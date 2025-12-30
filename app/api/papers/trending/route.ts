import { NextRequest, NextResponse } from 'next/server';
import { db, discoveredPapers, paperMentions } from '@/lib/db';
import { desc, sql, gt } from 'drizzle-orm';

// GET /api/papers/trending?hours=24&limit=50 - Get trending papers
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const hours = parseInt(searchParams.get('hours') || '24');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Get papers with recent mention counts
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
        recentMentions: sql<number>`(
          SELECT COUNT(*) FROM paper_mentions
          WHERE paper_mentions.paper_id = ${discoveredPapers.id}
          AND paper_mentions.created_at > ${cutoffTime}
        )`.as('recent_mentions'),
      })
      .from(discoveredPapers)
      .orderBy(
        desc(sql`(
          SELECT COUNT(*) FROM paper_mentions
          WHERE paper_mentions.paper_id = ${discoveredPapers.id}
          AND paper_mentions.created_at > ${cutoffTime}
        )`),
        desc(discoveredPapers.mentionCount)
      )
      .limit(limit);

    return NextResponse.json({ papers });
  } catch (error) {
    console.error('Failed to fetch trending papers:', error);
    return NextResponse.json({ error: 'Failed to fetch trending papers' }, { status: 500 });
  }
}
