import { NextRequest, NextResponse } from 'next/server';
import { BskyAgent } from '@atproto/api';
import { syncUserGraph } from '@/lib/services/graph-sync';
import { getBotAgent } from '@/lib/services/list-manager';

export async function POST(request: NextRequest) {
  try {
    const { did, direction = 'both', maxPages = 5 } = await request.json();

    if (!did) {
      return NextResponse.json(
        { error: 'Missing did parameter' },
        { status: 400 }
      );
    }

    // Get bot agent for API calls
    const agent = await getBotAgent();
    if (!agent) {
      return NextResponse.json(
        { error: 'Bot agent not configured' },
        { status: 500 }
      );
    }

    const result = await syncUserGraph(agent, {
      did,
      direction,
      maxPages,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Graph sync error:', error);
    return NextResponse.json(
      { error: 'Failed to sync graph' },
      { status: 500 }
    );
  }
}
