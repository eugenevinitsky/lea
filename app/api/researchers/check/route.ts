import { NextRequest, NextResponse } from 'next/server';
import { db, verifiedResearchers } from '@/lib/db';
import { eq, and } from 'drizzle-orm';

// GET /api/researchers/check?did=xxx - Check if a user is verified
export async function GET(request: NextRequest) {
  const did = request.nextUrl.searchParams.get('did');

  if (!did) {
    return NextResponse.json({ error: 'DID required' }, { status: 400 });
  }

  try {
    const [researcher] = await db
      .select({ did: verifiedResearchers.did })
      .from(verifiedResearchers)
      .where(and(
        eq(verifiedResearchers.did, did),
        eq(verifiedResearchers.isActive, true)
      ))
      .limit(1);

    return NextResponse.json({ isVerified: !!researcher });
  } catch (error) {
    console.error('Failed to check verification:', error);
    return NextResponse.json({ error: 'Failed to check verification' }, { status: 500 });
  }
}
