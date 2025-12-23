import { BskyAgent } from '@atproto/api';
import { db, blueskyLists, communityMembers, verifiedResearchers, socialGraph } from '@/lib/db';
import { eq, isNull, and, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const COMMUNITY_LIST_NAME = 'Lea Verified Community';
const COMMUNITY_LIST_DESCRIPTION =
  'Verified researchers and their trusted connections (1-hop). Used for reply restrictions.';

const VERIFIED_LIST_NAME = 'Lea Verified Researchers';
const VERIFIED_LIST_DESCRIPTION =
  'Verified researchers only. Used for strict reply restrictions.';

const PERSONAL_LIST_NAME_PREFIX = 'My Verified Community';
const PERSONAL_LIST_DESCRIPTION =
  'People within 1-hop of me (my followers + following). Used for reply restrictions.';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type ListPurpose = 'community_members' | 'verified_only';

export async function getOrCreateList(
  agent: BskyAgent,
  purpose: ListPurpose
): Promise<string> {
  const isVerifiedOnly = purpose === 'verified_only';
  const listName = isVerifiedOnly ? VERIFIED_LIST_NAME : COMMUNITY_LIST_NAME;
  const listDescription = isVerifiedOnly ? VERIFIED_LIST_DESCRIPTION : COMMUNITY_LIST_DESCRIPTION;

  // Check if list exists in database
  const existingList = await db
    .select()
    .from(blueskyLists)
    .where(eq(blueskyLists.purpose, purpose))
    .limit(1);

  if (existingList[0]) {
    return existingList[0].listUri;
  }

  // Create new list on Bluesky
  const result = await agent.com.atproto.repo.createRecord({
    repo: agent.session!.did,
    collection: 'app.bsky.graph.list',
    record: {
      $type: 'app.bsky.graph.list',
      purpose: 'app.bsky.graph.defs#curatelist',
      name: listName,
      description: listDescription,
      createdAt: new Date().toISOString(),
    },
  });

  // Store in database
  await db.insert(blueskyLists).values({
    id: nanoid(),
    ownerDid: agent.session!.did,
    listUri: result.data.uri,
    listCid: result.data.cid,
    name: listName,
    purpose: purpose,
  });

  return result.data.uri;
}

// Backwards compatible wrapper
export async function getOrCreateCommunityList(
  agent: BskyAgent
): Promise<string> {
  return getOrCreateList(agent, 'community_members');
}

export async function getListUri(purpose: ListPurpose): Promise<string | null> {
  const list = await db
    .select()
    .from(blueskyLists)
    .where(eq(blueskyLists.purpose, purpose))
    .limit(1);

  return list[0]?.listUri || null;
}

// Backwards compatible wrapper
export async function getCommunityListUri(): Promise<string | null> {
  return getListUri('community_members');
}

export async function getVerifiedOnlyListUri(): Promise<string | null> {
  return getListUri('verified_only');
}

interface SyncResult {
  addedCount: number;
  removedCount: number;
  listUri: string;
  errors: string[];
}

export async function syncListMembers(agent: BskyAgent): Promise<SyncResult> {
  const listUri = await getOrCreateCommunityList(agent);
  const errors: string[] = [];
  let addedCount = 0;
  let removedCount = 0;

  // Get community members not yet added to list
  const membersToAdd = await db
    .select()
    .from(communityMembers)
    .where(isNull(communityMembers.addedToListAt))
    .limit(50); // Process in batches due to rate limits

  for (const member of membersToAdd) {
    try {
      // Add to Bluesky list
      const result = await agent.com.atproto.repo.createRecord({
        repo: agent.session!.did,
        collection: 'app.bsky.graph.listitem',
        record: {
          $type: 'app.bsky.graph.listitem',
          subject: member.did,
          list: listUri,
          createdAt: new Date().toISOString(),
        },
      });

      // Update database
      await db
        .update(communityMembers)
        .set({
          addedToListAt: new Date(),
          listItemUri: result.data.uri,
        })
        .where(eq(communityMembers.id, member.id));

      addedCount++;

      // Rate limit
      await delay(200);
    } catch (error) {
      const msg = `Failed to add ${member.did}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(msg);
      errors.push(msg);
    }
  }

  // Update list member count - count members that have been added to list
  const allMembers = await db.select().from(communityMembers);
  const membersInList = allMembers.filter((m) => m.addedToListAt !== null);

  await db
    .update(blueskyLists)
    .set({
      memberCount: membersInList.length,
      updatedAt: new Date(),
    })
    .where(eq(blueskyLists.listUri, listUri));

  return { addedCount, removedCount, listUri, errors };
}

// Sync verified researchers only to the verified-only list
export async function syncVerifiedOnlyList(agent: BskyAgent): Promise<SyncResult> {
  const listUri = await getOrCreateList(agent, 'verified_only');
  const errors: string[] = [];
  let addedCount = 0;
  let removedCount = 0;

  // Get all active verified researchers
  const researchers = await db
    .select()
    .from(verifiedResearchers)
    .where(eq(verifiedResearchers.isActive, true));

  // Get existing list items to avoid duplicates
  let existingDids = new Set<string>();
  try {
    const listItems = await agent.app.bsky.graph.getList({ list: listUri, limit: 100 });
    existingDids = new Set(listItems.data.items.map(item => item.subject.did));
  } catch (error) {
    console.log('Could not fetch existing list items, will try to add all');
  }

  for (const researcher of researchers) {
    if (existingDids.has(researcher.did)) {
      continue; // Already in list
    }

    try {
      await agent.com.atproto.repo.createRecord({
        repo: agent.session!.did,
        collection: 'app.bsky.graph.listitem',
        record: {
          $type: 'app.bsky.graph.listitem',
          subject: researcher.did,
          list: listUri,
          createdAt: new Date().toISOString(),
        },
      });

      addedCount++;
      await delay(200);
    } catch (error) {
      const msg = `Failed to add researcher ${researcher.did}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(msg);
      errors.push(msg);
    }
  }

  // Update list member count
  await db
    .update(blueskyLists)
    .set({
      memberCount: researchers.length,
      updatedAt: new Date(),
    })
    .where(eq(blueskyLists.listUri, listUri));

  return { addedCount, removedCount, listUri, errors };
}

export async function removeFromList(
  agent: BskyAgent,
  memberDid: string
): Promise<boolean> {
  const member = await db
    .select()
    .from(communityMembers)
    .where(eq(communityMembers.did, memberDid))
    .limit(1);

  if (!member[0]?.listItemUri) {
    return false;
  }

  try {
    // Parse the URI to get rkey
    const parts = member[0].listItemUri.split('/');
    const rkey = parts[parts.length - 1];

    await agent.com.atproto.repo.deleteRecord({
      repo: agent.session!.did,
      collection: 'app.bsky.graph.listitem',
      rkey,
    });

    await db
      .update(communityMembers)
      .set({ addedToListAt: null, listItemUri: null })
      .where(eq(communityMembers.did, memberDid));

    return true;
  } catch (error) {
    console.error(`Failed to remove ${memberDid} from list:`, error);
    return false;
  }
}

// Get bot agent for list management
export async function getBotAgent(): Promise<BskyAgent | null> {
  const handle = process.env.LEA_BOT_HANDLE;
  const password = process.env.LEA_BOT_PASSWORD;

  if (!handle || !password) {
    console.error('LEA_BOT_HANDLE or LEA_BOT_PASSWORD not configured');
    return null;
  }

  const agent = new BskyAgent({ service: 'https://bsky.social' });

  try {
    await agent.login({ identifier: handle, password });
    return agent;
  } catch (error) {
    console.error('Failed to login bot agent:', error);
    return null;
  }
}

// ==========================================
// Per-User Personal Community Lists
// ==========================================

// Get the personal list URI for a verified researcher
export async function getPersonalListUri(userDid: string): Promise<string | null> {
  const researcher = await db
    .select()
    .from(verifiedResearchers)
    .where(eq(verifiedResearchers.did, userDid))
    .limit(1);

  return researcher[0]?.personalListUri || null;
}

// Create or get personal list for a verified researcher
export async function getOrCreatePersonalList(
  agent: BskyAgent,
  userDid: string
): Promise<string> {
  // Check if researcher already has a personal list
  const researcher = await db
    .select()
    .from(verifiedResearchers)
    .where(eq(verifiedResearchers.did, userDid))
    .limit(1);

  if (!researcher[0]) {
    throw new Error('User is not a verified researcher');
  }

  if (researcher[0].personalListUri) {
    return researcher[0].personalListUri;
  }

  // Create new list on Bluesky (owned by the bot, for the user)
  const result = await agent.com.atproto.repo.createRecord({
    repo: agent.session!.did,
    collection: 'app.bsky.graph.list',
    record: {
      $type: 'app.bsky.graph.list',
      purpose: 'app.bsky.graph.defs#curatelist',
      name: `${PERSONAL_LIST_NAME_PREFIX} - ${researcher[0].handle || userDid.slice(-8)}`,
      description: PERSONAL_LIST_DESCRIPTION,
      createdAt: new Date().toISOString(),
    },
  });

  // Store in database
  await db
    .update(verifiedResearchers)
    .set({ personalListUri: result.data.uri })
    .where(eq(verifiedResearchers.did, userDid));

  return result.data.uri;
}

// Compute 1-hop connections for a specific user
export async function computePersonalHops(userDid: string): Promise<Set<string>> {
  const oneHopDids = new Set<string>();

  // Get all edges where user is follower or following
  const edges = await db
    .select()
    .from(socialGraph)
    .where(
      or(
        eq(socialGraph.followerId, userDid),
        eq(socialGraph.followingId, userDid)
      )
    );

  // Collect all DIDs that are 1-hop from user
  for (const edge of edges) {
    if (edge.followerId === userDid) {
      oneHopDids.add(edge.followingId); // People user follows
    }
    if (edge.followingId === userDid) {
      oneHopDids.add(edge.followerId); // People who follow user
    }
  }

  // Also include the user themselves
  oneHopDids.add(userDid);

  // Also include all verified researchers (they should always be able to reply)
  const allVerified = await db
    .select()
    .from(verifiedResearchers)
    .where(eq(verifiedResearchers.isActive, true));

  for (const researcher of allVerified) {
    oneHopDids.add(researcher.did);
  }

  return oneHopDids;
}

interface PersonalSyncResult {
  addedCount: number;
  totalMembers: number;
  listUri: string;
  errors: string[];
}

// Sync personal list for a specific verified researcher
export async function syncPersonalList(
  agent: BskyAgent,
  userDid: string
): Promise<PersonalSyncResult> {
  const listUri = await getOrCreatePersonalList(agent, userDid);
  const errors: string[] = [];
  let addedCount = 0;

  // Compute who should be in this user's personal list
  const shouldBeInList = await computePersonalHops(userDid);

  // Get existing list items to avoid duplicates
  let existingDids = new Set<string>();
  try {
    let cursor: string | undefined;
    do {
      const listItems = await agent.app.bsky.graph.getList({
        list: listUri,
        limit: 100,
        cursor
      });
      for (const item of listItems.data.items) {
        existingDids.add(item.subject.did);
      }
      cursor = listItems.data.cursor;
    } while (cursor);
  } catch (error) {
    console.log('Could not fetch existing list items, will try to add all');
  }

  // Add missing members (limit to 50 per sync to stay within rate limits)
  let addedThisSync = 0;
  const MAX_PER_SYNC = 50;

  for (const did of shouldBeInList) {
    if (addedThisSync >= MAX_PER_SYNC) break;
    if (existingDids.has(did)) continue;

    try {
      await agent.com.atproto.repo.createRecord({
        repo: agent.session!.did,
        collection: 'app.bsky.graph.listitem',
        record: {
          $type: 'app.bsky.graph.listitem',
          subject: did,
          list: listUri,
          createdAt: new Date().toISOString(),
        },
      });

      addedCount++;
      addedThisSync++;
      await delay(200);
    } catch (error) {
      const msg = `Failed to add ${did} to personal list: ${error instanceof Error ? error.message : String(error)}`;
      console.error(msg);
      errors.push(msg);
    }
  }

  // Update sync timestamp
  await db
    .update(verifiedResearchers)
    .set({ personalListSyncedAt: new Date() })
    .where(eq(verifiedResearchers.did, userDid));

  return {
    addedCount,
    totalMembers: existingDids.size + addedCount,
    listUri,
    errors,
  };
}

// Sync personal lists for all verified researchers
export async function syncAllPersonalLists(agent: BskyAgent): Promise<{
  synced: number;
  errors: string[];
}> {
  const researchers = await db
    .select()
    .from(verifiedResearchers)
    .where(eq(verifiedResearchers.isActive, true));

  const errors: string[] = [];
  let synced = 0;

  for (const researcher of researchers) {
    try {
      await syncPersonalList(agent, researcher.did);
      synced++;
      // Longer delay between users to avoid rate limits
      await delay(500);
    } catch (error) {
      const msg = `Failed to sync personal list for ${researcher.did}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(msg);
      errors.push(msg);
    }
  }

  return { synced, errors };
}
