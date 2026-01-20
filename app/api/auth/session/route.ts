import { NextRequest, NextResponse } from 'next/server';
import { setSessionCookie, clearSessionCookie, verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/server-auth';
import { verifyAndConsumeNonce } from '../nonce/route';

// Nonce cookie name - must match nonce/route.ts
const NONCE_COOKIE_NAME = 'lea_auth_nonce';

/**
 * POST /api/auth/session - Create a new session
 * Called by the client after OAuth login completes
 *
 * Body: { did: string }
 *
 * Security: Requires a valid nonce cookie from /api/auth/nonce to prevent
 * session fixation attacks. The nonce ensures the request originated from
 * a legitimate OAuth flow started on this browser.
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

    // Verify nonce cookie to prevent session fixation attacks
    // This ensures the session creation request came from a browser that
    // started the OAuth flow (got a nonce) and completed it (has the cookie)
    const nonceCookie = request.cookies.get(NONCE_COOKIE_NAME);
    if (!verifyAndConsumeNonce(nonceCookie?.value)) {
      return NextResponse.json(
        { error: 'Invalid or expired authentication flow. Please try logging in again.' },
        { status: 401 }
      );
    }

    // Create response and set session cookie
    const response = NextResponse.json({ success: true });
    setSessionCookie(response, did);

    // Clear the nonce cookie - it's single-use
    response.cookies.delete(NONCE_COOKIE_NAME);

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
