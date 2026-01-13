import { classifyContent } from '../lib/substack-classifier';

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
      // Extract text from paragraphs
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
  } catch (e) {
    console.error('Error:', e);
    return null;
  }
}

async function main() {
  const url = 'https://snyder.substack.com/p/the-strongman-fantasy-text-and-audio';
  const title = 'The Strongman Fantasy (text and audio)';
  const description = 'And Dictatorship in Real Life';

  console.log('Fetching body from page...');
  const bodyText = await fetchBodyFromPage(url);

  console.log('Body text length:', bodyText?.length || 0);
  console.log('Body text (first 500 chars):', bodyText?.slice(0, 500));
  console.log('---');

  const fullText = [title, description, bodyText || ''].filter(Boolean).join(' ');
  const result = classifyContent('', fullText);

  console.log('\nClassification with body:');
  console.log('Prediction:', result.prediction);
  console.log('Scores:', result.scores);
  console.log('Is technical:', result.isTechnical);
}

main();
