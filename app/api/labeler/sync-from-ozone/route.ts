import { NextRequest, NextResponse } from 'next/server';
import { BskyAgent } from '@atproto/api';
import { db, blueskyLists } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { verifyInternalSecret } from '@/lib/server-auth';

const VERIFIED_RESEARCHER_LABEL = 'verified-researcher';
const OZONE_URL = process.env.OZONE_URL;

// Fail explicitly if OZONE_URL is not configured
function getOzoneUrl(): string {
  if (!OZONE_URL) {
    throw new Error('OZONE_URL environment variable is required');
  }
  return OZONE_URL;
}

// Get labeler agent for Bluesky operations
async function getLabelerAgent(): Promise<BskyAgent | null> {
  const handle = process.env.LEA_LABELER_HANDLE;
  const password = process.env.LEA_LABELER_PASSWORD;

  if (!handle || !password) {
    return null;
  }

  const agent = new BskyAgent({ service: 'https://bsky.social' });
  await agent.login({ identifier: handle, password });
  return agent;
}

// Label type from Ozone
interface OzoneLabel {
  ver: number;
  src: string;
  uri: string;
  val: string;
  neg?: boolean;
  cts: string;
}

// Query Ozone's public label endpoint (no auth required!)
async function queryOzoneLabels(): Promise<{ dids: string[], debug: Record<string, unknown> }> {
  const labeledDids = new Set<string>();
  const negatedDids = new Set<string>();
  const debug: Record<string, unknown> = {};
  let cursor: string | undefined;
  let totalLabels = 0;

  try {
    do {
      const params = new URLSearchParams({
        uriPatterns: 'did:*',
        limit: '250',
      });
      if (cursor) params.set('cursor', cursor);

      const response = await fetch(
        `${getOzoneUrl()}/xrpc/com.atproto.label.queryLabels?${params}`
      );

      if (!response.ok) {
        const error = await response.text();
        debug.queryError = error;
        console.error('Ozone query error:', error);
        break;
      }

      const data = await response.json();
      const labels: OzoneLabel[] = data.labels || [];
      totalLabels += labels.length;

      for (const label of labels) {
        if (label.val === VERIFIED_RESEARCHER_LABEL) {
          const did = label.uri;
          if (did.startsWith('did:')) {
            if (label.neg) {
              // Label was negated (removed)
              negatedDids.add(did);
            } else {
              // Label was added
              labeledDids.add(did);
            }
          }
        }
      }

      cursor = data.cursor;
    } while (cursor);

    // Remove negated DIDs from the final set
    for (const did of negatedDids) {
      labeledDids.delete(did);
    }

    debug.totalLabelsQueried = totalLabels;
    debug.verifiedLabelsFound = labeledDids.size;
    debug.negatedLabels = negatedDids.size;

  } catch (error) {
    debug.exception = String(error);
    console.error('Error querying Ozone:', error);
  }

  return { dids: Array.from(labeledDids), debug };
}

// Get existing list members
async function getExistingListMembers(agent: BskyAgent, listUri: string): Promise<Set<string>> {
  const members = new Set<string>();

  try {
    let cursor: string | undefined;
    do {
      const response = await agent.app.bsky.graph.getList({
        list: listUri,
        limit: 100,
        cursor,
      });

      for (const item of response.data.items) {
        members.add(item.subject.did);
      }

      cursor = response.data.cursor;
    } while (cursor);
  } catch (error) {
    console.log('Could not fetch existing list members');
  }

  return members;
}

// Add user to list
async function addToList(agent: BskyAgent, listUri: string, userDid: string): Promise<boolean> {
  try {
    await agent.com.atproto.repo.createRecord({
      repo: agent.session!.did,
      collection: 'app.bsky.graph.listitem',
      record: {
        $type: 'app.bsky.graph.listitem',
        subject: userDid,
        list: listUri,
        createdAt: new Date().toISOString(),
      },
    });
    return true;
  } catch (error) {
    console.error(`Failed to add ${userDid}:`, error);
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  // Verify internal API secret
  if (!verifyInternalSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const agent = await getLabelerAgent();
    if (!agent || !agent.session) {
      return NextResponse.json(
        { error: 'Labeler agent not configured' },
        { status: 500 }
      );
    }

    // Get the list URI
    const existingList = await db
      .select()
      .from(blueskyLists)
      .where(eq(blueskyLists.purpose, 'labeler_verified'))
      .limit(1);

    if (!existingList[0]) {
      return NextResponse.json(
        { error: 'List not initialized. Call POST /api/labeler/init-list first.' },
        { status: 400 }
      );
    }

    const listUri = existingList[0].listUri;

    // Query Ozone's public label endpoint (no auth required!)
    const { dids: labeledDids, debug } = await queryOzoneLabels();
    console.log(`Found ${labeledDids.length} labeled users from Ozone`);

    // Get current list members
    const currentMembers = await getExistingListMembers(agent, listUri);
    console.log(`List currently has ${currentMembers.size} members`);

    let added = 0;
    const errors: string[] = [];

    // Add users who have the label but aren't in the list
    for (const did of labeledDids) {
      if (!currentMembers.has(did)) {
        const success = await addToList(agent, listUri, did);
        if (success) added++;
        else errors.push(`Failed to add ${did}`);
        await delay(200);
      }
    }

    return NextResponse.json({
      success: true,
      listUri,
      labeledUsersFound: labeledDids.length,
      labeledUsers: labeledDids,
      currentListMembers: currentMembers.size,
      added,
      errors,
      debug,
    });
  } catch (error) {
    console.error('Ozone sync error:', error);
    return NextResponse.json(
      { error: 'Sync failed' },
      { status: 500 }
    );
  }
}
