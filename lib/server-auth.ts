/**
 * Server-side authentication utilities
 *
 * Uses secure session cookies for API authentication.
 * Flow:
 * 1. Client logs in via OAuth
 * 2. Client calls /api/auth/session to create a session
 * 3. Server verifies OAuth and sets httpOnly session cookie
 * 4. Subsequent API calls include the cookie automatically
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Secret for signing session tokens
const SESSION_SECRET = process.env.INTERNAL_AUTH_SECRET || 'dev-secret-change-in-production';

// Session validity (7 days)
const SESSION_VALIDITY_MS = 7 * 24 * 60 * 60 * 1000;

// Cookie name
export const SESSION_COOKIE_NAME = 'lea_session';

interface VerifyResult {
  success: true;
  did: string;
}

interface VerifyError {
  success: false;
  error: string;
  status: number;
}

/**
 * Generate a signed session token
 */
export function generateSessionToken(did: string): string {
  const expiresAt = Date.now() + SESSION_VALIDITY_MS;
  const payload = `${did}:${expiresAt}`;
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('hex');

  return Buffer.from(`${payload}:${signature}`).toString('base64');
}

/**
 * Verify a session token
 */
export function verifySessionToken(token: string): VerifyResult | VerifyError {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const parts = decoded.split(':');

    if (parts.length !== 3) {
      return { success: false, error: 'Invalid session format', status: 401 };
    }

    const [did, expiresAt, signature] = parts;

    // Verify not expired
    const expiry = parseInt(expiresAt, 10);
    if (isNaN(expiry) || Date.now() > expiry) {
      return { success: false, error: 'Session expired', status: 401 };
    }

    // Verify signature using timing-safe comparison
    const expectedSignature = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(`${did}:${expiresAt}`)
      .digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (signatureBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return { success: false, error: 'Invalid session', status: 401 };
    }

    return { success: true, did };
  } catch {
    return { success: false, error: 'Session verification failed', status: 401 };
  }
}

/**
 * Set session cookie on response
 */
export function setSessionCookie(response: NextResponse, did: string): void {
  const token = generateSessionToken(did);
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_VALIDITY_MS / 1000,
    path: '/',
  });
}

/**
 * Clear session cookie
 */
export function clearSessionCookie(response: NextResponse): void {
  response.cookies.delete(SESSION_COOKIE_NAME);
}

/**
 * Verify user has access to the requested resource
 * Checks session cookie and validates against requested DID
 */
export async function verifyUserAccess(
  request: NextRequest,
  requestedDid: string
): Promise<VerifyResult | VerifyError> {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);

  if (!sessionCookie?.value) {
    return { success: false, error: 'Authentication required', status: 401 };
  }

  const verification = verifySessionToken(sessionCookie.value);

  if (!verification.success) {
    return verification;
  }

  if (verification.did !== requestedDid) {
    return { success: false, error: 'Access denied', status: 403 };
  }

  return verification;
}

/**
 * Get the authenticated user's DID from session cookie
 * Returns null if not authenticated
 */
export function getAuthenticatedDid(request: NextRequest): string | null {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);

  if (!sessionCookie?.value) {
    return null;
  }

  const verification = verifySessionToken(sessionCookie.value);

  if (!verification.success) {
    return null;
  }

  return verification.did;
}
