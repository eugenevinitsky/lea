import { NextRequest, NextResponse } from 'next/server';
import { db, vouchRequests } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
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
        { error: 'Can only reject vouches addressed to yourself' },
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

    // Update vouch request status
    await db
      .update(vouchRequests)
      .set({
        status: 'rejected',
        resolvedAt: new Date(),
      })
      .where(eq(vouchRequests.id, requestId));

    return NextResponse.json({
      success: true,
      message: 'Vouch request rejected',
    });
  } catch (error) {
    console.error('Vouch rejection error:', error);
    return NextResponse.json(
      { error: 'Failed to reject vouch' },
      { status: 500 }
    );
  }
}
