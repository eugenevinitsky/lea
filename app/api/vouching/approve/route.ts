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

    // Use a transaction to prevent race conditions
    // This ensures the check, researcher creation, and status update are atomic
    let researcherId: string | null = null;

    try {
      await db.transaction(async (tx) => {
        // Get the vouch request (inside transaction)
        const vouchRequest = await tx
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
          throw new Error('NOT_FOUND');
        }

        const req = vouchRequest[0];

        // Get voucher's researcher record to link
        const voucher = await tx
          .select()
          .from(verifiedResearchers)
          .where(eq(verifiedResearchers.did, voucherDid))
          .limit(1);

        if (voucher.length === 0) {
          throw new Error('VOUCHER_NOT_FOUND');
        }

        // Create verified researcher entry for the vouched person
        researcherId = nanoid();

        await tx.insert(verifiedResearchers).values({
          id: researcherId,
          did: req.requesterDid,
          handle: req.requesterHandle,
          orcid: '', // No ORCID for vouched users
          verificationMethod: 'vouched',
          vouchedBy: voucher[0].id,
        });

        // Update vouch request status
        await tx
          .update(vouchRequests)
          .set({
            status: 'approved',
            resolvedAt: new Date(),
          })
          .where(eq(vouchRequests.id, requestId));
      });
    } catch (txError) {
      if (txError instanceof Error) {
        if (txError.message === 'NOT_FOUND') {
          return NextResponse.json(
            { error: 'Vouch request not found or not pending' },
            { status: 404 }
          );
        }
        if (txError.message === 'VOUCHER_NOT_FOUND') {
          return NextResponse.json(
            { error: 'Voucher not found' },
            { status: 404 }
          );
        }
      }
      throw txError;
    }

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
