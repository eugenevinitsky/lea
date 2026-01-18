import { NextRequest, NextResponse } from 'next/server';

// Check if an IP address is private/internal
function isPrivateIP(ip: string): boolean {
  // IPv4 private ranges
  const ipv4Parts = ip.split('.').map(Number);
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
    // 169.254.0.0/16 (link-local, includes AWS metadata endpoint)
    if (a === 169 && b === 254) return true;
    // 0.0.0.0
    if (a === 0) return true;
  }

  // IPv6 localhost and private
  const ipLower = ip.toLowerCase();
  if (ipLower === '::1' || ipLower === '::' || ipLower.startsWith('fe80:') || ipLower.startsWith('fc') || ipLower.startsWith('fd')) {
    return true;
  }

  return false;
}

// Check if hostname is safe to fetch
function isSafeHostname(hostname: string): boolean {
  const hostLower = hostname.toLowerCase();

  // Block localhost variants
  if (hostLower === 'localhost' || hostLower.endsWith('.localhost')) {
    return false;
  }

  // Block internal hostnames
  if (hostLower.endsWith('.internal') || hostLower.endsWith('.local') || hostLower.endsWith('.corp')) {
    return false;
  }

  // Block cloud metadata endpoints
  if (hostLower === 'metadata.google.internal' || hostLower === 'metadata') {
    return false;
  }

  // Check if hostname is an IP address
  if (isPrivateIP(hostname)) {
    return false;
  }

  return true;
}

// Fetch metadata for a URL (title, description, image)
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL required' }, { status: 400 });
  }

  try {
    // Validate URL
    const parsedUrl = new URL(url);

    // Only allow http and https protocols
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return NextResponse.json({ error: 'Invalid protocol' }, { status: 400 });
    }

    // Block requests to private/internal hosts (SSRF protection)
    if (!isSafeHostname(parsedUrl.hostname)) {
      return NextResponse.json({ error: 'Invalid host' }, { status: 400 });
    }

    // Fetch the page with manual redirect handling to prevent SSRF via redirects
    let currentUrl = url;
    let response: Response;
    let redirectCount = 0;
    const maxRedirects = 5;

    while (true) {
      response = await fetch(currentUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LeaBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(10000),
        redirect: 'manual', // Don't auto-follow redirects
      });

      // Check if this is a redirect
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) break;

        // Resolve relative redirects
        const redirectUrl = new URL(location, currentUrl);

        // Validate the redirect target
        if (redirectUrl.protocol !== 'http:' && redirectUrl.protocol !== 'https:') {
          return NextResponse.json({ error: 'Invalid redirect protocol' }, { status: 400 });
        }
        if (!isSafeHostname(redirectUrl.hostname)) {
          return NextResponse.json({ error: 'Invalid redirect host' }, { status: 400 });
        }

        redirectCount++;
        if (redirectCount > maxRedirects) {
          return NextResponse.json({ error: 'Too many redirects' }, { status: 400 });
        }

        currentUrl = redirectUrl.toString();
        continue;
      }

      break;
    }

    if (!response.ok) {
      return NextResponse.json({
        url,
        title: parsedUrl.hostname,
        description: '',
        image: null,
      });
    }

    const html = await response.text();

    // Parse metadata from HTML
    const title = extractMeta(html, 'og:title') ||
                  extractMeta(html, 'twitter:title') ||
                  extractTitle(html) ||
                  parsedUrl.hostname;

    const description = extractMeta(html, 'og:description') ||
                        extractMeta(html, 'twitter:description') ||
                        extractMeta(html, 'description') ||
                        '';

    let image = extractMeta(html, 'og:image') ||
                extractMeta(html, 'twitter:image') ||
                null;

    // Make image URL absolute if relative
    if (image && !image.startsWith('http')) {
      image = new URL(image, url).toString();
    }

    return NextResponse.json({
      url,
      title: title.slice(0, 300), // Bluesky limits
      description: description.slice(0, 1000),
      image,
    }, {
      headers: {
        // Cache at CDN for 1 hour, stale-while-revalidate for 24 hours (page metadata rarely changes)
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('Failed to fetch link metadata:', error);
    return NextResponse.json({
      url,
      title: new URL(url).hostname,
      description: '',
      image: null,
    });
  }
}

function extractMeta(html: string, property: string): string | null {
  // Try og: and twitter: prefixes
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      return decodeHtmlEntities(match[1]);
    }
  }
  return null;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? decodeHtmlEntities(match[1].trim()) : null;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
