import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { classifyContent } from '../lib/substack-classifier';

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchBodyFromRss(subdomain: string, slug: string): Promise<string | null> {
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
}

async function main() {
  const title = 'The Strongman Fantasy (text and audio)';
  const description = 'And Dictatorship in Real Life';
  const subdomain = 'snyder';
  const slug = 'the-strongman-fantasy-text-and-audio';

  const bodyText = await fetchBodyFromRss(subdomain, slug);
  console.log('Body text (first 500 chars):', bodyText?.slice(0, 500));
  console.log('---');

  // Test with full text
  const fullText = [title, description, bodyText || ''].join(' ');
  const result = classifyContent('', fullText);
  console.log('\nFull text classification:');
  console.log('Prediction:', result.prediction);
  console.log('Scores:', result.scores);
  console.log('Is technical:', result.isTechnical);
}

main();
