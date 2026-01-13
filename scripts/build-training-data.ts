/**
 * Build training data with body text for the Naive Bayes classifier
 *
 * This script:
 * 1. Pulls posts from our database (technical examples) and fetches body text from RSS
 * 2. For non-technical examples, tries to find them on Substack and fetch body text
 * 3. Outputs training data with full text (title + description + body)
 *
 * Usage: npx tsx scripts/build-training-data.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { db, discoveredSubstackPosts } from '@/lib/db';
import { desc, isNotNull } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

interface TrainingExample {
  text: string;
  label: 'technical' | 'non-technical';
}

// Strip HTML tags and decode entities
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

// Fetch body text from RSS feed
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
          return stripHtml(contentMatch[1]).slice(0, 2000);
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Search Substack for a post by title and fetch its content
async function searchAndFetchSubstack(title: string): Promise<{
  subdomain: string;
  slug: string;
  description: string;
  bodyText: string;
} | null> {
  try {
    // Use Substack's search API (unofficial)
    const searchUrl = `https://substack.com/api/v1/universal_search?query=${encodeURIComponent(title)}&type=posts&limit=5`;

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    const posts = data.results || [];

    // Find a post with matching title
    for (const post of posts) {
      if (post.title && post.title.toLowerCase().includes(title.toLowerCase().slice(0, 30))) {
        // Extract subdomain from publication URL
        const pubUrl = post.publication?.base_url || '';
        const subdomainMatch = pubUrl.match(/https?:\/\/([^.]+)\.substack\.com/);
        const subdomain = subdomainMatch?.[1];

        if (subdomain && post.slug) {
          // Fetch body text from RSS
          const bodyText = await fetchBodyFromRss(subdomain, post.slug);
          if (bodyText) {
            return {
              subdomain,
              slug: post.slug,
              description: post.subtitle || post.description || '',
              bodyText,
            };
          }
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  const outputPath = path.join(__dirname, '../data/training-data-with-body.json');

  console.log('Building training data with body text...\n');

  const examples: TrainingExample[] = [];

  // === PART 1: Technical examples from database ===
  console.log('=== Fetching technical examples from database ===');

  const dbPosts = await db
    .select({
      title: discoveredSubstackPosts.title,
      description: discoveredSubstackPosts.description,
      subdomain: discoveredSubstackPosts.subdomain,
      slug: discoveredSubstackPosts.slug,
      mentionCount: discoveredSubstackPosts.mentionCount,
    })
    .from(discoveredSubstackPosts)
    .where(isNotNull(discoveredSubstackPosts.title))
    .orderBy(desc(discoveredSubstackPosts.mentionCount))
    .limit(500); // Get top 500 most mentioned posts

  console.log(`Found ${dbPosts.length} posts in database`);

  let technicalWithBody = 0;
  let technicalWithoutBody = 0;

  for (let i = 0; i < dbPosts.length; i++) {
    const post = dbPosts[i];
    if (i % 50 === 0) console.log(`Processing technical ${i + 1}/${dbPosts.length}...`);

    const bodyText = await fetchBodyFromRss(post.subdomain, post.slug);

    // Build combined text like inference does
    const parts = [post.title];
    if (post.description) parts.push(post.description);
    if (bodyText) {
      parts.push(bodyText);
      technicalWithBody++;
    } else {
      technicalWithoutBody++;
    }

    examples.push({
      text: parts.join(' '),
      label: 'technical',
    });

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`Technical examples: ${technicalWithBody} with body, ${technicalWithoutBody} without\n`);

  // === PART 2: Non-technical examples ===
  console.log('=== Loading non-technical examples ===');

  // Load existing training data for non-technical examples
  const existingDataPath = path.join(__dirname, '../data/training-data.json');
  const existingData: TrainingExample[] = JSON.parse(fs.readFileSync(existingDataPath, 'utf-8'));
  const nonTechnicalTitles = existingData
    .filter(e => e.label === 'non-technical')
    .map(e => e.text);

  console.log(`Found ${nonTechnicalTitles.length} non-technical titles to search`);

  let nonTechWithBody = 0;
  let nonTechWithoutBody = 0;

  for (let i = 0; i < nonTechnicalTitles.length; i++) {
    const title = nonTechnicalTitles[i];
    if (i % 20 === 0) console.log(`Searching non-technical ${i + 1}/${nonTechnicalTitles.length}...`);

    const result = await searchAndFetchSubstack(title);

    if (result) {
      const parts = [title];
      if (result.description) parts.push(result.description);
      parts.push(result.bodyText);

      examples.push({
        text: parts.join(' '),
        label: 'non-technical',
      });
      nonTechWithBody++;
    } else {
      // Keep just the title if we can't find body text
      examples.push({
        text: title,
        label: 'non-technical',
      });
      nonTechWithoutBody++;
    }

    // Rate limiting - be gentle with Substack search
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`Non-technical examples: ${nonTechWithBody} with body, ${nonTechWithoutBody} without\n`);

  // === Summary ===
  const technicalCount = examples.filter(e => e.label === 'technical').length;
  const nonTechnicalCount = examples.filter(e => e.label === 'non-technical').length;
  const avgLength = examples.reduce((sum, e) => sum + e.text.length, 0) / examples.length;

  console.log('=== Summary ===');
  console.log(`Total examples: ${examples.length}`);
  console.log(`  Technical: ${technicalCount}`);
  console.log(`  Non-technical: ${nonTechnicalCount}`);
  console.log(`Average text length: ${avgLength.toFixed(0)} chars`);

  // Save
  fs.writeFileSync(outputPath, JSON.stringify(examples, null, 2));
  console.log(`\nSaved to: ${outputPath}`);
}

main().catch(console.error);
