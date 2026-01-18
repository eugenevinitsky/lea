import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { discoveredSubstackPosts } from '../lib/db/schema';
import { eq } from 'drizzle-orm';
import { classifyContent } from '../lib/substack-classifier';

const pool = new pg.Pool({
  connectionString: process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});
const db = drizzle(pool);

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchBodyFromRss(subdomain: string, slug: string): Promise<string | null> {
  const feedUrl = `https://${subdomain}.substack.com/feed`;
  console.log('Fetching RSS from:', feedUrl);
  const response = await fetch(feedUrl, { headers: { 'User-Agent': 'Lea/1.0' } });
  if (!response.ok) {
    console.log('RSS fetch failed:', response.status);
    return null;
  }
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
}

async function main() {
  const postId = parseInt(process.argv[2] || '4078');

  const [post] = await db.select()
    .from(discoveredSubstackPosts)
    .where(eq(discoveredSubstackPosts.id, postId));

  if (!post) {
    console.log('Post not found');
    process.exit(1);
  }

  console.log('Post ID:', post.id);
  console.log('Post subdomain:', post.subdomain);
  console.log('Post slug:', post.slug);
  console.log('Post title:', post.title);
  console.log('Post description:', post.description?.slice(0, 200) || 'none');
  console.log('');

  let bodyText: string | null = null;
  if (post.subdomain && post.slug) {
    bodyText = await fetchBodyFromRss(post.subdomain, post.slug);
  }
  console.log('Body text found:', bodyText ? `yes (${bodyText.length} chars)` : 'no');
  if (bodyText) {
    console.log('Body preview:', bodyText.slice(0, 300));
  }

  const classificationText = [post.title || '', post.description || '', bodyText || ''].filter(Boolean).join(' ');
  console.log('\n=== Classification with all available text ===');
  const r = classifyContent('', classificationText);
  console.log('Prediction:', r.prediction);
  console.log('Normalized margin:', r.normalizedMargin?.toFixed(3));
  console.log('Tokens:', r.tokens.length);

  await pool.end();
}

main();
