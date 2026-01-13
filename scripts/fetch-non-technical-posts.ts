/**
 * Fetch real non-technical Substack posts for training data
 *
 * Searches known political/lifestyle newsletters and fetches their content
 *
 * Usage: npx tsx scripts/fetch-non-technical-posts.ts
 */

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

// Known political/lifestyle/non-technical Substack newsletters
const NON_TECHNICAL_NEWSLETTERS = [
  // Political newsletters
  'luciantruscott', // Political commentary
  'heathercoxrichardson', // Political history
  'popularinformation', // Political
  'commonsense', // Bari Weiss
  'slowboring', // Matt Yglesias
  'noahpinion', // Noah Smith - econ/politics (but also technical)
  'thebulwark',
  'tangle', // Isaac Saul politics
  'bigtechnology',
  // More political
  'steady', // Dan Rather
  'theankler', // Hollywood
  'dansinker',
  'charliewarzel',
  'russelljmoore',
  'caitlinmoran',
  'jeffjarvis',
  'davekarpf',
  'thepresentage', // Parker Molloy
  'griefbacon',
  'readmore',
  'semafor',
  'platformer', // Tech policy/politics
  'lux', // Culture
  'benwakana',
  'mattstoller', // Antitrust
  'joshbarro',
  'donmoynihan',
  'everythingisamazing',
  'juliacarolina',
  'overcomingbias',
  'flyingwithadog',
  'newsletters', // Generic
  'jessesingal',
  'freddieboyle', // Freddie deBoer
  'andrewsullivan',
  'jimgeraghty',
  'seancarroll', // Mix but often broader topics
  'theswamp',
  'puckslinger',
  'sidecar',
  'signaldisruption',
  // Lifestyle
  'annehelen',
  'embedded',
  'garbageday', // Internet culture
  'galaxybrain',
  // Sports/Entertainment
  'defector',
  'theathletic',
  'theringer',
];

// Fetch posts from a newsletter's RSS feed
async function fetchNewsletterPosts(subdomain: string): Promise<{
  title: string;
  description: string;
  bodyText: string;
}[]> {
  const posts: { title: string; description: string; bodyText: string }[] = [];

  try {
    // Try both substack.com and custom domain formats
    const feedUrls = [
      `https://${subdomain}.substack.com/feed`,
    ];

    for (const feedUrl of feedUrls) {
      try {
        const response = await fetch(feedUrl, {
          headers: {
            'User-Agent': 'Lea/1.0 (mailto:support@lea.community)',
            'Accept': 'application/rss+xml, application/xml, text/xml',
          },
        });

        if (!response.ok) continue;

        const xml = await response.text();
        const items = xml.split('<item>');

        for (const item of items.slice(1, 11)) { // Get up to 10 posts per newsletter
          const titleMatch = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
                            item.match(/<title>([^<]+)<\/title>/);
          const descMatch = item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ||
                           item.match(/<description>([^<]+)<\/description>/);
          const contentMatch = item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/);

          if (titleMatch && contentMatch) {
            const title = stripHtml(titleMatch[1]);
            const description = descMatch ? stripHtml(descMatch[1]) : '';
            const bodyText = stripHtml(contentMatch[1]).slice(0, 2000);

            // Skip very short posts
            if (bodyText.length > 200) {
              posts.push({ title, description, bodyText });
            }
          }
        }

        if (posts.length > 0) break; // Found posts, don't try other URLs
      } catch {
        continue;
      }
    }
  } catch {
    // Ignore errors
  }

  return posts;
}

// Search Substack for political/lifestyle content
async function searchSubstackByCategory(category: string): Promise<{
  title: string;
  subdomain: string;
  slug: string;
}[]> {
  const results: { title: string; subdomain: string; slug: string }[] = [];

  try {
    const searchUrl = `https://substack.com/api/v1/universal_search?query=${encodeURIComponent(category)}&type=posts&limit=20`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      for (const post of data.results || []) {
        const pubUrl = post.publication?.base_url || '';
        const subdomainMatch = pubUrl.match(/https?:\/\/([^.]+)\.substack\.com/);
        const subdomain = subdomainMatch?.[1];

        if (subdomain && post.slug && post.title) {
          results.push({
            title: post.title,
            subdomain,
            slug: post.slug,
          });
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return results;
}

async function main() {
  const outputPath = path.join(__dirname, '../data/non-technical-posts.json');

  console.log('Fetching non-technical Substack posts...\n');

  const examples: TrainingExample[] = [];

  // === PART 1: Fetch from known newsletters ===
  console.log('=== Fetching from known newsletters ===');

  for (const newsletter of NON_TECHNICAL_NEWSLETTERS) {
    console.log(`Fetching from ${newsletter}...`);
    const posts = await fetchNewsletterPosts(newsletter);

    for (const post of posts) {
      const text = [post.title, post.description, post.bodyText].filter(Boolean).join(' ');
      examples.push({ text, label: 'non-technical' });
    }

    console.log(`  Found ${posts.length} posts`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // === PART 2: Search by political topics ===
  console.log('\n=== Searching by political topics ===');

  const politicalTopics = [
    'Trump election 2024',
    'Biden administration policy',
    'Congress legislation',
    'political commentary',
    'election analysis',
    'democratic party',
    'republican party',
    'white house',
    'senate vote',
    'political opinion',
    'culture war',
    'celebrity news',
    'sports news football',
    'fashion trends',
    'lifestyle advice',
    'relationship advice',
    'parenting tips',
    'cooking recipes',
    'travel destinations',
    'fitness workout',
    // More political
    'MAGA movement',
    'progressive left',
    'conservative opinion',
    'liberal media',
    'supreme court ruling',
    'immigration policy',
    'healthcare debate',
    'abortion rights',
    'gun control',
    'climate policy debate',
    // More lifestyle
    'dating advice',
    'wedding planning',
    'home decor',
    'skincare routine',
    'weight loss tips',
    'meditation practice',
    'book recommendations',
    'movie review',
    'tv show recap',
    'true crime',
    'celebrity gossip',
    'music industry',
    'nfl football',
    'nba basketball',
    'soccer news',
    'personal finance',
    'real estate market',
    'stock market',
    'crypto trading',
  ];

  for (const topic of politicalTopics) {
    console.log(`Searching for "${topic}"...`);
    const searchResults = await searchSubstackByCategory(topic);

    for (const result of searchResults.slice(0, 5)) {
      // Fetch body text from RSS
      try {
        const feedUrl = `https://${result.subdomain}.substack.com/feed`;
        const response = await fetch(feedUrl, {
          headers: {
            'User-Agent': 'Lea/1.0 (mailto:support@lea.community)',
            'Accept': 'application/rss+xml, application/xml, text/xml',
          },
        });

        if (response.ok) {
          const xml = await response.text();
          const items = xml.split('<item>');

          for (const item of items.slice(1)) {
            const linkMatch = item.match(/<link>([^<]+)<\/link>/);
            if (linkMatch && linkMatch[1].includes(`/p/${result.slug}`)) {
              const contentMatch = item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/);
              const descMatch = item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/);

              if (contentMatch) {
                const bodyText = stripHtml(contentMatch[1]).slice(0, 2000);
                const description = descMatch ? stripHtml(descMatch[1]) : '';

                if (bodyText.length > 200) {
                  examples.push({
                    text: [result.title, description, bodyText].filter(Boolean).join(' '),
                    label: 'non-technical',
                  });
                }
              }
              break;
            }
          }
        }
      } catch {
        // Ignore errors
      }
    }

    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // === Summary ===
  console.log('\n=== Summary ===');
  console.log(`Total non-technical examples: ${examples.length}`);

  const avgLength = examples.length > 0
    ? examples.reduce((sum, e) => sum + e.text.length, 0) / examples.length
    : 0;
  console.log(`Average text length: ${avgLength.toFixed(0)} chars`);

  // Save
  fs.writeFileSync(outputPath, JSON.stringify(examples, null, 2));
  console.log(`\nSaved to: ${outputPath}`);
}

main().catch(console.error);
