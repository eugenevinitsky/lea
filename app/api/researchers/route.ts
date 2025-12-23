import { NextResponse } from 'next/server';
import { db, verifiedResearchers } from '@/lib/db';
import { eq } from 'drizzle-orm';

export async function GET() {
  try {
    const researchers = await db
      .select()
      .from(verifiedResearchers)
      .where(eq(verifiedResearchers.isActive, true))
      .orderBy(verifiedResearchers.verifiedAt);

    return NextResponse.json({ researchers });
  } catch (error) {
    console.error('Failed to fetch researchers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch researchers' },
      { status: 500 }
    );
  }
}
