/**
 * Cleanup posts by fetching body text from RSS and reclassifying
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { discoveredSubstackPosts, substackMentions } from '../lib/db/schema';
import { desc, inArray } from 'drizzle-orm';
import { initEmbeddingClassifier, classifyWithEmbedding, loadEmbeddingData } from '../lib/embedding-classifier';

const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });
const db = drizzle(pool);

const THRESHOLD = 0.6;

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchBodyFromRss(subdomain: string, slug: string): Promise<string | null> {
  try {
    const feedUrl = `https://${subdomain}.substack.com/feed`;
    const response = await fetch(feedUrl, {
      headers: { 'User-Agent': 'Lea/1.0' },
    });
    if (!response.ok) return null;

    const xml = await response.text();
    const items = xml.split('<item>');

    for (const item of items.slice(1)) {
      const linkMatch = item.match(/<link>([^<]+)<\/link>/);
      if (linkMatch && linkMatch[1].includes(slug)) {
        const contentMatch = item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/);
        if (contentMatch) {
          return stripHtml(contentMatch[1]).slice(0, 2000);
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  const shouldDelete = process.argv.includes('--delete');
  const limit = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '200');

  console.log('Loading embedding classifier...');
  const data = await loadEmbeddingData();
  initEmbeddingClassifier(process.env.GOOGLE_AI_API_KEY!, data);

  console.log(`Fetching top ${limit} posts by mention count...`);
  const posts = await db.select().from(discoveredSubstackPosts)
    .orderBy(desc(discoveredSubstackPosts.mentionCount))
    .limit(limit);

  console.log(`Processing ${posts.length} posts with body text...\n`);

  const toRemove: { id: number; title: string | null; prob: number; bodyProb?: number }[] = [];
  const toKeep: { id: number; title: string | null; prob: number }[] = [];

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    process.stdout.write(`\r${i + 1}/${posts.length}: ${(post.title || '').slice(0, 40)}...`);

    // First classify with title+description
    const titleDesc = [post.title || '', post.description || ''].join(' ');
    const titleResult = await classifyWithEmbedding(titleDesc);

    // Try to fetch body text
    const body = await fetchBodyFromRss(post.subdomain, post.slug);

    let finalProb = titleResult.probability;
    let bodyProb: number | undefined;

    if (body && body.length > 100) {
      const bodyResult = await classifyWithEmbedding(body);
      bodyProb = bodyResult.probability;
      // Use the lower score (more likely to filter political content)
      finalProb = Math.min(titleResult.probability, bodyResult.probability);
    }

    if (finalProb < THRESHOLD) {
      toRemove.push({ id: post.id, title: post.title, prob: titleResult.probability, bodyProb });
    } else {
      toKeep.push({ id: post.id, title: post.title, prob: finalProb });
    }

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('\n\n=== Results ===');
  console.log(`Keep: ${toKeep.length}`);
  console.log(`Remove: ${toRemove.length}`);

  if (toRemove.length > 0) {
    console.log('\n=== Posts to Remove ===');
    for (const p of toRemove.slice(0, 30)) {
      const bodyInfo = p.bodyProb !== undefined ? ` (body: ${p.bodyProb.toFixed(3)})` : ' (no body)';
      console.log(`[title: ${p.prob.toFixed(3)}${bodyInfo}] ${p.title}`);
    }

    if (shouldDelete) {
      console.log('\nDeleting...');
      const ids = toRemove.map(p => p.id);
      for (let i = 0; i < ids.length; i += 100) {
        const batch = ids.slice(i, i + 100);
        await db.delete(substackMentions).where(inArray(substackMentions.substackPostId, batch));
        await db.delete(discoveredSubstackPosts).where(inArray(discoveredSubstackPosts.id, batch));
      }
      console.log(`Deleted ${ids.length} posts`);
    } else {
      console.log('\nRun with --delete to remove these posts');
    }
  }

  process.exit(0);
}

main().catch(console.error);
