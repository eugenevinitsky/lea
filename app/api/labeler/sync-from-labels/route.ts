import { NextRequest, NextResponse } from 'next/server';
import { BskyAgent } from '@atproto/api';
import { db, blueskyLists } from '@/lib/db';
import { eq } from 'drizzle-orm';

const VERIFIED_RESEARCHER_LABEL = 'verified-researcher';
const LABELER_DID = 'did:plc:7c7tx56n64jhzezlwox5dja6';

// Get labeler agent
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

// Fetch labels from the Ozone labeler instance
async function fetchLabelsFromOzone(): Promise<Map<string, boolean>> {
  // Map of DID -> isLabeled (true = has label, false = label negated)
  const labeledUsers = new Map<string, boolean>();

  // Get the labeler's service endpoint from PLC directory
  let ozoneEndpoint = process.env.OZONE_ENDPOINT;

  if (!ozoneEndpoint) {
    try {
      const plcResponse = await fetch(`https://plc.directory/${LABELER_DID}`);
      if (plcResponse.ok) {
        const plcData = await plcResponse.json();
        const labelerService = plcData.service?.find((s: { id: string }) => s.id === '#atproto_labeler');
        ozoneEndpoint = labelerService?.serviceEndpoint;
      }
    } catch (error) {
      console.error('Error fetching labeler endpoint from PLC:', error);
    }
  }

  if (!ozoneEndpoint) {
    console.error('Could not find Ozone endpoint');
    return labeledUsers;
  }

  try {
    // Query labels directly from the Ozone instance
    const response = await fetch(
      `${ozoneEndpoint}/xrpc/com.atproto.label.queryLabels?` +
      new URLSearchParams({
        uriPatterns: 'did:*',
        sources: LABELER_DID,
        limit: '250',
      })
    );

    if (response.ok) {
      const data = await response.json();
      for (const label of data.labels || []) {
        if (label.val === VERIFIED_RESEARCHER_LABEL) {
          const did = label.uri;
          if (did.startsWith('did:')) {
            // neg: true means label was removed
            labeledUsers.set(did, !label.neg);
          }
        }
      }
    } else {
      console.error('Failed to query Ozone labels:', response.status, await response.text());
    }
  } catch (error) {
    console.error('Error querying Ozone labels:', error);
  }

  return labeledUsers;
}

// Get existing list members
async function getExistingListMembers(agent: BskyAgent, listUri: string): Promise<Map<string, string>> {
  // Map of DID -> listitem URI (for removal)
  const members = new Map<string, string>();

  try {
    let cursor: string | undefined;
    do {
      const response = await agent.app.bsky.graph.getList({
        list: listUri,
        limit: 100,
        cursor,
      });

      for (const item of response.data.items) {
        // We need the listitem URI to remove it later
        // The item.uri is the listitem record URI
        members.set(item.subject.did, item.uri);
      }

      cursor = response.data.cursor;
    } while (cursor);
  } catch (error) {
    console.log('Could not fetch existing list members:', error);
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

// Remove user from list
async function removeFromList(agent: BskyAgent, listitemUri: string): Promise<boolean> {
  try {
    const parts = listitemUri.split('/');
    const rkey = parts[parts.length - 1];

    await agent.com.atproto.repo.deleteRecord({
      repo: agent.session!.did,
      collection: 'app.bsky.graph.listitem',
      rkey,
    });
    return true;
  } catch (error) {
    console.error(`Failed to remove listitem:`, error);
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

    // Get labeled users from Ozone
    const labeledUsers = await fetchLabelsFromOzone();
    console.log(`Found ${labeledUsers.size} labeled users from Ozone`);

    // Get current list members
    const currentMembers = await getExistingListMembers(agent, listUri);
    console.log(`List currently has ${currentMembers.size} members`);

    let added = 0;
    let removed = 0;
    const errors: string[] = [];

    // Add users who have the label but aren't in the list
    for (const [did, hasLabel] of labeledUsers) {
      if (hasLabel && !currentMembers.has(did)) {
        const success = await addToList(agent, listUri, did);
        if (success) added++;
        else errors.push(`Failed to add ${did}`);
        await delay(200);
      }
    }

    // Remove users who are in the list but no longer have the label
    for (const [did, listitemUri] of currentMembers) {
      const hasLabel = labeledUsers.get(did);
      // Remove if explicitly negated OR if they're not in the label list at all
      if (hasLabel === false || hasLabel === undefined) {
        const success = await removeFromList(agent, listitemUri);
        if (success) removed++;
        else errors.push(`Failed to remove ${did}`);
        await delay(200);
      }
    }

    return NextResponse.json({
      success: true,
      listUri,
      labeledUsersFound: labeledUsers.size,
      currentListMembers: currentMembers.size,
      added,
      removed,
      errors,
    });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    );
  }
}
