import { NextRequest, NextResponse } from 'next/server';
import { db, userFeeds } from '@/lib/db';
import { eq, asc } from 'drizzle-orm';
import { verifyUserAccess } from '@/lib/server-auth';
import { randomBytes } from 'crypto';

// Generate cryptographically secure random ID
function secureRandomId(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomBytes(6).toString('hex')}`;
}

// GET /api/feeds?did=xxx - Fetch all pinned feeds for a user
export async function GET(request: NextRequest) {
  const did = request.nextUrl.searchParams.get('did');

  if (!did) {
    return NextResponse.json({ error: 'DID required' }, { status: 400 });
  }

  // Verify the user is authenticated and requesting their own data
  const auth = await verifyUserAccess(request, did);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const feeds = await db
      .select()
      .from(userFeeds)
      .where(eq(userFeeds.userDid, did))
      .orderBy(asc(userFeeds.position));

    const parsedFeeds = feeds.map(f => ({
      uri: f.feedUri,
      displayName: f.displayName,
      acceptsInteractions: f.acceptsInteractions,
      type: f.feedType,
      keyword: f.keyword,
    }));

    return NextResponse.json({ feeds: parsedFeeds }, {
      headers: {
        // User-specific data - don't cache
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('Failed to fetch feeds:', error);
    return NextResponse.json({ error: 'Failed to fetch feeds' }, { status: 500 });
  }
}

// POST /api/feeds - Sync feeds for a user
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { did, feeds } = body;

    if (!did) {
      return NextResponse.json({ error: 'DID required' }, { status: 400 });
    }

    // Verify the user is authenticated and modifying their own data
    const auth = await verifyUserAccess(request, did);
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (!Array.isArray(feeds)) {
      return NextResponse.json({ error: 'Feeds array required' }, { status: 400 });
    }

    // Delete all existing feeds for user
    await db.delete(userFeeds).where(eq(userFeeds.userDid, did));

    // Insert new feeds with positions
    for (let i = 0; i < feeds.length; i++) {
      const feed = feeds[i];
      const id = secureRandomId('feed');
      await db.insert(userFeeds).values({
        id,
        userDid: did,
        feedUri: feed.uri,
        displayName: feed.displayName,
        acceptsInteractions: feed.acceptsInteractions || false,
        feedType: feed.type || null,
        keyword: feed.keyword || null,
        position: i,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to sync feeds:', error);
    return NextResponse.json({ error: 'Failed to sync feeds' }, { status: 500 });
  }
}
