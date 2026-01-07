import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { discoveredSubstackPosts, substackMentions } from '../lib/db/schema';
import { inArray } from 'drizzle-orm';
import model from '../lib/classifier-model.json';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const db = drizzle(pool);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(word => word.length > 0);
}

function isTechnicalContent(title: string, description: string): boolean {
  const tokens = tokenize(title + ' ' + description);
  let techScore = model.classPriors.technical;
  let nonTechScore = model.classPriors['non-technical'];

  for (const token of tokens) {
    techScore += (model.wordLogProbs.technical as Record<string, number>)[token] !== undefined
      ? (model.wordLogProbs.technical as Record<string, number>)[token]
      : model.unknownWordLogProb.technical;
    nonTechScore += (model.wordLogProbs['non-technical'] as Record<string, number>)[token] !== undefined
      ? (model.wordLogProbs['non-technical'] as Record<string, number>)[token]
      : model.unknownWordLogProb['non-technical'];
  }

  return techScore > nonTechScore;
}

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
      if (linkMatch && linkMatch[1].includes(`/p/${slug}`)) {
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

  console.log('Fetching all Substack posts...');
  const allPosts = await db.select().from(discoveredSubstackPosts);
  console.log(`Found ${allPosts.length} posts\n`);

  const kept: { id: number; title: string | null }[] = [];
  const removed: { id: number; title: string | null; hasBody: boolean }[] = [];

  for (let i = 0; i < allPosts.length; i++) {
    const post = allPosts[i];
    process.stdout.write(`\rProcessing ${i + 1}/${allPosts.length}: ${post.subdomain}/${post.slug?.slice(0, 30)}...                    `);

    let bodyText: string | null = null;
    if (post.subdomain && post.slug) {
      bodyText = await fetchBodyFromRss(post.subdomain, post.slug);
    }

    const classificationText = [
      post.title || '',
      post.description || '',
      bodyText || '',
    ].filter(Boolean).join(' ');

    const isTechnical = isTechnicalContent(post.title || '', classificationText);

    if (isTechnical) {
      kept.push({ id: post.id, title: post.title });
    } else {
      removed.push({
        id: post.id,
        title: post.title,
        hasBody: !!bodyText,
      });
    }
  }

  console.log('\n\n--- Results ---');
  console.log(`Kept: ${kept.length}`);
  console.log(`To remove: ${removed.length}`);

  console.log('\nPosts to remove:');
  removed.forEach(p => console.log(`  - ${p.title} (body: ${p.hasBody ? 'yes' : 'no'})`));

  if (removed.length > 0 && shouldDelete) {
    console.log('\nDeleting...');
    const removedIds = removed.map(p => p.id);
    await db.delete(substackMentions).where(inArray(substackMentions.substackPostId, removedIds));
    await db.delete(discoveredSubstackPosts).where(inArray(discoveredSubstackPosts.id, removedIds));
    console.log('Done!');
  } else if (removed.length > 0) {
    console.log('\nRun with --delete to actually remove these posts');
  }

  process.exit(0);
}

main().catch(console.error);
