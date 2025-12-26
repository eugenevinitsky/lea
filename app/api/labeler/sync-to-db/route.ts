import { NextRequest, NextResponse } from 'next/server';
import { BskyAgent } from '@atproto/api';
import { db, verifiedResearchers } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const VERIFIED_RESEARCHER_LABEL = 'verified-researcher';
const LABELER_DID = 'did:plc:7c7tx56n64jhzezlwox5dja6';

// Search ORCID API by name
async function searchOrcidByName(displayName: string): Promise<string | null> {
  if (!displayName || displayName.trim().length < 3) return null;

  const parts = displayName.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const givenName = parts[0];
  const familyName = parts[parts.length - 1];

  if (givenName.includes('@') || familyName.includes('@')) return null;
  if (givenName.length < 2 || familyName.length < 2) return null;

  try {
    const query = encodeURIComponent(`family-name:${familyName} AND given-names:${givenName}`);
    const response = await fetch(`https://pub.orcid.org/v3.0/search?q=${query}&rows=3`, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) return null;

    const data = await response.json();
    const results = data.result || [];
    if (results.length === 0) return null;

    return results[0]['orcid-identifier']?.path || null;
  } catch {
    return null;
  }
}

// Fetch research topics from OpenAlex using ORCID
async function fetchResearchTopics(orcid: string): Promise<string[]> {
  try {
    // Get author from OpenAlex
    const authorResponse = await fetch(
      `https://api.openalex.org/authors?filter=orcid:${orcid}`,
      { headers: { 'User-Agent': 'Lea/1.0 (mailto:contact@lea.app)' } }
    );

    if (!authorResponse.ok) return [];

    const authorData = await authorResponse.json();
    if (!authorData.results || authorData.results.length === 0) return [];

    const author = authorData.results[0];

    // Get works to extract topics
    const worksResponse = await fetch(
      `https://api.openalex.org/works?filter=author.id:${author.id}&per_page=50&sort=publication_year:desc`,
      { headers: { 'User-Agent': 'Lea/1.0 (mailto:contact@lea.app)' } }
    );

    if (!worksResponse.ok) return [];

    const worksData = await worksResponse.json();
    const works = worksData.results || [];

    // Count topics
    const topicCounts = new Map<string, number>();
    for (const work of works) {
      if (work.topics) {
        for (const topic of work.topics) {
          if (topic.display_name) {
            topicCounts.set(topic.display_name, (topicCounts.get(topic.display_name) || 0) + 1);
          }
        }
      }
    }

    // Return top 15 topics
    return Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([topic]) => topic);
  } catch (error) {
    console.error(`Failed to fetch topics for ORCID ${orcid}:`, error);
    return [];
  }
}

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

// Handle single-DID sync from Jetstream listener
async function handleSingleDid(agent: BskyAgent, did: string, action: 'add' | 'remove') {
  console.log(`Single-DID sync: ${action} ${did}`);

  if (action === 'remove') {
    // Mark researcher as inactive
    const result = await db
      .update(verifiedResearchers)
      .set({ isActive: false })
      .where(eq(verifiedResearchers.did, did));

    return NextResponse.json({
      message: `Deactivated researcher`,
      did,
      action: 'remove',
    });
  }

  // Action is 'add' - check if already exists
  const existing = await db
    .select({ did: verifiedResearchers.did, isActive: verifiedResearchers.isActive })
    .from(verifiedResearchers)
    .where(eq(verifiedResearchers.did, did))
    .limit(1);

  if (existing.length > 0) {
    // Researcher exists - reactivate if needed
    if (!existing[0].isActive) {
      await db
        .update(verifiedResearchers)
        .set({ isActive: true })
        .where(eq(verifiedResearchers.did, did));

      return NextResponse.json({
        message: `Reactivated existing researcher`,
        did,
        action: 'reactivate',
      });
    }

    return NextResponse.json({
      message: `Researcher already exists and is active`,
      did,
      action: 'none',
    });
  }

  // New researcher - get profile and insert
  const profile = await getProfile(agent, did);
  if (!profile) {
    return NextResponse.json(
      { error: `Could not fetch profile for ${did}` },
      { status: 400 }
    );
  }

  // Try to find ORCID and research topics
  let orcid = '';
  let researchTopics: string[] = [];

  const displayName = profile.displayName || '';
  if (displayName) {
    console.log(`Looking up ORCID for ${displayName}...`);
    const foundOrcid = await searchOrcidByName(displayName);
    if (foundOrcid) {
      orcid = foundOrcid;
      console.log(`  Found ORCID: ${orcid}`);

      // Fetch research topics from OpenAlex
      researchTopics = await fetchResearchTopics(orcid);
      console.log(`  Found ${researchTopics.length} research topics`);
    }
  }

  const researcherId = nanoid();
  await db.insert(verifiedResearchers).values({
    id: researcherId,
    did,
    handle: profile.handle,
    orcid,
    name: profile.displayName || profile.handle,
    researchTopics: researchTopics.length > 0 ? JSON.stringify(researchTopics) : null,
    verificationMethod: 'manual',
    isActive: true,
  });

  return NextResponse.json({
    message: `Added new researcher`,
    did,
    handle: profile.handle,
    orcid: orcid || undefined,
    topicsCount: researchTopics.length,
    action: 'add',
  });
}

export async function POST(request: NextRequest) {
  try {
    // Create a public agent for profile lookups
    const agent = new BskyAgent({ service: 'https://public.api.bsky.app' });

    // Check if this is a single-DID sync from Jetstream
    let body: { did?: string; action?: 'add' | 'remove' } = {};
    try {
      body = await request.json();
    } catch {
      // No body or invalid JSON - do full sync
    }

    // Single-DID sync (from Jetstream listener)
    if (body.did && body.action) {
      return handleSingleDid(agent, body.did, body.action);
    }

    // Full sync - fetch all labeled DIDs
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

    const results: { did: string; handle?: string; status: string; orcid?: string; topicsCount?: number }[] = [];

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

        // Try to find ORCID and research topics
        let orcid = '';
        let researchTopics: string[] = [];

        const displayName = profile.displayName || '';
        if (displayName) {
          const foundOrcid = await searchOrcidByName(displayName);
          if (foundOrcid) {
            orcid = foundOrcid;
            researchTopics = await fetchResearchTopics(orcid);
          }
        }

        // Insert into verified_researchers with ORCID and topics if found
        await db.insert(verifiedResearchers).values({
          id: researcherId,
          did,
          handle: profile.handle,
          orcid,
          name: profile.displayName || profile.handle,
          researchTopics: researchTopics.length > 0 ? JSON.stringify(researchTopics) : null,
          verificationMethod: 'manual',
          isActive: true,
        });

        results.push({
          did,
          handle: profile.handle,
          status: 'added',
          orcid: orcid || undefined,
          topicsCount: researchTopics.length,
        });
      } catch (error) {
        console.error(`Failed to insert ${did}:`, error);
        results.push({ did, handle: profile.handle, status: 'insert_failed' });
      }

      // Delay to avoid rate limiting (ORCID + OpenAlex API calls)
      await new Promise(resolve => setTimeout(resolve, 500));
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
