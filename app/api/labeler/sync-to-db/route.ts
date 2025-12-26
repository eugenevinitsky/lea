import { NextRequest, NextResponse } from 'next/server';
import { BskyAgent } from '@atproto/api';
import { db, verifiedResearchers } from '@/lib/db';
import { nanoid } from 'nanoid';

const VERIFIED_RESEARCHER_LABEL = 'verified-researcher';
const LABELER_DID = 'did:plc:7c7tx56n64jhzezlwox5dja6';

// Get the labeler's service endpoint from PLC directory
async function getLabelerServiceEndpoint(): Promise<string | null> {
  try {
    const response = await fetch(`https://plc.directory/${LABELER_DID}`);
    if (!response.ok) return null;

    const data = await response.json();
    const labelerService = data.service?.find((s: { id: string }) => s.id === '#atproto_labeler');
    return labelerService?.serviceEndpoint || null;
  } catch (error) {
    console.error('Error fetching labeler service endpoint:', error);
    return null;
  }
}

// Fetch all DIDs with verified-researcher label from the labeler's own endpoint
async function fetchLabeledDids(): Promise<string[]> {
  const labeledDids: string[] = [];

  try {
    // Get labeler's service endpoint
    const labelerEndpoint = await getLabelerServiceEndpoint();
    if (!labelerEndpoint) {
      console.error('Could not find labeler service endpoint');
      return labeledDids;
    }

    console.log(`Querying labels from: ${labelerEndpoint}`);

    // Query labels directly from the labeler's service
    const response = await fetch(
      `${labelerEndpoint}/xrpc/com.atproto.label.queryLabels?` +
      new URLSearchParams({
        uriPatterns: 'did:*',
        sources: LABELER_DID,
        limit: '250',
      })
    );

    if (response.ok) {
      const data = await response.json();
      for (const label of data.labels || []) {
        if (label.val === VERIFIED_RESEARCHER_LABEL && !label.neg) {
          const did = label.uri;
          if (did.startsWith('did:') && !labeledDids.includes(did)) {
            labeledDids.push(did);
          }
        }
      }
    } else {
      console.error('Label query failed:', response.status, await response.text());
    }
  } catch (error) {
    console.error('Error querying labels:', error);
  }

  return labeledDids;
}

// Get profile info for a DID
async function getProfile(agent: BskyAgent, did: string): Promise<{ handle: string; displayName?: string } | null> {
  try {
    const profile = await agent.getProfile({ actor: did });
    return {
      handle: profile.data.handle,
      displayName: profile.data.displayName,
    };
  } catch (error) {
    console.error(`Failed to get profile for ${did}:`, error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Create a public agent for profile lookups
    const agent = new BskyAgent({ service: 'https://public.api.bsky.app' });

    // Fetch all labeled DIDs from the labeler's service endpoint
    const labeledDids = await fetchLabeledDids();
    console.log(`Found ${labeledDids.length} labeled DIDs from labeler`);

    if (labeledDids.length === 0) {
      return NextResponse.json({
        message: 'No labeled users found',
        added: 0,
        skipped: 0,
      });
    }

    // Get existing researchers from DB
    const existingResearchers = await db
      .select({ did: verifiedResearchers.did })
      .from(verifiedResearchers);

    const existingDids = new Set(existingResearchers.map(r => r.did));
    console.log(`${existingDids.size} researchers already in database`);

    const results: { did: string; handle?: string; status: string }[] = [];

    for (const did of labeledDids) {
      // Skip if already in database
      if (existingDids.has(did)) {
        results.push({ did, status: 'already_exists' });
        continue;
      }

      // Get profile info
      const profile = await getProfile(agent, did);
      if (!profile) {
        results.push({ did, status: 'profile_fetch_failed' });
        continue;
      }

      try {
        const researcherId = nanoid();

        // Insert into verified_researchers
        // Note: ORCID will be empty since we don't have it from the labeler
        await db.insert(verifiedResearchers).values({
          id: researcherId,
          did,
          handle: profile.handle,
          orcid: '', // Will need manual update or re-verification
          name: profile.displayName || profile.handle,
          verificationMethod: 'manual', // Mark as manual since imported from labeler
          isActive: true,
        });

        results.push({ did, handle: profile.handle, status: 'added' });
      } catch (error) {
        console.error(`Failed to insert ${did}:`, error);
        results.push({ did, handle: profile.handle, status: 'insert_failed' });
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const added = results.filter(r => r.status === 'added').length;
    const skipped = results.filter(r => r.status === 'already_exists').length;
    const failed = results.filter(r => r.status.includes('failed')).length;

    return NextResponse.json({
      message: `Sync complete: ${added} added, ${skipped} already existed, ${failed} failed`,
      totalLabeled: labeledDids.length,
      added,
      skipped,
      failed,
      results,
    });
  } catch (error) {
    console.error('Sync to DB error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    );
  }
}
