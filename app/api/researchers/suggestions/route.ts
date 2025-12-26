import { NextRequest, NextResponse } from 'next/server';
import { db, verifiedResearchers } from '@/lib/db';
import { eq, and, isNotNull } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { topics, excludeDid, limit = 10 } = body;

    if (!topics || !Array.isArray(topics) || topics.length === 0) {
      return NextResponse.json(
        { error: 'Missing required field: topics (array of strings)' },
        { status: 400 }
      );
    }

    // Get all active verified researchers with topics
    const researchers = await db
      .select({
        did: verifiedResearchers.did,
        handle: verifiedResearchers.handle,
        name: verifiedResearchers.name,
        institution: verifiedResearchers.institution,
        researchTopics: verifiedResearchers.researchTopics,
      })
      .from(verifiedResearchers)
      .where(
        and(
          eq(verifiedResearchers.isActive, true),
          isNotNull(verifiedResearchers.researchTopics)
        )
      );

    // Score researchers by topic overlap
    const scoredResearchers = researchers
      .filter(r => r.did !== excludeDid) // Exclude the requesting user
      .map(researcher => {
        const researcherTopics: string[] = researcher.researchTopics
          ? JSON.parse(researcher.researchTopics)
          : [];

        // Calculate overlap score
        const inputTopicsLower = topics.map((t: string) => t.toLowerCase());
        const researcherTopicsLower = researcherTopics.map(t => t.toLowerCase());

        let matchScore = 0;
        const matchedTopics: string[] = [];

        for (const inputTopic of inputTopicsLower) {
          for (const researcherTopic of researcherTopicsLower) {
            // Exact match
            if (inputTopic === researcherTopic) {
              matchScore += 3;
              if (!matchedTopics.includes(researcherTopic)) {
                matchedTopics.push(researcherTopic);
              }
            }
            // Partial match (one contains the other)
            else if (inputTopic.includes(researcherTopic) || researcherTopic.includes(inputTopic)) {
              matchScore += 1;
              if (!matchedTopics.includes(researcherTopic)) {
                matchedTopics.push(researcherTopic);
              }
            }
          }
        }

        return {
          did: researcher.did,
          handle: researcher.handle,
          name: researcher.name,
          institution: researcher.institution,
          researchTopics: researcherTopics.slice(0, 5), // Return top 5 topics
          matchScore,
          matchedTopics: matchedTopics.slice(0, 3),
        };
      })
      .filter(r => r.matchScore > 0) // Only return researchers with at least one match
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit);

    return NextResponse.json({
      suggestions: scoredResearchers,
      count: scoredResearchers.length,
    });
  } catch (error) {
    console.error('Suggestions error:', error);
    return NextResponse.json(
      { error: 'Failed to get suggestions' },
      { status: 500 }
    );
  }
}

// GET endpoint to fetch all unique topics for selection UI
export async function GET() {
  try {
    const researchers = await db
      .select({
        researchTopics: verifiedResearchers.researchTopics,
      })
      .from(verifiedResearchers)
      .where(
        and(
          eq(verifiedResearchers.isActive, true),
          isNotNull(verifiedResearchers.researchTopics)
        )
      );

    // Aggregate all topics and count occurrences
    const topicCounts = new Map<string, number>();

    for (const researcher of researchers) {
      if (researcher.researchTopics) {
        const topics: string[] = JSON.parse(researcher.researchTopics);
        for (const topic of topics) {
          topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
        }
      }
    }

    // Sort by count and return
    const sortedTopics = Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([topic, count]) => ({ topic, count }));

    return NextResponse.json({
      topics: sortedTopics,
      totalResearchers: researchers.length,
    });
  } catch (error) {
    console.error('Topics fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch topics' },
      { status: 500 }
    );
  }
}
