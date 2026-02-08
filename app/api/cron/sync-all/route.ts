import { NextRequest, NextResponse } from 'next/server';
import { db, verifiedResearchers } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { syncUserGraph } from '@/lib/services/graph-sync';
import { syncVerifiedOnlyList, syncAllPersonalLists, getBotAgent } from '@/lib/services/list-manager';
import { verifyBearerSecret } from '@/lib/server-auth';

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sets this automatically)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Always require authentication - fail if secret is not configured
  if (!cronSecret) {
    console.error('CRON_SECRET not configured');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }
  if (!verifyBearerSecret(authHeader, cronSecret)) {
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
          error: 'Sync step failed',
        });
      }
    }
    (results.steps as unknown[]).push({
      name: 'graph_sync',
      processed: researchers.length,
      results: graphResults,
    });

    // Step 3: Sync verified-only list
    const verifiedListResult = await syncVerifiedOnlyList(agent);
    (results.steps as unknown[]).push({
      name: 'verified_list_sync',
      ...verifiedListResult,
    });

    // Step 4: Sync labeler's verified list from Ozone
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';
    const internalSecret = process.env.INTERNAL_API_SECRET;

    try {
      const labelerSyncResponse = await fetch(`${baseUrl}/api/labeler/sync-from-ozone`, {
        method: 'POST',
        headers: internalSecret ? { 'Authorization': `Bearer ${internalSecret}` } : {},
      });

      if (labelerSyncResponse.ok) {
        const labelerSyncResult = await labelerSyncResponse.json();
        (results.steps as unknown[]).push({
          name: 'labeler_ozone_sync',
          ...labelerSyncResult,
        });
      } else {
        (results.steps as unknown[]).push({
          name: 'labeler_ozone_sync',
          error: `HTTP ${labelerSyncResponse.status}`,
        });
      }
    } catch (error) {
      console.error('Labeler ozone sync error:', error);
      (results.steps as unknown[]).push({
        name: 'labeler_ozone_sync',
        error: 'Sync step failed',
      });
    }

    // Step 5: Sync labeled researchers to database
    try {
      const syncToDbResponse = await fetch(`${baseUrl}/api/labeler/sync-to-db`, {
        method: 'POST',
        headers: internalSecret ? { 'Authorization': `Bearer ${internalSecret}` } : {},
      });

      if (syncToDbResponse.ok) {
        const syncToDbResult = await syncToDbResponse.json();
        (results.steps as unknown[]).push({
          name: 'labeler_db_sync',
          ...syncToDbResult,
        });
      } else {
        (results.steps as unknown[]).push({
          name: 'labeler_db_sync',
          error: `HTTP ${syncToDbResponse.status}`,
        });
      }
    } catch (error) {
      console.error('Labeler DB sync error:', error);
      (results.steps as unknown[]).push({
        name: 'labeler_db_sync',
        error: 'Sync step failed',
      });
    }

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
    results.error = 'Sync failed';
    return NextResponse.json(results, { status: 500 });
  }
}
