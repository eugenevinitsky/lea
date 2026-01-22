import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { eq, desc, sql, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { verificationService } from '../services/verification.js';
import { openAlexService } from '../services/openalex.js';
import { blueskyService } from '../services/bluesky.js';
import { ozoneService } from '../services/ozone.js';
import { labelerService, LabelDefinition } from '../services/labeler.js';
import { adminAuth } from '../middleware/auth.js';
import { db, verifiedResearchers, verifiedOrganizations, auditLogs } from '../db.js';

const router = Router();

// Pagination constants and validation
const MAX_LIMIT = 200;
const MAX_OFFSET = 100000;
const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

// Validate and sanitize pagination parameters to prevent DoS attacks
function validatePagination(limitStr: string | undefined, offsetStr: string | undefined): { limit: number; offset: number } {
  const limit = limitStr ? parseInt(limitStr, 10) : DEFAULT_LIMIT;
  const offset = offsetStr ? parseInt(offsetStr, 10) : DEFAULT_OFFSET;

  return {
    limit: isNaN(limit) || limit < 1 ? DEFAULT_LIMIT : Math.min(limit, MAX_LIMIT),
    offset: isNaN(offset) || offset < 0 ? DEFAULT_OFFSET : Math.min(offset, MAX_OFFSET),
  };
}

// Apply admin authentication to all routes
router.use(adminAuth);

// Organization type to label mapping
const ORG_TYPE_TO_LABEL: Record<string, string> = {
  VENUE: 'verified-venue',
  LAB: 'verified-lab',
  ACADEMIC_INSTITUTION: 'verified-academic-institution',
  INDUSTRY_INSTITUTION: 'verified-industry-institution',
};

// ==================== RESEARCHER VERIFICATION ====================

// Validation schema for quick verify - supports ORCID, OpenAlex ID, or website
const quickVerifySchema = z.object({
  blueskyHandle: z.string().min(1, 'Bluesky handle is required'),
  openAlexId: z.string().optional(),
  orcidId: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  displayName: z.string().optional(),
}).refine(data => data.openAlexId || data.orcidId || data.website, {
  message: 'At least one of openAlexId, orcidId, or website is required',
});

/**
 * POST /api/admin/quick-verify
 * Verify a researcher by handle + OpenAlex ID or ORCID
 */
router.post('/quick-verify', async (req: Request, res: Response) => {
  try {
    const parseResult = quickVerifySchema.safeParse(req.body);
    
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.errors,
      });
    }

    const { blueskyHandle, openAlexId, orcidId, website, displayName } = parseResult.data;
    const reviewerId = (req as Request & { adminDid?: string }).adminDid || 'admin';

    const result = await verificationService.verifyResearcher(
      { blueskyHandle, openAlexId, orcidId, website: website || undefined, displayName },
      reviewerId
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    return res.json({
      success: true,
      message: 'Researcher verified successfully',
      member: result.member,
      publicationData: result.publicationData,
    });
  } catch (error) {
    console.error('Quick verify error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/quick-verify/preview
 * Preview verification (resolve handle and fetch OpenAlex data without creating records)
 */
router.post('/quick-verify/preview', async (req: Request, res: Response) => {
  try {
    const { blueskyHandle, openAlexId, orcidId: inputOrcidId } = req.body;

    if (!blueskyHandle) {
      return res.status(400).json({ error: 'blueskyHandle is required' });
    }

    if (!openAlexId && !inputOrcidId) {
      return res.status(400).json({ error: 'Either openAlexId or orcidId is required' });
    }

    // Resolve Bluesky handle
    const resolved = await blueskyService.resolveHandle(blueskyHandle);
    if (!resolved) {
      return res.status(400).json({ error: 'Could not resolve Bluesky handle' });
    }

    // If we have OpenAlex ID, fetch author info and potentially get ORCID
    let orcidId = inputOrcidId;
    let authorFromOpenAlex = null;
    if (openAlexId) {
      authorFromOpenAlex = await openAlexService.getAuthorById(openAlexId);
      if (authorFromOpenAlex?.orcid && !orcidId) {
        orcidId = authorFromOpenAlex.orcid;
      }
    }

    // Check if already verified
    const alreadyVerified = await verificationService.isAlreadyVerified(resolved.did, orcidId);

    // Fetch OpenAlex data
    let publicationCheck;
    if (orcidId) {
      publicationCheck = await openAlexService.checkAutoApprovalCriteria(orcidId);
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
    } else {
      publicationCheck = {
        meetsAutoApprovalCriteria: false,
        totalWorks: 0,
        worksAtEstablishedVenues: 0,
        recentWorks: 0,
        author: null,
        publications: [],
        reason: 'No OpenAlex data available',
      };
    }

    return res.json({
      bluesky: {
        handle: resolved.handle,
        did: resolved.did,
      },
      alreadyVerified,
      openAlexId: openAlexId || null,
      orcidId: orcidId || null,
      publicationData: {
        author: publicationCheck.author,
        totalWorks: publicationCheck.totalWorks,
        worksAtEstablishedVenues: publicationCheck.worksAtEstablishedVenues,
        recentWorks: publicationCheck.recentWorks,
        meetsAutoApprovalCriteria: publicationCheck.meetsAutoApprovalCriteria,
        reason: publicationCheck.reason,
        publications: publicationCheck.publications.slice(0, 10),
      },
    });
  } catch (error) {
    console.error('Quick verify preview error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/resolve-handle
 * Resolve a Bluesky handle and get profile display name
 */
router.get('/resolve-handle', async (req: Request, res: Response) => {
  try {
    const { handle } = req.query;

    if (!handle || typeof handle !== 'string') {
      return res.status(400).json({ error: 'Handle is required' });
    }

    const resolved = await blueskyService.resolveHandle(handle);
    if (!resolved) {
      return res.status(400).json({ error: 'Could not resolve Bluesky handle' });
    }

    const profile = await blueskyService.getProfile(resolved.did);

    return res.json({
      handle: resolved.handle,
      did: resolved.did,
      displayName: profile?.displayName || null,
      avatar: profile?.avatar || null,
    });
  } catch (error) {
    console.error('Resolve handle error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/bulk-verify
 * Bulk verify researchers from CSV data
 */
router.post('/bulk-verify', async (req: Request, res: Response) => {
  try {
    const { researchers } = req.body as {
      researchers: Array<{ blueskyHandle: string; orcidId: string; displayName?: string }>;
    };

    if (!researchers || !Array.isArray(researchers) || researchers.length === 0) {
      return res.status(400).json({ error: 'researchers array is required' });
    }

    if (researchers.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 researchers per batch' });
    }

    const reviewerId = (req as Request & { adminDid?: string }).adminDid || 'admin';

    const results: Array<{
      blueskyHandle: string;
      orcidId: string;
      status: 'success' | 'skipped' | 'error';
      message: string;
      displayName?: string;
    }> = [];

    for (const researcher of researchers) {
      const { blueskyHandle, orcidId, displayName } = researcher;

      if (!blueskyHandle || !orcidId) {
        results.push({
          blueskyHandle: blueskyHandle || '(missing)',
          orcidId: orcidId || '(missing)',
          status: 'error',
          message: 'Missing blueskyHandle or orcidId',
        });
        continue;
      }

      try {
        const result = await verificationService.verifyResearcher(
          { blueskyHandle, orcidId, displayName },
          reviewerId
        );

        if (result.success) {
          results.push({
            blueskyHandle: result.member!.handle,
            orcidId: result.member!.orcid || orcidId,
            status: 'success',
            message: 'Verified successfully',
            displayName: result.member!.name,
          });
        } else if (result.error?.includes('already verified')) {
          results.push({
            blueskyHandle,
            orcidId,
            status: 'skipped',
            message: 'Already verified',
          });
        } else {
          results.push({
            blueskyHandle,
            orcidId,
            status: 'error',
            message: result.error || 'Unknown error',
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          blueskyHandle,
          orcidId,
          status: 'error',
          message,
        });
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    const summary = {
      total: results.length,
      success: results.filter(r => r.status === 'success').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      errors: results.filter(r => r.status === 'error').length,
    };

    await db.insert(auditLogs).values({
      id: uuidv4(),
      action: 'bulk_verify',
      actorId: reviewerId,
      targetId: 'bulk',
      targetType: 'researcher',
      metadata: JSON.stringify(summary),
    });

    return res.json({
      success: true,
      summary,
      results,
    });
  } catch (error) {
    console.error('Bulk verify error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/members
 * List verified researchers
 */
router.get('/members', async (req: Request, res: Response) => {
  try {
    const { limit: limitStr, offset: offsetStr } = req.query;
    const { limit, offset } = validatePagination(limitStr as string, offsetStr as string);

    const result = await verificationService.getVerifiedMembers(limit, offset);

    return res.json(result);
  } catch (error) {
    console.error('Admin list members error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/admin/members/:id
 * Remove a verified researcher
 */
router.delete('/members/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const reviewerId = (req as Request & { adminDid?: string }).adminDid || 'admin';

    const success = await verificationService.removeVerification(id, reviewerId);

    if (!success) {
      return res.status(404).json({ error: 'Member not found' });
    }

    return res.json({
      success: true,
      message: 'Verification removed',
    });
  } catch (error) {
    console.error('Admin remove member error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/openalex-search
 * Search OpenAlex for authors by name
 */
router.get('/openalex-search', async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    
    if (!q || typeof q !== 'string' || q.length < 2) {
      return res.json({ results: [] });
    }

    const results = await openAlexService.searchAuthorsByName(q, 8);

    return res.json({ results });
  } catch (error) {
    console.error('OpenAlex search error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== ORGANIZATION VERIFICATION ====================

// Validation schema for quick verify organization
const quickVerifyOrgSchema = z.object({
  blueskyHandle: z.string().min(1, 'Bluesky handle is required'),
  organizationType: z.enum(['VENUE', 'LAB', 'ACADEMIC_INSTITUTION', 'INDUSTRY_INSTITUTION']),
  organizationName: z.string().optional(),
});

/**
 * POST /api/admin/quick-verify-org
 * Verify an organization by handle + type
 */
router.post('/quick-verify-org', async (req: Request, res: Response) => {
  try {
    const parseResult = quickVerifyOrgSchema.safeParse(req.body);
    
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.errors,
      });
    }

    const { blueskyHandle, organizationType, organizationName } = parseResult.data;
    const reviewerId = (req as Request & { adminDid?: string }).adminDid || 'admin';

    // Resolve Bluesky handle
    const resolved = await blueskyService.resolveHandle(blueskyHandle);
    if (!resolved) {
      return res.status(400).json({ error: 'Could not resolve Bluesky handle' });
    }

    // Check if already verified (Drizzle query)
    const existingOrg = await db
      .select()
      .from(verifiedOrganizations)
      .where(eq(verifiedOrganizations.did, resolved.did))
      .limit(1);

    if (existingOrg.length > 0) {
      return res.status(400).json({ error: 'Organization is already verified' });
    }

    // Get the label for this organization type
    const labelValue = ORG_TYPE_TO_LABEL[organizationType];
    if (!labelValue) {
      return res.status(500).json({ error: 'Unknown organization type' });
    }

    // Get profile for display name if not provided
    const profile = await blueskyService.getProfile(resolved.did);
    const displayName = organizationName || profile?.displayName || resolved.handle;

    // Apply the label
    const labelResult = await ozoneService.applyLabel(resolved.did, labelValue);
    if (!labelResult.success) {
      return res.status(500).json({ error: `Failed to apply label: ${labelResult.error}` });
    }

    // Create verified organization record (Drizzle insert)
    const orgId = uuidv4();
    await db.insert(verifiedOrganizations).values({
      id: orgId,
      did: resolved.did,
      handle: resolved.handle,
      organizationType: organizationType,
      organizationName: displayName,
      labelApplied: true,
      verifiedBy: reviewerId,
    });

    await db.insert(auditLogs).values({
      id: uuidv4(),
      action: 'organization_verified',
      actorId: reviewerId,
      targetId: orgId,
      targetType: 'organization',
      metadata: JSON.stringify({
        organizationType,
        labelApplied: labelValue,
        blueskyHandle: resolved.handle,
      }),
    });

    return res.json({
      success: true,
      message: `Organization verified with ${labelValue} label`,
      organization: {
        id: orgId,
        blueskyHandle: resolved.handle,
        blueskyDid: resolved.did,
        organizationType,
        organizationName: displayName,
      },
    });
  } catch (error) {
    console.error('Quick verify organization error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/organizations
 * List verified organizations
 */
router.get('/organizations', async (req: Request, res: Response) => {
  try {
    const { type, limit: limitStr, offset: offsetStr } = req.query;
    const { limit, offset } = validatePagination(limitStr as string, offsetStr as string);

    let query = db
      .select()
      .from(verifiedOrganizations)
      .orderBy(desc(verifiedOrganizations.verifiedAt))
      .limit(limit)
      .offset(offset);

    // Add type filter if provided
    if (type && typeof type === 'string') {
      query = db
        .select()
        .from(verifiedOrganizations)
        .where(eq(verifiedOrganizations.organizationType, type.toUpperCase()))
        .orderBy(desc(verifiedOrganizations.verifiedAt))
        .limit(limit)
        .offset(offset);
    }

    const organizations = await query;

    // Count total
    const countResult = await db
      .select({ id: verifiedOrganizations.id })
      .from(verifiedOrganizations)
      .where(type ? eq(verifiedOrganizations.organizationType, (type as string).toUpperCase()) : undefined);

    const total = countResult.length;

    return res.json({
      organizations,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Admin list organizations error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/admin/organizations/:id
 * Remove a verified organization
 */
router.delete('/organizations/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const reviewerId = (req as Request & { adminDid?: string }).adminDid || 'admin';

    const [org] = await db
      .select()
      .from(verifiedOrganizations)
      .where(eq(verifiedOrganizations.id, id));

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Remove label via Ozone
    const labelValue = ORG_TYPE_TO_LABEL[org.organizationType];
    if (labelValue) {
      await ozoneService.removeLabel(org.did, labelValue);
    }

    // Delete the record
    await db.delete(verifiedOrganizations).where(eq(verifiedOrganizations.id, id));

    await db.insert(auditLogs).values({
      id: uuidv4(),
      action: 'organization_unverified',
      actorId: reviewerId,
      targetId: id,
      targetType: 'organization',
      metadata: JSON.stringify({
        blueskyHandle: org.handle,
        organizationType: org.organizationType,
      }),
    });

    return res.json({
      success: true,
      message: 'Organization verification removed',
    });
  } catch (error) {
    console.error('Admin remove organization error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== STATS ====================

/**
 * GET /api/admin/stats
 * Get verification statistics
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    // Count researchers
    const researchersResult = await db
      .select({ id: verifiedResearchers.id })
      .from(verifiedResearchers);
    const totalMembers = researchersResult.length;

    // Count organizations
    const orgsResult = await db
      .select({ id: verifiedOrganizations.id })
      .from(verifiedOrganizations);
    const totalOrganizations = orgsResult.length;

    // Get organization breakdown by type
    const orgsByTypeResult = await db
      .select({
        organizationType: verifiedOrganizations.organizationType,
      })
      .from(verifiedOrganizations);

    // Group by type manually
    const typeCount: Record<string, number> = {};
    for (const org of orgsByTypeResult) {
      typeCount[org.organizationType] = (typeCount[org.organizationType] || 0) + 1;
    }
    const orgsByType = Object.entries(typeCount).map(([type, count]) => ({ type, count }));

    return res.json({
      researchers: totalMembers,
      organizations: {
        total: totalOrganizations,
        byType: orgsByType,
      },
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/audit
 * Get audit log entries
 */
router.get('/audit', async (req: Request, res: Response) => {
  try {
    const { action, limit: limitStr, offset: offsetStr } = req.query;
    const { limit, offset } = validatePagination(limitStr as string, offsetStr as string);

    let query = db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    if (action && typeof action === 'string') {
      query = db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, action))
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit)
        .offset(offset);
    }

    const logs = await query;

    return res.json({ logs });
  } catch (error) {
    console.error('Admin audit log error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/sync-from-ozone
 * Import labeled accounts from Ozone that aren't in the database
 */
router.post('/sync-from-ozone', async (req: Request, res: Response) => {
  try {
    const reviewerId = (req as Request & { adminDid?: string }).adminDid || 'admin';

    const results = {
      imported: 0,
      skipped: 0,
      errors: [] as string[],
    };

    // Get all labeled DIDs from Ozone
    const labeledDids = await ozoneService.getAllLabeledDids();
    
    if (labeledDids.length > 0) {
      // Check which DIDs are already in our database
      const existingMembers = await db
        .select({ did: verifiedResearchers.did })
        .from(verifiedResearchers)
        .where(inArray(verifiedResearchers.did, labeledDids));
      
      const existingDids = new Set(existingMembers.map(m => m.did));
      results.skipped = existingDids.size;

      // Import each missing DID
      for (const did of labeledDids) {
        if (existingDids.has(did)) continue;
        
        try {
          const profile = await blueskyService.getProfile(did);
          const handle = profile?.handle || did;
          const displayName = profile?.displayName || profile?.handle || did;

          await db.insert(verifiedResearchers).values({
            id: uuidv4(),
            did: did,
            handle: handle,
            name: displayName,
            verificationMethod: 'manual',
            verifiedBy: reviewerId,
          });

          await db.insert(auditLogs).values({
            id: uuidv4(),
            action: 'imported_from_ozone',
            actorId: reviewerId,
            targetId: did,
            targetType: 'researcher',
            metadata: JSON.stringify({ did, handle }),
          });

          results.imported++;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          results.errors.push(`Failed to import ${did}: ${message}`);
        }
      }
    }

    return res.json({
      success: true,
      message: `Imported ${results.imported} accounts from Ozone`,
      total: labeledDids.length,
      imported: results.imported,
      skipped: results.skipped,
      errors: results.errors,
    });
  } catch (error) {
    console.error('Ozone sync error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== LABEL MANAGEMENT ====================

/**
 * GET /api/admin/labels
 * Get all label definitions from the labeler service record
 */
router.get('/labels', async (_req: Request, res: Response) => {
  try {
    const config = await labelerService.getLabelerConfig();
    if (!config) {
      return res.status(500).json({ error: 'Failed to fetch labeler configuration' });
    }

    return res.json({
      did: config.did,
      labels: config.labelValueDefinitions,
      createdAt: config.createdAt,
    });
  } catch (error) {
    console.error('Get labels error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/labels/:identifier/usage
 * Get usage count for a specific label
 */
router.get('/labels/:identifier/usage', async (req: Request, res: Response) => {
  try {
    const { identifier } = req.params;
    const count = await labelerService.getLabelUsageCount(identifier);
    return res.json({ identifier, usageCount: count });
  } catch (error) {
    console.error('Get label usage error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Validation schema for label definition
const labelDefinitionSchema = z.object({
  identifier: z.string().min(1).max(128).regex(/^[a-z0-9-]+$/, 'Identifier must be lowercase alphanumeric with hyphens'),
  severity: z.enum(['inform', 'alert', 'none']),
  blurs: z.enum(['content', 'media', 'none']),
  defaultSetting: z.enum(['ignore', 'warn', 'hide']),
  adultOnly: z.boolean().optional().default(false),
  locales: z.array(z.object({
    lang: z.string().min(2).max(5),
    name: z.string().min(1).max(64),
    description: z.string().min(1).max(10000),
  })).min(1),
});

/**
 * POST /api/admin/labels
 * Add a new label definition
 */
router.post('/labels', async (req: Request, res: Response) => {
  try {
    const parseResult = labelDefinitionSchema.safeParse(req.body);
    
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.errors,
      });
    }

    const reviewerId = (req as Request & { adminDid?: string }).adminDid || 'admin';
    const definition = parseResult.data as LabelDefinition;

    const result = await labelerService.addLabel(definition);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    await db.insert(auditLogs).values({
      id: uuidv4(),
      action: 'label_created',
      actorId: reviewerId,
      targetId: definition.identifier,
      targetType: 'label',
      metadata: JSON.stringify({ definition }),
    });

    return res.json({
      success: true,
      message: `Label "${definition.identifier}" created successfully`,
      label: definition,
    });
  } catch (error) {
    console.error('Create label error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Validation schema for label update
const labelUpdateSchema = z.object({
  severity: z.enum(['inform', 'alert', 'none']).optional(),
  blurs: z.enum(['content', 'media', 'none']).optional(),
  defaultSetting: z.enum(['ignore', 'warn', 'hide']).optional(),
  adultOnly: z.boolean().optional(),
  locales: z.array(z.object({
    lang: z.string().min(2).max(5),
    name: z.string().min(1).max(64),
    description: z.string().min(1).max(10000),
  })).min(1).optional(),
});

/**
 * PATCH /api/admin/labels/:identifier
 * Update an existing label definition
 */
router.patch('/labels/:identifier', async (req: Request, res: Response) => {
  try {
    const { identifier } = req.params;
    const parseResult = labelUpdateSchema.safeParse(req.body);
    
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.errors,
      });
    }

    const reviewerId = (req as Request & { adminDid?: string }).adminDid || 'admin';
    const updates = parseResult.data;

    const result = await labelerService.updateLabel(identifier, updates as Partial<LabelDefinition>);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    await db.insert(auditLogs).values({
      id: uuidv4(),
      action: 'label_updated',
      actorId: reviewerId,
      targetId: identifier,
      targetType: 'label',
      metadata: JSON.stringify({ updates }),
    });

    return res.json({
      success: true,
      message: `Label "${identifier}" updated successfully`,
    });
  } catch (error) {
    console.error('Update label error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Validation schema for delete confirmation
const labelDeleteSchema = z.object({
  confirmIdentifier: z.string(),
  confirmPhrase: z.literal('DELETE THIS LABEL'),
});

/**
 * DELETE /api/admin/labels/:identifier
 * Delete a label definition (requires confirmation)
 */
router.delete('/labels/:identifier', async (req: Request, res: Response) => {
  try {
    const { identifier } = req.params;
    const parseResult = labelDeleteSchema.safeParse(req.body);
    
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.errors,
        message: 'You must confirm deletion by providing confirmIdentifier and confirmPhrase',
      });
    }

    const { confirmIdentifier, confirmPhrase } = parseResult.data;

    if (confirmIdentifier !== identifier) {
      return res.status(400).json({ error: 'Confirmation identifier does not match' });
    }

    if (confirmPhrase !== 'DELETE THIS LABEL') {
      return res.status(400).json({ error: 'Invalid confirmation phrase' });
    }

    const reviewerId = (req as Request & { adminDid?: string }).adminDid || 'admin';

    const usageCount = await labelerService.getLabelUsageCount(identifier);
    const result = await labelerService.deleteLabel(identifier);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    await db.insert(auditLogs).values({
      id: uuidv4(),
      action: 'label_deleted',
      actorId: reviewerId,
      targetId: identifier,
      targetType: 'label',
      metadata: JSON.stringify({ usageCount, deletedAt: new Date().toISOString() }),
    });

    return res.json({
      success: true,
      message: `Label "${identifier}" deleted successfully`,
      warning: usageCount > 0
        ? `This label was applied to ${usageCount} accounts. Those accounts will no longer show this badge.`
        : undefined,
    });
  } catch (error) {
    console.error('Delete label error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
