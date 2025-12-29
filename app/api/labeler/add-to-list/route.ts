import { NextRequest, NextResponse } from 'next/server';
import { BskyAgent } from '@atproto/api';
import { VERIFIED_RESEARCHERS_LIST } from '@/lib/constants';

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { handle, did } = body;

    if (!handle && !did) {
      return NextResponse.json(
        { error: 'Either handle or did is required' },
        { status: 400 }
      );
    }

    const agent = await getLabelerAgent();
    if (!agent) {
      return NextResponse.json(
        { error: 'Labeler agent not configured' },
        { status: 500 }
      );
    }

    // Resolve handle to DID if needed
    let userDid = did;
    if (!userDid && handle) {
      try {
        const profile = await agent.getProfile({ actor: handle });
        userDid = profile.data.did;
      } catch (error) {
        return NextResponse.json(
          { error: `Could not resolve handle: ${handle}` },
          { status: 404 }
        );
      }
    }

    // Use the verified researchers list constant
    const listUri = VERIFIED_RESEARCHERS_LIST;

    // Check if user is already in the list
    try {
      let cursor: string | undefined;
      let alreadyInList = false;

      do {
        const response = await agent.app.bsky.graph.getList({
          list: listUri,
          limit: 100,
          cursor,
        });

        for (const item of response.data.items) {
          if (item.subject.did === userDid) {
            alreadyInList = true;
            break;
          }
        }

        if (alreadyInList) break;
        cursor = response.data.cursor;
      } while (cursor);

      if (alreadyInList) {
        return NextResponse.json({
          success: true,
          message: 'User already in list',
          userDid,
          listUri,
        });
      }
    } catch (error) {
      console.log('Could not check existing list members');
    }

    // Add user to list
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

    return NextResponse.json({
      success: true,
      message: 'User added to list',
      userDid,
      listUri,
    });
  } catch (error) {
    console.error('Add to list error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add to list' },
      { status: 500 }
    );
  }
}
