/**
 * Backfill OCN fields for existing community notes and ratings.
 *
 * Run with: npx dotenv -e .env.local -- npx tsx scripts/backfill-ocn-fields.ts
 */

import { db, communityNotes, communityNoteRatings } from '../lib/db';
import { computeAid } from '../lib/community-notes-aid';
import { CLASSIFICATION_TO_OCN_REASONS } from '../lib/constants';
import { isNull, eq } from 'drizzle-orm';

const BATCH_SIZE = 100;

async function backfillCommunityNotes(): Promise<{ updated: number; skipped: number }> {
  console.log('--- Backfilling community notes ---');

  // Select all notes where aid IS NULL
  const notes = await db
    .select({
      id: communityNotes.id,
      authorDid: communityNotes.authorDid,
      classification: communityNotes.classification,
    })
    .from(communityNotes)
    .where(isNull(communityNotes.aid));

  console.log(`Found ${notes.length} notes with NULL aid`);

  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < notes.length; i += BATCH_SIZE) {
    const batch = notes.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(notes.length / BATCH_SIZE);

    console.log(`  Processing batch ${batchNum}/${totalBatches} (${batch.length} notes)...`);

    for (const note of batch) {
      try {
        const aid = computeAid(note.authorDid);

        // Map classification to OCN reason
        const mappedReason = CLASSIFICATION_TO_OCN_REASONS[note.classification];
        const reasons = mappedReason
          ? JSON.stringify([mappedReason])
          : JSON.stringify(['other']);

        await db
          .update(communityNotes)
          .set({
            aid,
            reasons,
            targetType: 'post',
            labelStatus: 'none',
            updatedAt: new Date(),
          })
          .where(eq(communityNotes.id, note.id));

        updated++;
      } catch (err) {
        console.error(`  Failed to update note ${note.id}:`, err);
        skipped++;
      }
    }
  }

  console.log(`  Notes updated: ${updated}, skipped: ${skipped}`);
  return { updated, skipped };
}

async function backfillCommunityNoteRatings(): Promise<{ updated: number; skipped: number }> {
  console.log('\n--- Backfilling community note ratings ---');

  // Select all ratings where aid IS NULL
  const ratings = await db
    .select({
      id: communityNoteRatings.id,
      raterDid: communityNoteRatings.raterDid,
      helpfulness: communityNoteRatings.helpfulness,
    })
    .from(communityNoteRatings)
    .where(isNull(communityNoteRatings.aid));

  console.log(`Found ${ratings.length} ratings with NULL aid`);

  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < ratings.length; i += BATCH_SIZE) {
    const batch = ratings.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(ratings.length / BATCH_SIZE);

    console.log(`  Processing batch ${batchNum}/${totalBatches} (${batch.length} ratings)...`);

    for (const rating of batch) {
      try {
        const aid = computeAid(rating.raterDid);

        // Map helpfulness to ocnValue: 1.0 -> +1, 0.5 -> 0, 0.0 -> -1
        let ocnValue: number;
        if (rating.helpfulness >= 1.0) {
          ocnValue = 1;
        } else if (rating.helpfulness >= 0.5) {
          ocnValue = 0;
        } else {
          ocnValue = -1;
        }

        await db
          .update(communityNoteRatings)
          .set({
            aid,
            ocnValue,
            updatedAt: new Date(),
          })
          .where(eq(communityNoteRatings.id, rating.id));

        updated++;
      } catch (err) {
        console.error(`  Failed to update rating ${rating.id}:`, err);
        skipped++;
      }
    }
  }

  console.log(`  Ratings updated: ${updated}, skipped: ${skipped}`);
  return { updated, skipped };
}

async function main() {
  console.log('Starting OCN fields backfill...\n');
  const startTime = Date.now();

  try {
    const notesResult = await backfillCommunityNotes();
    const ratingsResult = await backfillCommunityNoteRatings();

    const duration = Date.now() - startTime;
    console.log('\n=== Backfill Complete ===');
    console.log(`Notes:   ${notesResult.updated} updated, ${notesResult.skipped} skipped`);
    console.log(`Ratings: ${ratingsResult.updated} updated, ${ratingsResult.skipped} skipped`);
    console.log(`Duration: ${duration}ms`);
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

main();
