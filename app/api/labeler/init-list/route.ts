import { NextRequest, NextResponse } from 'next/server';
import { BskyAgent } from '@atproto/api';
import { db, blueskyLists } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const VERIFIED_LIST_NAME = 'Verified Researchers';
const VERIFIED_LIST_DESCRIPTION = 'Users verified as researchers by Lea. Used for reply restrictions.';
const VERIFIED_RESEARCHER_LABEL = 'verified-researcher';

// Get labeler agent
async function getLabelerAgent(): Promise<BskyAgent | null> {
  const handle = process.env.LEA_LABELER_HANDLE;
  const password = process.env.LEA_LABELER_PASSWORD;

  if (!handle || !password) {
    console.error('LEA_LABELER_HANDLE or LEA_LABELER_PASSWORD not configured');
    return null;
  }

  const agent = new BskyAgent({ service: 'https://bsky.social' });

  try {
    await agent.login({ identifier: handle, password });
    return agent;
  } catch (error) {
    console.error('Failed to login labeler agent:', error);
    return null;
  }
}

// Query all labels applied by this labeler
async function queryLabelerLabels(agent: BskyAgent): Promise<string[]> {
  const labeledDids: string[] = [];
  const labelerDid = agent.session!.did;

  try {
    // Use the label query endpoint
    // Note: This requires the labeler to have access to query its own labels
    // We'll query via the com.atproto.label.queryLabels endpoint
    let cursor: string | undefined;

    do {
      const response = await fetch(
        `https://bsky.social/xrpc/com.atproto.label.queryLabels?` +
        new URLSearchParams({
          uriPatterns: 'did:*',
          sources: labelerDid,
          limit: '100',
          ...(cursor ? { cursor } : {}),
        }),
        {
          headers: {
            'Authorization': `Bearer ${agent.session!.accessJwt}`,
          },
        }
      );

      if (!response.ok) {
        console.error('Failed to query labels:', await response.text());
        break;
      }

      const data = await response.json();

      for (const label of data.labels || []) {
        if (label.val === VERIFIED_RESEARCHER_LABEL && !label.neg) {
          // Extract DID from the URI (format: did:plc:xxx)
          const did = label.uri;
          if (did.startsWith('did:')) {
            labeledDids.push(did);
          }
        }
      }

      cursor = data.cursor;
    } while (cursor);

  } catch (error) {
    console.error('Error querying labels:', error);
  }

  return labeledDids;
}

// Create the verified researchers list
async function createVerifiedList(agent: BskyAgent): Promise<string> {
  const result = await agent.com.atproto.repo.createRecord({
    repo: agent.session!.did,
    collection: 'app.bsky.graph.list',
    record: {
      $type: 'app.bsky.graph.list',
      purpose: 'app.bsky.graph.defs#curatelist',
      name: VERIFIED_LIST_NAME,
      description: VERIFIED_LIST_DESCRIPTION,
      createdAt: new Date().toISOString(),
    },
  });

  return result.data.uri;
}

// Get existing list members
async function getExistingListMembers(agent: BskyAgent, listUri: string): Promise<Set<string>> {
  const existingDids = new Set<string>();

  try {
    let cursor: string | undefined;
    do {
      const response = await agent.app.bsky.graph.getList({
        list: listUri,
        limit: 100,
        cursor,
      });

      for (const item of response.data.items) {
        existingDids.add(item.subject.did);
      }

      cursor = response.data.cursor;
    } while (cursor);
  } catch (error) {
    console.log('Could not fetch existing list items');
  }

  return existingDids;
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
    console.error(`Failed to add ${userDid} to list:`, error);
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  try {
    const agent = await getLabelerAgent();
    if (!agent) {
      return NextResponse.json(
        { error: 'Labeler agent not configured' },
        { status: 500 }
      );
    }

    const labelerDid = agent.session!.did;

    // Check if we already have a list stored for this labeler
    let listUri: string | null = null;

    const existingList = await db
      .select()
      .from(blueskyLists)
      .where(eq(blueskyLists.purpose, 'labeler_verified'))
      .limit(1);

    if (existingList[0]) {
      listUri = existingList[0].listUri;
      console.log('Using existing list:', listUri);
    } else {
      // Check if the labeler already has a "Verified Researchers" list on Bluesky
      try {
        const listsResponse = await agent.app.bsky.graph.getLists({
          actor: labelerDid,
          limit: 50,
        });

        const existingBskyList = listsResponse.data.lists.find(
          list => list.name === VERIFIED_LIST_NAME
        );

        if (existingBskyList) {
          listUri = existingBskyList.uri;
          console.log('Found existing Bluesky list:', listUri);
        }
      } catch (error) {
        console.log('Could not fetch existing lists');
      }

      // Create new list if none exists
      if (!listUri) {
        listUri = await createVerifiedList(agent);
        console.log('Created new list:', listUri);
      }

      // Store in database
      await db.insert(blueskyLists).values({
        id: nanoid(),
        ownerDid: labelerDid,
        listUri: listUri,
        listCid: '',
        name: VERIFIED_LIST_NAME,
        purpose: 'labeler_verified',
      });
    }

    // Query all labeled users
    const labeledDids = await queryLabelerLabels(agent);
    console.log(`Found ${labeledDids.length} labeled users`);

    // Get existing list members
    const existingMembers = await getExistingListMembers(agent, listUri);
    console.log(`List already has ${existingMembers.size} members`);

    // Add missing members
    let addedCount = 0;
    const errors: string[] = [];

    for (const did of labeledDids) {
      if (existingMembers.has(did)) {
        continue;
      }

      const success = await addToList(agent, listUri, did);
      if (success) {
        addedCount++;
      } else {
        errors.push(`Failed to add ${did}`);
      }

      // Rate limiting
      await delay(200);
    }

    return NextResponse.json({
      success: true,
      listUri,
      labelerDid,
      totalLabeled: labeledDids.length,
      existingMembers: existingMembers.size,
      added: addedCount,
      errors,
    });
  } catch (error) {
    console.error('Init list error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to init list' },
      { status: 500 }
    );
  }
}

// GET endpoint to just retrieve the list URI
export async function GET() {
  try {
    const existingList = await db
      .select()
      .from(blueskyLists)
      .where(eq(blueskyLists.purpose, 'labeler_verified'))
      .limit(1);

    if (existingList[0]) {
      return NextResponse.json({
        listUri: existingList[0].listUri,
        ownerDid: existingList[0].ownerDid,
      });
    }

    return NextResponse.json({ listUri: null });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get list URI' },
      { status: 500 }
    );
  }
}
