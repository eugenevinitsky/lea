import { NextRequest, NextResponse } from 'next/server';

// Fetch metadata for a URL (title, description, image)
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL required' }, { status: 400 });
  }

  try {
    // Validate URL
    const parsedUrl = new URL(url);

    // Fetch the page
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LeaBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10000),
    });

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
