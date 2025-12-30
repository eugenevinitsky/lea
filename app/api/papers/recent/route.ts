import { NextRequest, NextResponse } from 'next/server';
import { db, discoveredPapers } from '@/lib/db';
import { desc } from 'drizzle-orm';

// GET /api/papers/recent?limit=50 - Get recently mentioned papers
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    const papers = await db
      .select()
      .from(discoveredPapers)
      .orderBy(desc(discoveredPapers.lastSeenAt))
      .limit(limit);

    return NextResponse.json({ papers });
  } catch (error) {
    console.error('Failed to fetch recent papers:', error);
    return NextResponse.json({ error: 'Failed to fetch recent papers' }, { status: 500 });
  }
}
