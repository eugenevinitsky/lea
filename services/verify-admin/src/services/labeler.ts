import { AtpAgent } from '@atproto/api';
import { config } from '../config.js';

export interface LabelDefinition {
  identifier: string;
  severity: 'inform' | 'alert' | 'none';
  blurs: 'content' | 'media' | 'none';
  defaultSetting: 'ignore' | 'warn' | 'hide';
  adultOnly: boolean;
  locales: Array<{
    lang: string;
    name: string;
    description: string;
  }>;
}

export interface LabelerConfig {
  did: string;
  labelValues: string[];
  labelValueDefinitions: LabelDefinition[];
  createdAt: string;
}

export class LabelerService {
  private agent: AtpAgent | null = null;

  /**
   * Get an authenticated agent for the labeler account
   */
  private async getAgent(): Promise<AtpAgent | null> {
    if (this.agent?.session) {
      return this.agent;
    }

    try {
      const identifier = config.bluesky.labelerHandle;
      const password = config.bluesky.labelerPassword;

      if (!identifier || !password) {
        console.error('Labeler credentials not configured');
        return null;
      }

      this.agent = new AtpAgent({ service: 'https://bsky.social' });
      await this.agent.login({ identifier, password });
      return this.agent;
    } catch (error) {
      console.error('Failed to authenticate labeler:', error);
      return null;
    }
  }

  /**
   * Get the current labeler configuration
   */
  async getLabelerConfig(): Promise<LabelerConfig | null> {
    try {
      const agent = await this.getAgent();
      if (!agent?.session?.did) {
        return null;
      }

      const response = await agent.api.com.atproto.repo.getRecord({
        repo: agent.session.did,
        collection: 'app.bsky.labeler.service',
        rkey: 'self',
      });

      if (!response.success) {
        return null;
      }

      const record = response.data.value as {
        policies?: {
          labelValues?: string[];
          labelValueDefinitions?: LabelDefinition[];
        };
        createdAt?: string;
      };

      return {
        did: agent.session.did,
        labelValues: record.policies?.labelValues || [],
        labelValueDefinitions: record.policies?.labelValueDefinitions || [],
        createdAt: record.createdAt || new Date().toISOString(),
      };
    } catch (error) {
      console.error('Failed to get labeler config:', error);
      return null;
    }
  }

  /**
   * Update the labeler service record with new label definitions
   */
  async updateLabelerConfig(labelDefinitions: LabelDefinition[]): Promise<{ success: boolean; error?: string }> {
    try {
      const agent = await this.getAgent();
      if (!agent?.session?.did) {
        return { success: false, error: 'Failed to authenticate' };
      }

      // Get current record to preserve createdAt
      const current = await this.getLabelerConfig();

      const serviceRecord = {
        $type: 'app.bsky.labeler.service',
        policies: {
          labelValues: labelDefinitions.map(d => d.identifier),
          labelValueDefinitions: labelDefinitions,
        },
        createdAt: current?.createdAt || new Date().toISOString(),
      };

      const result = await agent.api.com.atproto.repo.putRecord({
        repo: agent.session.did,
        collection: 'app.bsky.labeler.service',
        rkey: 'self',
        record: serviceRecord,
      });

      if (result.success) {
        return { success: true };
      }

      return { success: false, error: 'Failed to update labeler record' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to update labeler config:', message);
      return { success: false, error: message };
    }
  }

  /**
   * Add a new label definition
   */
  async addLabel(definition: LabelDefinition): Promise<{ success: boolean; error?: string }> {
    const current = await this.getLabelerConfig();
    if (!current) {
      return { success: false, error: 'Failed to get current config' };
    }

    // Check if label already exists
    if (current.labelValueDefinitions.some(d => d.identifier === definition.identifier)) {
      return { success: false, error: 'Label with this identifier already exists' };
    }

    const updatedDefinitions = [...current.labelValueDefinitions, definition];
    return this.updateLabelerConfig(updatedDefinitions);
  }

  /**
   * Update an existing label definition
   */
  async updateLabel(identifier: string, updates: Partial<LabelDefinition>): Promise<{ success: boolean; error?: string }> {
    const current = await this.getLabelerConfig();
    if (!current) {
      return { success: false, error: 'Failed to get current config' };
    }

    const index = current.labelValueDefinitions.findIndex(d => d.identifier === identifier);
    if (index === -1) {
      return { success: false, error: 'Label not found' };
    }

    // Don't allow changing the identifier through update (would break existing labels)
    if (updates.identifier && updates.identifier !== identifier) {
      return { success: false, error: 'Cannot change label identifier' };
    }

    const updatedDefinitions = [...current.labelValueDefinitions];
    updatedDefinitions[index] = { ...updatedDefinitions[index], ...updates, identifier };

    return this.updateLabelerConfig(updatedDefinitions);
  }

  /**
   * Delete a label definition
   * WARNING: This is destructive and will affect all users with this label
   */
  async deleteLabel(identifier: string): Promise<{ success: boolean; error?: string }> {
    const current = await this.getLabelerConfig();
    if (!current) {
      return { success: false, error: 'Failed to get current config' };
    }

    const index = current.labelValueDefinitions.findIndex(d => d.identifier === identifier);
    if (index === -1) {
      return { success: false, error: 'Label not found' };
    }

    const updatedDefinitions = current.labelValueDefinitions.filter(d => d.identifier !== identifier);
    return this.updateLabelerConfig(updatedDefinitions);
  }

  /**
   * Get usage count for a label (how many accounts have this label)
   */
  async getLabelUsageCount(identifier: string): Promise<number> {
    try {
      const agent = await this.getAgent();
      if (!agent?.session?.did) {
        return 0;
      }

      const labelerDid = config.bluesky.labelerDid;
      let count = 0;
      let cursor: string | undefined;

      // Query label events to count how many accounts have this label
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
          const labelAdded = new Set<string>();
          const labelNegated = new Set<string>();

          for (const event of response.data.events) {
            if (event.subject.$type !== 'com.atproto.admin.defs#repoRef') continue;
            const did = (event.subject as { did: string }).did;
            if (!did) continue;

            const labelEvent = event.event as {
              createLabelVals?: string[];
              negateLabelVals?: string[];
            };

            if (labelEvent.createLabelVals?.includes(identifier)) {
              labelAdded.add(did);
            }
            if (labelEvent.negateLabelVals?.includes(identifier)) {
              labelNegated.add(did);
            }
          }

          // Count DIDs with label added but not negated
          for (const did of labelAdded) {
            if (!labelNegated.has(did)) {
              count++;
            }
          }
        }

        cursor = response.data.cursor;
      } while (cursor);

      return count;
    } catch (error) {
      console.error('Failed to get label usage count:', error);
      return 0;
    }
  }
}

// Singleton instance
export const labelerService = new LabelerService();
export default labelerService;
