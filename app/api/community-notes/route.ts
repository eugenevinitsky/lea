import { NextRequest, NextResponse } from 'next/server';
import { db, communityNotes, communityNoteRatings, communityNoteScores, communityNoteDisputes } from '@/lib/db';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { getAuthenticatedDid } from '@/lib/server-auth';
import { computeAid } from '@/lib/community-notes-aid';
import {
  OCN_PROPOSAL_REASONS,
  LEGACY_CLASSIFICATION_MAP,
  CLASSIFICATION_TO_OCN_REASONS,
  MAX_COMMUNITY_NOTE_LENGTH,
  type OcnProposalReason,
} from '@/lib/constants';
import { negateNoteLabel } from '@/lib/community-notes-labels';

const VALID_CLASSIFICATIONS = ['misinformed_or_misleading', 'missing_context', 'needs_nuance', 'other'] as const;

function secureRandomId(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomBytes(6).toString('hex')}`;
}

// Map OCN value (+1/0/-1) to legacy helpfulness (1.0/0.5/0.0)
function ocnValueToHelpfulness(value: number): number {
  if (value === 1) return 1.0;
  if (value === -1) return 0.0;
  return 0.5;
}

// Map legacy helpfulness (1.0/0.5/0.0) to OCN value (+1/0/-1)
function helpfulnessToOcnValue(helpfulness: number): number {
  if (helpfulness === 1.0) return 1;
  if (helpfulness === 0.0) return -1;
  return 0;
}

// GET /api/community-notes?postUri=xxx — Get notes for a post
export async function GET(request: NextRequest) {
  const postUri = request.nextUrl.searchParams.get('postUri');
  if (!postUri) {
    return NextResponse.json({ error: 'postUri required' }, { status: 400 });
  }

  const callerDid = getAuthenticatedDid(request);

  try {
    // Fetch all notes for this post
    const notes = await db
      .select()
      .from(communityNotes)
      .where(eq(communityNotes.postUri, postUri));

    if (notes.length === 0) {
      return NextResponse.json({ notes: [] });
    }

    const noteIds = notes.map((n) => n.id);

    // Fetch scores, live rating counts, and user ratings in parallel
    const [scores, ratingCounts, userRatingRows] = await Promise.all([
      db
        .select()
        .from(communityNoteScores)
        .where(inArray(communityNoteScores.noteId, noteIds)),
      db
        .select({
          noteId: communityNoteRatings.noteId,
          count: sql<number>`count(*)::int`,
        })
        .from(communityNoteRatings)
        .where(inArray(communityNoteRatings.noteId, noteIds))
        .groupBy(communityNoteRatings.noteId),
      callerDid
        ? db
            .select({ noteId: communityNoteRatings.noteId, helpfulness: communityNoteRatings.helpfulness })
            .from(communityNoteRatings)
            .where(
              and(
                inArray(communityNoteRatings.noteId, noteIds),
                eq(communityNoteRatings.raterDid, callerDid)
              )
            )
        : Promise.resolve([]),
    ]);

    const scoreMap = new Map(scores.map((s) => [s.noteId, s]));
    const ratingCountMap = new Map(ratingCounts.map((r) => [r.noteId, r.count]));
    const userRatings = new Map(userRatingRows.map((r) => [r.noteId, r.helpfulness]));

    // Build response:
    //   CRH  → visible to everyone (proven helpful)
    //   NMR  → visible to all authenticated users (needs ratings to graduate)
    //   CRNH → visible only to author/raters (scored not helpful)
    const result = notes
      .map((note) => {
        const score = scoreMap.get(note.id);
        const status = score?.status ?? 'NMR';
        const isAuthor = callerDid === note.authorDid;
        const hasRated = userRatings.has(note.id);

        // CRNH notes only visible to author or raters
        if (status === 'CRNH' && !isAuthor && !hasRated) {
          return null;
        }

        // NMR notes require authentication to view (so they can be rated)
        if (status === 'NMR' && !callerDid && !isAuthor) {
          return null;
        }

        // Parse reasons from JSON
        let reasons: string[] = [];
        try {
          if (note.reasons) {
            reasons = JSON.parse(note.reasons);
          }
        } catch {
          // Fall back to empty
        }

        return {
          id: note.id,
          postUri: note.postUri,
          summary: note.summary,
          classification: note.classification,
          reasons,
          aid: note.aid,
          labelStatus: note.labelStatus ?? 'none',
          targetType: note.targetType ?? 'post',
          createdAt: note.createdAt.toISOString(),
          ratingCount: ratingCountMap.get(note.id) ?? 0,
          status,
          isAuthor,
          userRating: userRatings.get(note.id) ?? null,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ notes: result });
  } catch (error) {
    console.error('Error fetching community notes:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}

// POST /api/community-notes — Create note, rate note, delete note, or dispute
export async function POST(request: NextRequest) {
  const callerDid = getAuthenticatedDid(request);
  if (!callerDid) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const action = body.action as string;

  switch (action) {
    case 'create':
      return handleCreate(callerDid, body);
    case 'rate':
      return handleRate(callerDid, body);
    case 'delete':
      return handleDelete(callerDid, body);
    case 'dispute':
      return handleDispute(callerDid, body);
    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
}

async function handleCreate(
  authorDid: string,
  body: Record<string, unknown>
): Promise<NextResponse> {
  const postUri = body.postUri as string;
  const summary = body.summary as string;
  const reasons = body.reasons as string[] | undefined;
  const classification = body.classification as string | undefined;

  if (!postUri || !summary) {
    return NextResponse.json(
      { error: 'postUri and summary are required' },
      { status: 400 }
    );
  }

  if (summary.length > MAX_COMMUNITY_NOTE_LENGTH) {
    return NextResponse.json(
      { error: `Summary must be ${MAX_COMMUNITY_NOTE_LENGTH} characters or less` },
      { status: 400 }
    );
  }

  // Determine reasons and classification
  let finalReasons: string[];
  let finalClassification: string;

  if (reasons && Array.isArray(reasons) && reasons.length > 0) {
    // New OCN-style: reasons provided
    const validReasons = reasons.filter((r) =>
      (OCN_PROPOSAL_REASONS as readonly string[]).includes(r)
    );
    if (validReasons.length === 0) {
      return NextResponse.json(
        { error: `At least one valid reason required. Valid reasons: ${OCN_PROPOSAL_REASONS.join(', ')}` },
        { status: 400 }
      );
    }
    finalReasons = validReasons;
    // Map first reason to legacy classification
    finalClassification = LEGACY_CLASSIFICATION_MAP[validReasons[0] as OcnProposalReason] ?? 'other';
  } else if (classification) {
    // Legacy-style: classification provided, map to reasons
    if (!VALID_CLASSIFICATIONS.includes(classification as typeof VALID_CLASSIFICATIONS[number])) {
      return NextResponse.json(
        { error: `Invalid classification. Must be one of: ${VALID_CLASSIFICATIONS.join(', ')}` },
        { status: 400 }
      );
    }
    finalClassification = classification;
    const mappedReason = CLASSIFICATION_TO_OCN_REASONS[classification];
    finalReasons = mappedReason ? [mappedReason] : ['other'];
  } else {
    return NextResponse.json(
      { error: 'Either reasons (array) or classification (string) is required' },
      { status: 400 }
    );
  }

  // Compute AID
  let aid: string | undefined;
  try {
    aid = computeAid(authorDid);
  } catch {
    // AID secret not configured — proceed without AID
  }

  try {
    // Check if user already has a note on this post
    const existing = await db
      .select({ id: communityNotes.id })
      .from(communityNotes)
      .where(
        and(
          eq(communityNotes.postUri, postUri),
          eq(communityNotes.authorDid, authorDid)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'You already have a note on this post' },
        { status: 409 }
      );
    }

    const id = secureRandomId('cn');
    await db.insert(communityNotes).values({
      id,
      postUri,
      authorDid,
      summary,
      classification: finalClassification,
      reasons: JSON.stringify(finalReasons),
      aid,
      targetType: 'post',
      labelStatus: 'none',
    });

    return NextResponse.json({ id, success: true }, { status: 201 });
  } catch (error) {
    console.error('Error creating community note:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}

async function handleRate(
  raterDid: string,
  body: Record<string, unknown>
): Promise<NextResponse> {
  const noteId = body.noteId as string;
  const reasons = body.reasons as string[] | undefined;

  // Accept either OCN value or legacy helpfulness
  let helpfulness: number;
  let ocnValue: number;

  if (body.value !== undefined && body.value !== null) {
    // OCN-style: value (+1/0/-1)
    ocnValue = body.value as number;
    if (![1, 0, -1].includes(ocnValue)) {
      return NextResponse.json(
        { error: 'value must be +1, 0, or -1' },
        { status: 400 }
      );
    }
    helpfulness = ocnValueToHelpfulness(ocnValue);
  } else if (body.helpfulness !== undefined && body.helpfulness !== null) {
    // Legacy-style: helpfulness (1.0/0.5/0.0)
    helpfulness = body.helpfulness as number;
    if (![0.0, 0.5, 1.0].includes(helpfulness)) {
      return NextResponse.json(
        { error: 'helpfulness must be 0.0, 0.5, or 1.0' },
        { status: 400 }
      );
    }
    ocnValue = helpfulnessToOcnValue(helpfulness);
  } else {
    return NextResponse.json(
      { error: 'noteId and either helpfulness or value are required' },
      { status: 400 }
    );
  }

  if (!noteId) {
    return NextResponse.json(
      { error: 'noteId is required' },
      { status: 400 }
    );
  }

  // Compute AID
  let aid: string | undefined;
  try {
    aid = computeAid(raterDid);
  } catch {
    // AID secret not configured
  }

  try {
    // Fetch the note to check author
    const [note] = await db
      .select({ authorDid: communityNotes.authorDid })
      .from(communityNotes)
      .where(eq(communityNotes.id, noteId))
      .limit(1);

    if (!note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    if (note.authorDid === raterDid) {
      return NextResponse.json(
        { error: 'You cannot rate your own note' },
        { status: 403 }
      );
    }

    // Upsert rating in a single query using ON CONFLICT
    await db
      .insert(communityNoteRatings)
      .values({
        id: secureRandomId('cnr'),
        noteId,
        raterDid,
        helpfulness,
        ocnValue,
        aid,
        reasons: reasons ? JSON.stringify(reasons) : null,
      })
      .onConflictDoUpdate({
        target: [communityNoteRatings.noteId, communityNoteRatings.raterDid],
        set: {
          helpfulness,
          ocnValue,
          reasons: reasons ? JSON.stringify(reasons) : null,
          updatedAt: sql`now()`,
        },
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error rating community note:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}

async function handleDelete(
  callerDid: string,
  body: Record<string, unknown>
): Promise<NextResponse> {
  const noteId = body.noteId as string;

  if (!noteId) {
    return NextResponse.json({ error: 'noteId is required' }, { status: 400 });
  }

  try {
    // Verify ownership
    const [note] = await db
      .select({
        authorDid: communityNotes.authorDid,
        postUri: communityNotes.postUri,
        labelStatus: communityNotes.labelStatus,
      })
      .from(communityNotes)
      .where(eq(communityNotes.id, noteId))
      .limit(1);

    if (!note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    if (note.authorDid !== callerDid) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Negate any published label before deleting
    if (note.labelStatus && note.labelStatus !== 'none' && note.labelStatus !== 'negated') {
      await negateNoteLabel(noteId, note.postUri);
    }

    // Cascade delete in a transaction for atomicity
    await db.transaction(async (tx) => {
      // Delete disputes referencing this note
      await tx
        .delete(communityNoteDisputes)
        .where(eq(communityNoteDisputes.targetNoteId, noteId));
      await tx
        .delete(communityNoteDisputes)
        .where(eq(communityNoteDisputes.disputeNoteId, noteId));
      await tx
        .delete(communityNoteRatings)
        .where(eq(communityNoteRatings.noteId, noteId));
      await tx
        .delete(communityNoteScores)
        .where(eq(communityNoteScores.noteId, noteId));
      await tx
        .delete(communityNotes)
        .where(eq(communityNotes.id, noteId));
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting community note:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}

async function handleDispute(
  callerDid: string,
  body: Record<string, unknown>
): Promise<NextResponse> {
  const targetNoteId = body.targetNoteId as string;
  const summary = body.summary as string;
  const reasons = body.reasons as string[] | undefined;

  if (!targetNoteId || !summary) {
    return NextResponse.json(
      { error: 'targetNoteId and summary are required' },
      { status: 400 }
    );
  }

  if (summary.length > MAX_COMMUNITY_NOTE_LENGTH) {
    return NextResponse.json(
      { error: `Summary must be ${MAX_COMMUNITY_NOTE_LENGTH} characters or less` },
      { status: 400 }
    );
  }

  // Validate reasons if provided
  let finalReasons: string[] = ['other'];
  if (reasons && Array.isArray(reasons) && reasons.length > 0) {
    const validReasons = reasons.filter((r) =>
      (OCN_PROPOSAL_REASONS as readonly string[]).includes(r)
    );
    if (validReasons.length > 0) {
      finalReasons = validReasons;
    }
  }

  // Compute AID
  let aid: string | undefined;
  try {
    aid = computeAid(callerDid);
  } catch {
    // AID secret not configured
  }

  try {
    // Verify target note exists
    const [targetNote] = await db
      .select({
        id: communityNotes.id,
        postUri: communityNotes.postUri,
        authorDid: communityNotes.authorDid,
      })
      .from(communityNotes)
      .where(eq(communityNotes.id, targetNoteId))
      .limit(1);

    if (!targetNote) {
      return NextResponse.json({ error: 'Target note not found' }, { status: 404 });
    }

    // Cannot dispute your own note
    if (targetNote.authorDid === callerDid) {
      return NextResponse.json(
        { error: 'You cannot dispute your own note' },
        { status: 403 }
      );
    }

    const classification = LEGACY_CLASSIFICATION_MAP[finalReasons[0] as OcnProposalReason] ?? 'other';

    // Create the dispute note
    const noteId = secureRandomId('cn');
    const disputeId = secureRandomId('cnd');

    await db.transaction(async (tx) => {
      // Create community note with targetType='note'
      await tx.insert(communityNotes).values({
        id: noteId,
        postUri: targetNote.postUri, // Same post as the target note
        authorDid: callerDid,
        summary,
        classification,
        reasons: JSON.stringify(finalReasons),
        aid,
        targetType: 'note',
        labelStatus: 'none',
      });

      // Create dispute record
      await tx.insert(communityNoteDisputes).values({
        id: disputeId,
        disputeNoteId: noteId,
        targetNoteId,
        status: 'pending',
      });
    });

    return NextResponse.json({ id: noteId, disputeId, success: true }, { status: 201 });
  } catch (error) {
    console.error('Error creating dispute:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
