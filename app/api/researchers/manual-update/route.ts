import { NextRequest, NextResponse } from 'next/server';
import { db, verifiedResearchers } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { verifyBearerSecret } from '@/lib/server-auth';

function verifyAdminSecret(request: NextRequest): boolean {
  const secret = process.env.BACKFILL_SECRET;
  if (!secret) return false;
  return verifyBearerSecret(request.headers.get('authorization'), secret);
}

// Fetch research topics from OpenAlex by author ID
async function fetchTopicsForOpenAlexId(openalexId: string): Promise<string[]> {
  try {
    const worksResponse = await fetch(
      `https://api.openalex.org/works?filter=author.id:${openalexId}&per_page=100&sort=publication_year:desc`,
      { headers: { 'User-Agent': 'Lea/1.0 (mailto:contact@lea.app)' } }
    );

    if (!worksResponse.ok) return [];

    const worksData = await worksResponse.json();
    const works = worksData.results || [];

    const topicCounts = new Map<string, number>();

    for (const work of works) {
      if (work.topics) {
        for (const topic of work.topics) {
          if (topic.display_name) {
            topicCounts.set(topic.display_name, (topicCounts.get(topic.display_name) || 0) + 1);
          }
          if (topic.subfield?.display_name) {
            topicCounts.set(topic.subfield.display_name, (topicCounts.get(topic.subfield.display_name) || 0) + 1);
          }
          if (topic.field?.display_name) {
            topicCounts.set(topic.field.display_name, (topicCounts.get(topic.field.display_name) || 0) + 1);
          }
        }
      }
    }

    return Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([topic]) => topic);
  } catch (error) {
    console.error(`Failed to fetch topics for OpenAlex ID ${openalexId}:`, error);
    return [];
  }
}

// Fetch research topics from OpenAlex for an ORCID
async function fetchTopicsForOrcid(orcid: string): Promise<string[]> {
  try {
    const authorResponse = await fetch(
      `https://api.openalex.org/authors?filter=orcid:${orcid}`,
      { headers: { 'User-Agent': 'Lea/1.0 (mailto:contact@lea.app)' } }
    );

    if (!authorResponse.ok) return [];

    const authorData = await authorResponse.json();
    if (!authorData.results || authorData.results.length === 0) return [];

    const author = authorData.results[0];
    return fetchTopicsForOpenAlexId(author.id);
  } catch (error) {
    console.error(`Failed to fetch topics for ORCID ${orcid}:`, error);
    return [];
  }
}

export async function POST(request: NextRequest) {
  // Require admin authentication
  if (!verifyAdminSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { handle, orcid, openalexId } = body;

    if (!handle) {
      return NextResponse.json(
        { error: 'handle required' },
        { status: 400 }
      );
    }

    if (!orcid && !openalexId) {
      return NextResponse.json(
        { error: 'orcid or openalexId required' },
        { status: 400 }
      );
    }

    // Find researcher by handle
    const researchers = await db
      .select()
      .from(verifiedResearchers)
      .where(eq(verifiedResearchers.handle, handle))
      .limit(1);

    if (researchers.length === 0) {
      return NextResponse.json(
        { error: 'Researcher not found' },
        { status: 404 }
      );
    }

    // Fetch topics - prefer OpenAlex ID if provided, otherwise use ORCID
    let topics: string[] = [];
    if (openalexId) {
      topics = await fetchTopicsForOpenAlexId(openalexId);
    } else if (orcid) {
      topics = await fetchTopicsForOrcid(orcid);
    }

    // Update - only update orcid if provided
    const updateData: { orcid?: string; researchTopics: string | null } = {
      researchTopics: topics.length > 0 ? JSON.stringify(topics) : null,
    };
    if (orcid) {
      updateData.orcid = orcid;
    }

    await db
      .update(verifiedResearchers)
      .set(updateData)
      .where(eq(verifiedResearchers.handle, handle));

    return NextResponse.json({
      success: true,
      handle,
      orcid: orcid || researchers[0].orcid,
      openalexId,
      topicsCount: topics.length,
    });
  } catch (error) {
    console.error('Manual update error:', error);
    return NextResponse.json(
      { error: 'Update failed' },
      { status: 500 }
    );
  }
}
