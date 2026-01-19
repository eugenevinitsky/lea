import { NextRequest, NextResponse } from 'next/server';
import { db, vouchRequests } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { verifyUserAccess } from '@/lib/server-auth';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const voucherDid = searchParams.get('voucherDid');

  if (!voucherDid) {
    return NextResponse.json(
      { error: 'Missing voucherDid parameter' },
      { status: 400 }
    );
  }

  // Verify the user is authenticated and requesting their own pending vouches
  const auth = await verifyUserAccess(request, voucherDid);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const pending = await db
      .select()
      .from(vouchRequests)
      .where(
        and(
          eq(vouchRequests.voucherDid, voucherDid),
          eq(vouchRequests.status, 'pending')
        )
      )
      .orderBy(vouchRequests.createdAt);

    return NextResponse.json({ requests: pending });
  } catch (error) {
    console.error('Failed to fetch pending vouches:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pending vouches' },
      { status: 500 }
    );
  }
}
