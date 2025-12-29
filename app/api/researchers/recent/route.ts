import { NextResponse } from 'next/server';
import { ozoneDb, verifiedMembers } from '@/lib/ozone-db';
import { desc, isNotNull } from 'drizzle-orm';

export async function GET() {
  try {
    // Get recently verified researchers, ordered by verifiedAt
    const recent = await ozoneDb
      .select({
        did: verifiedMembers.blueskyDid,
        handle: verifiedMembers.blueskyHandle,
        name: verifiedMembers.displayName,
        verifiedAt: verifiedMembers.verifiedAt,
      })
      .from(verifiedMembers)
      .where(isNotNull(verifiedMembers.verifiedAt))
      .orderBy(desc(verifiedMembers.verifiedAt))
      .limit(20);

    return NextResponse.json({
      researchers: recent,
    });
  } catch (error) {
    console.error('Failed to fetch recent researchers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recent researchers' },
      { status: 500 }
    );
  }
}
