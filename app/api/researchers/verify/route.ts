import { NextRequest, NextResponse } from 'next/server';
import { db, verifiedResearchers, communityMembers } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { did, handle, orcid, name, institution, verificationMethod = 'auto' } = body;

    if (!did || !orcid) {
      return NextResponse.json(
        { error: 'Missing required fields: did and orcid' },
        { status: 400 }
      );
    }

    // Check if already verified
    const existing = await db
      .select()
      .from(verifiedResearchers)
      .where(eq(verifiedResearchers.did, did))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'Already verified', researcher: existing[0] },
        { status: 409 }
      );
    }

    // Check if ORCID is already used by another account
    const existingOrcid = await db
      .select()
      .from(verifiedResearchers)
      .where(eq(verifiedResearchers.orcid, orcid))
      .limit(1);

    if (existingOrcid.length > 0) {
      return NextResponse.json(
        { error: 'ORCID already registered to another account' },
        { status: 409 }
      );
    }

    const researcherId = nanoid();

    // Insert verified researcher
    await db.insert(verifiedResearchers).values({
      id: researcherId,
      did,
      handle,
      orcid,
      name,
      institution,
      verificationMethod,
    });

    // Also add as community member (hop 0)
    await db.insert(communityMembers).values({
      id: nanoid(),
      did,
      handle,
      hopDistance: 0,
      closestVerifiedDid: did,
    });

    return NextResponse.json({
      success: true,
      id: researcherId,
      message: 'Verification complete',
    });
  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.json(
      { error: 'Failed to complete verification' },
      { status: 500 }
    );
  }
}
