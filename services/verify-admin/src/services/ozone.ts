import { AtpAgent } from '@atproto/api';
import { config } from '../config.js';

export interface LabelResult {
  success: boolean;
  error?: string;
}

export class OzoneService {
  private maxRetries = 3;
  private retryDelayMs = 1000;

  /**
   * Apply the verified-researcher label to a user's DID
   * Uses tools.ozone.moderation.emitEvent API
   */
  async applyVerifiedResearcherLabel(targetDid: string): Promise<LabelResult> {
    return this.applyLabel(targetDid, config.verifiedResearcherLabel);
  }

  /**
   * Apply a label to a user's DID via the Ozone moderation API
   */
  async applyLabel(targetDid: string, labelValue: string): Promise<LabelResult> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.emitLabelEvent(targetDid, labelValue, 'add');
        if (result.success) {
          console.log(`Successfully applied label "${labelValue}" to ${targetDid}`);
          return { success: true };
        }
        lastError = new Error(result.error || 'Unknown error');
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`Attempt ${attempt}/${this.maxRetries} failed:`, lastError.message);
        
        if (attempt < this.maxRetries) {
          await this.delay(this.retryDelayMs * attempt);
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Failed to apply label after retries',
    };
  }

  /**
   * Remove a label from a user's DID
   */
  async removeLabel(targetDid: string, labelValue: string): Promise<LabelResult> {
    return this.emitLabelEvent(targetDid, labelValue, 'negate');
  }

  /**
   * Get or create an authenticated Ozone agent
   * Uses service proxying through PDS to call Ozone API
   */
  private async getOzoneAgent(): Promise<{ agent: AtpAgent; accessJwt: string; labelerDid: string } | null> {
    try {
      const identifier = config.bluesky.labelerHandle;
      const password = config.ozone.adminPassword || config.bluesky.labelerPassword;
      const labelerDid = config.bluesky.labelerDid;

      if (!identifier || !password) {
        console.error('Labeler credentials not configured');
        return null;
      }

      // Authenticate to bsky.social PDS
      console.log(`Authenticating to bsky.social as: ${identifier}`);
      const agent = new AtpAgent({ service: 'https://bsky.social' });
      await agent.login({ identifier, password });
      console.log('PDS login successful');

      if (!agent.session?.accessJwt) {
        console.error('No access token received from PDS');
        return null;
      }

      return { agent, accessJwt: agent.session.accessJwt, labelerDid };
    } catch (error) {
      console.error('Failed to create agent:', error);
      return null;
    }
  }

  /**
   * Emit a label event via the Ozone moderation API
   * This is the core API call: tools.ozone.moderation.emitEvent
   */
  private async emitLabelEvent(
    targetDid: string,
    labelValue: string,
    action: 'add' | 'negate'
  ): Promise<LabelResult> {
    try {
      const result = await this.getOzoneAgent();
      if (!result) {
        return { success: false, error: 'Failed to authenticate' };
      }

      const { agent, labelerDid } = result;

      // Build the label event
      const createLabels = action === 'add' ? [labelValue] : [];
      const negateLabels = action === 'negate' ? [labelValue] : [];

      console.log(`Applying label "${labelValue}" to ${targetDid}`);
      console.log(`Using service proxy to labeler: ${labelerDid}`);

      // Call tools.ozone.moderation.emitEvent via service proxy
      // The PDS will proxy the request to the labeler's Ozone instance
      const response = await agent.api.tools.ozone.moderation.emitEvent(
        {
          subject: {
            $type: 'com.atproto.admin.defs#repoRef',
            did: targetDid,
          },
          event: {
            $type: 'tools.ozone.moderation.defs#modEventLabel',
            createLabelVals: createLabels,
            negateLabelVals: negateLabels,
            comment: `Lea verification system: ${action === 'add' ? 'applying' : 'removing'} ${labelValue} label`,
          },
          createdBy: labelerDid,
        },
        {
          headers: {
            'atproto-proxy': `${labelerDid}#atproto_labeler`,
          },
        }
      );

      if (response.success) {
        return { success: true };
      }

      return { success: false, error: 'API call did not return success' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('emitLabelEvent error:', message);
      return { success: false, error: message };
    }
  }

  /**
   * Check if a user already has the verified-researcher label
   */
  async hasVerifiedResearcherLabel(targetDid: string): Promise<boolean> {
    try {
      const result = await this.getOzoneAgent();
      if (!result) return false;
      
      const { agent } = result;
      
      // Query labels for this DID
      const response = await agent.api.com.atproto.label.queryLabels({
        uriPatterns: [targetDid],
        sources: [config.bluesky.labelerDid],
      });

      if (response.success && response.data.labels) {
        return response.data.labels.some(
          label => label.val === config.verifiedResearcherLabel && !label.neg
        );
      }

      return false;
    } catch (error) {
      console.error('Failed to check existing labels:', error);
      return false;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Fetch all DIDs that have the verified-researcher label from Ozone
   * Uses tools.ozone.moderation.queryEvents to find label events
   */
  async getAllLabeledDids(): Promise<string[]> {
    try {
      const result = await this.getOzoneAgent();
      if (!result) {
        console.error('Failed to authenticate for label query');
        return [];
      }

      const { agent, labelerDid } = result;
      
      // Track labels added and negated per DID
      const labelAdded: Set<string> = new Set();
      const labelNegated: Set<string> = new Set();
      let cursor: string | undefined;

      // Query moderation events to find label actions
      do {
        const response = await agent.api.tools.ozone.moderation.queryEvents(
          {
            types: ['tools.ozone.moderation.defs#modEventLabel'],
            limit: 100,
            cursor,
          },
          {
            headers: {
              'atproto-proxy': `${labelerDid}#atproto_labeler`,
            },
          }
        );

        if (response.success && response.data.events) {
          for (const event of response.data.events) {
            // Get the subject DID
            if (event.subject.$type !== 'com.atproto.admin.defs#repoRef') continue;
            const did = (event.subject as { did: string }).did;
            if (!did) continue;

            // Check if this event added or negated our label
            const labelEvent = event.event as {
              $type: string;
              createLabelVals?: string[];
              negateLabelVals?: string[];
            };

            if (labelEvent.createLabelVals?.includes(config.verifiedResearcherLabel)) {
              labelAdded.add(did);
            }
            if (labelEvent.negateLabelVals?.includes(config.verifiedResearcherLabel)) {
              labelNegated.add(did);
            }
          }
        }

        cursor = response.data.cursor;
      } while (cursor);

      // Return DIDs that have label added but not negated
      const activeLabels = [...labelAdded].filter(did => !labelNegated.has(did));
      console.log(`Found ${activeLabels.length} actively labeled accounts from Ozone events`);
      return activeLabels;
    } catch (error) {
      console.error('Failed to fetch labeled DIDs:', error);
      return [];
    }
  }

  /**
   * Fetch all pending/open reports from Ozone (subjects that have been reported but not actioned)
   * These are accounts that need review
   */
  async getPendingReports(): Promise<Array<{ did: string; reportedAt: string; comment?: string }>> {
    try {
      const result = await this.getOzoneAgent();
      if (!result) {
        console.error('Failed to authenticate for pending reports query');
        return [];
      }

      const { agent, labelerDid } = result;
      const pendingReports: Array<{ did: string; reportedAt: string; comment?: string }> = [];
      let cursor: string | undefined;

      // Query moderation statuses to find subjects that need review
      do {
        const response = await agent.api.tools.ozone.moderation.queryStatuses(
          {
            reviewState: 'tools.ozone.moderation.defs#reviewOpen',
            limit: 100,
            cursor,
          },
          {
            headers: {
              'atproto-proxy': `${labelerDid}#atproto_labeler`,
            },
          }
        );

        if (response.success && response.data.subjectStatuses) {
          for (const status of response.data.subjectStatuses) {
            // Only include repo refs (user accounts)
            if (status.subject.$type === 'com.atproto.admin.defs#repoRef') {
              const did = (status.subject as { did: string }).did;
              if (did) {
                pendingReports.push({
                  did,
                  reportedAt: status.createdAt,
                  comment: status.comment || undefined,
                });
              }
            }
          }
        }

        cursor = response.data.cursor;
      } while (cursor);

      console.log(`Found ${pendingReports.length} pending reports from Ozone`);
      return pendingReports;
    } catch (error) {
      console.error('Failed to fetch pending reports:', error);
      return [];
    }
  }
}

// Singleton instance
export const ozoneService = new OzoneService();
export default ozoneService;
