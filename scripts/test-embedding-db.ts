import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { discoveredSubstackPosts } from '../lib/db/schema';
import { initEmbeddingClassifier, batchClassifyWithEmbedding, loadEmbeddingData } from '../lib/embedding-classifier';

const API_KEY = process.env.GOOGLE_AI_API_KEY!;
const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });
const db = drizzle(pool);

async function main() {
  console.log('Loading embedding data...');
  const data = await loadEmbeddingData();
  initEmbeddingClassifier(API_KEY, data);

  console.log('Fetching posts from database...');
  const allPosts = await db.select().from(discoveredSubstackPosts);
  console.log(`Found ${allPosts.length} posts\n`);

  // Sample 100 random posts to test
  const sample = allPosts.sort(() => Math.random() - 0.5).slice(0, 100);

  console.log('Classifying sample of 100 posts...');
  const texts = sample.map(p => [p.title || '', p.description || ''].filter(Boolean).join(' '));

  // Batch in groups of 50 (API limit)
  const results: { title: string; probability: number }[] = [];
  for (let i = 0; i < texts.length; i += 50) {
    const batch = texts.slice(i, i + 50);
    const batchResults = await batchClassifyWithEmbedding(batch);
    for (let j = 0; j < batchResults.length; j++) {
      results.push({
        title: sample[i + j].title || '',
        probability: batchResults[j].probability,
      });
    }
    console.log(`  Processed ${Math.min(i + 50, texts.length)}/${texts.length}`);
  }

  // Sort by probability
  results.sort((a, b) => b.probability - a.probability);

  console.log('\n=== DISTRIBUTION ===');
  for (const t of [0.5, 0.6, 0.7, 0.8, 0.9]) {
    const count = results.filter(r => r.probability >= t).length;
    console.log(`>= ${t}: ${count}/100`);
  }

  console.log('\n=== TOP 20 (Most Technical) ===');
  for (const r of results.slice(0, 20)) {
    console.log(`[${r.probability.toFixed(3)}] ${r.title.slice(0, 65)}`);
  }

  console.log('\n=== BOTTOM 20 (Least Technical) ===');
  for (const r of results.slice(-20)) {
    console.log(`[${r.probability.toFixed(3)}] ${r.title.slice(0, 65)}`);
  }

  process.exit(0);
}

main().catch(console.error);
