#!/usr/bin/env node

/**
 * Label Researchers
 *
 * Labels candidates in Ozone and syncs to LEA database + list.
 *
 * Usage:
 *   node scripts/label-researchers.js researchers-full.json
 *   node scripts/label-researchers.js researchers-full.json --limit=30
 *   node scripts/label-researchers.js researchers-full.json --dry-run
 *
 * Required env vars (in .env.local):
 *   LABELER_HANDLE   - handle for Ozone auth (e.g. lea-community.bsky.social)
 *   LABELER_PASSWORD - password for Ozone auth
 */

// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

const fs = require('fs');
const { AtpAgent } = require('@atproto/api');

const LABELER_DID = 'did:plc:7c7tx56n64jhzezlwox5dja6';
const LEA_API = 'https://client-kappa-weld-68.vercel.app';
const LABEL_NAME = 'verified-researcher';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Get Ozone endpoint from PLC directory
async function getOzoneEndpoint() {
  if (process.env.OZONE_ENDPOINT) {
    return process.env.OZONE_ENDPOINT;
  }

  const plcResponse = await fetch(`https://plc.directory/${LABELER_DID}`);
  if (!plcResponse.ok) {
    throw new Error('Failed to lookup labeler in PLC directory');
  }

  const plcData = await plcResponse.json();
  const labelerService = plcData.service?.find(s => s.id === '#atproto_labeler');
  if (!labelerService) {
    throw new Error('No labeler service found in PLC directory');
  }

  return labelerService.serviceEndpoint;
}

// Label a user via Ozone API
async function labelInOzone(ozoneEndpoint, accessJwt, targetDid) {
  const response = await fetch(`${ozoneEndpoint}/xrpc/tools.ozone.moderation.emitEvent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessJwt}`,
    },
    body: JSON.stringify({
      event: {
        $type: 'tools.ozone.moderation.defs#modEventLabel',
        createLabelVals: [LABEL_NAME],
        negateLabelVals: [],
      },
      subject: {
        $type: 'com.atproto.admin.defs#repoRef',
        did: targetDid,
      },
      createdBy: LABELER_DID,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error.slice(0, 80));
  }

  return response.json();
}

async function main() {
  const args = process.argv.slice(2);
  const inputFile = args.find(a => !a.startsWith('--'));
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '30');
  const dryRun = args.includes('--dry-run');

  if (!inputFile) {
    console.log('Usage: node scripts/label-researchers.js <researchers.json> [options]');
    console.log('\nOptions:');
    console.log('  --limit=N      Max researchers to label (default: 30)');
    console.log('  --dry-run      Show what would be done without doing it');
    console.log('\nRequired env vars (in .env.local):');
    console.log('  LABELER_HANDLE   - Bluesky handle for Ozone auth');
    console.log('  LABELER_PASSWORD - Password for Ozone auth');
    process.exit(1);
  }

  console.log('\n🏷️  Label Researchers in Ozone\n');

  // Load researchers
  const researchers = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
  const toProcess = researchers.slice(0, limit);

  console.log(`Loaded ${researchers.length} researchers from ${inputFile}`);
  console.log(`Will process top ${toProcess.length}`);
  if (dryRun) console.log('\n⚠️  DRY RUN - no changes will be made');

  // Setup agent and Ozone connection
  let agent, ozoneEndpoint;
  if (!dryRun) {
    const handle = process.env.LABELER_HANDLE;
    const password = process.env.LABELER_PASSWORD;

    if (!handle || !password) {
      console.error('❌ LABELER_HANDLE and LABELER_PASSWORD env vars required');
      process.exit(1);
    }

    console.log('\nConnecting...');

    // Get Ozone endpoint
    ozoneEndpoint = await getOzoneEndpoint();
    console.log(`  Ozone: ${ozoneEndpoint}`);

    // Authenticate via bsky.social
    agent = new AtpAgent({ service: 'https://bsky.social' });
    await agent.login({ identifier: handle, password });
    console.log(`  Authenticated as: ${agent.session?.handle}`);
    console.log(`  DID: ${agent.session?.did}`);
  }

  // Process researchers
  console.log('\n' + '='.repeat(60));
  console.log('\nLabeling researchers:\n');

  let success = 0, failed = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const r = toProcess[i];
    const name = r.displayName || r.handle;

    if (dryRun) {
      console.log(`[${i + 1}/${toProcess.length}] Would label @${r.handle} (${name})`);
    } else {
      process.stdout.write(`[${i + 1}/${toProcess.length}] @${r.handle} (${name})... `);
      try {
        await labelInOzone(ozoneEndpoint, agent.session.accessJwt, r.did);
        console.log('✓');
        success++;
      } catch (err) {
        console.log(`✗ ${err.message.slice(0, 60)}`);
        failed++;
      }
      await delay(300); // Rate limiting
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Summary:\n');
  if (dryRun) {
    console.log(`Would label ${toProcess.length} researchers`);
  } else {
    console.log(`Labeled: ${success}`);
    console.log(`Failed: ${failed}`);
  }

  // Sync to LEA database and list
  if (!dryRun && success > 0) {
    console.log('\n🔄 Syncing to LEA...\n');

    // Sync labels to database
    console.log('  Syncing to database...');
    try {
      const dbResponse = await fetch(`${LEA_API}/api/labeler/sync-to-db`, { method: 'POST' });
      if (dbResponse.ok) {
        const dbResult = await dbResponse.json();
        console.log(`  ✓ Database: ${dbResult.added || 0} added, ${dbResult.skipped || 0} skipped`);
      } else {
        console.log(`  ✗ Database sync failed: ${await dbResponse.text()}`);
      }
    } catch (err) {
      console.log(`  ✗ Database sync error: ${err.message}`);
    }

    // Sync to Bluesky list
    console.log('  Syncing to list...');
    try {
      const listResponse = await fetch(`${LEA_API}/api/labeler/sync-from-labels`, { method: 'POST' });
      if (listResponse.ok) {
        const listResult = await listResponse.json();
        console.log(`  ✓ List: ${listResult.added || 0} added`);
      } else {
        console.log(`  ✗ List sync failed: ${await listResponse.text()}`);
      }
    } catch (err) {
      console.log(`  ✗ List sync error: ${err.message}`);
    }
  }

  console.log('\n✅ Done!\n');
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
