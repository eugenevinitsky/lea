import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  communityNotes,
  communityNoteRatings,
  communityNoteScores,
  communityNoteDisputes,
} from '@/lib/db/schema';
import { scoreNotes, type Rating, type NoteStatus } from '@/lib/community-notes-scoring';
import { eq, inArray, sql } from 'drizzle-orm';
import { publishNoteLabel, negateNoteLabel } from '@/lib/community-notes-labels';
import { verifyBearerSecret } from '@/lib/server-auth';

const MAX_LABEL_OPS_PER_RUN = 50;
const LABEL_OP_DELAY_MS = 200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('CRON_SECRET not configured');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }
  if (!verifyBearerSecret(authHeader, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    // Load only the columns needed for scoring
    const allRatings = await db
      .select({
        noteId: communityNoteRatings.noteId,
        raterDid: communityNoteRatings.raterDid,
        helpfulness: communityNoteRatings.helpfulness,
      })
      .from(communityNoteRatings);

    const ratings: Rating[] = allRatings;

    if (ratings.length === 0) {
      return NextResponse.json({
        success: true,
        scored: 0,
        ratings: 0,
        labels: { published: 0, negated: 0, errors: 0 },
        disputes: { resolved: 0 },
        durationMs: Date.now() - startTime,
      });
    }

    // Load previous scores before running new scoring
    const noteIds = [...new Set(allRatings.map((r) => r.noteId))];
    const previousScores = noteIds.length > 0
      ? await db
          .select({
            noteId: communityNoteScores.noteId,
            status: communityNoteScores.status,
          })
          .from(communityNoteScores)
          .where(inArray(communityNoteScores.noteId, noteIds))
      : [];

    const previousStatusMap = new Map(previousScores.map((s) => [s.noteId, s.status]));

    // Run MF scoring
    const scores = scoreNotes(ratings);

    // Batch upsert all scores in a single query
    if (scores.length > 0) {
      await db
        .insert(communityNoteScores)
        .values(
          scores.map((s) => ({
            noteId: s.noteId,
            intercept: s.intercept,
            factor: s.factor,
            ratingCount: s.ratingCount,
            status: s.status,
          }))
        )
        .onConflictDoUpdate({
          target: communityNoteScores.noteId,
          set: {
            intercept: sql`excluded.intercept`,
            factor: sql`excluded.factor`,
            ratingCount: sql`excluded.rating_count`,
            status: sql`excluded.status`,
            scoredAt: sql`now()`,
          },
        });
    }

    // ==================== LABEL PUBLISHING ====================
    // Find notes where status changed
    const changedNotes: Array<{
      noteId: string;
      oldStatus: string | null;
      newStatus: NoteStatus;
    }> = [];

    for (const score of scores) {
      const oldStatus = previousStatusMap.get(score.noteId) ?? null;
      if (oldStatus !== score.status) {
        changedNotes.push({
          noteId: score.noteId,
          oldStatus,
          newStatus: score.status,
        });
      }
    }

    let labelsPublished = 0;
    let labelsNegated = 0;
    let labelErrors = 0;

    // Get post URIs for changed notes
    const changedNoteIds = changedNotes.slice(0, MAX_LABEL_OPS_PER_RUN).map((n) => n.noteId);
    const notePostUris = changedNoteIds.length > 0
      ? await db
          .select({ id: communityNotes.id, postUri: communityNotes.postUri })
          .from(communityNotes)
          .where(inArray(communityNotes.id, changedNoteIds))
      : [];
    const postUriMap = new Map(notePostUris.map((n) => [n.id, n.postUri]));

    for (const changed of changedNotes.slice(0, MAX_LABEL_OPS_PER_RUN)) {
      const postUri = postUriMap.get(changed.noteId);
      if (!postUri) continue;

      try {
        if (changed.newStatus === 'CRNH') {
          // Negate any existing label
          const success = await negateNoteLabel(changed.noteId, postUri);
          if (success) labelsNegated++;
          else labelErrors++;
        } else {
          // Publish or update label (CRH → annotation, NMR → proposed-annotation)
          const success = await publishNoteLabel(changed.noteId, postUri, changed.newStatus);
          if (success) labelsPublished++;
          else labelErrors++;
        }
      } catch (error) {
        console.error(`Label op failed for note ${changed.noteId}:`, error);
        labelErrors++;
      }

      await delay(LABEL_OP_DELAY_MS);
    }

    // ==================== DISPUTE RESOLUTION ====================
    // If a dispute note reaches CRH, negate the original note's label
    let disputesResolved = 0;

    const pendingDisputes = await db
      .select()
      .from(communityNoteDisputes)
      .where(eq(communityNoteDisputes.status, 'pending'));

    if (pendingDisputes.length > 0) {
      const disputeNoteIds = pendingDisputes.map((d) => d.disputeNoteId);
      const disputeScores = await db
        .select({ noteId: communityNoteScores.noteId, status: communityNoteScores.status })
        .from(communityNoteScores)
        .where(inArray(communityNoteScores.noteId, disputeNoteIds));

      const disputeScoreMap = new Map(disputeScores.map((s) => [s.noteId, s.status]));

      for (const dispute of pendingDisputes) {
        const disputeStatus = disputeScoreMap.get(dispute.disputeNoteId);

        if (disputeStatus === 'CRH') {
          // Dispute reached CRH — negate the original note's label
          const [targetNote] = await db
            .select({ postUri: communityNotes.postUri })
            .from(communityNotes)
            .where(eq(communityNotes.id, dispute.targetNoteId))
            .limit(1);

          if (targetNote) {
            await negateNoteLabel(dispute.targetNoteId, targetNote.postUri);
          }

          await db
            .update(communityNoteDisputes)
            .set({ status: 'approved', resolvedAt: new Date() })
            .where(eq(communityNoteDisputes.id, dispute.id));

          disputesResolved++;
        } else if (disputeStatus === 'CRNH') {
          // Dispute was voted not helpful — reject it
          await db
            .update(communityNoteDisputes)
            .set({ status: 'rejected', resolvedAt: new Date() })
            .where(eq(communityNoteDisputes.id, dispute.id));

          disputesResolved++;
        }
      }
    }

    const durationMs = Date.now() - startTime;
    console.log(
      `[COMMUNITY NOTES SCORING] scored=${scores.length} ratings=${ratings.length} ` +
      `labels_published=${labelsPublished} labels_negated=${labelsNegated} label_errors=${labelErrors} ` +
      `disputes_resolved=${disputesResolved} duration=${durationMs}ms`
    );

    return NextResponse.json({
      success: true,
      scored: scores.length,
      ratings: ratings.length,
      labels: {
        changed: changedNotes.length,
        published: labelsPublished,
        negated: labelsNegated,
        errors: labelErrors,
      },
      disputes: {
        pending: pendingDisputes.length,
        resolved: disputesResolved,
      },
      durationMs,
    });
  } catch (error) {
    console.error('Community notes scoring error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
