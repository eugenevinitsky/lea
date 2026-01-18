import { NextRequest, NextResponse } from 'next/server';
import { db, discoveredSubstackPosts, substackMentions } from '@/lib/db';
import { inArray } from 'drizzle-orm';
import { initEmbeddingClassifier, classifyContentAsync, isEmbeddingClassifierReady } from '@/lib/substack-classifier';
import crypto from 'crypto';

// Timing-safe secret comparison
function verifyBearerSecret(authHeader: string | null, expected: string): boolean {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const provided = authHeader.slice(7);
  try {
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);
    if (providedBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  } catch {
    return false;
  }
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

// Try to fetch article body from RSS feed
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
          const bodyText = stripHtml(contentMatch[1]);
          return bodyText.slice(0, 2000);
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Fetch body text directly from article page (fallback when RSS doesn't have it)
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
  } catch {
    return null;
  }
}

// Fetch body text - try RSS first, then fall back to page scraping
async function fetchBodyText(subdomain: string, slug: string, url: string): Promise<string | null> {
  // Try RSS first (faster, less load on Substack)
  const rssBody = await fetchBodyFromRss(subdomain, slug);
  if (rssBody) return rssBody;

  // Fall back to fetching the actual page
  return fetchBodyFromPage(url);
}

// Cleanup endpoint to reclassify existing posts using body text from RSS
export async function POST(request: NextRequest) {
  // Basic auth check - require a secret
  const authHeader = request.headers.get('Authorization');
  const secret = process.env.PAPER_FIREHOSE_SECRET;

  if (!secret) {
    console.error('PAPER_FIREHOSE_SECRET not configured');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }
  if (!verifyBearerSecret(authHeader, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Initialize embedding classifier
    if (!isEmbeddingClassifierReady()) {
      const initialized = await initEmbeddingClassifier();
      if (!initialized) {
        return NextResponse.json({ error: 'Failed to initialize embedding classifier' }, { status: 500 });
      }
    }

    // Fetch all existing posts
    const allPosts = await db.select().from(discoveredSubstackPosts);

    const kept: { id: number; title: string | null }[] = [];
    const removed: { id: number; title: string | null; reason: string }[] = [];

    for (const post of allPosts) {
      // Try to fetch body text (RSS first, then page scraping)
      let bodyText: string | null = null;
      if (post.subdomain && post.slug) {
        bodyText = await fetchBodyText(post.subdomain, post.slug, post.url);
      }

      // Classify using embedding k-NN
      const result = await classifyContentAsync(
        post.title || '',
        post.description || '',
        bodyText || undefined
      );

      if (result.isTechnical) {
        kept.push({ id: post.id, title: post.title });
      } else {
        removed.push({
          id: post.id,
          title: post.title,
          reason: `prediction=${result.prediction} prob=${result.probability.toFixed(3)} body=${bodyText ? 'yes' : 'no'}`,
        });
      }
    }

    // Delete mentions for removed posts first (foreign key constraint)
    if (removed.length > 0) {
      const removedIds = removed.map((p) => p.id);
      await db.delete(substackMentions).where(inArray(substackMentions.substackPostId, removedIds));

      // Delete the posts
      await db.delete(discoveredSubstackPosts).where(inArray(discoveredSubstackPosts.id, removedIds));
    }

    return NextResponse.json({
      success: true,
      totalProcessed: allPosts.length,
      kept: kept.length,
      removed: removed.length,
      removedPosts: removed,
      keptPosts: kept,
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
