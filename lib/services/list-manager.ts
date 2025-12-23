import { BskyAgent } from '@atproto/api';
import { db, blueskyLists, communityMembers } from '@/lib/db';
import { eq, isNull, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const LIST_NAME = 'Lea Verified Community';
const LIST_DESCRIPTION =
  'Verified researchers and their trusted connections (within 2 hops). Used for reply restrictions.';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getOrCreateCommunityList(
  agent: BskyAgent
): Promise<string> {
  // Check if list exists in database
  const existingList = await db
    .select()
    .from(blueskyLists)
    .where(eq(blueskyLists.purpose, 'community_members'))
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
      name: LIST_NAME,
      description: LIST_DESCRIPTION,
      createdAt: new Date().toISOString(),
    },
  });

  // Store in database
  await db.insert(blueskyLists).values({
    id: nanoid(),
    ownerDid: agent.session!.did,
    listUri: result.data.uri,
    listCid: result.data.cid,
    name: LIST_NAME,
    purpose: 'community_members',
  });

  return result.data.uri;
}

export async function getCommunityListUri(): Promise<string | null> {
  const list = await db
    .select()
    .from(blueskyLists)
    .where(eq(blueskyLists.purpose, 'community_members'))
    .limit(1);

  return list[0]?.listUri || null;
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
