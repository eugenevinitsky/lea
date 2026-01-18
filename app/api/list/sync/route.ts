import { NextRequest, NextResponse } from 'next/server';
import { syncVerifiedOnlyList, getBotAgent } from '@/lib/services/list-manager';

// Verify admin secret for admin endpoints
function verifyAdminSecret(request: NextRequest): boolean {
  const secret = process.env.BACKFILL_SECRET;
  if (!secret) return false;

  const { searchParams } = new URL(request.url);
  return searchParams.get('key') === secret;
}

export async function POST(request: NextRequest) {
  try {
    // Require admin secret
    if (!verifyAdminSecret(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const agent = await getBotAgent();
    if (!agent) {
      return NextResponse.json(
        { error: 'Bot agent not configured' },
        { status: 500 }
      );
    }

    const result = await syncVerifiedOnlyList(agent);
    return NextResponse.json(result);
  } catch (error) {
    console.error('List sync error:', error);
    return NextResponse.json(
      { error: 'Failed to sync list' },
      { status: 500 }
    );
  }
}
