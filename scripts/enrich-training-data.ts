/**
 * Enrich training data with body text from RSS feeds
 *
 * This script:
 * 1. Reads current training data (titles + labels)
 * 2. Matches titles to database entries to get subdomain/slug
 * 3. Fetches body text from RSS feeds
 * 4. Outputs enriched training data with title + description + body text
 *
 * Usage: npx tsx scripts/enrich-training-data.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { db, discoveredSubstackPosts } from '@/lib/db';
import { eq, ilike } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

interface TrainingExample {
  text: string;
  label: 'technical' | 'non-technical';
}

interface EnrichedExample {
  text: string;
  label: 'technical' | 'non-technical';
  originalTitle: string;
  hasBodyText: boolean;
}

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

// Fetch article body from RSS feed
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

    // Find the item with matching slug in link
    const items = xml.split('<item>');
    for (const item of items.slice(1)) {
      const linkMatch = item.match(/<link>([^<]+)<\/link>/);
      if (linkMatch && linkMatch[1].includes(`/p/${slug}`)) {
        // Found matching item - extract content:encoded
        const contentMatch = item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/);
        if (contentMatch) {
          const bodyText = stripHtml(contentMatch[1]);
          // Return first 2000 chars of body text (same as ingest)
          return bodyText.slice(0, 2000);
        }
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

// Try to find a post in DB by title (exact or fuzzy match)
async function findPostByTitle(title: string): Promise<{
  subdomain: string;
  slug: string;
  description: string | null;
} | null> {
  // First try exact match
  const [exactMatch] = await db
    .select({
      subdomain: discoveredSubstackPosts.subdomain,
      slug: discoveredSubstackPosts.slug,
      description: discoveredSubstackPosts.description,
    })
    .from(discoveredSubstackPosts)
    .where(eq(discoveredSubstackPosts.title, title))
    .limit(1);

  if (exactMatch) return exactMatch;

  // Try case-insensitive match
  const [ilikeMatch] = await db
    .select({
      subdomain: discoveredSubstackPosts.subdomain,
      slug: discoveredSubstackPosts.slug,
      description: discoveredSubstackPosts.description,
    })
    .from(discoveredSubstackPosts)
    .where(ilike(discoveredSubstackPosts.title, title))
    .limit(1);

  return ilikeMatch || null;
}

async function main() {
  const inputPath = path.join(__dirname, '../data/training-data.json');
  const outputPath = path.join(__dirname, '../data/training-data-enriched.json');

  console.log('Loading training data...');
  const rawData = fs.readFileSync(inputPath, 'utf-8');
  const examples: TrainingExample[] = JSON.parse(rawData);

  console.log(`Found ${examples.length} training examples\n`);

  const enriched: EnrichedExample[] = [];
  let matchedCount = 0;
  let bodyTextCount = 0;
  let descriptionCount = 0;

  for (let i = 0; i < examples.length; i++) {
    const example = examples[i];

    // The current text might already contain description - extract just the title
    // Titles are usually the first sentence or before the first period/newline
    const originalText = example.text;
    const titleGuess = originalText.split(/[.!?\n]/)[0].trim();

    if (i % 50 === 0) {
      console.log(`Processing ${i + 1}/${examples.length}...`);
    }

    // Try to find in database
    const post = await findPostByTitle(titleGuess) || await findPostByTitle(originalText);

    if (post) {
      matchedCount++;

      // Build combined text like inference does
      const parts: string[] = [titleGuess];

      if (post.description) {
        parts.push(post.description);
        descriptionCount++;
      }

      // Fetch body text from RSS
      const bodyText = await fetchBodyFromRss(post.subdomain, post.slug);
      if (bodyText) {
        parts.push(bodyText);
        bodyTextCount++;
      }

      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));

      enriched.push({
        text: parts.join(' '),
        label: example.label,
        originalTitle: titleGuess,
        hasBodyText: !!bodyText,
      });
    } else {
      // Couldn't find in DB - keep original
      enriched.push({
        text: originalText,
        label: example.label,
        originalTitle: originalText,
        hasBodyText: false,
      });
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Total examples: ${examples.length}`);
  console.log(`Matched in DB: ${matchedCount}`);
  console.log(`With description: ${descriptionCount}`);
  console.log(`With body text: ${bodyTextCount}`);

  // Calculate new average text length
  const avgLength = enriched.reduce((sum, e) => sum + e.text.length, 0) / enriched.length;
  console.log(`Average text length: ${avgLength.toFixed(0)} chars (was ~79)`);

  // Save enriched data
  fs.writeFileSync(outputPath, JSON.stringify(enriched, null, 2));
  console.log(`\nEnriched data saved to: ${outputPath}`);

  // Also save in training format (just text + label)
  const trainingFormat = enriched.map(e => ({
    text: e.text,
    label: e.label,
  }));
  const trainingOutputPath = path.join(__dirname, '../data/training-data-with-body.json');
  fs.writeFileSync(trainingOutputPath, JSON.stringify(trainingFormat, null, 2));
  console.log(`Training format saved to: ${trainingOutputPath}`);
}

main().catch(console.error);
