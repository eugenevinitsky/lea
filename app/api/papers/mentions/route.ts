import { NextRequest, NextResponse } from 'next/server';
import { db, discoveredPapers, paperMentions } from '@/lib/db';
import { eq, desc, count } from 'drizzle-orm';

// GET /api/papers/mentions?id=arxiv:2401.12345
// Fetches all post URIs that mention a paper
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const normalizedId = searchParams.get('id');
  const limit = parseInt(searchParams.get('limit') || '100', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  if (!normalizedId) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
  }

  try {
    // Find the paper by normalized ID
    const [paper] = await db
      .select()
      .from(discoveredPapers)
      .where(eq(discoveredPapers.normalizedId, normalizedId))
      .limit(1);

    if (!paper) {
      return NextResponse.json({
        paper: null,
        mentions: [],
        total: 0
      });
    }

    // Get actual count of mentions (not weighted)
    const [countResult] = await db
      .select({ count: count() })
      .from(paperMentions)
      .where(eq(paperMentions.paperId, paper.id));
    const totalMentions = countResult?.count ?? 0;

    // Fetch mentions for this paper
    const mentions = await db
      .select({
        id: paperMentions.id,
        postUri: paperMentions.postUri,
        authorDid: paperMentions.authorDid,
        authorHandle: paperMentions.authorHandle,
        postText: paperMentions.postText,
        createdAt: paperMentions.createdAt,
        isVerifiedResearcher: paperMentions.isVerifiedResearcher,
      })
      .from(paperMentions)
      .where(eq(paperMentions.paperId, paper.id))
      .orderBy(desc(paperMentions.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      paper: {
        id: paper.id,
        normalizedId: paper.normalizedId,
        url: paper.url,
        source: paper.source,
        title: paper.title,
        authors: paper.authors ? JSON.parse(paper.authors) : null,
        mentionCount: paper.mentionCount, // weighted count (for ranking)
        firstSeenAt: paper.firstSeenAt,
        lastSeenAt: paper.lastSeenAt,
      },
      mentions,
      total: totalMentions, // actual post count
    });
  } catch (error) {
    console.error('Failed to fetch paper mentions:', error);
    return NextResponse.json({ error: 'Failed to fetch mentions' }, { status: 500 });
  }
}
