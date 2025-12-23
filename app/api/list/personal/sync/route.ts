import { NextRequest, NextResponse } from 'next/server';
import { syncPersonalList, getBotAgent } from '@/lib/services/list-manager';
import { syncUserGraph } from '@/lib/services/graph-sync';

export async function POST(request: NextRequest) {
  try {
    const { did } = await request.json();

    if (!did) {
      return NextResponse.json(
        { error: 'did parameter required' },
        { status: 400 }
      );
    }

    const agent = await getBotAgent();
    if (!agent) {
      return NextResponse.json(
        { error: 'Bot agent not configured' },
        { status: 500 }
      );
    }

    // First sync the user's social graph
    const graphResult = await syncUserGraph(agent, {
      did,
      direction: 'both',
      maxPages: 5,
    });

    // Then sync their personal list
    const listResult = await syncPersonalList(agent, did);

    return NextResponse.json({
      success: true,
      graphSync: graphResult,
      listSync: listResult,
    });
  } catch (error) {
    console.error('Failed to sync personal list:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync personal list' },
      { status: 500 }
    );
  }
}
