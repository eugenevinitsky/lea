import { NextRequest, NextResponse } from 'next/server';
import { db, communityNotes, communityNoteScores } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { LEA_LABELER_DID } from '@/lib/constants';

// GET /api/community-notes/proposals/?uri=at://...
// Public endpoint - returns proposals (community notes) for a post in OCN social.pmsky.proposal format
export async function GET(request: NextRequest) {
  const uri = request.nextUrl.searchParams.get('uri');
  if (!uri) {
    return NextResponse.json({ error: 'uri query parameter is required' }, { status: 400 });
  }

  try {
    // Query community notes for this post URI, joined with scores
    const results = await db
      .select({
        id: communityNotes.id,
        postUri: communityNotes.postUri,
        summary: communityNotes.summary,
        reasons: communityNotes.reasons,
        aid: communityNotes.aid,
        labelStatus: communityNotes.labelStatus,
        createdAt: communityNotes.createdAt,
        // Score fields
        status: communityNoteScores.status,
      })
      .from(communityNotes)
      .leftJoin(communityNoteScores, eq(communityNoteScores.noteId, communityNotes.id))
      .where(
        and(
          eq(communityNotes.postUri, uri),
          eq(communityNotes.targetType, 'post')
        )
      );

    const proposals = results.map((row) => {
      let parsedReasons: string[] = [];
      if (row.reasons) {
        try {
          parsedReasons = JSON.parse(row.reasons);
        } catch {
          parsedReasons = [];
        }
      }

      return {
        uri: `at://${LEA_LABELER_DID}/social.pmsky.proposal/${row.id}`,
        subject: row.postUri,
        body: row.summary,
        reasons: parsedReasons,
        aid: row.aid ?? '',
        status: row.status ?? 'NMR',
        labelStatus: row.labelStatus ?? 'none',
        createdAt: row.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ proposals });
  } catch (error) {
    console.error('Error fetching community note proposals:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
