#!/usr/bin/env node

/**
 * Script to look up ORCID IDs for researchers (with resume support)
 * Only assigns ORCID if there's exactly one match (unique name)
 */

const fs = require('fs');
const path = require('path');

const ORCID_API = 'https://pub.orcid.org/v3.0/search/';
const CSV_PATH = path.join(__dirname, '..', 'researchers.csv');
const JSON_PATH = path.join(__dirname, '..', 'researchers-full.json');

async function searchOrcid(name) {
  try {
    const parts = name.trim().split(/\s+/);
    if (parts.length < 2) return null;

    const firstName = parts[0];
    const lastName = parts[parts.length - 1];

    const query = `given-names:${firstName} AND family-name:${lastName}`;
    const url = `${ORCID_API}?q=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) return null;

    const data = await response.json();
    const numResults = data['num-found'] || 0;

    if (numResults === 1) {
      return data.result?.[0]?.['orcid-identifier']?.path || null;
    }
    return null;
  } catch (err) {
    return null;
  }
}

function saveCSV(results) {
  const sorted = [...results].sort((a, b) => {
    if (a.orcid && !b.orcid) return -1;
    if (!a.orcid && b.orcid) return 1;
    return 0;
  });
  const content = 'bluesky_handle,orcid_id\n' + sorted.map(r => `${r.handle},${r.orcid}`).join('\n');
  fs.writeFileSync(CSV_PATH, content);
}

async function main() {
  // Read existing CSV to get current ORCIDs
  const existingCSV = fs.readFileSync(CSV_PATH, 'utf-8').split('\n').slice(1).filter(Boolean);
  const existingOrcids = {};
  existingCSV.forEach(line => {
    const [handle, orcid] = line.split(',');
    if (orcid) existingOrcids[handle] = orcid;
  });

  // Read researchers JSON for display names
  const researchers = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));

  const results = researchers.map(r => ({
    handle: r.handle,
    displayName: r.displayName,
    orcid: existingOrcids[r.handle] || ''
  }));

  const toProcess = results.filter(r => !r.orcid && r.displayName);
  console.log(`Already have ${Object.keys(existingOrcids).length} ORCIDs`);
  console.log(`Processing ${toProcess.length} remaining researchers...`);

  let foundCount = 0;
  let processed = 0;

  for (const r of toProcess) {
    // Rate limit
    await new Promise(resolve => setTimeout(resolve, 100));

    processed++;
    if (processed % 50 === 0) {
      console.log(`Progress: ${processed}/${toProcess.length} (found ${foundCount} new ORCIDs)`);
      saveCSV(results); // Save periodically
    }

    const orcid = await searchOrcid(r.displayName);
    if (orcid) {
      r.orcid = orcid;
      foundCount++;
      console.log(`  Found: ${r.displayName} -> ${orcid}`);
    }
  }

  // Final save
  saveCSV(results);

  const totalOrcids = results.filter(r => r.orcid).length;
  console.log(`\nDone! Found ${foundCount} new ORCIDs`);
  console.log(`Total researchers with ORCIDs: ${totalOrcids}`);
}

main().catch(console.error);
