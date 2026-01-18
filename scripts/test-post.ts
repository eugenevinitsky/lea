import { classifyContent } from '../lib/substack-classifier';

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchBodyFromPage(url: string): Promise<string | null> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Lea/1.0 (mailto:support@lea.community)',
      'Accept': 'text/html',
    },
  });
  if (!response.ok) return null;
  const html = await response.text();

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

  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/);
  if (articleMatch) {
    const bodyText = stripHtml(articleMatch[1]);
    if (bodyText.length > 100) {
      return bodyText.slice(0, 2000);
    }
  }
  return null;
}

async function main() {
  const url = process.argv[2] || 'https://stopthepresses.substack.com/p/how-to-build-a-radically-truthful';

  console.log('Fetching:', url);
  const bodyText = await fetchBodyFromPage(url);
  console.log('Body text length:', bodyText?.length || 0);
  console.log('Body text (first 500 chars):', bodyText?.slice(0, 500));
  console.log('---');

  const title = 'How to Build a Radically Truthful';
  const fullText = [title, bodyText || ''].filter(Boolean).join(' ');

  const result = classifyContent('', fullText);
  console.log('\nClassification:');
  console.log('Prediction:', result.prediction);
  console.log('Tech score:', result.scores['technical']);
  console.log('Non-tech score:', result.scores['non-technical']);
  console.log('Margin:', result.margin);
  console.log('Normalized margin:', result.normalizedMargin);
  console.log('Tokens:', result.tokens.length);
  console.log('Is technical:', result.isTechnical);
}

main();
