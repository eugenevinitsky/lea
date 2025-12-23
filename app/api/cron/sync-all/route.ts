import { NextRequest, NextResponse } from 'next/server';
import { db, verifiedResearchers } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { syncUserGraph } from '@/lib/services/graph-sync';
import { computeNHopCommunity } from '@/lib/services/hop-computation';
import { syncListMembers, syncVerifiedOnlyList, syncAllPersonalLists, getBotAgent } from '@/lib/services/list-manager';

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sets this automatically)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    steps: [],
  };

  try {
    // Step 1: Get bot agent
    const agent = await getBotAgent();
    if (!agent) {
      return NextResponse.json(
        { error: 'Bot agent not configured', results },
        { status: 500 }
      );
    }

    // Step 2: Sync graph for verified researchers
    const researchers = await db
      .select({ did: verifiedResearchers.did })
      .from(verifiedResearchers)
      .where(eq(verifiedResearchers.isActive, true))
      .limit(10); // Process 10 per run

    const graphResults = [];
    for (const researcher of researchers) {
      try {
        const result = await syncUserGraph(agent, {
          did: researcher.did,
          direction: 'both',
          maxPages: 3, // Limited pages per user to stay within timeout
        });
        graphResults.push({ did: researcher.did, ...result });
      } catch (error) {
        graphResults.push({
          did: researcher.did,
          error: String(error),
        });
      }
    }
    (results.steps as unknown[]).push({
      name: 'graph_sync',
      processed: researchers.length,
      results: graphResults,
    });

    // Step 3: Recompute N-hop community
    const hopResult = await computeNHopCommunity();
    (results.steps as unknown[]).push({
      name: 'hop_computation',
      ...hopResult,
    });

    // Step 4: Sync community members to Bluesky list
    const listResult = await syncListMembers(agent);
    (results.steps as unknown[]).push({
      name: 'community_list_sync',
      ...listResult,
    });

    // Step 5: Sync verified-only list
    const verifiedListResult = await syncVerifiedOnlyList(agent);
    (results.steps as unknown[]).push({
      name: 'verified_list_sync',
      ...verifiedListResult,
    });

    // Step 6: Sync personal lists for all verified researchers
    const personalListsResult = await syncAllPersonalLists(agent);
    (results.steps as unknown[]).push({
      name: 'personal_lists_sync',
      ...personalListsResult,
    });

    results.success = true;
    return NextResponse.json(results);
  } catch (error) {
    console.error('Cron sync error:', error);
    results.error = String(error);
    return NextResponse.json(results, { status: 500 });
  }
}
