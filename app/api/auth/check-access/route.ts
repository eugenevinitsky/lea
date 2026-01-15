import { NextRequest, NextResponse } from 'next/server';
import { db, verifiedResearchers } from '@/lib/db';
import { eq, and } from 'drizzle-orm';

// GET /api/auth/check-access?did=xxx - Check if a DID is authorized to use the app
// Currently restricted to verified researchers only
export async function GET(request: NextRequest) {
  const did = request.nextUrl.searchParams.get('did');

  if (!did) {
    return NextResponse.json({ error: 'DID required' }, { status: 400 });
  }

  try {
    // Check if user is a verified researcher
    const [researcher] = await db
      .select()
      .from(verifiedResearchers)
      .where(and(
        eq(verifiedResearchers.did, did),
        eq(verifiedResearchers.isActive, true)
      ))
      .limit(1);

    return NextResponse.json({
      authorized: !!researcher,
      verifiedAt: researcher?.verifiedAt || null,
    });
  } catch (error) {
    console.error('Failed to check access:', error);
    return NextResponse.json({ error: 'Failed to check access' }, { status: 500 });
  }
}
