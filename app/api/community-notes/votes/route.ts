import { NextRequest, NextResponse } from 'next/server';
import { db, communityNoteRatings } from '@/lib/db';
import { eq } from 'drizzle-orm';

// Map helpfulness values (1.0, 0.5, 0.0) to OCN vote values (+1, 0, -1)
function helpfulnessToOcnValue(helpfulness: number): number {
  if (helpfulness >= 1.0) return 1;
  if (helpfulness <= 0.0) return -1;
  return 0;
}

// GET /api/community-notes/votes/?proposalUri=at://did:plc:.../social.pmsky.proposal/noteId
// Public endpoint - returns votes (ratings) for a proposal in OCN social.pmsky.vote format
export async function GET(request: NextRequest) {
  const proposalUri = request.nextUrl.searchParams.get('proposalUri');
  if (!proposalUri) {
    return NextResponse.json({ error: 'proposalUri query parameter is required' }, { status: 400 });
  }

  // Extract noteId from the proposalUri (last segment after the final /)
  const parts = proposalUri.split('/');
  const noteId = parts[parts.length - 1];
  if (!noteId) {
    return NextResponse.json({ error: 'Could not extract noteId from proposalUri' }, { status: 400 });
  }

  try {
    const ratings = await db
      .select({
        aid: communityNoteRatings.aid,
        helpfulness: communityNoteRatings.helpfulness,
        ocnValue: communityNoteRatings.ocnValue,
        reasons: communityNoteRatings.reasons,
        createdAt: communityNoteRatings.createdAt,
      })
      .from(communityNoteRatings)
      .where(eq(communityNoteRatings.noteId, noteId));

    const votes = ratings.map((rating) => {
      let parsedReasons: string[] = [];
      if (rating.reasons) {
        try {
          parsedReasons = JSON.parse(rating.reasons);
        } catch {
          parsedReasons = [];
        }
      }

      // Use ocnValue if available, otherwise map from helpfulness
      const value = rating.ocnValue !== null
        ? rating.ocnValue
        : helpfulnessToOcnValue(rating.helpfulness);

      return {
        aid: rating.aid ?? '',
        value,
        reasons: parsedReasons,
        createdAt: rating.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ votes });
  } catch (error) {
    console.error('Error fetching community note votes:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
