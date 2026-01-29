/**
 * Cleanup Substack posts using embedding classifier
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { discoveredSubstackPosts, substackMentions } from '../lib/db/schema';
import { inArray } from 'drizzle-orm';
import { initEmbeddingClassifier, batchClassifyWithEmbedding, loadEmbeddingData } from '../lib/embedding-classifier';

const API_KEY = process.env.GOOGLE_AI_API_KEY!;
const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });
const db = drizzle(pool);

const THRESHOLD = 0.6; // Posts below this are removed
const BATCH_SIZE = 50; // Google API batch limit

async function main() {
  const shouldDelete = process.argv.includes('--delete');

  console.log('Loading embedding classifier...');
  const data = await loadEmbeddingData();
  if (!data) {
    console.error('Failed to load embeddings file. Make sure lib/classifier-embeddings.json exists.');
    process.exit(1);
  }
  initEmbeddingClassifier(API_KEY, data);

  console.log('Fetching all Substack posts...');
  const allPosts = await db.select().from(discoveredSubstackPosts);
  console.log(`Found ${allPosts.length} posts\n`);

  const kept: { id: number; title: string | null; probability: number }[] = [];
  const removed: { id: number; title: string | null; probability: number }[] = [];

  // Process in batches
  for (let i = 0; i < allPosts.length; i += BATCH_SIZE) {
    const batch = allPosts.slice(i, i + BATCH_SIZE);
    const texts = batch.map(p => [p.title || '', p.description || ''].filter(Boolean).join(' '));

    process.stdout.write(`\rProcessing ${i + batch.length}/${allPosts.length}...`);

    const results = await batchClassifyWithEmbedding(texts);

    for (let j = 0; j < results.length; j++) {
      const post = batch[j];
      const probability = results[j].probability;

      if (probability >= THRESHOLD) {
        kept.push({ id: post.id, title: post.title, probability });
      } else {
        removed.push({ id: post.id, title: post.title, probability });
      }
    }

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('\n\n--- Results ---');
  console.log(`Kept: ${kept.length}`);
  console.log(`To remove: ${removed.length}`);

  // Show distribution
  console.log('\n--- Distribution ---');
  for (const t of [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
    const count = kept.filter(p => p.probability >= t).length + removed.filter(p => p.probability >= t).length;
    console.log(`>= ${t}: ${count}`);
  }

  // Show borderline posts
  console.log('\nBorderline posts (0.4-0.6):');
  const borderline = [...kept, ...removed]
    .filter(p => p.probability >= 0.4 && p.probability < 0.6)
    .sort((a, b) => a.probability - b.probability);
  for (const p of borderline.slice(0, 20)) {
    console.log(`  [${p.probability.toFixed(3)}] ${p.title}`);
  }

  // Show posts to remove
  console.log('\nSample posts to remove (lowest probability):');
  removed.sort((a, b) => a.probability - b.probability);
  for (const p of removed.slice(0, 20)) {
    console.log(`  [${p.probability.toFixed(3)}] ${p.title}`);
  }

  if (removed.length > 0 && shouldDelete) {
    console.log('\nDeleting...');
    const removedIds = removed.map(p => p.id);

    // Delete in batches to avoid query size limits
    for (let i = 0; i < removedIds.length; i += 500) {
      const batch = removedIds.slice(i, i + 500);
      await db.delete(substackMentions).where(inArray(substackMentions.substackPostId, batch));
      await db.delete(discoveredSubstackPosts).where(inArray(discoveredSubstackPosts.id, batch));
      console.log(`  Deleted ${Math.min(i + 500, removedIds.length)}/${removedIds.length}`);
    }
    console.log('Done!');
  } else if (removed.length > 0) {
    console.log('\nRun with --delete to actually remove these posts');
  }

  process.exit(0);
}

main().catch(console.error);
