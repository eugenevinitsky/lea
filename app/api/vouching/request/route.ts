import { NextRequest, NextResponse } from 'next/server';
import { db, vouchRequests, verifiedResearchers } from '@/lib/db';
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

    const { requesterDid, requesterHandle, voucherDid, message } =
      await request.json();

    if (!requesterDid || !voucherDid) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Ensure the authenticated user is the requester
    if (requesterDid !== authenticatedDid) {
      return NextResponse.json(
        { error: 'Can only request vouches for yourself' },
        { status: 403 }
      );
    }

    // Check that voucher is a verified researcher
    const voucher = await db
      .select()
      .from(verifiedResearchers)
      .where(
        and(
          eq(verifiedResearchers.did, voucherDid),
          eq(verifiedResearchers.isActive, true)
        )
      )
      .limit(1);

    if (voucher.length === 0) {
      return NextResponse.json(
        { error: 'Voucher is not a verified researcher' },
        { status: 400 }
      );
    }

    // Check for existing pending request
    const existing = await db
      .select()
      .from(vouchRequests)
      .where(
        and(
          eq(vouchRequests.requesterDid, requesterDid),
          eq(vouchRequests.voucherDid, voucherDid),
          eq(vouchRequests.status, 'pending')
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'Request already pending' },
        { status: 409 }
      );
    }

    const id = nanoid();

    await db.insert(vouchRequests).values({
      id,
      requesterDid,
      requesterHandle,
      voucherDid,
      message,
      status: 'pending',
    });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Vouch request error:', error);
    return NextResponse.json(
      { error: 'Failed to create vouch request' },
      { status: 500 }
    );
  }
}
