import { NextRequest, NextResponse } from 'next/server';
import { db, vouchRequests } from '@/lib/db';
import { eq, and } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const { requestId, voucherDid } = await request.json();

    if (!requestId || !voucherDid) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
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
