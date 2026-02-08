import { NextRequest, NextResponse } from 'next/server';
import { syncPersonalList, getBotAgent } from '@/lib/services/list-manager';
import { syncUserGraph } from '@/lib/services/graph-sync';
import { verifyUserAccess } from '@/lib/server-auth';

export async function POST(request: NextRequest) {
  try {
    const { did } = await request.json();

    if (!did) {
      return NextResponse.json(
        { error: 'did parameter required' },
        { status: 400 }
      );
    }

    // Verify the user is authenticated and syncing their own data
    const auth = await verifyUserAccess(request, did);
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
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
      { error: 'Failed to sync personal list' },
      { status: 500 }
    );
  }
}
