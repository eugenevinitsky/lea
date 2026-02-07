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

  // Only allow HTTPS URLs (except for localhost in development mode only)
  const isLocalhost = parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1';
  if (parsedUrl.protocol !== 'https:' && !(process.env.NODE_ENV === 'development' && isLocalhost)) {
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

  // Check if hostname is a private/internal IP address
  function isPrivateHost(host: string): boolean {
    // Localhost variants
    if (host === 'localhost' || host.endsWith('.localhost')) return true;

    // IPv4 checks
    const ipv4Parts = host.split('.').map(Number);
    if (ipv4Parts.length === 4 && ipv4Parts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
      const [a, b] = ipv4Parts;
      // 10.0.0.0/8
      if (a === 10) return true;
      // 172.16.0.0/12
      if (a === 172 && b >= 16 && b <= 31) return true;
      // 192.168.0.0/16
      if (a === 192 && b === 168) return true;
      // 127.0.0.0/8 (localhost)
      if (a === 127) return true;
      // 169.254.0.0/16 (link-local, includes AWS/cloud metadata endpoints)
      if (a === 169 && b === 254) return true;
      // 0.0.0.0
      if (a === 0) return true;
    }

    // IPv6 checks
    const hostLower = host.toLowerCase();
    if (hostLower === '::1' || hostLower === '::') return true;
    if (hostLower.startsWith('fe80:')) return true; // Link-local
    if (hostLower.startsWith('fc') || hostLower.startsWith('fd')) return true; // Unique local

    return false;
  }

  if (isPrivateHost(hostname)) {
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
