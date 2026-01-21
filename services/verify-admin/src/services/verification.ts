import { eq, or } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db, verifiedResearchers, auditLogs } from '../db.js';
import { blueskyService } from './bluesky.js';
import { orcidService } from './orcid.js';
import { openAlexService, PublicationCheckResult } from './openalex.js';
import { ozoneService } from './ozone.js';

export interface VerifyResearcherInput {
  blueskyHandle: string;
  openAlexId?: string;
  orcidId?: string;
  website?: string;
  displayName?: string;
}

export interface VerifyResearcherResult {
  success: boolean;
  member?: {
    id: string;
    handle: string;
    did: string;
    name: string;
    orcid: string | null;
    openAlexId: string | null;
  };
  publicationData?: {
    totalWorks: number;
    worksAtEstablishedVenues: number;
    recentWorks: number;
    meetsAutoApprovalCriteria: boolean;
  };
  error?: string;
}

export class VerificationService {
  /**
   * Verify a researcher (moderator-initiated)
   * Creates a verified member record and applies the label
   */
  async verifyResearcher(
    input: VerifyResearcherInput,
    reviewerId: string
  ): Promise<VerifyResearcherResult> {
    // Step 1: Resolve Bluesky handle to DID
    const resolved = await blueskyService.resolveHandle(input.blueskyHandle);
    if (!resolved) {
      return { success: false, error: 'Could not resolve Bluesky handle' };
    }

    // Step 2: Get ORCID from OpenAlex if provided
    let orcidId = input.orcidId;
    let authorFromOpenAlex = null;
    if (input.openAlexId) {
      authorFromOpenAlex = await openAlexService.getAuthorById(input.openAlexId);
      if (authorFromOpenAlex?.orcid && !orcidId) {
        orcidId = authorFromOpenAlex.orcid;
      }
    }

    // Clean ORCID
    const cleanOrcidId = orcidId ? orcidService.extractOrcidId(orcidId) : null;

    // Step 3: Check if already verified (using Drizzle)
    const orConditions = cleanOrcidId
      ? or(eq(verifiedResearchers.did, resolved.did), eq(verifiedResearchers.orcid, cleanOrcidId))
      : eq(verifiedResearchers.did, resolved.did);

    const existingMember = await db
      .select()
      .from(verifiedResearchers)
      .where(orConditions)
      .limit(1);

    if (existingMember.length > 0) {
      return { success: false, error: 'User is already verified' };
    }

    // Step 4: Fetch publication data for reference
    let publicationCheck: PublicationCheckResult | null = null;
    if (cleanOrcidId) {
      publicationCheck = await openAlexService.checkAutoApprovalCriteria(cleanOrcidId);
    } else if (authorFromOpenAlex) {
      const works = await openAlexService.getAuthorWorks(authorFromOpenAlex.id);
      publicationCheck = {
        meetsAutoApprovalCriteria: false,
        totalWorks: authorFromOpenAlex.worksCount,
        worksAtEstablishedVenues: 0,
        recentWorks: works.filter(w => w.publicationYear >= new Date().getFullYear() - 5).length,
        author: authorFromOpenAlex,
        publications: works,
        reason: 'No ORCID available',
      };
    }

    // Step 5: Determine display name
    const displayName = input.displayName || 
                        publicationCheck?.author?.displayName || 
                        authorFromOpenAlex?.displayName || 
                        resolved.handle;

    // Step 6: Apply label via Ozone
    const labelResult = await ozoneService.applyVerifiedResearcherLabel(resolved.did);
    if (!labelResult.success) {
      return { success: false, error: `Failed to apply label: ${labelResult.error}` };
    }

    // Step 7: Create verified member record (using Drizzle with lea-db column names)
    const memberId = uuidv4();
    await db.insert(verifiedResearchers).values({
      id: memberId,
      did: resolved.did,
      handle: resolved.handle,
      orcid: cleanOrcidId,
      openAlexId: input.openAlexId || null,
      website: input.website || null,
      name: displayName,
      verificationMethod: 'manual',
      verifiedBy: reviewerId,
    });

    // Step 8: Log the verification
    await this.logAction('researcher_verified', reviewerId, memberId, 'researcher', {
      handle: resolved.handle,
      orcid: cleanOrcidId,
      openAlexId: input.openAlexId,
      website: input.website,
    });

    return {
      success: true,
      member: {
        id: memberId,
        handle: resolved.handle,
        did: resolved.did,
        name: displayName,
        orcid: cleanOrcidId,
        openAlexId: input.openAlexId || null,
      },
      publicationData: publicationCheck ? {
        totalWorks: publicationCheck.totalWorks,
        worksAtEstablishedVenues: publicationCheck.worksAtEstablishedVenues,
        recentWorks: publicationCheck.recentWorks,
        meetsAutoApprovalCriteria: publicationCheck.meetsAutoApprovalCriteria,
      } : undefined,
    };
  }

  /**
   * Check if a user is already verified
   */
  async isAlreadyVerified(blueskyDid: string, orcidId?: string): Promise<boolean> {
    const cleanOrcid = orcidId ? orcidService.extractOrcidId(orcidId) : null;
    
    const orConditions = cleanOrcid
      ? or(eq(verifiedResearchers.did, blueskyDid), eq(verifiedResearchers.orcid, cleanOrcid))
      : eq(verifiedResearchers.did, blueskyDid);

    const member = await db
      .select()
      .from(verifiedResearchers)
      .where(orConditions)
      .limit(1);

    return member.length > 0;
  }

  /**
   * Remove verification (unverify a researcher)
   */
  async removeVerification(memberId: string, reviewerId: string): Promise<boolean> {
    const [member] = await db
      .select()
      .from(verifiedResearchers)
      .where(eq(verifiedResearchers.id, memberId));

    if (!member) {
      return false;
    }

    // Remove label via Ozone
    await ozoneService.removeLabel(member.did, 'verified-researcher');

    // Delete the member record
    await db.delete(verifiedResearchers).where(eq(verifiedResearchers.id, memberId));

    // Log the removal
    await this.logAction('researcher_unverified', reviewerId, memberId, 'researcher', {
      handle: member.handle,
      did: member.did,
    });

    return true;
  }

  /**
   * Get all verified members
   */
  async getVerifiedMembers(limit = 50, offset = 0): Promise<{
    members: Array<{
      id: string;
      did: string;
      handle: string | null;
      name: string | null;
      orcid: string | null;
      openAlexId: string | null;
      verifiedAt: Date;
    }>;
    total: number;
  }> {
    const members = await db
      .select({
        id: verifiedResearchers.id,
        did: verifiedResearchers.did,
        handle: verifiedResearchers.handle,
        name: verifiedResearchers.name,
        orcid: verifiedResearchers.orcid,
        openAlexId: verifiedResearchers.openAlexId,
        verifiedAt: verifiedResearchers.verifiedAt,
      })
      .from(verifiedResearchers)
      .orderBy(verifiedResearchers.verifiedAt)
      .limit(limit)
      .offset(offset);

    // Count total (simple count query)
    const countResult = await db
      .select({ id: verifiedResearchers.id })
      .from(verifiedResearchers);
    
    const total = countResult.length;

    return { members, total };
  }

  /**
   * Log an action to the audit log
   */
  private async logAction(
    action: string,
    actorId: string | null,
    targetId: string,
    targetType: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await db.insert(auditLogs).values({
      id: uuidv4(),
      action,
      actorId,
      targetId,
      targetType,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  }
}

// Singleton instance
export const verificationService = new VerificationService();
export default verificationService;
