import { NextRequest, NextResponse } from 'next/server';
import { syncVerifiedOnlyList, getBotAgent } from '@/lib/services/list-manager';
import crypto from 'crypto';

// Timing-safe Bearer token verification
function verifyBearerSecret(authHeader: string | null, expected: string): boolean {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const provided = authHeader.slice(7);
  try {
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);
    if (providedBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Require admin secret via Bearer token (not query params - those get logged)
    const authHeader = request.headers.get('Authorization');
    const secret = process.env.BACKFILL_SECRET;

    if (!secret) {
      console.error('BACKFILL_SECRET not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    if (!verifyBearerSecret(authHeader, secret)) {
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
