/**
 * Remove paywalled posts (posts where body text is not available via RSS)
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { discoveredSubstackPosts, substackMentions } from '../lib/db/schema';
import { desc, inArray } from 'drizzle-orm';

const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });
const db = drizzle(pool);

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
  const limit = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '500');

  console.log(`Checking top ${limit} posts for paywalled content...`);
  const posts = await db.select().from(discoveredSubstackPosts)
    .orderBy(desc(discoveredSubstackPosts.mentionCount))
    .limit(limit);

  console.log(`Processing ${posts.length} posts...\n`);

  const paywalled: { id: number; title: string | null; subdomain: string }[] = [];
  const accessible: { id: number; title: string | null }[] = [];

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    process.stdout.write(`\r${i + 1}/${posts.length}: ${post.subdomain}...`);

    const body = await fetchBodyFromRss(post.subdomain, post.slug);

    if (!body || body.length < 100) {
      paywalled.push({ id: post.id, title: post.title, subdomain: post.subdomain });
    } else {
      accessible.push({ id: post.id, title: post.title });
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 150));
  }

  console.log('\n\n=== Results ===');
  console.log(`Accessible: ${accessible.length}`);
  console.log(`Paywalled: ${paywalled.length}`);

  if (paywalled.length > 0) {
    console.log('\n=== Paywalled Posts to Remove ===');
    // Group by subdomain
    const bySubdomain: Record<string, string[]> = {};
    for (const p of paywalled) {
      if (!bySubdomain[p.subdomain]) bySubdomain[p.subdomain] = [];
      bySubdomain[p.subdomain].push(p.title || 'No title');
    }

    for (const [subdomain, titles] of Object.entries(bySubdomain).slice(0, 20)) {
      console.log(`\n${subdomain} (${titles.length} posts):`);
      for (const title of titles.slice(0, 3)) {
        console.log(`  - ${title.slice(0, 60)}`);
      }
      if (titles.length > 3) console.log(`  ... and ${titles.length - 3} more`);
    }

    if (shouldDelete) {
      console.log('\nDeleting...');
      const ids = paywalled.map(p => p.id);
      for (let i = 0; i < ids.length; i += 100) {
        const batch = ids.slice(i, i + 100);
        await db.delete(substackMentions).where(inArray(substackMentions.substackPostId, batch));
        await db.delete(discoveredSubstackPosts).where(inArray(discoveredSubstackPosts.id, batch));
        console.log(`  Deleted ${Math.min(i + 100, ids.length)}/${ids.length}`);
      }
      console.log('Done!');
    } else {
      console.log('\nRun with --delete to remove these posts');
    }
  }

  process.exit(0);
}

main().catch(console.error);
