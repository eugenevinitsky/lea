import { NextRequest, NextResponse } from 'next/server';
import { db, verifiedResearchers } from '@/lib/db';
import { inArray } from 'drizzle-orm';

const OPENALEX_BASE = 'https://api.openalex.org';

interface CoAuthor {
  openAlexId: string;
  name: string;
  count: number;
  // If they're a verified researcher on Lea
  verified?: {
    did: string;
    handle: string | null;
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const authorId = searchParams.get('authorId');

  if (!authorId) {
    return NextResponse.json({ error: 'Author ID is required' }, { status: 400 });
  }

  // Extract OpenAlex ID from full URL if needed
  const id = authorId.replace('https://openalex.org/', '');

  try {
    // Fetch recent works to find co-authors
    const response = await fetch(
      `${OPENALEX_BASE}/works?filter=author.id:${id}&per-page=100&sort=publication_year:desc`,
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
    const works = data.results || [];

    // Count co-author occurrences
    const coAuthorCounts = new Map<string, { name: string; count: number }>();
    
    for (const work of works) {
      for (const authorship of work.authorships || []) {
        const coAuthorId = authorship.author?.id;
        const coAuthorName = authorship.author?.display_name;
        
        // Skip the author themselves
        if (!coAuthorId || coAuthorId === `https://openalex.org/${id}`) continue;
        
        const existing = coAuthorCounts.get(coAuthorId);
        if (existing) {
          existing.count++;
        } else {
          coAuthorCounts.set(coAuthorId, { name: coAuthorName || 'Unknown', count: 1 });
        }
      }
    }

    // Sort by count and take top 10
    const sortedCoAuthors = Array.from(coAuthorCounts.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([openAlexId, data]) => ({
        openAlexId,
        name: data.name,
        count: data.count,
      }));

    // Try to find verified researchers matching these co-authors
    // We need to look them up by OpenAlex ID, but we store ORCID
    // Let's fetch their ORCIDs from OpenAlex and check against our database
    const coAuthorsWithVerification: CoAuthor[] = [];
    
    for (const coAuthor of sortedCoAuthors) {
      const coAuthorData: CoAuthor = { ...coAuthor };
      
      try {
        // Fetch co-author details from OpenAlex to get their ORCID
        const authorResponse = await fetch(
          `${OPENALEX_BASE}/authors/${coAuthor.openAlexId.replace('https://openalex.org/', '')}`,
          {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'Lea (mailto:hello@lea.social)',
            },
          }
        );
        
        if (authorResponse.ok) {
          const authorData = await authorResponse.json();
          if (authorData.orcid) {
            const orcid = authorData.orcid.replace('https://orcid.org/', '');
            
            // Check if they're a verified researcher
            const [verified] = await db
              .select({ did: verifiedResearchers.did, handle: verifiedResearchers.handle })
              .from(verifiedResearchers)
              .where(inArray(verifiedResearchers.orcid, [orcid]))
              .limit(1);
            
            if (verified) {
              coAuthorData.verified = {
                did: verified.did,
                handle: verified.handle,
              };
            }
          }
        }
      } catch (err) {
        // Ignore errors fetching individual co-author details
        console.error('Error fetching co-author details:', err);
      }
      
      coAuthorsWithVerification.push(coAuthorData);
    }

    return NextResponse.json({ coAuthors: coAuthorsWithVerification }, {
      headers: {
        // Cache at CDN for 1 hour, stale-while-revalidate for 24 hours
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('Error fetching co-authors from OpenAlex:', error);
    return NextResponse.json(
      { error: 'Failed to fetch co-authors data' },
      { status: 500 }
    );
  }
}
