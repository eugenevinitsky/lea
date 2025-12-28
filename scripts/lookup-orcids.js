#!/usr/bin/env node

/**
 * Script to look up ORCID IDs for researchers
 * Only assigns ORCID if there's exactly one match (unique name)
 */

const fs = require('fs');
const path = require('path');

const ORCID_API = 'https://pub.orcid.org/v3.0/search/';

async function searchOrcid(name) {
  try {
    // Split name into parts
    const parts = name.trim().split(/\s+/);
    if (parts.length < 2) return null;

    const firstName = parts[0];
    const lastName = parts[parts.length - 1];

    // Search ORCID with given-names and family-name
    const query = `given-names:${firstName} AND family-name:${lastName}`;
    const url = `${ORCID_API}?q=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`  API error for ${name}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const numResults = data['num-found'] || 0;

    if (numResults === 1) {
      // Unique match - return the ORCID
      const orcidPath = data.result?.[0]?.['orcid-identifier']?.path;
      return orcidPath || null;
    } else if (numResults === 0) {
      console.log(`  No results for: ${name}`);
      return null;
    } else {
      console.log(`  Multiple results (${numResults}) for: ${name} - skipping`);
      return null;
    }
  } catch (err) {
    console.error(`  Error searching for ${name}:`, err.message);
    return null;
  }
}

async function main() {
  // Read researchers-full.json
  const jsonPath = path.join(__dirname, '..', 'researchers-full.json');
  const researchers = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

  console.log(`Processing ${researchers.length} researchers...`);

  const results = [];
  let foundCount = 0;

  for (let i = 0; i < researchers.length; i++) {
    const r = researchers[i];
    const handle = r.handle;
    const displayName = r.displayName;

    if (!displayName || displayName.trim().length === 0) {
      results.push({ handle, orcid: '' });
      continue;
    }

    // Rate limit - wait 100ms between requests
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (i % 50 === 0) {
      console.log(`Progress: ${i}/${researchers.length} (found ${foundCount} ORCIDs)`);
    }

    const orcid = await searchOrcid(displayName);

    if (orcid) {
      foundCount++;
      console.log(`  Found: ${displayName} -> ${orcid}`);
    }

    results.push({ handle, orcid: orcid || '' });
  }

  // Sort: entries with ORCID first, then alphabetically by handle
  results.sort((a, b) => {
    if (a.orcid && !b.orcid) return -1;
    if (!a.orcid && b.orcid) return 1;
    return a.handle.localeCompare(b.handle);
  });

  // Write CSV
  const csvPath = path.join(__dirname, '..', 'researchers.csv');
  const csvContent = 'bluesky_handle,orcid_id\n' +
    results.map(r => `${r.handle},${r.orcid}`).join('\n');

  fs.writeFileSync(csvPath, csvContent);

  console.log(`\nDone! Found ${foundCount} unique ORCID matches out of ${researchers.length} researchers`);
  console.log(`CSV written to: ${csvPath}`);
}

main().catch(console.error);
