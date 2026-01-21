/**
 * Local script to cleanup Substack posts using embedding classifier
 * Runs locally to avoid serverless timeout limits
 *
 * Usage: npx tsx scripts/cleanup-substack-local.ts [--dry-run]
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { db, discoveredSubstackPosts, substackMentions } from '@/lib/db';
import { inArray } from 'drizzle-orm';
import { initEmbeddingClassifier, classifyContentAsync, isEmbeddingClassifierReady, TECHNICAL_THRESHOLD } from '@/lib/substack-classifier';

// Strip HTML tags and decode entities to get plain text
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8212;/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

// Try to fetch article body from RSS feed
async function fetchBodyFromRss(subdomain: string, slug: string): Promise<string | null> {
  try {
    const feedUrl = `https://${subdomain}.substack.com/feed`;
    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Lea/1.0 (mailto:support@lea.community)',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
    });

    if (!response.ok) return null;

    const xml = await response.text();
    const items = xml.split('<item>');
    for (const item of items.slice(1)) {
      const linkMatch = item.match(/<link>([^<]+)<\/link>/);
      if (linkMatch && linkMatch[1].includes(`/p/${slug}`)) {
        const contentMatch = item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/);
        if (contentMatch) {
          const bodyText = stripHtml(contentMatch[1]);
          return bodyText.slice(0, 2000);
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
  const rssBody = await fetchBodyFromRss(subdomain, slug);
  if (rssBody) return rssBody;
  return fetchBodyFromPage(url);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  // Parse --limit argument
  let limit = 0; // 0 = no limit
  const limitIdx = process.argv.indexOf('--limit');
  if (limitIdx !== -1 && process.argv[limitIdx + 1]) {
    limit = parseInt(process.argv[limitIdx + 1], 10);
  }

  console.log(`Substack Cleanup Script ${dryRun ? '(DRY RUN)' : ''} ${limit ? `(limit: ${limit})` : ''}`);
  console.log('='.repeat(50));
  console.log(`Using TECHNICAL_THRESHOLD = ${TECHNICAL_THRESHOLD} (same as ingestion)`);
  console.log('');

  // Initialize embedding classifier
  console.log('Initializing embedding classifier...');
  if (!isEmbeddingClassifierReady()) {
    const initialized = await initEmbeddingClassifier();
    if (!initialized) {
      console.error('Failed to initialize embedding classifier. Check GOOGLE_AI_API_KEY.');
      process.exit(1);
    }
  }
  console.log('Classifier initialized.\n');

  // Fetch posts from database
  console.log('Fetching Substack posts from database...');
  const allPosts = limit > 0
    ? await db.select().from(discoveredSubstackPosts).limit(limit)
    : await db.select().from(discoveredSubstackPosts);
  console.log(`Found ${allPosts.length} posts.\n`);

  const kept: { id: number; title: string | null; probability: number; titleDescProb: number; bodyProb: number | null }[] = [];
  const removed: { id: number; title: string | null; probability: number; titleDescProb: number; bodyProb: number | null; reason: string }[] = [];

  for (let i = 0; i < allPosts.length; i++) {
    const post = allPosts[i];
    process.stdout.write(`\rProcessing ${i + 1}/${allPosts.length}: ${post.title?.slice(0, 40) || 'untitled'}...`);

    // Try to fetch body text (RSS first, then page scraping)
    let bodyText: string | null = null;
    if (post.subdomain && post.slug) {
      bodyText = await fetchBodyText(post.subdomain, post.slug, post.url);
    }

    // Classify using embedding k-NN (same params as ingestion)
    const result = await classifyContentAsync(
      post.title || '',
      post.description || '',
      bodyText || undefined,
      15, // k neighbors (same as ingestion)
      { logDecision: false, context: 'cleanup' } // Don't log each one, we summarize at end
    );

    if (result.isTechnical) {
      kept.push({
        id: post.id,
        title: post.title,
        probability: result.probability,
        titleDescProb: result.titleDescProb,
        bodyProb: result.bodyProb,
      });
    } else {
      removed.push({
        id: post.id,
        title: post.title,
        probability: result.probability,
        titleDescProb: result.titleDescProb,
        bodyProb: result.bodyProb,
        reason: `prob=${result.probability.toFixed(3)} (title=${result.titleDescProb.toFixed(3)}, body=${result.bodyProb?.toFixed(3) ?? 'N/A'})`,
      });
    }
  }

  console.log('\n\n' + '='.repeat(50));
  console.log('RESULTS');
  console.log('='.repeat(50));
  console.log(`Total processed: ${allPosts.length}`);
  console.log(`Kept (technical): ${kept.length}`);
  console.log(`Removed (non-technical): ${removed.length}`);

  if (removed.length > 0) {
    console.log('\n--- Posts to be removed: ---');
    for (const post of removed) {
      console.log(`  [${post.probability.toFixed(3)}] ${post.title || '(no title)'}`);
    }
  }

  if (!dryRun && removed.length > 0) {
    console.log('\nDeleting posts from database...');
    const removedIds = removed.map((p) => p.id);

    // Delete mentions first (foreign key constraint)
    await db.delete(substackMentions).where(inArray(substackMentions.substackPostId, removedIds));
    console.log(`Deleted ${removedIds.length} mention records.`);

    // Delete the posts
    await db.delete(discoveredSubstackPosts).where(inArray(discoveredSubstackPosts.id, removedIds));
    console.log(`Deleted ${removedIds.length} posts.`);
  } else if (dryRun && removed.length > 0) {
    console.log('\n(Dry run - no changes made)');
  }

  console.log('\nDone!');
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
