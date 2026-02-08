import { NextResponse } from 'next/server';

// GET /api/community-notes/subscribe/
// WebSocket subscriptions are not supported - return 501 with polling guidance
export async function GET() {
  return NextResponse.json(
    { error: 'WebSocket subscriptions not supported on this host. Use polling via /api/community-notes/proposals/ instead.' },
    { status: 501 }
  );
}
