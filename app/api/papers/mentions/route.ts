import { NextRequest, NextResponse } from 'next/server';
import { db, discoveredPapers, paperMentions, botAccounts } from '@/lib/db';
import { eq, desc, and, notExists, sql } from 'drizzle-orm';

// GET /api/papers/mentions?id=arxiv:2401.12345
// Fetches all post URIs that mention a paper
// Validation constants
const MAX_LIMIT = 500;
const MAX_OFFSET = 10000;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const normalizedId = searchParams.get('id');

  // Parse and validate limit/offset to prevent resource exhaustion
  const rawLimit = parseInt(searchParams.get('limit') || '100', 10);
  const rawOffset = parseInt(searchParams.get('offset') || '0', 10);

  const limit = Number.isNaN(rawLimit) || rawLimit < 1 ? 100 : Math.min(rawLimit, MAX_LIMIT);
  const offset = Number.isNaN(rawOffset) || rawOffset < 0 ? 0 : Math.min(rawOffset, MAX_OFFSET);

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

    // Fetch mentions excluding bots using NOT EXISTS (efficient with indexed bot_accounts table)
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
      .where(
        and(
          eq(paperMentions.paperId, paper.id),
          notExists(
            db.select({ one: sql`1` })
              .from(botAccounts)
              .where(eq(botAccounts.did, paperMentions.authorDid))
          )
        )
      )
      .orderBy(desc(paperMentions.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count (excluding bots)
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(paperMentions)
      .where(
        and(
          eq(paperMentions.paperId, paper.id),
          notExists(
            db.select({ one: sql`1` })
              .from(botAccounts)
              .where(eq(botAccounts.did, paperMentions.authorDid))
          )
        )
      );
    const totalMentions = countResult?.count ?? 0;

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
