import { NextRequest, NextResponse } from 'next/server';
import { db, communityMembers } from '@/lib/db';
import { lte } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const maxHop = searchParams.get('maxHop');
  const limitParam = searchParams.get('limit');
  const limitValue = limitParam ? parseInt(limitParam) : 100;

  try {
    // Build query based on parameters
    const members = maxHop
      ? await db
          .select()
          .from(communityMembers)
          .where(lte(communityMembers.hopDistance, parseInt(maxHop)))
          .orderBy(communityMembers.hopDistance)
          .limit(limitValue)
      : await db
          .select()
          .from(communityMembers)
          .orderBy(communityMembers.hopDistance)
          .limit(limitValue);

    // Get counts by hop
    const allMembers = await db.select().from(communityMembers);
    const stats = {
      total: allMembers.length,
      hop0: allMembers.filter((m) => m.hopDistance === 0).length,
      hop1: allMembers.filter((m) => m.hopDistance === 1).length,
      hop2: allMembers.filter((m) => m.hopDistance === 2).length,
    };

    return NextResponse.json({ members, stats });
  } catch (error) {
    console.error('Failed to fetch community members:', error);
    return NextResponse.json(
      { error: 'Failed to fetch community members' },
      { status: 500 }
    );
  }
}
