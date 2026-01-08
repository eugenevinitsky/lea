import { NextRequest, NextResponse } from 'next/server';
import { db, discoveredArticles, articleMentions, verifiedResearchers } from '@/lib/db';
import { eq, sql } from 'drizzle-orm';

// Secret for authenticating requests from the Cloudflare Worker
const API_SECRET = process.env.PAPER_FIREHOSE_SECRET;

// RSS feed URLs for fetching metadata
const RSS_FEEDS: Record<string, string> = {
  quanta: 'https://www.quantamagazine.org/feed/',
  mittechreview: 'https://www.technologyreview.com/feed/',
};

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
    .replace(/\s+/g, ' ')
    .trim();
}

// Fetch metadata from RSS feed
async function fetchArticleMetadata(
  source: string,
  slug: string,
  url: string
): Promise<{
  title?: string;
  description?: string;
  author?: string;
  imageUrl?: string;
  category?: string;
  publishedAt?: Date;
} | null> {
  const feedUrl = RSS_FEEDS[source];
  if (!feedUrl) return null;

  try {
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
      // Check if this item matches our URL
      const linkMatch = item.match(/<link>([^<]+)<\/link>/);
      if (!linkMatch) continue;

      const itemUrl = linkMatch[1].trim();
      // Check if URL contains our slug
      if (!itemUrl.includes(slug) && !url.includes(itemUrl)) continue;

      // Extract metadata
      const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?([^\]<]+)(?:\]\]>)?<\/title>/);
      const descMatch = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/);
      const authorMatch = item.match(/<dc:creator>(?:<!\[CDATA\[)?([^\]<]+)(?:\]\]>)?<\/dc:creator>/);
      const categoryMatch = item.match(/<category>(?:<!\[CDATA\[)?([^\]<]+)(?:\]\]>)?<\/category>/);
      const pubDateMatch = item.match(/<pubDate>([^<]+)<\/pubDate>/);

      // Extract image from enclosure or media:content
      let imageUrl: string | undefined;
      const enclosureMatch = item.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image/);
      const mediaMatch = item.match(/<media:content[^>]*url="([^"]+)"/);
      if (enclosureMatch) imageUrl = enclosureMatch[1];
      else if (mediaMatch) imageUrl = mediaMatch[1];

      return {
        title: titleMatch ? stripHtml(titleMatch[1]) : undefined,
        description: descMatch ? stripHtml(descMatch[1]).slice(0, 500) : undefined,
        author: authorMatch ? stripHtml(authorMatch[1]) : undefined,
        category: categoryMatch ? stripHtml(categoryMatch[1]) : undefined,
        imageUrl,
        publishedAt: pubDateMatch ? new Date(pubDateMatch[1]) : undefined,
      };
    }

    // If not found in RSS, try fetching from the page directly
    return await fetchMetadataFromPage(url);
  } catch (error) {
    console.error(`Failed to fetch RSS for ${source}:`, error);
    return await fetchMetadataFromPage(url);
  }
}

// Fallback: fetch metadata from page Open Graph tags
async function fetchMetadataFromPage(url: string): Promise<{
  title?: string;
  description?: string;
  author?: string;
  imageUrl?: string;
} | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Lea/1.0 (mailto:support@lea.community)',
        'Accept': 'text/html',
      },
      redirect: 'follow',
    });

    if (!response.ok) return null;

    const html = await response.text();

    const ogTitle =
      html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i)?.[1] ||
      html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:title"/i)?.[1];
    const ogDescription =
      html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i)?.[1] ||
      html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:description"/i)?.[1];
    const ogImage =
      html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i)?.[1] ||
      html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:image"/i)?.[1];
    const authorMeta =
      html.match(/<meta[^>]*name="author"[^>]*content="([^"]+)"/i)?.[1] ||
      html.match(/<meta[^>]*content="([^"]+)"[^>]*name="author"/i)?.[1];

    return {
      title: ogTitle ? stripHtml(ogTitle) : undefined,
      description: ogDescription ? stripHtml(ogDescription) : undefined,
      author: authorMeta ? stripHtml(authorMeta) : undefined,
      imageUrl: ogImage,
    };
  } catch (error) {
    console.error(`Failed to fetch page metadata for ${url}:`, error);
    return null;
  }
}

interface ArticleData {
  url: string;
  normalizedId: string;
  source: string;
  slug: string;
}

interface IngestRequest {
  articles: ArticleData[];
  postUri: string;
  authorDid: string;
  postText: string;
  createdAt: string;
}

// POST /api/articles/ingest - Ingest article mentions from firehose worker
export async function POST(request: NextRequest) {
  // Verify API secret
  const authHeader = request.headers.get('Authorization');
  if (!API_SECRET || authHeader !== `Bearer ${API_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: IngestRequest = await request.json();
    const { articles, postUri, authorDid, postText, createdAt } = body;

    if (!articles || !Array.isArray(articles) || articles.length === 0) {
      return NextResponse.json({ error: 'No articles provided' }, { status: 400 });
    }

    // Check if author is a verified researcher (3x weight for mentions)
    const [verifiedAuthor] = await db
      .select()
      .from(verifiedResearchers)
      .where(eq(verifiedResearchers.did, authorDid))
      .limit(1);
    const isVerified = !!verifiedAuthor;
    const mentionWeight = isVerified ? 3 : 1;

    const results: { articleId: number; normalizedId: string }[] = [];

    for (const article of articles) {
      // Upsert article
      const [existingArticle] = await db
        .select()
        .from(discoveredArticles)
        .where(eq(discoveredArticles.normalizedId, article.normalizedId))
        .limit(1);

      let articleId: number;

      if (existingArticle) {
        // Update existing article
        await db
          .update(discoveredArticles)
          .set({
            lastSeenAt: new Date(),
            mentionCount: sql`${discoveredArticles.mentionCount} + ${mentionWeight}`,
          })
          .where(eq(discoveredArticles.normalizedId, article.normalizedId));
        articleId = existingArticle.id;
      } else {
        // Fetch metadata for new article
        const metadata = await fetchArticleMetadata(article.source, article.slug, article.url);

        // Insert new article with metadata
        const [inserted] = await db
          .insert(discoveredArticles)
          .values({
            url: article.url,
            normalizedId: article.normalizedId,
            source: article.source,
            slug: article.slug,
            title: metadata?.title || null,
            description: metadata?.description || null,
            author: metadata?.author || null,
            imageUrl: metadata?.imageUrl || null,
            category: metadata?.category || null,
            publishedAt: metadata?.publishedAt || null,
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
            mentionCount: mentionWeight,
          })
          .returning({ id: discoveredArticles.id });
        articleId = inserted.id;

        console.log(`New article discovered: ${article.source} - ${metadata?.title || article.slug}`);
      }

      // Check if mention already exists
      const [existingMention] = await db
        .select()
        .from(articleMentions)
        .where(eq(articleMentions.postUri, postUri))
        .limit(1);

      if (!existingMention) {
        // Insert mention
        await db.insert(articleMentions).values({
          articleId,
          postUri,
          authorDid,
          postText: postText?.slice(0, 1000) || '',
          createdAt: new Date(createdAt),
          isVerifiedResearcher: isVerified,
        });
      }

      results.push({ articleId, normalizedId: article.normalizedId });
    }

    return NextResponse.json({ success: true, articles: results });
  } catch (error) {
    console.error('Failed to ingest articles:', error);
    return NextResponse.json({ error: 'Failed to ingest articles' }, { status: 500 });
  }
}
