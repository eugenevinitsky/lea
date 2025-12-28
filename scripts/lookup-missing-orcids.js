/**
 * Script to lookup ORCID IDs for researchers in CSV who are missing them
 *
 * Usage: node scripts/lookup-missing-orcids.js
 */

const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '..', 'researchers.csv');
const OUTPUT_PATH = path.join(__dirname, '..', 'researchers-updated.csv');

// Rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Get Bluesky profile to find display name
async function getBlueskyProfile(handle) {
  try {
    const response = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`
    );
    if (!response.ok) return null;
    const data = await response.json();
    return {
      did: data.did,
      displayName: data.displayName,
      handle: data.handle,
    };
  } catch (error) {
    return null;
  }
}

// Search ORCID by name
async function searchOrcid(displayName) {
  if (!displayName || displayName.trim().length < 3) return null;

  const parts = displayName.trim().split(/\s+/);
  if (parts.length < 2) return null;

  // Clean up name parts (remove titles, suffixes)
  const cleanParts = parts
    .filter(p => !p.match(/^(Ph\.?D\.?|M\.?D\.?|Jr\.?|Sr\.?|III?|IV|Dr\.?)$/i))
    .filter(p => !p.endsWith(','))
    .map(p => p.replace(/,$/, ''));

  if (cleanParts.length < 2) return null;

  const givenName = cleanParts[0];
  const familyName = cleanParts[cleanParts.length - 1];

  // Skip if names look like handles or emails
  if (givenName.includes('@') || familyName.includes('@')) return null;
  if (givenName.includes('.') && givenName.length < 4) return null;

  try {
    const query = `family-name:${familyName} AND given-names:${givenName}`;
    const response = await fetch(
      `https://pub.orcid.org/v3.0/search?q=${encodeURIComponent(query)}&rows=5`,
      { headers: { 'Accept': 'application/json' } }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const results = data.result || [];

    if (results.length === 0) return { status: 'no_match' };
    if (results.length > 1) return { status: 'multiple', count: results.length };

    return {
      status: 'found',
      orcid: results[0]['orcid-identifier']?.path,
    };
  } catch (error) {
    console.error(`ORCID search error for ${displayName}:`, error.message);
    return null;
  }
}

async function main() {
  // Read CSV
  const csv = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = csv.trim().split('\n');
  const header = lines[0];

  const results = [];
  let processed = 0;
  let found = 0;
  let noMatch = 0;
  let multiple = 0;
  let errors = 0;

  console.log(`Processing ${lines.length - 1} researchers...`);
  console.log('');

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const [handle, existingOrcid] = line.split(',');

    // If already has ORCID, keep it
    if (existingOrcid && existingOrcid.trim()) {
      results.push({ handle, orcid: existingOrcid.trim() });
      continue;
    }

    processed++;

    // Get Bluesky profile
    const profile = await getBlueskyProfile(handle);

    if (!profile || !profile.displayName) {
      results.push({ handle, orcid: '', note: 'no_profile' });
      errors++;
      process.stdout.write(`\r[${processed}] ${handle}: no profile`);
      await delay(100);
      continue;
    }

    // Search ORCID
    const orcidResult = await searchOrcid(profile.displayName);

    if (!orcidResult) {
      results.push({ handle, orcid: '', note: 'search_error' });
      errors++;
    } else if (orcidResult.status === 'found' && orcidResult.orcid) {
      results.push({ handle, orcid: orcidResult.orcid });
      found++;
      process.stdout.write(`\r[${processed}] ${handle}: FOUND ${orcidResult.orcid}          `);
    } else if (orcidResult.status === 'multiple') {
      results.push({ handle, orcid: '', note: `multiple:${orcidResult.count}` });
      multiple++;
      process.stdout.write(`\r[${processed}] ${handle}: ${orcidResult.count} matches (skipped)`);
    } else {
      results.push({ handle, orcid: '', note: 'no_match' });
      noMatch++;
      process.stdout.write(`\r[${processed}] ${handle}: no match`);
    }

    // Rate limit (ORCID API)
    await delay(300);

    // Progress update every 50
    if (processed % 50 === 0) {
      console.log(`\n\nProgress: ${processed} processed, ${found} found, ${noMatch} no match, ${multiple} multiple`);
    }
  }

  console.log('\n\n--- Summary ---');
  console.log(`Processed: ${processed}`);
  console.log(`Found: ${found}`);
  console.log(`No match: ${noMatch}`);
  console.log(`Multiple matches: ${multiple}`);
  console.log(`Errors: ${errors}`);

  // Write output CSV
  const outputLines = [header];
  for (const r of results) {
    outputLines.push(`${r.handle},${r.orcid}`);
  }

  fs.writeFileSync(OUTPUT_PATH, outputLines.join('\n'));
  console.log(`\nWritten to: ${OUTPUT_PATH}`);
}

main().catch(console.error);
