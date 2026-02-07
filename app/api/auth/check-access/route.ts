import { NextRequest, NextResponse } from 'next/server';
import { db, verifiedResearchers, authorizedUsers, suspendedUsers } from '@/lib/db';
import { eq, and } from 'drizzle-orm';

// GET /api/auth/check-access?did=xxx or ?handle=xxx - Check if a user is authorized
// Users are authorized if they:
// 1. Are in the authorized_users table (used an invite code), OR
// 2. Are a verified researcher (grandfathered in)
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
        // Provide a more helpful error if the handle doesn't contain a dot
        const hint = !handle.includes('.')
          ? ' Make sure to include your full handle (e.g., yourname.bsky.social).'
          : '';
        return NextResponse.json({ 
          authorized: false, 
          error: `Could not resolve handle.${hint}` 
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
    // Check if user is suspended
    const [suspended] = await db
      .select()
      .from(suspendedUsers)
      .where(eq(suspendedUsers.did, did))
      .limit(1);

    if (suspended) {
      return NextResponse.json({
        authorized: false,
        suspended: true,
        reason: suspended.reason || 'Account suspended',
      });
    }

    // First check if user is already authorized (used an invite code)
    const [existingUser] = await db
      .select()
      .from(authorizedUsers)
      .where(eq(authorizedUsers.did, did))
      .limit(1);

    if (existingUser) {
      return NextResponse.json({
        authorized: true,
        did,
        authorizedAt: existingUser.authorizedAt,
        method: 'invite_code',
      });
    }

    // Fall back to checking if user is a verified researcher (grandfathered)
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
      method: researcher ? 'verified_researcher' : null,
    });
  } catch (error) {
    console.error('Failed to check access:', error);
    return NextResponse.json({ error: 'Failed to check access' }, { status: 500 });
  }
}
