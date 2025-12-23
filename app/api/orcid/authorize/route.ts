import { NextRequest, NextResponse } from 'next/server';

// ORCID OAuth configuration
// Production: https://orcid.org
// Sandbox: https://sandbox.orcid.org
const ORCID_BASE = process.env.ORCID_SANDBOX === 'true'
  ? 'https://sandbox.orcid.org'
  : 'https://orcid.org';

export async function GET(request: NextRequest) {
  const clientId = process.env.ORCID_CLIENT_ID;

  if (!clientId) {
    return NextResponse.json(
      { error: 'ORCID client ID not configured' },
      { status: 500 }
    );
  }

  // Get the callback URL from the request origin
  const origin = request.nextUrl.origin;
  const redirectUri = `${origin}/api/orcid/callback`;

  // Generate a random state for CSRF protection
  const state = crypto.randomUUID();

  // Store state in a cookie for verification in callback
  const authUrl = new URL(`${ORCID_BASE}/oauth/authorize`);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', '/authenticate');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);

  const response = NextResponse.redirect(authUrl.toString());

  // Set state cookie for CSRF verification
  response.cookies.set('orcid_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
  });

  return response;
}
