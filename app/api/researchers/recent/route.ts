import { NextResponse } from 'next/server';
import { db, verifiedResearchers } from '@/lib/db';
import { desc, eq } from 'drizzle-orm';

export async function GET() {
  try {
    // Get recently verified researchers, ordered by verifiedAt
    const recent = await db
      .select({
        did: verifiedResearchers.did,
        handle: verifiedResearchers.handle,
        name: verifiedResearchers.name,
        verifiedAt: verifiedResearchers.verifiedAt,
      })
      .from(verifiedResearchers)
      .where(eq(verifiedResearchers.isActive, true))
      .orderBy(desc(verifiedResearchers.verifiedAt))
      .limit(20);

    return NextResponse.json({
      researchers: recent,
    }, {
      headers: {
        // Cache at CDN for 5 minutes, stale-while-revalidate for 10 min
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Failed to fetch recent researchers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recent researchers' },
      { status: 500 }
    );
  }
}
