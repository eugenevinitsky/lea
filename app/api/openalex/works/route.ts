import { NextRequest, NextResponse } from 'next/server';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

const OPENALEX_BASE = 'https://api.openalex.org';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const authorId = searchParams.get('authorId');
  const perPageParam = searchParams.get('perPage') || '50';
  const pageParam = searchParams.get('page') || '1';

  if (!authorId) {
    return NextResponse.json({ error: 'Author ID is required' }, { status: 400 });
  }

  // Extract OpenAlex ID from full URL if needed and normalize
  const id = authorId.replace('https://openalex.org/', '').replace('authors/', '');

  // Validate OpenAlex author ID format (A followed by digits)
  if (!/^A\d+$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid OpenAlex author ID format' }, { status: 400 });
  }

  // Validate pagination parameters are positive integers
  const perPage = parseInt(perPageParam, 10);
  const page = parseInt(pageParam, 10);
  if (isNaN(perPage) || perPage < 1 || perPage > 200) {
    return NextResponse.json({ error: 'Invalid perPage parameter (must be 1-200)' }, { status: 400 });
  }
  if (isNaN(page) || page < 1) {
    return NextResponse.json({ error: 'Invalid page parameter' }, { status: 400 });
  }

  try {
    const response = await fetchWithTimeout(
      `${OPENALEX_BASE}/works?filter=author.id:${id.toUpperCase()}&per-page=${perPage}&page=${page}&sort=publication_year:desc`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Lea (mailto:hello@lea.social)',
        },
        timeout: 15000,
      }
    );

    if (!response.ok) {
      throw new Error(`OpenAlex API error: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data, {
      headers: {
        // Cache at CDN for 1 hour, stale-while-revalidate for 24 hours
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('Error fetching works from OpenAlex:', error);
    return NextResponse.json(
      { error: 'Failed to fetch works data' },
      { status: 500 }
    );
  }
}
