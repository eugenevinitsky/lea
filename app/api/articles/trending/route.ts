import { NextRequest, NextResponse } from 'next/server';
import { db, discoveredArticles } from '@/lib/db';
import { desc, sql, eq } from 'drizzle-orm';

// Validation constants
const MAX_HOURS = 168; // 1 week max
const MAX_LIMIT = 100;
const ALLOWED_SOURCES = ['quanta', 'mittechreview'];

// Map hours to the nearest trending score bucket
function getScoreColumn(hours: number) {
  if (hours <= 1) return discoveredArticles.trendingScore1h;
  if (hours <= 6) return discoveredArticles.trendingScore6h;
  if (hours <= 24) return discoveredArticles.trendingScore24h;
  if (hours <= 168) return discoveredArticles.trendingScore7d;
  return discoveredArticles.trendingScoreAllTime;
}

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

    // Get the appropriate score column based on hours
    const scoreColumn = getScoreColumn(hours);

    // Build where condition based on source filter
    const whereCondition = source
      ? eq(discoveredArticles.source, source)
      : sql`${discoveredArticles.title} IS NOT NULL`;

    // Execute query using denormalized trending scores (fast column reads)
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
        // Use all-time score as total post count proxy
        postCount: discoveredArticles.trendingScoreAllTime,
        // Use the appropriate time-bucket score
        recentMentions: scoreColumn,
        // For display, use the same score (approximation)
        recentPostCount: scoreColumn,
      })
      .from(discoveredArticles)
      .where(whereCondition)
      .orderBy(
        desc(scoreColumn),
        desc(discoveredArticles.trendingScoreAllTime)
      )
      .limit(limit);

    return NextResponse.json({ articles });
  } catch (error) {
    console.error('Failed to fetch trending articles:', error);
    return NextResponse.json({ error: 'Failed to fetch trending articles' }, { status: 500 });
  }
}
