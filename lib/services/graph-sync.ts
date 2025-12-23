import { BskyAgent } from '@atproto/api';
import { db, socialGraph, syncState } from '@/lib/db';
import { eq } from 'drizzle-orm';

const BATCH_SIZE = 100;
const DELAY_BETWEEN_REQUESTS = 200; // ms

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface SyncOptions {
  did: string;
  direction: 'followers' | 'following' | 'both';
  maxPages?: number;
}

interface SyncResult {
  status: string;
  pagesProcessed?: number;
  edgesAdded?: number;
  hasMore?: boolean;
  error?: string;
}

export async function syncUserGraph(
  agent: BskyAgent,
  options: SyncOptions
): Promise<SyncResult> {
  const { did, direction, maxPages = 10 } = options;

  let totalEdges = 0;
  let pagesProcessed = 0;

  try {
    // Sync followers (people who follow this user)
    if (direction === 'followers' || direction === 'both') {
      const syncId = `followers_${did}`;

      // Get existing cursor
      const existingSync = await db
        .select()
        .from(syncState)
        .where(eq(syncState.id, syncId))
        .limit(1);

      let cursor = existingSync[0]?.cursor || undefined;

      // Mark as in progress
      await db
        .insert(syncState)
        .values({
          id: syncId,
          status: 'in_progress',
          lastSyncAt: new Date(),
        })
        .onConflictDoUpdate({
          target: syncState.id,
          set: { status: 'in_progress', lastSyncAt: new Date() },
        });

      let followerPages = 0;
      while (followerPages < maxPages) {
        const response = await agent.getFollowers({
          actor: did,
          limit: BATCH_SIZE,
          cursor,
        });

        const edges = response.data.followers.map((f) => ({
          followerId: f.did,
          followingId: did,
          discoveredAt: new Date(),
          lastVerified: new Date(),
        }));

        if (edges.length > 0) {
          // Insert edges, update lastVerified on conflict
          for (const edge of edges) {
            await db
              .insert(socialGraph)
              .values(edge)
              .onConflictDoUpdate({
                target: [socialGraph.followerId, socialGraph.followingId],
                set: { lastVerified: new Date() },
              });
          }
          totalEdges += edges.length;
        }

        cursor = response.data.cursor;
        followerPages++;
        pagesProcessed++;

        if (!cursor) break;
        await delay(DELAY_BETWEEN_REQUESTS);
      }

      // Update sync state
      await db
        .update(syncState)
        .set({
          cursor: cursor || null,
          status: cursor ? 'idle' : 'complete',
          lastSyncAt: new Date(),
        })
        .where(eq(syncState.id, syncId));
    }

    // Sync following (people this user follows)
    if (direction === 'following' || direction === 'both') {
      const syncId = `following_${did}`;

      const existingSync = await db
        .select()
        .from(syncState)
        .where(eq(syncState.id, syncId))
        .limit(1);

      let cursor = existingSync[0]?.cursor || undefined;

      await db
        .insert(syncState)
        .values({
          id: syncId,
          status: 'in_progress',
          lastSyncAt: new Date(),
        })
        .onConflictDoUpdate({
          target: syncState.id,
          set: { status: 'in_progress', lastSyncAt: new Date() },
        });

      let followingPages = 0;
      while (followingPages < maxPages) {
        const response = await agent.getFollows({
          actor: did,
          limit: BATCH_SIZE,
          cursor,
        });

        const edges = response.data.follows.map((f) => ({
          followerId: did,
          followingId: f.did,
          discoveredAt: new Date(),
          lastVerified: new Date(),
        }));

        if (edges.length > 0) {
          for (const edge of edges) {
            await db
              .insert(socialGraph)
              .values(edge)
              .onConflictDoUpdate({
                target: [socialGraph.followerId, socialGraph.followingId],
                set: { lastVerified: new Date() },
              });
          }
          totalEdges += edges.length;
        }

        cursor = response.data.cursor;
        followingPages++;
        pagesProcessed++;

        if (!cursor) break;
        await delay(DELAY_BETWEEN_REQUESTS);
      }

      await db
        .update(syncState)
        .set({
          cursor: cursor || null,
          status: cursor ? 'idle' : 'complete',
          lastSyncAt: new Date(),
        })
        .where(eq(syncState.id, syncId));
    }

    return {
      status: 'success',
      pagesProcessed,
      edgesAdded: totalEdges,
      hasMore: pagesProcessed >= maxPages,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Graph sync error:', errorMessage);

    return {
      status: 'error',
      pagesProcessed,
      edgesAdded: totalEdges,
      error: errorMessage,
    };
  }
}
