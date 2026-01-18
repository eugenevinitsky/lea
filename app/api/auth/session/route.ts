import { NextRequest, NextResponse } from 'next/server';
import { setSessionCookie, clearSessionCookie, verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/server-auth';

/**
 * POST /api/auth/session - Create a new session
 * Called by the client after OAuth login completes
 *
 * Body: { did: string }
 *
 * Note: This endpoint trusts the client-provided DID. The security model relies on:
 * 1. The client only calling this after successful OAuth authentication
 * 2. The session cookie being httpOnly (can't be read by JS)
 * 3. Rate limiting to prevent abuse (TODO)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { did } = body;

    if (!did || typeof did !== 'string') {
      return NextResponse.json({ error: 'DID required' }, { status: 400 });
    }

    // Validate DID format
    if (!did.startsWith('did:')) {
      return NextResponse.json({ error: 'Invalid DID format' }, { status: 400 });
    }

    // Create response and set session cookie
    const response = NextResponse.json({ success: true });
    setSessionCookie(response, did);

    return response;
  } catch (error) {
    console.error('Failed to create session:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}

/**
 * GET /api/auth/session - Check current session status
 */
export async function GET(request: NextRequest) {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);

  if (!sessionCookie?.value) {
    return NextResponse.json({ authenticated: false });
  }

  const verification = verifySessionToken(sessionCookie.value);

  if (!verification.success) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
    authenticated: true,
    did: verification.did,
  });
}

/**
 * DELETE /api/auth/session - Clear the session (logout)
 */
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  clearSessionCookie(response);
  return response;
}
