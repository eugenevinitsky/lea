import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  vouchRequests,
  verifiedResearchers,
} from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getAuthenticatedDid } from '@/lib/server-auth';

export async function POST(request: NextRequest) {
  try {
    // Verify the user is authenticated
    const authenticatedDid = getAuthenticatedDid(request);
    if (!authenticatedDid) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { requestId, voucherDid } = await request.json();

    if (!requestId || !voucherDid) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Ensure the authenticated user is the voucher
    if (voucherDid !== authenticatedDid) {
      return NextResponse.json(
        { error: 'Can only approve vouches for yourself' },
        { status: 403 }
      );
    }

    // Get the vouch request
    const vouchRequest = await db
      .select()
      .from(vouchRequests)
      .where(
        and(
          eq(vouchRequests.id, requestId),
          eq(vouchRequests.voucherDid, voucherDid),
          eq(vouchRequests.status, 'pending')
        )
      )
      .limit(1);

    if (vouchRequest.length === 0) {
      return NextResponse.json(
        { error: 'Vouch request not found or not pending' },
        { status: 404 }
      );
    }

    const req = vouchRequest[0];

    // Get voucher's researcher record to link
    const voucher = await db
      .select()
      .from(verifiedResearchers)
      .where(eq(verifiedResearchers.did, voucherDid))
      .limit(1);

    if (voucher.length === 0) {
      return NextResponse.json(
        { error: 'Voucher not found' },
        { status: 404 }
      );
    }

    // Create verified researcher entry for the vouched person
    const researcherId = nanoid();

    await db.insert(verifiedResearchers).values({
      id: researcherId,
      did: req.requesterDid,
      handle: req.requesterHandle,
      orcid: '', // No ORCID for vouched users
      verificationMethod: 'vouched',
      vouchedBy: voucher[0].id,
    });

    // Update vouch request status
    await db
      .update(vouchRequests)
      .set({
        status: 'approved',
        resolvedAt: new Date(),
      })
      .where(eq(vouchRequests.id, requestId));

    return NextResponse.json({
      success: true,
      researcherId,
      message: 'Vouch approved successfully',
    });
  } catch (error) {
    console.error('Vouch approval error:', error);
    return NextResponse.json(
      { error: 'Failed to approve vouch' },
      { status: 500 }
    );
  }
}
