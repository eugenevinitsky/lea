import { NextRequest, NextResponse } from 'next/server';
import { db, verifiedResearchers } from '@/lib/db';
import { eq, and } from 'drizzle-orm';

// GET /api/auth/check-access?did=xxx or ?handle=xxx - Check if a user is authorized
// Currently restricted to verified researchers only
export async function GET(request: NextRequest) {
  let did = request.nextUrl.searchParams.get('did');
  const handle = request.nextUrl.searchParams.get('handle');

  // If handle provided, resolve it to a DID
  if (!did && handle) {
    try {
      const resolveResponse = await fetch(
        `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
      );
      if (!resolveResponse.ok) {
        return NextResponse.json({ 
          authorized: false, 
          error: 'Could not resolve handle' 
        });
      }
      const data = await resolveResponse.json();
      did = data.did;
    } catch {
      return NextResponse.json({ 
        authorized: false, 
        error: 'Could not resolve handle' 
      });
    }
  }

  if (!did) {
    return NextResponse.json({ error: 'DID or handle required' }, { status: 400 });
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
      did,
      verifiedAt: researcher?.verifiedAt || null,
    });
  } catch (error) {
    console.error('Failed to check access:', error);
    return NextResponse.json({ error: 'Failed to check access' }, { status: 500 });
  }
}
