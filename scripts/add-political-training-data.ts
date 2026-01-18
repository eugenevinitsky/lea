/**
 * Add political newsletters to non-technical training data
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { db, discoveredSubstackPosts } from '@/lib/db';
import { inArray } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

interface TrainingExample {
  text: string;
  label: 'technical' | 'non-technical';
}

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

// Political newsletters to add - these are subdomains that consistently produce political content
const POLITICAL_SUBDOMAINS = [
  'aaronparnas',      // Aaron Parnas - political commentary
  'meidastouch',      // MeidasTouch - political news
  'heathercoxrichardson', // Letters from an American - political history
  'popularinformation', // Popular Information - political journalism
  'theatlantic',      // The Atlantic political content
  'luciantruscott',   // Lucian Truscott - political commentary
  'samf',             // Sam Freedman - UK politics
  'phillipspobrien',  // Phillips O'Brien - geopolitics (borderline but often political)
  'robert.reich',     // Robert Reich - political economics
  'karfriedrichs',    // Political commentary
];

async function main() {
  const trainingDataPath = path.join(__dirname, '../data/training-data.json');
  const trainingData: TrainingExample[] = JSON.parse(fs.readFileSync(trainingDataPath, 'utf-8'));

  console.log(`Current training data: ${trainingData.length} examples`);
  console.log(`  Technical: ${trainingData.filter(e => e.label === 'technical').length}`);
  console.log(`  Non-technical: ${trainingData.filter(e => e.label === 'non-technical').length}`);

  // Get posts from political subdomains that are currently in our database
  const politicalPosts = await db
    .select()
    .from(discoveredSubstackPosts)
    .where(inArray(discoveredSubstackPosts.subdomain, POLITICAL_SUBDOMAINS));

  console.log(`\nFound ${politicalPosts.length} posts from political subdomains in database`);

  // Also get recent posts that might be political based on keywords
  const allPosts = await db.select().from(discoveredSubstackPosts);
  const politicalKeywords = ['trump', 'biden', 'democrat', 'republican', 'election', 'congress', 'senate', 'political', 'maga', 'liberal', 'conservative'];

  const keywordPoliticalPosts = allPosts.filter(post => {
    const text = `${post.title || ''} ${post.description || ''}`.toLowerCase();
    return politicalKeywords.some(kw => text.includes(kw));
  });

  console.log(`Found ${keywordPoliticalPosts.length} posts with political keywords`);

  // Combine and dedupe
  const allPoliticalPosts = [...politicalPosts];
  for (const post of keywordPoliticalPosts) {
    if (!allPoliticalPosts.find(p => p.id === post.id)) {
      allPoliticalPosts.push(post);
    }
  }

  console.log(`Total unique political posts to add: ${allPoliticalPosts.length}`);

  // Check which are already in training data
  const existingTexts = new Set(trainingData.map(e => e.text.slice(0, 100).toLowerCase()));

  let added = 0;
  let skipped = 0;

  for (const post of allPoliticalPosts) {
    // Skip if already in training data
    const textStart = (post.title || '').slice(0, 100).toLowerCase();
    if (existingTexts.has(textStart)) {
      skipped++;
      continue;
    }

    // Fetch body text
    let bodyText: string | null = null;
    if (post.subdomain && post.slug) {
      bodyText = await fetchBodyFromRss(post.subdomain, post.slug);
      // Rate limit
      await new Promise(r => setTimeout(r, 100));
    }

    // Build text
    const parts = [post.title || ''];
    if (post.description) parts.push(post.description);
    if (bodyText) parts.push(bodyText);

    const text = parts.join(' ').trim();
    if (text.length < 50) {
      skipped++;
      continue;
    }

    trainingData.push({
      text,
      label: 'non-technical',
    });

    existingTexts.add(textStart);
    added++;

    if (added % 50 === 0) {
      console.log(`Added ${added} posts...`);
    }
  }

  console.log(`\nAdded ${added} new non-technical examples (skipped ${skipped} duplicates)`);
  console.log(`New training data: ${trainingData.length} examples`);
  console.log(`  Technical: ${trainingData.filter(e => e.label === 'technical').length}`);
  console.log(`  Non-technical: ${trainingData.filter(e => e.label === 'non-technical').length}`);

  // Save
  fs.writeFileSync(trainingDataPath, JSON.stringify(trainingData, null, 2));
  console.log(`\nSaved to ${trainingDataPath}`);
}

main().catch(console.error);
