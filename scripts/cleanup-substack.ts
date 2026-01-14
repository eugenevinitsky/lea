import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { discoveredSubstackPosts, substackMentions } from '../lib/db/schema';
import { inArray } from 'drizzle-orm';
import model from '../lib/classifier-model.json';

const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.DATABASE_URL;
const pool = new pg.Pool({
  connectionString,
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

// Normalized margin threshold - require margin > 0.05 for technical classification
const NORMALIZED_MARGIN_THRESHOLD = 0.05;

function classifyContent(combinedText: string): { isTechnical: boolean; normalizedMargin: number } {
  const tokens = tokenize(combinedText);
  if (tokens.length === 0) {
    return { isTechnical: false, normalizedMargin: -1 };
  }

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

  const margin = techScore - nonTechScore;
  const normalizedMargin = margin / (tokens.length + 1);

  return {
    isTechnical: normalizedMargin > NORMALIZED_MARGIN_THRESHOLD,
    normalizedMargin,
  };
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

// Fetch body text directly from article page (fallback when RSS doesn't have it)
async function fetchBodyFromPage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Lea/1.0 (mailto:support@lea.community)',
        'Accept': 'text/html',
      },
    });

    if (!response.ok) return null;

    const html = await response.text();

    // Find content between available-content and end of article
    const start = html.indexOf('class="available-content"');
    const end = html.indexOf('</article>');

    if (start > 0 && end > start) {
      const content = html.slice(start, end);
      // Extract text from paragraphs
      const paragraphs = content.match(/<p[^>]*>([^<]+)<\/p>/g) || [];
      const text = paragraphs.map(p => stripHtml(p)).join(' ');
      if (text.length > 100) {
        return text.slice(0, 2000);
      }
    }

    // Fallback: try to get text from article body
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/);
    if (articleMatch) {
      const bodyText = stripHtml(articleMatch[1]);
      if (bodyText.length > 100) {
        return bodyText.slice(0, 2000);
      }
    }

    return null;
  } catch {
    return null;
  }
}

// Fetch body text - try RSS first, then fall back to page scraping
async function fetchBodyText(subdomain: string, slug: string, url: string): Promise<string | null> {
  // Try RSS first (faster, less load on Substack)
  const rssBody = await fetchBodyFromRss(subdomain, slug);
  if (rssBody) return rssBody;

  // Fall back to fetching the actual page
  return fetchBodyFromPage(url);
}

async function main() {
  const shouldDelete = process.argv.includes('--delete');

  console.log('Fetching all Substack posts...');
  const allPosts = await db.select().from(discoveredSubstackPosts);
  console.log(`Found ${allPosts.length} posts\n`);

  const kept: { id: number; title: string | null; normalizedMargin: number }[] = [];
  const removed: { id: number; title: string | null; hasBody: boolean; normalizedMargin: number }[] = [];

  for (let i = 0; i < allPosts.length; i++) {
    const post = allPosts[i];
    process.stdout.write(`\rProcessing ${i + 1}/${allPosts.length}: ${post.subdomain}/${post.slug?.slice(0, 30)}...                    `);

    let bodyText: string | null = null;
    if (post.subdomain && post.slug) {
      bodyText = await fetchBodyText(post.subdomain, post.slug, post.url);
    }

    const classificationText = [
      post.title || '',
      post.description || '',
      bodyText || '',
    ].filter(Boolean).join(' ');

    const { isTechnical, normalizedMargin } = classifyContent(classificationText);

    if (isTechnical) {
      kept.push({ id: post.id, title: post.title, normalizedMargin });
    } else {
      removed.push({
        id: post.id,
        title: post.title,
        hasBody: !!bodyText,
        normalizedMargin,
      });
    }
  }

  console.log('\n\n--- Results ---');
  console.log(`Kept: ${kept.length}`);
  console.log(`To remove: ${removed.length}`);

  console.log('\nPosts to remove (sorted by normalized margin):');
  removed.sort((a, b) => b.normalizedMargin - a.normalizedMargin);
  removed.forEach(p => console.log(`  - [${p.normalizedMargin.toFixed(3)}] ${p.title} (body: ${p.hasBody ? 'yes' : 'no'})`));

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
