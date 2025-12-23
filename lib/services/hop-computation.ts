import { db, verifiedResearchers, socialGraph, communityMembers } from '@/lib/db';
import { eq, inArray, or, and, notInArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const MAX_HOPS = 2;

interface HopComputationResult {
  totalMembers: number;
  byHop: {
    hop0: number;
    hop1: number;
    hop2: number;
  };
}

export async function computeNHopCommunity(): Promise<HopComputationResult> {
  // Step 1: Get all verified researchers (hop 0)
  const verified = await db
    .select({ did: verifiedResearchers.did, handle: verifiedResearchers.handle })
    .from(verifiedResearchers)
    .where(eq(verifiedResearchers.isActive, true));

  const verifiedDids = new Set(verified.map((v) => v.did));
  const communityMap = new Map<
    string,
    { hopDistance: number; closestVerifiedDid: string; handle?: string | null }
  >();

  // Initialize verified researchers as hop 0
  for (const v of verified) {
    communityMap.set(v.did, {
      hopDistance: 0,
      closestVerifiedDid: v.did,
      handle: v.handle,
    });
  }

  // Step 2: BFS to find N-hop connections
  let currentHopDids = Array.from(verifiedDids);

  for (let hop = 1; hop <= MAX_HOPS; hop++) {
    if (currentHopDids.length === 0) break;

    // Process in batches to avoid huge queries
    const BATCH_SIZE = 100;
    const nextHopDids: string[] = [];

    for (let i = 0; i < currentHopDids.length; i += BATCH_SIZE) {
      const batch = currentHopDids.slice(i, i + BATCH_SIZE);

      // Find all connections of current hop level
      // Both directions: followers AND following
      const edges = await db
        .select()
        .from(socialGraph)
        .where(
          or(
            inArray(socialGraph.followerId, batch),
            inArray(socialGraph.followingId, batch)
          )
        );

      for (const edge of edges) {
        // Check both directions
        const candidates = [edge.followerId, edge.followingId];

        for (const candidate of candidates) {
          if (!communityMap.has(candidate)) {
            // Find which verified researcher this connects through
            const connector = batch.find(
              (d) => d === edge.followerId || d === edge.followingId
            );
            const closestVerified =
              communityMap.get(connector!)?.closestVerifiedDid || connector!;

            communityMap.set(candidate, {
              hopDistance: hop,
              closestVerifiedDid: closestVerified,
            });
            nextHopDids.push(candidate);
          }
        }
      }
    }

    currentHopDids = nextHopDids;
  }

  // Step 3: Clear existing community members and insert new ones
  // First, get existing members to preserve list URIs
  const existingMembers = await db.select().from(communityMembers);
  const existingByDid = new Map(existingMembers.map((m) => [m.did, m]));

  // Delete members no longer in community
  const newDids = Array.from(communityMap.keys());
  if (existingMembers.length > 0) {
    const didsToRemove = existingMembers
      .filter((m) => !communityMap.has(m.did))
      .map((m) => m.did);

    if (didsToRemove.length > 0) {
      await db
        .delete(communityMembers)
        .where(inArray(communityMembers.did, didsToRemove));
    }
  }

  // Upsert community members
  const members = Array.from(communityMap.entries()).map(([did, data]) => {
    const existing = existingByDid.get(did);
    return {
      id: existing?.id || nanoid(),
      did,
      handle: data.handle || existing?.handle,
      hopDistance: data.hopDistance,
      closestVerifiedDid: data.closestVerifiedDid,
      computedAt: new Date(),
      // Preserve list membership info if exists
      addedToListAt: existing?.addedToListAt,
      listItemUri: existing?.listItemUri,
    };
  });

  // Batch upsert
  const CHUNK_SIZE = 50;
  for (let i = 0; i < members.length; i += CHUNK_SIZE) {
    const chunk = members.slice(i, i + CHUNK_SIZE);

    for (const member of chunk) {
      await db
        .insert(communityMembers)
        .values(member)
        .onConflictDoUpdate({
          target: communityMembers.did,
          set: {
            hopDistance: member.hopDistance,
            closestVerifiedDid: member.closestVerifiedDid,
            computedAt: member.computedAt,
            handle: member.handle,
          },
        });
    }
  }

  // Compute stats
  const byHop = {
    hop0: Array.from(communityMap.values()).filter((m) => m.hopDistance === 0)
      .length,
    hop1: Array.from(communityMap.values()).filter((m) => m.hopDistance === 1)
      .length,
    hop2: Array.from(communityMap.values()).filter((m) => m.hopDistance === 2)
      .length,
  };

  return {
    totalMembers: communityMap.size,
    byHop,
  };
}

// Check if a specific DID is in the community
export async function isInCommunity(
  did: string
): Promise<{ inCommunity: boolean; hopDistance?: number }> {
  const member = await db
    .select()
    .from(communityMembers)
    .where(eq(communityMembers.did, did))
    .limit(1);

  if (member.length > 0) {
    return { inCommunity: true, hopDistance: member[0].hopDistance };
  }

  return { inCommunity: false };
}
