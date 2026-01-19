import { NextRequest, NextResponse } from 'next/server';
import { db, verifiedResearchers } from '@/lib/db';
import { eq, and, or, isNull } from 'drizzle-orm';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

// Search ORCID by name
async function searchOrcid(name: string): Promise<{ orcid: string; name: string }[]> {
  // Parse name into parts
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return [];

  // Handle various name formats
  // "Brian C. Keegan, Ph.D." -> given: "Brian", family: "Keegan"
  // "Laura K. Nelson" -> given: "Laura", family: "Nelson"
  const cleanParts = parts
    .filter(p => !p.match(/^(Ph\.?D\.?|M\.?D\.?|Jr\.?|Sr\.?|III?|IV)$/i))
    .filter(p => !p.endsWith(','))
    .map(p => p.replace(/,$/, ''));

  const givenName = cleanParts[0];
  const familyName = cleanParts[cleanParts.length - 1];

  try {
    const response = await fetchWithTimeout(
      `https://pub.orcid.org/v3.0/search/?q=family-name:${encodeURIComponent(familyName)}+AND+given-names:${encodeURIComponent(givenName)}`,
      {
        headers: {
          'Accept': 'application/json',
        },
        timeout: 10000,
      }
    );

    if (!response.ok) return [];

    const data = await response.json();
    const results: { orcid: string; name: string }[] = [];

    for (const result of data.result || []) {
      if (result['orcid-identifier']?.path) {
        results.push({
          orcid: result['orcid-identifier'].path,
          name: `${givenName} ${familyName}`,
        });
      }
    }

    return results;
  } catch (error) {
    console.error(`ORCID search failed for ${name}:`, error);
    return [];
  }
}

// Fetch research topics from OpenAlex for an ORCID
async function fetchTopicsForOrcid(orcid: string): Promise<string[]> {
  try {
    // Get author from OpenAlex
    const authorResponse = await fetchWithTimeout(
      `https://api.openalex.org/authors?filter=orcid:${orcid}`,
      { headers: { 'User-Agent': 'Lea/1.0 (mailto:contact@lea.app)' }, timeout: 10000 }
    );

    if (!authorResponse.ok) return [];

    const authorData = await authorResponse.json();
    if (!authorData.results || authorData.results.length === 0) return [];

    const author = authorData.results[0];

    // Fetch works
    const worksResponse = await fetchWithTimeout(
      `https://api.openalex.org/works?filter=author.id:${author.id}&per_page=100&sort=publication_year:desc`,
      { headers: { 'User-Agent': 'Lea/1.0 (mailto:contact@lea.app)' }, timeout: 15000 }
    );

    if (!worksResponse.ok) return [];

    const worksData = await worksResponse.json();
    const works = worksData.results || [];

    // Extract topics
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

    // Get top 20 topics
    return Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([topic]) => topic);
  } catch (error) {
    console.error(`Failed to fetch topics for ORCID ${orcid}:`, error);
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get researchers without ORCID
    const researchers = await db
      .select({
        id: verifiedResearchers.id,
        name: verifiedResearchers.name,
        orcid: verifiedResearchers.orcid,
      })
      .from(verifiedResearchers)
      .where(
        or(
          eq(verifiedResearchers.orcid, ''),
          isNull(verifiedResearchers.orcid)
        )
      );

    console.log(`Found ${researchers.length} researchers without ORCID`);

    const results: {
      id: string;
      name: string | null;
      status: string;
      orcid?: string;
      matchCount?: number;
      topicsCount?: number;
    }[] = [];

    for (const researcher of researchers) {
      if (!researcher.name) {
        results.push({ id: researcher.id, name: null, status: 'no_name' });
        continue;
      }

      // Search ORCID
      const matches = await searchOrcid(researcher.name);

      if (matches.length === 0) {
        results.push({
          id: researcher.id,
          name: researcher.name,
          status: 'no_match',
          matchCount: 0,
        });
      } else if (matches.length > 1) {
        results.push({
          id: researcher.id,
          name: researcher.name,
          status: 'multiple_matches',
          matchCount: matches.length,
        });
      } else {
        // Exactly 1 match - update ORCID
        const orcid = matches[0].orcid;

        // Fetch topics from OpenAlex
        const topics = await fetchTopicsForOrcid(orcid);

        // Update database
        await db
          .update(verifiedResearchers)
          .set({
            orcid,
            researchTopics: topics.length > 0 ? JSON.stringify(topics) : null,
          })
          .where(eq(verifiedResearchers.id, researcher.id));

        results.push({
          id: researcher.id,
          name: researcher.name,
          status: 'updated',
          orcid,
          topicsCount: topics.length,
        });
      }

      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    const updated = results.filter(r => r.status === 'updated').length;
    const noMatch = results.filter(r => r.status === 'no_match').length;
    const multiple = results.filter(r => r.status === 'multiple_matches').length;

    return NextResponse.json({
      message: `Lookup complete: ${updated} updated, ${noMatch} no match, ${multiple} multiple matches`,
      updated,
      noMatch,
      multipleMatches: multiple,
      results,
    });
  } catch (error) {
    console.error('ORCID lookup error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lookup failed' },
      { status: 500 }
    );
  }
}
