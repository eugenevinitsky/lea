import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { db, discoveredSubstackPosts } from '@/lib/db';
import { initEmbeddingClassifier, classifyContentAsync } from '@/lib/substack-classifier';

const titles = [
  'Major Good News Updates!!',
  'Power to the People',
  'IMPORTANT SUNDAY Message from Meidas Founder',
  'Weekend Update #168: The Trump-Putin Plan To Torment Ukraine Reaches A Crescendo',
  'Cybercab Hearings and FSD Sales Cancelation',
  'The Health Dog Whistles You Keep Hearing'
];

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchBody(subdomain: string, slug: string): Promise<string | null> {
  try {
    const feedUrl = `https://${subdomain}.substack.com/feed`;
    const response = await fetch(feedUrl, {
      headers: { 'User-Agent': 'Lea/1.0', 'Accept': 'application/rss+xml' },
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
  console.log('Initializing classifier...');
  await initEmbeddingClassifier();

  console.log('Fetching posts from database...\n');
  const posts = await db.select().from(discoveredSubstackPosts);

  for (const title of titles) {
    const post = posts.find(p => p.title === title);
    if (!post) {
      console.log(`NOT FOUND: ${title}\n`);
      continue;
    }

    const body = post.subdomain && post.slug ? await fetchBody(post.subdomain, post.slug) : null;

    // Test with body
    const resultWithBody = await classifyContentAsync(post.title || '', post.description || '', body || undefined);
    // Test without body (title + description only)
    const resultWithoutBody = await classifyContentAsync(post.title || '', post.description || '', undefined);

    console.log(`Title: ${post.title}`);
    console.log(`  Subdomain: ${post.subdomain}`);
    console.log(`  Body length: ${body ? body.length : 0} chars`);
    console.log(`  WITH body:    [${resultWithBody.probability.toFixed(3)}] ${resultWithBody.prediction.toUpperCase()}`);
    console.log(`  WITHOUT body: [${resultWithoutBody.probability.toFixed(3)}] ${resultWithoutBody.prediction.toUpperCase()}`);
    console.log(`  Body preview: ${body ? body.slice(0, 200) + '...' : 'NO BODY'}`);
    console.log();
  }

  process.exit(0);
}

main().catch(console.error);
