import { NextResponse } from 'next/server';
import crypto from 'crypto';

// Nonce cookie settings
const NONCE_COOKIE_NAME = 'lea_auth_nonce';
const NONCE_VALIDITY_MS = 10 * 60 * 1000; // 10 minutes - enough time for OAuth flow

/**
 * GET /api/auth/nonce - Generate a nonce for OAuth flow
 *
 * This must be called before starting OAuth. The nonce is stored in an httpOnly
 * cookie and must be present when creating a session. This prevents attackers
 * from creating sessions for arbitrary DIDs without going through OAuth.
 */
export async function GET() {
  // Generate a cryptographically secure random nonce
  const nonce = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + NONCE_VALIDITY_MS;

  // Create signed nonce to prevent tampering
  const secret = process.env.INTERNAL_AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'development') {
      // Only allow dev fallback when NODE_ENV is explicitly 'development'
    } else {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
  }

  const signingSecret = secret || 'dev-secret-do-not-use-in-production';
  const payload = `${nonce}|${expiresAt}`;
  const signature = crypto
    .createHmac('sha256', signingSecret)
    .update(payload)
    .digest('hex');

  const signedNonce = Buffer.from(`${payload}|${signature}`).toString('base64');

  const response = NextResponse.json({ success: true });

  response.cookies.set(NONCE_COOKIE_NAME, signedNonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: NONCE_VALIDITY_MS / 1000,
    path: '/',
  });

  return response;
}

/**
 * Verify and consume the nonce cookie
 * Returns the nonce value if valid, null otherwise
 */
export function verifyAndConsumeNonce(cookieValue: string | undefined): boolean {
  if (!cookieValue) {
    return false;
  }

  try {
    const decoded = Buffer.from(cookieValue, 'base64').toString('utf-8');
    const parts = decoded.split('|');

    if (parts.length !== 3) {
      return false;
    }

    const [nonce, expiresAt, signature] = parts;

    // Verify not expired
    const expiry = parseInt(expiresAt, 10);
    if (isNaN(expiry) || Date.now() > expiry) {
      return false;
    }

    // Verify signature - require secret unless NODE_ENV is explicitly 'development'
    const secret = process.env.INTERNAL_AUTH_SECRET;
    if (!secret && process.env.NODE_ENV !== 'development') {
      return false;
    }
    const signingSecret = secret || 'dev-secret-do-not-use-in-production';

    const expectedSignature = crypto
      .createHmac('sha256', signingSecret)
      .update(`${nonce}|${expiresAt}`)
      .digest('hex');

    // Timing-safe comparison
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch {
    return false;
  }
}
