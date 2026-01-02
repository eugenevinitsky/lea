import { NextResponse } from 'next/server';
import { db, discoveredPapers, paperMentions } from '@/lib/db';
import { count, sql, min, max, countDistinct, gt } from 'drizzle-orm';

export async function GET() {
  try {
    // Total papers
    const [papersCount] = await db.select({ count: count() }).from(discoveredPapers);

    // Total mentions
    const [mentionsCount] = await db.select({ count: count() }).from(paperMentions);

    // Verified mentions
    const [verifiedCount] = await db
      .select({ count: count() })
      .from(paperMentions)
      .where(sql`is_verified_researcher = true`);

    // Unique authors
    const [authorsCount] = await db
      .select({ count: countDistinct(paperMentions.authorDid) })
      .from(paperMentions);

    // Date range
    const [dateRange] = await db
      .select({
        first: min(discoveredPapers.firstSeenAt),
        last: max(discoveredPapers.lastSeenAt),
      })
      .from(discoveredPapers);

    // Recent mentions (last 24 hours)
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recent] = await db
      .select({ count: count() })
      .from(paperMentions)
      .where(gt(paperMentions.createdAt, cutoff));

    // Papers by source
    const bySource = await db
      .select({
        source: discoveredPapers.source,
        count: count(),
      })
      .from(discoveredPapers)
      .groupBy(discoveredPapers.source)
      .orderBy(sql`count(*) desc`);

    return NextResponse.json({
      totalPapers: papersCount.count,
      totalMentions: mentionsCount.count,
      verifiedMentions: verifiedCount.count,
      uniqueAuthors: authorsCount.count,
      firstPaper: dateRange.first,
      latestActivity: dateRange.last,
      mentionsLast24h: recent.count,
      papersBySource: bySource,
    });
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
