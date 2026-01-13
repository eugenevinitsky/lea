import { NextRequest, NextResponse } from 'next/server';

const OPENALEX_BASE = 'https://api.openalex.org';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const orcid = searchParams.get('orcid');

  if (!orcid) {
    return NextResponse.json({ error: 'ORCID is required' }, { status: 400 });
  }

  // Normalize ORCID format
  const normalizedOrcid = orcid.replace('https://orcid.org/', '');

  try {
    const response = await fetch(
      `${OPENALEX_BASE}/authors?filter=orcid:https://orcid.org/${normalizedOrcid}`,
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
    return NextResponse.json(data, {
      headers: {
        // Cache at CDN for 1 hour, stale-while-revalidate for 24 hours (external data rarely changes)
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('Error fetching author from OpenAlex:', error);
    return NextResponse.json(
      { error: 'Failed to fetch author data' },
      { status: 500 }
    );
  }
}
