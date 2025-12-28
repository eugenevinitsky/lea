import { NextResponse } from 'next/server';
import { ozoneDb, verifiedMembers } from '@/lib/ozone-db';
import { desc } from 'drizzle-orm';

export async function GET() {
  try {
    const members = await ozoneDb
      .select()
      .from(verifiedMembers)
      .orderBy(desc(verifiedMembers.verifiedAt));

    // Map to the format expected by the frontend
    const researchers = members.map(m => ({
      did: m.blueskyDid,
      handle: m.blueskyHandle,
      orcid: m.orcidId || '',
      name: m.displayName,
      institution: null, // Not in Ozone DB
      researchTopics: null, // Will need to fetch from OpenAlex using openalexId
      verifiedAt: m.verifiedAt,
      isActive: true,
      openalexId: m.openalexId,
    }));

    return NextResponse.json({ researchers });
  } catch (error) {
    console.error('Failed to fetch researchers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch researchers' },
      { status: 500 }
    );
  }
}
