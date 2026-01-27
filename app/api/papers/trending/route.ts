import { NextRequest, NextResponse } from 'next/server';
import { db, discoveredPapers } from '@/lib/db';
import { desc, sql } from 'drizzle-orm';

// Validation constants
const MAX_HOURS = 168; // 1 week max
const MAX_LIMIT = 100;
const MAX_OFFSET = 10000;

// Map hours to the nearest trending score bucket
function getScoreColumn(hours: number) {
  if (hours <= 1) return discoveredPapers.trendingScore1h;
  if (hours <= 6) return discoveredPapers.trendingScore6h;
  if (hours <= 24) return discoveredPapers.trendingScore24h;
  if (hours <= 168) return discoveredPapers.trendingScore7d;
  return discoveredPapers.trendingScoreAllTime;
}

// GET /api/papers/trending?hours=24&limit=50&offset=0 - Get trending papers
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse and validate all query params
    const rawHours = parseInt(searchParams.get('hours') || '24');
    const rawLimit = parseInt(searchParams.get('limit') || '50');
    const rawOffset = parseInt(searchParams.get('offset') || '0');

    const hours = Number.isNaN(rawHours) || rawHours < 1 ? 24 : Math.min(rawHours, MAX_HOURS);
    const limit = Number.isNaN(rawLimit) || rawLimit < 1 ? 50 : Math.min(rawLimit, MAX_LIMIT);
    const offset = Number.isNaN(rawOffset) || rawOffset < 0 ? 0 : Math.min(rawOffset, MAX_OFFSET);

    // Get the appropriate score column based on hours
    const scoreColumn = getScoreColumn(hours);

    // Get papers using denormalized trending scores (fast column reads)
    const papers = await db
      .select({
        id: discoveredPapers.id,
        url: discoveredPapers.url,
        normalizedId: discoveredPapers.normalizedId,
        source: discoveredPapers.source,
        title: discoveredPapers.title,
        authors: discoveredPapers.authors,
        firstSeenAt: discoveredPapers.firstSeenAt,
        lastSeenAt: discoveredPapers.lastSeenAt,
        mentionCount: discoveredPapers.mentionCount,
        // Use all-time score as total post count proxy
        postCount: discoveredPapers.trendingScoreAllTime,
        // Use the appropriate time-bucket score
        recentMentions: scoreColumn,
        // For display, use the unweighted portion (approximate)
        recentPostCount: scoreColumn,
      })
      .from(discoveredPapers)
      .where(
        sql`${discoveredPapers.title} IS NOT NULL
            AND ${discoveredPapers.normalizedId} NOT LIKE 'doi:10.1234/%'`
      )
      .orderBy(
        desc(scoreColumn),
        desc(discoveredPapers.trendingScoreAllTime)
      )
      .limit(limit)
      .offset(offset);

    // Check if there are more results
    const hasMore = papers.length === limit;

    return NextResponse.json({ papers, hasMore }, {
      headers: {
        // Cache at CDN for 5 minutes, stale-while-revalidate for 10 min
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Failed to fetch trending papers:', error);
    return NextResponse.json({ error: 'Failed to fetch trending papers' }, { status: 500 });
  }
}
