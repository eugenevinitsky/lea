import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { discoveredSubstackPosts } from '../lib/db/schema';
import { classifyContent } from '../lib/substack-classifier';

const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.DATABASE_URL;
const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});
const db = drizzle(pool);

async function main() {
  console.log('Fetching all Substack posts...');
  const allPosts = await db.select().from(discoveredSubstackPosts);
  console.log(`Found ${allPosts.length} posts\n`);

  const all: { id: number; title: string | null; probability: number }[] = [];

  for (const post of allPosts) {
    const classificationText = [
      post.title || '',
      post.description || '',
    ].filter(Boolean).join(' ');

    const result = classifyContent(classificationText);
    const probability = result.probability ?? 0;
    all.push({ id: post.id, title: post.title, probability });
  }

  // Sort by probability
  all.sort((a, b) => a.probability - b.probability);

  // Test multiple thresholds
  for (const threshold of [0.75, 0.78, 0.80, 0.82, 0.85]) {
    const kept = all.filter(p => p.probability >= threshold);
    const removed = all.filter(p => p.probability < threshold);

    console.log(`\n=== THRESHOLD ${threshold} ===`);
    console.log(`Kept: ${kept.length}, Removed: ${removed.length}`);

    // Sample borderline removed
    const borderlineRemoved = removed.slice(-5);
    console.log('Borderline removed:');
    for (const p of borderlineRemoved) {
      console.log(`  [${p.probability.toFixed(3)}] ${p.title?.slice(0, 60)}`);
    }

    // Sample borderline kept
    const borderlineKept = kept.slice(0, 5);
    console.log('Borderline kept:');
    for (const p of borderlineKept) {
      console.log(`  [${p.probability.toFixed(3)}] ${p.title?.slice(0, 60)}`);
    }
  }

  process.exit(0);
}

main().catch(console.error);
