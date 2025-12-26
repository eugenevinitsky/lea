#!/usr/bin/env node

/**
 * Prepare Researcher Labels
 *
 * Takes candidate data and prepares it for Ozone bulk labeling.
 * - Filters out non-researchers (companies, politicians, news orgs)
 * - Searches ORCID API by name to find ORCID IDs
 * - Exports DIDs for Ozone import
 *
 * Usage:
 *   node scripts/find-researcher-candidates.js --output candidates.json
 *   node scripts/prepare-researcher-labels.js candidates.json
 *   node scripts/prepare-researcher-labels.js candidates.json --min-follows 5
 *   node scripts/prepare-researcher-labels.js candidates.json --lookup-orcid
 */

const fs = require('fs');

// Rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Patterns that indicate NON-researchers (companies, orgs, politicians, etc.)
// These are applied to handle + displayName ONLY (not bio) to reduce false positives
const NON_RESEARCHER_HANDLE_PATTERNS = [
  /^bluesky$/i,
  /official/i,
  /^the[a-z]+$/i,  // "theguardian", "thenytimes", etc.
  /news$/i,
  /media$/i,
  /\bbot$/i,
  /feed$/i,
];

// These patterns check the full text (handle + displayName + bio)
// but are very specific to avoid false positives
const NON_RESEARCHER_BIO_PATTERNS = [
  // Political positions (not "studying politics")
  /\bcongress(?:woman|man|person)?\b/i,
  /\bsenator\b/i,
  /\brepresentative\b.*\bdistrict\b/i,
  /\bgovernor\b/i,
  /\bmayor of\b/i,
  /elected.*\b(?:congress|senate|house)\b/i,
  /running for\b/i,
  /\bfor congress\b/i,
  /\bfor senate\b/i,
  /\bfor president\b/i,
  /\bcampaign manager\b/i,

  // Specific organization types (at start of bio or as identity)
  /^(?:official|we are|we're)\b/i,
  /\bofficial account\b/i,
];

// Known non-researcher handles to exclude
const EXCLUDED_HANDLES = new Set([
  'bsky.app',
  'bluesky.social',
  'aoc.bsky.social',
  'nytimes.com',
  'washingtonpost.com',
  'theguardian.com',
  'bbc.com',
  'cnn.com',
  'msnbc.com',
  'foxnews.com',
  'npr.org',
  'reuters.com',
  'apnews.com',
]);

function isLikelyNonResearcher(candidate) {
  const handleAndName = `${candidate.handle} ${candidate.displayName}`.toLowerCase();
  const fullText = `${candidate.handle} ${candidate.displayName} ${candidate.description}`.toLowerCase();

  // Check excluded handles
  if (EXCLUDED_HANDLES.has(candidate.handle.toLowerCase())) {
    return { excluded: true, reason: 'Known non-researcher handle' };
  }

  // Check handle/name patterns (strict - these are org/brand indicators)
  for (const pattern of NON_RESEARCHER_HANDLE_PATTERNS) {
    if (pattern.test(handleAndName)) {
      return { excluded: true, reason: `Handle/name matches: ${pattern.source}` };
    }
  }

  // Check bio patterns (very specific to avoid false positives)
  for (const pattern of NON_RESEARCHER_BIO_PATTERNS) {
    if (pattern.test(fullText)) {
      return { excluded: true, reason: `Bio matches: ${pattern.source}` };
    }
  }

  return { excluded: false };
}

// Search ORCID API by name
async function searchOrcidByName(displayName) {
  if (!displayName || displayName.trim().length < 3) return null;

  // Parse name - try to split into given/family names
  const parts = displayName.trim().split(/\s+/);
  if (parts.length < 2) return null;

  // Assume "First Last" or "First Middle Last" format
  const givenName = parts[0];
  const familyName = parts[parts.length - 1];

  // Skip if names look like usernames or handles
  if (givenName.includes('@') || familyName.includes('@')) return null;
  if (givenName.length < 2 || familyName.length < 2) return null;

  try {
    // ORCID public API search
    const query = encodeURIComponent(`family-name:${familyName} AND given-names:${givenName}`);
    const url = `https://pub.orcid.org/v3.0/search?q=${query}&rows=5`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    const results = data.result || [];

    if (results.length === 0) return null;

    // Return first result's ORCID
    const orcidPath = results[0]['orcid-identifier']?.path;
    return orcidPath || null;
  } catch {
    return null;
  }
}

// Fetch research interests/keywords from ORCID profile
async function fetchOrcidResearchInterests(orcid) {
  try {
    // Fetch keywords
    const keywordsResponse = await fetch(`https://pub.orcid.org/v3.0/${orcid}/keywords`, {
      headers: { 'Accept': 'application/json' },
    });

    const interests = [];

    if (keywordsResponse.ok) {
      const keywordsData = await keywordsResponse.json();
      const keywords = keywordsData.keyword || [];
      for (const kw of keywords) {
        if (kw.content) {
          interests.push(kw.content);
        }
      }
    }

    // Also try to get research areas from the person's bio/biography
    const personResponse = await fetch(`https://pub.orcid.org/v3.0/${orcid}/person`, {
      headers: { 'Accept': 'application/json' },
    });

    let biography = null;
    if (personResponse.ok) {
      const personData = await personResponse.json();
      biography = personData.biography?.content || null;
    }

    // Try to get works to extract subject areas
    const worksResponse = await fetch(`https://pub.orcid.org/v3.0/${orcid}/works`, {
      headers: { 'Accept': 'application/json' },
    });

    const recentWorks = [];
    if (worksResponse.ok) {
      const worksData = await worksResponse.json();
      const groups = worksData.group || [];
      // Get up to 5 recent work titles
      for (const group of groups.slice(0, 5)) {
        const summary = group['work-summary']?.[0];
        if (summary?.title?.title?.value) {
          recentWorks.push(summary.title.title.value);
        }
      }
    }

    return {
      keywords: interests,
      biography,
      recentWorks,
    };
  } catch (err) {
    return { keywords: [], biography: null, recentWorks: [] };
  }
}

function processCandidate(candidate) {
  const nonResearcherCheck = isLikelyNonResearcher(candidate);

  return {
    ...candidate,
    orcid: null,  // Will be filled by ORCID lookup
    hasOrcid: false,
    isLikelyNonResearcher: nonResearcherCheck.excluded,
    exclusionReason: nonResearcherCheck.reason || null,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const inputFile = args.find(a => !a.startsWith('--'));
  const minFollows = parseInt(args.find(a => a.startsWith('--min-follows='))?.split('=')[1] || '3');
  const outputDir = args.find(a => a.startsWith('--output-dir='))?.split('=')[1] || '.';
  const lookupOrcid = args.includes('--lookup-orcid');
  const orcidLimit = parseInt(args.find(a => a.startsWith('--orcid-limit='))?.split('=')[1] || '100');

  if (!inputFile) {
    console.log('Usage: node scripts/prepare-researcher-labels.js <candidates.json> [options]');
    console.log('\nOptions:');
    console.log('  --min-follows=N     Minimum verified researcher follows (default: 3)');
    console.log('  --output-dir=DIR    Output directory (default: current)');
    console.log('  --lookup-orcid      Search ORCID API by name (slow, rate-limited)');
    console.log('  --orcid-limit=N     Max candidates to lookup ORCID for (default: 100)');
    console.log('\nFirst run: node scripts/find-researcher-candidates.js --output candidates.json');
    process.exit(1);
  }

  console.log('\n🔬 Preparing Researcher Labels\n');

  // Load candidates
  const candidates = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
  console.log(`Loaded ${candidates.length} candidates from ${inputFile}`);
  console.log(`Minimum follows filter: ${minFollows}`);
  if (lookupOrcid) {
    console.log(`ORCID lookup enabled (limit: ${orcidLimit})`);
  }
  console.log('');

  // Process all candidates
  let processed = candidates
    .filter(c => c.followedByCount >= minFollows)
    .map(processCandidate);

  console.log(`After min-follows filter: ${processed.length} candidates\n`);

  // Separate researchers from non-researchers
  let researchers = processed.filter(c => !c.isLikelyNonResearcher);
  const excluded = processed.filter(c => c.isLikelyNonResearcher);

  // ORCID lookup if enabled
  if (lookupOrcid) {
    console.log('=' .repeat(80));
    console.log('\n🔍 Looking up ORCIDs via API...\n');

    const toSearch = researchers.slice(0, orcidLimit);
    let found = 0;

    for (let i = 0; i < toSearch.length; i++) {
      const r = toSearch[i];
      process.stdout.write(`[${i + 1}/${toSearch.length}] Searching for ${r.displayName}...`);

      const orcid = await searchOrcidByName(r.displayName);
      if (orcid) {
        r.orcid = orcid;
        r.hasOrcid = true;
        found++;
        console.log(` Found: ${orcid}`);

        // Fetch research interests from ORCID profile
        process.stdout.write(`    Fetching research interests...`);
        const interests = await fetchOrcidResearchInterests(orcid);
        r.orcidKeywords = interests.keywords;
        r.orcidBiography = interests.biography;
        r.orcidRecentWorks = interests.recentWorks;

        if (interests.keywords.length > 0) {
          console.log(` ${interests.keywords.length} keywords found`);
        } else {
          console.log(` no keywords (${interests.recentWorks.length} works found)`);
        }

        await delay(200); // Extra delay for the 3 API calls we just made
      } else {
        console.log(' Not found');
      }

      await delay(300); // Rate limiting - ORCID API has limits
    }

    console.log(`\nFound ${found} ORCIDs out of ${toSearch.length} searched\n`);

    // Note: ORCID search by name can return multiple results or wrong people
    // This is a starting point that needs manual verification
    console.log('⚠️  Note: ORCID matches are based on name only and may be incorrect.');
    console.log('   Please verify each ORCID match before using!\n');
  }

  console.log('=' .repeat(80));
  console.log('\n📊 Results:\n');
  console.log(`Total processed: ${processed.length}`);
  console.log(`Likely researchers: ${researchers.length}`);
  console.log(`Excluded (non-researchers): ${excluded.length}`);
  if (lookupOrcid) {
    console.log(`With ORCID (found via API): ${researchers.filter(r => r.hasOrcid).length}`);
  }

  // Show excluded accounts
  if (excluded.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('\n🚫 Excluded Accounts (review for false positives):\n');
    for (const e of excluded.slice(0, 20)) {
      console.log(`  @${e.handle} - ${e.exclusionReason}`);
      console.log(`    "${e.displayName}" - followed by ${e.followedByCount}`);
    }
    if (excluded.length > 20) {
      console.log(`  ... and ${excluded.length - 20} more`);
    }
  }

  // Show researchers with ORCID (if lookup was done)
  const withOrcid = researchers.filter(r => r.hasOrcid);
  if (withOrcid.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Researchers with ORCID (needs verification!):\n');
    for (const r of withOrcid.slice(0, 30)) {
      console.log(`  @${r.handle} (${r.displayName})`);
      console.log(`    ORCID: https://orcid.org/${r.orcid}`);
      console.log(`    Followed by: ${r.followedByCount} verified researchers`);
      if (r.orcidKeywords?.length > 0) {
        console.log(`    Research interests: ${r.orcidKeywords.slice(0, 5).join(', ')}${r.orcidKeywords.length > 5 ? '...' : ''}`);
      }
      if (r.orcidRecentWorks?.length > 0 && !r.orcidKeywords?.length) {
        console.log(`    Recent work: "${r.orcidRecentWorks[0].slice(0, 60)}${r.orcidRecentWorks[0].length > 60 ? '...' : ''}"`);
      }
    }
    if (withOrcid.length > 30) {
      console.log(`  ... and ${withOrcid.length - 30} more`);
    }
  }

  // Show top researchers
  console.log('\n' + '='.repeat(80));
  console.log('\n📋 Top Researcher Candidates:\n');
  for (const r of researchers.slice(0, 30)) {
    console.log(`  @${r.handle} (${r.displayName})`);
    console.log(`    Bio: ${r.description?.slice(0, 80)}${r.description?.length > 80 ? '...' : ''}`);
    console.log(`    Followed by: ${r.followedByCount} | Keywords: ${r.matchedKeywords?.join(', ') || 'none'}`);
    if (r.hasOrcid) console.log(`    ORCID: ${r.orcid} (verify!)`);
  }

  // Export files
  console.log('\n' + '='.repeat(80));
  console.log('\n📁 Exporting files...\n');

  // 1. DIDs only (for simple Ozone import)
  const didsFile = `${outputDir}/researcher-dids.txt`;
  fs.writeFileSync(didsFile, researchers.map(r => r.did).join('\n'));
  console.log(`✓ ${didsFile} - ${researchers.length} DIDs for Ozone import`);

  // 2. DIDs with ORCID and research interests (if lookup was done)
  if (withOrcid.length > 0) {
    const orcidFile = `${outputDir}/researchers-with-orcid.json`;
    fs.writeFileSync(orcidFile, JSON.stringify(withOrcid.map(r => ({
      did: r.did,
      handle: r.handle,
      displayName: r.displayName,
      orcid: r.orcid,
      orcidUrl: `https://orcid.org/${r.orcid}`,
      researchInterests: r.orcidKeywords || [],
      orcidBiography: r.orcidBiography || null,
      recentWorkTitles: r.orcidRecentWorks || [],
      followedByCount: r.followedByCount,
    })), null, 2));
    console.log(`✓ ${orcidFile} - ${withOrcid.length} researchers with ORCID + research interests`);

    // Summary of research interests found
    const withKeywords = withOrcid.filter(r => r.orcidKeywords?.length > 0);
    console.log(`   (${withKeywords.length} have keywords, ${withOrcid.length - withKeywords.length} have works only)`);
  }

  // 3. Full researcher data (for review)
  const fullFile = `${outputDir}/researchers-full.json`;
  fs.writeFileSync(fullFile, JSON.stringify(researchers, null, 2));
  console.log(`✓ ${fullFile} - ${researchers.length} full researcher records`);

  // 4. Excluded accounts (for review)
  const excludedFile = `${outputDir}/excluded-accounts.json`;
  fs.writeFileSync(excludedFile, JSON.stringify(excluded, null, 2));
  console.log(`✓ ${excludedFile} - ${excluded.length} excluded accounts`);

  // 5. CSV for easy review + manual ORCID entry
  const csvFile = `${outputDir}/researchers-review.csv`;
  const csvHeader = 'handle,displayName,followedByCount,orcid_to_verify,academicScore,bio';
  const csvRows = researchers.map(r => {
    const escapeCsv = (s) => `"${(s || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`;
    return [
      r.handle,
      escapeCsv(r.displayName),
      r.followedByCount,
      r.orcid || '',  // Empty column for manual entry
      r.academicScore,
      escapeCsv(r.description?.slice(0, 200)),
    ].join(',');
  });
  fs.writeFileSync(csvFile, [csvHeader, ...csvRows].join('\n'));
  console.log(`✓ ${csvFile} - spreadsheet for manual review & ORCID entry`);

  console.log('\n' + '='.repeat(80));
  console.log('\n🎯 Next Steps:\n');
  console.log('1. Review excluded-accounts.json for false positives');
  console.log('2. Open researchers-review.csv in a spreadsheet:');
  console.log('   - Review candidates and remove non-researchers');
  console.log('   - Look up ORCIDs manually: https://orcid.org/orcid-search/search');
  console.log('   - Fill in orcid_to_verify column');
  console.log('3. Label in Ozone:');
  console.log('   - Go to https://ozone.lea-community.bsky.social');
  console.log('   - For each researcher, add verified-researcher label');
  console.log('4. Sync labels to database:');
  console.log('   - curl -X POST https://client-kappa-weld-68.vercel.app/api/labeler/sync-to-db');
  console.log('\n');
}

main().catch(console.error);
