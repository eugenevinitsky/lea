import { NextRequest, NextResponse } from 'next/server';
import { db, discoveredPapers, paperMentions } from '@/lib/db';
import { desc, sql, gt, isNotNull, notLike } from 'drizzle-orm';

// GET /api/papers/trending?hours=24&limit=50 - Get trending papers
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const hours = parseInt(searchParams.get('hours') || '24');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Get papers with recent mention counts (verified researchers count 3x)
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
        // Unique author count (not weighted) - each person only counts once
        postCount: sql<number>`(
          SELECT COUNT(DISTINCT paper_mentions.author_did)
          FROM paper_mentions
          WHERE paper_mentions.paper_id = discovered_papers.id
        )`.as('post_count'),
        // Weighted unique authors: verified researchers count 3x, others 1x
        recentMentions: sql<number>`(
          SELECT COUNT(DISTINCT paper_mentions.author_did) +
                 2 * COUNT(DISTINCT CASE WHEN paper_mentions.is_verified_researcher THEN paper_mentions.author_did END)
          FROM paper_mentions
          WHERE paper_mentions.paper_id = discovered_papers.id
          AND paper_mentions.created_at > ${cutoffTime}
        )`.as('recent_mentions'),
        // Unique authors in time window - for display
        recentPostCount: sql<number>`(
          SELECT COUNT(DISTINCT paper_mentions.author_did)
          FROM paper_mentions
          WHERE paper_mentions.paper_id = discovered_papers.id
          AND paper_mentions.created_at > ${cutoffTime}
        )`.as('recent_post_count'),
      })
      .from(discoveredPapers)
      .where(
        sql`${discoveredPapers.title} IS NOT NULL
            AND ${discoveredPapers.normalizedId} NOT LIKE 'doi:10.1234/%'`
      )
      .orderBy(
        // Order by weighted unique authors in time window
        desc(sql`(
          SELECT COUNT(DISTINCT paper_mentions.author_did) +
                 2 * COUNT(DISTINCT CASE WHEN paper_mentions.is_verified_researcher THEN paper_mentions.author_did END)
          FROM paper_mentions
          WHERE paper_mentions.paper_id = discovered_papers.id
          AND paper_mentions.created_at > ${cutoffTime}
        )`),
        // Then by total unique authors
        desc(sql`(
          SELECT COUNT(DISTINCT paper_mentions.author_did)
          FROM paper_mentions
          WHERE paper_mentions.paper_id = discovered_papers.id
        )`)
      )
      .limit(limit);

    return NextResponse.json({ papers }, {
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
