import { NextResponse } from 'next/server';
import { db, verifiedResearchers } from '@/lib/db';
import { desc, eq } from 'drizzle-orm';

export async function GET() {
  try {
    const members = await db
      .select()
      .from(verifiedResearchers)
      .where(eq(verifiedResearchers.isActive, true))
      .orderBy(desc(verifiedResearchers.verifiedAt));

    // Map to the format expected by the frontend
    const researchers = members.map(m => ({
      did: m.did,
      handle: m.handle,
      orcid: m.orcid || '',
      name: m.name,
      institution: m.institution,
      researchTopics: m.researchTopics ? JSON.parse(m.researchTopics) : null,
      verifiedAt: m.verifiedAt,
      isActive: m.isActive,
      openAlexId: m.openAlexId,
    }));

    return NextResponse.json({ researchers }, {
      headers: {
        // Cache at CDN for 5 minutes, serve stale while revalidating for 10 minutes
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Failed to fetch researchers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch researchers' },
      { status: 500 }
    );
  }
}
