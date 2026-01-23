import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy OAuth metadata requests from self-hosted PDSes
 * This helps avoid CORS issues when the browser tries to fetch
 * /.well-known/oauth-protected-resource or /.well-known/oauth-authorization-server
 * from a self-hosted PDS that doesn't have proper CORS headers
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  
  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  // Validate URL - only allow well-known OAuth endpoints
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  // Only allow HTTPS URLs (except for localhost in development)
  if (parsedUrl.protocol !== 'https:' && !parsedUrl.hostname.includes('localhost')) {
    return NextResponse.json({ error: 'Only HTTPS URLs are allowed' }, { status: 400 });
  }

  // Only allow specific OAuth-related paths
  const allowedPaths = [
    '/.well-known/oauth-protected-resource',
    '/.well-known/oauth-authorization-server',
  ];
  
  if (!allowedPaths.includes(parsedUrl.pathname)) {
    return NextResponse.json(
      { error: 'Only OAuth metadata endpoints are allowed' },
      { status: 400 }
    );
  }

  // Block requests to internal/private IPs
  const hostname = parsedUrl.hostname;
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    hostname.startsWith('172.') ||
    hostname === '::1'
  ) {
    return NextResponse.json({ error: 'Cannot proxy to internal addresses' }, { status: 400 });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Lea OAuth Proxy/1.0',
      },
      // 10 second timeout
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${response.status}` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return NextResponse.json(
        { error: 'Upstream did not return JSON' },
        { status: 502 }
      );
    }

    const data = await response.json();
    
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      },
    });
  } catch (error) {
    console.error('OAuth proxy error:', error);
    
    if (error instanceof Error && error.name === 'TimeoutError') {
      return NextResponse.json({ error: 'Request timed out' }, { status: 504 });
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch OAuth metadata' },
      { status: 502 }
    );
  }
}
