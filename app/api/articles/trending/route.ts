import { NextRequest, NextResponse } from 'next/server';
import { db, discoveredArticles, articleMentions } from '@/lib/db';
import { desc, sql, eq, and } from 'drizzle-orm';

// Validation constants
const MAX_HOURS = 168; // 1 week max
const MAX_LIMIT = 100;
const ALLOWED_SOURCES = ['quanta', 'mittechreview'];

// GET /api/articles/trending?hours=24&limit=50&source=quanta - Get trending articles
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse and validate query params
    const rawHours = parseInt(searchParams.get('hours') || '24');
    const rawLimit = parseInt(searchParams.get('limit') || '50');
    const rawSource = searchParams.get('source');

    const hours = Number.isNaN(rawHours) || rawHours < 1 ? 24 : Math.min(rawHours, MAX_HOURS);
    const limit = Number.isNaN(rawLimit) || rawLimit < 1 ? 50 : Math.min(rawLimit, MAX_LIMIT);
    // Validate source is an allowed value or null
    const source = rawSource && ALLOWED_SOURCES.includes(rawSource) ? rawSource : null;

    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Build where condition based on source filter
    const whereCondition = source
      ? eq(discoveredArticles.source, source)
      : sql`${discoveredArticles.title} IS NOT NULL`;

    // Execute query
    const articles = await db
      .select({
        id: discoveredArticles.id,
        url: discoveredArticles.url,
        normalizedId: discoveredArticles.normalizedId,
        source: discoveredArticles.source,
        slug: discoveredArticles.slug,
        title: discoveredArticles.title,
        description: discoveredArticles.description,
        author: discoveredArticles.author,
        imageUrl: discoveredArticles.imageUrl,
        category: discoveredArticles.category,
        publishedAt: discoveredArticles.publishedAt,
        firstSeenAt: discoveredArticles.firstSeenAt,
        lastSeenAt: discoveredArticles.lastSeenAt,
        mentionCount: discoveredArticles.mentionCount,
        // Unique author count (not weighted)
        postCount: sql<number>`(
          SELECT COUNT(DISTINCT article_mentions.author_did)
          FROM article_mentions
          WHERE article_mentions.article_id = discovered_articles.id
        )`.as('post_count'),
        // Weighted unique authors: verified researchers count 3x, others 1x
        recentMentions: sql<number>`(
          SELECT COUNT(DISTINCT article_mentions.author_did) +
                 2 * COUNT(DISTINCT CASE WHEN article_mentions.is_verified_researcher THEN article_mentions.author_did END)
          FROM article_mentions
          WHERE article_mentions.article_id = discovered_articles.id
          AND article_mentions.created_at > ${cutoffTime}
        )`.as('recent_mentions'),
        // Unique authors in time window - for display
        recentPostCount: sql<number>`(
          SELECT COUNT(DISTINCT article_mentions.author_did)
          FROM article_mentions
          WHERE article_mentions.article_id = discovered_articles.id
          AND article_mentions.created_at > ${cutoffTime}
        )`.as('recent_post_count'),
      })
      .from(discoveredArticles)
      .where(whereCondition)
      .orderBy(
        // Order by weighted unique authors in time window
        desc(sql`(
          SELECT COUNT(DISTINCT article_mentions.author_did) +
                 2 * COUNT(DISTINCT CASE WHEN article_mentions.is_verified_researcher THEN article_mentions.author_did END)
          FROM article_mentions
          WHERE article_mentions.article_id = discovered_articles.id
          AND article_mentions.created_at > ${cutoffTime}
        )`),
        // Then by total unique authors
        desc(sql`(
          SELECT COUNT(DISTINCT article_mentions.author_did)
          FROM article_mentions
          WHERE article_mentions.article_id = discovered_articles.id
        )`)
      )
      .limit(limit);

    return NextResponse.json({ articles });
  } catch (error) {
    console.error('Failed to fetch trending articles:', error);
    return NextResponse.json({ error: 'Failed to fetch trending articles' }, { status: 500 });
  }
}
