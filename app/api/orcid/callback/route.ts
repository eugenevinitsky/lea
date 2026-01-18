import { NextRequest, NextResponse } from 'next/server';

// ORCID OAuth configuration
const ORCID_BASE = process.env.ORCID_SANDBOX === 'true'
  ? 'https://sandbox.orcid.org'
  : 'https://orcid.org';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Check for errors from ORCID
  if (error) {
    const errorDescription = searchParams.get('error_description') || 'Unknown error';
    return NextResponse.redirect(
      new URL(`/verify?error=${encodeURIComponent(errorDescription)}`, request.nextUrl.origin)
    );
  }

  // Verify state to prevent CSRF
  const storedState = request.cookies.get('orcid_oauth_state')?.value;
  if (!state || state !== storedState) {
    return NextResponse.redirect(
      new URL('/verify?error=Invalid+state+parameter', request.nextUrl.origin)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/verify?error=No+authorization+code+received', request.nextUrl.origin)
    );
  }

  const clientId = process.env.ORCID_CLIENT_ID;
  const clientSecret = process.env.ORCID_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL('/verify?error=ORCID+not+configured', request.nextUrl.origin)
    );
  }

  try {
    // Exchange authorization code for access token
    const origin = request.nextUrl.origin;
    const redirectUri = `${origin}/api/orcid/callback`;

    const tokenResponse = await fetch(`${ORCID_BASE}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      // Don't log the full error response as it may contain sensitive debugging info
      console.error('ORCID token error: status', tokenResponse.status);
      return NextResponse.redirect(
        new URL('/verify?error=Failed+to+authenticate+with+ORCID', request.nextUrl.origin)
      );
    }

    const tokenData = await tokenResponse.json();

    // ORCID returns the ORCID iD in the token response
    const orcid = tokenData.orcid;
    const name = tokenData.name;

    if (!orcid) {
      return NextResponse.redirect(
        new URL('/verify?error=No+ORCID+iD+received', request.nextUrl.origin)
      );
    }

    // Redirect to verify page with the authenticated ORCID
    const response = NextResponse.redirect(
      new URL(`/verify?orcid=${encodeURIComponent(orcid)}&name=${encodeURIComponent(name || '')}&authenticated=true`, request.nextUrl.origin)
    );

    // Clear the state cookie
    response.cookies.delete('orcid_oauth_state');

    // Optionally store the ORCID in a session cookie
    response.cookies.set('orcid_authenticated', orcid, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600, // 1 hour
    });

    return response;
  } catch (err) {
    console.error('ORCID callback error:', err);
    return NextResponse.redirect(
      new URL('/verify?error=Authentication+failed', request.nextUrl.origin)
    );
  }
}
