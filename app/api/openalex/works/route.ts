import { NextRequest, NextResponse } from 'next/server';

const OPENALEX_BASE = 'https://api.openalex.org';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const authorId = searchParams.get('authorId');
  const perPage = searchParams.get('perPage') || '50';
  const page = searchParams.get('page') || '1';

  if (!authorId) {
    return NextResponse.json({ error: 'Author ID is required' }, { status: 400 });
  }

  // Extract OpenAlex ID from full URL if needed
  const id = authorId.replace('https://openalex.org/', '');

  try {
    const response = await fetch(
      `${OPENALEX_BASE}/works?filter=author.id:${id}&per-page=${perPage}&page=${page}&sort=publication_year:desc`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Lea (mailto:hello@lea.social)',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`OpenAlex API error: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching works from OpenAlex:', error);
    return NextResponse.json(
      { error: 'Failed to fetch works data' },
      { status: 500 }
    );
  }
}
