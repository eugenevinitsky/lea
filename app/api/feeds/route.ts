import { NextRequest, NextResponse } from 'next/server';
import { db, userFeeds } from '@/lib/db';
import { eq, asc } from 'drizzle-orm';

// GET /api/feeds?did=xxx - Fetch all pinned feeds for a user
export async function GET(request: NextRequest) {
  const did = request.nextUrl.searchParams.get('did');

  if (!did) {
    return NextResponse.json({ error: 'DID required' }, { status: 400 });
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
        // Cache at CDN for 1 minute (per user via query param), stale-while-revalidate for 5 min
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
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

    if (!Array.isArray(feeds)) {
      return NextResponse.json({ error: 'Feeds array required' }, { status: 400 });
    }

    // Delete all existing feeds for user
    await db.delete(userFeeds).where(eq(userFeeds.userDid, did));

    // Insert new feeds with positions
    for (let i = 0; i < feeds.length; i++) {
      const feed = feeds[i];
      const id = `feed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
