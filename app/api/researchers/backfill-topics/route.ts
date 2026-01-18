import { NextRequest, NextResponse } from 'next/server';
import { db, verifiedResearchers } from '@/lib/db';
import { eq, isNull, and, ne } from 'drizzle-orm';
import crypto from 'crypto';

// Timing-safe secret comparison
function verifySecret(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  try {
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);
    if (providedBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

// Backfill research topics for existing verified researchers
// This fetches works from OpenAlex and extracts topics
export async function POST(request: NextRequest) {
  try {
    // Require secret key for admin endpoints
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const secret = process.env.BACKFILL_SECRET;

    // Always require authentication - fail if secret is not configured
    if (!secret) {
      console.error('BACKFILL_SECRET not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    if (!verifySecret(key, secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all researchers without topics but with an ORCID
    const researchers = await db
      .select({
        id: verifiedResearchers.id,
        orcid: verifiedResearchers.orcid,
        name: verifiedResearchers.name,
      })
      .from(verifiedResearchers)
      .where(
        and(
          isNull(verifiedResearchers.researchTopics),
          ne(verifiedResearchers.orcid, '')
        )
      );

    console.log(`Found ${researchers.length} researchers to backfill`);

    const results: { id: string; name: string | null; status: string; topicsCount?: number }[] = [];

    for (const researcher of researchers) {
      try {
        // Fetch author from OpenAlex
        const authorResponse = await fetch(
          `https://api.openalex.org/authors?filter=orcid:${researcher.orcid}`,
          { headers: { 'User-Agent': 'Lea/1.0 (mailto:contact@lea.app)' } }
        );

        if (!authorResponse.ok) {
          results.push({ id: researcher.id, name: researcher.name, status: 'author_fetch_failed' });
          continue;
        }

        const authorData = await authorResponse.json();
        if (!authorData.results || authorData.results.length === 0) {
          results.push({ id: researcher.id, name: researcher.name, status: 'author_not_found' });
          continue;
        }

        const author = authorData.results[0];

        // Fetch works
        const worksResponse = await fetch(
          `https://api.openalex.org/works?filter=author.id:${author.id}&per_page=100&sort=publication_year:desc`,
          { headers: { 'User-Agent': 'Lea/1.0 (mailto:contact@lea.app)' } }
        );

        if (!worksResponse.ok) {
          results.push({ id: researcher.id, name: researcher.name, status: 'works_fetch_failed' });
          continue;
        }

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
        const topics = Array.from(topicCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([topic]) => topic);

        if (topics.length === 0) {
          results.push({ id: researcher.id, name: researcher.name, status: 'no_topics_found' });
          continue;
        }

        // Update researcher with topics
        await db
          .update(verifiedResearchers)
          .set({ researchTopics: JSON.stringify(topics) })
          .where(eq(verifiedResearchers.id, researcher.id));

        results.push({
          id: researcher.id,
          name: researcher.name,
          status: 'success',
          topicsCount: topics.length,
        });

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`Error processing researcher ${researcher.id}:`, error);
        results.push({
          id: researcher.id,
          name: researcher.name,
          status: 'error',
        });
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;

    return NextResponse.json({
      message: `Backfill complete: ${successCount}/${researchers.length} researchers updated`,
      results,
    });
  } catch (error) {
    console.error('Backfill error:', error);
    return NextResponse.json(
      { error: 'Backfill failed' },
      { status: 500 }
    );
  }
}
