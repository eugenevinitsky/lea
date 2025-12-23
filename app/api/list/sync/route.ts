import { NextRequest, NextResponse } from 'next/server';
import { syncListMembers, getBotAgent } from '@/lib/services/list-manager';

export async function POST(request: NextRequest) {
  try {
    const agent = await getBotAgent();
    if (!agent) {
      return NextResponse.json(
        { error: 'Bot agent not configured' },
        { status: 500 }
      );
    }

    const result = await syncListMembers(agent);
    return NextResponse.json(result);
  } catch (error) {
    console.error('List sync error:', error);
    return NextResponse.json(
      { error: 'Failed to sync list' },
      { status: 500 }
    );
  }
}
