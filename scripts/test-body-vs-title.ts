/**
 * Test classifier on body text vs title+description
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { initEmbeddingClassifier, classifyWithEmbedding, loadEmbeddingData } from '../lib/embedding-classifier';

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchBody(feedUrl: string, slug: string): Promise<string | null> {
  const response = await fetch(feedUrl, {
    headers: { 'User-Agent': 'Lea/1.0' }
  });
  const xml = await response.text();

  const items = xml.split('<item>');
  for (const item of items.slice(1)) {
    const linkMatch = item.match(/<link>([^<]+)<\/link>/);
    if (linkMatch && linkMatch[1].includes(slug)) {
      const contentMatch = item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/);
      if (contentMatch) {
        return stripHtml(contentMatch[1]).slice(0, 2000);
      }
    }
  }
  return null;
}

async function main() {
  const data = await loadEmbeddingData();
  initEmbeddingClassifier(process.env.GOOGLE_AI_API_KEY!, data);

  const tests = [
    { name: 'Heather Cox Richardson', feed: 'https://heathercoxrichardson.substack.com/feed', slug: 'january-16-2026', title: 'January 16, 2026', desc: "A newsletter about the history behind today's politics." },
    { name: 'Lucian Truscott', feed: 'https://luciantruscott.substack.com/feed', slug: 'cancelled', title: 'Cancelled!', desc: 'The Africa Centers for Disease Control announced today' },
    { name: 'Quanta (control - should be technical)', feed: 'https://www.quantamagazine.org/feed', slug: 'store-information', title: "Why There's No Single Best Way To Store Information", desc: 'Brains and computers store and retrieve data differently' },
    { name: 'Gary Marcus (control - should be technical)', feed: 'https://garymarcus.substack.com/feed', slug: 'destroying-society', title: 'How Generative AI is destroying society', desc: 'An astonishingly lucid new paper that should be read by all' },
  ];

  for (const t of tests) {
    console.log('=== ' + t.name + ' ===');

    // Title + desc only
    const titleDescText = t.title + ' ' + t.desc;
    const titleDescResult = await classifyWithEmbedding(titleDescText);
    console.log('Title+Desc score: ' + titleDescResult.probability.toFixed(3));

    // Fetch body
    const body = await fetchBody(t.feed, t.slug);
    if (body && body.length > 50) {
      const bodyResult = await classifyWithEmbedding(body);
      console.log('Body score:       ' + bodyResult.probability.toFixed(3));
      console.log('Body preview:     ' + body.slice(0, 120) + '...');
    } else {
      console.log('Could not fetch body (may be paywalled)');
    }
    console.log();
  }

  process.exit(0);
}

main().catch(console.error);
