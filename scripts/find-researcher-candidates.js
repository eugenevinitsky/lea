#!/usr/bin/env node

/**
 * Find Researcher Candidates
 *
 * Analyzes who verified researchers follow to find likely researchers.
 * Ranks by:
 * 1. Number of verified researchers who follow them
 * 2. Academic keywords in bio (professor, PhD, researcher, university, etc.)
 *
 * Usage:
 *   node scripts/find-researcher-candidates.js
 *   node scripts/find-researcher-candidates.js --min-follows 3
 *   node scripts/find-researcher-candidates.js --output candidates.json
 */

const ACADEMIC_KEYWORDS = [
  'professor', 'prof.', 'prof ', 'faculty', 'lecturer',
  'phd', 'ph.d', 'doctorate', 'doctoral',
  'researcher', 'research scientist', 'scientist',
  'postdoc', 'post-doc', 'postdoctoral',
  'university', 'college', 'institute', 'lab ',
  'academic', 'scholar',
  'machine learning', 'ml ', ' ai ', 'artificial intelligence',
  'computer science', 'neuroscience', 'physics', 'biology', 'chemistry',
  'economics', 'psychology', 'sociology', 'political science',
  'arxiv', 'orcid', 'google scholar',
];

const API_BASE = 'https://public.api.bsky.app/xrpc';
const LEA_API = 'https://client-kappa-weld-68.vercel.app';

// Rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

// Get all verified researchers from LEA database
async function getVerifiedResearchers() {
  console.log('Fetching verified researchers from LEA...');
  const data = await fetchJson(`${LEA_API}/api/researchers`);
  return data.researchers || [];
}

// Get all accounts a user follows
async function getFollows(did) {
  const follows = [];
  let cursor;

  do {
    const url = `${API_BASE}/app.bsky.graph.getFollows?actor=${did}&limit=100${cursor ? `&cursor=${cursor}` : ''}`;
    const data = await fetchJson(url);
    follows.push(...(data.follows || []));
    cursor = data.cursor;
    await delay(100); // Rate limiting
  } while (cursor);

  return follows;
}

// Check if bio contains academic keywords
function getAcademicScore(profile) {
  const text = `${profile.displayName || ''} ${profile.description || ''}`.toLowerCase();
  let score = 0;
  const matchedKeywords = [];

  for (const keyword of ACADEMIC_KEYWORDS) {
    if (text.includes(keyword.toLowerCase())) {
      score++;
      matchedKeywords.push(keyword.trim());
    }
  }

  return { score, matchedKeywords };
}

async function main() {
  const args = process.argv.slice(2);
  const minFollows = parseInt(args.find(a => a.startsWith('--min-follows='))?.split('=')[1] || '2');
  const outputFile = args.find(a => a.startsWith('--output='))?.split('=')[1];

  console.log(`\n🔬 Finding Researcher Candidates\n`);
  console.log(`Minimum follows required: ${minFollows}`);

  // Get verified researchers
  const verified = await getVerifiedResearchers();
  console.log(`Found ${verified.length} verified researchers\n`);

  const verifiedDids = new Set(verified.map(r => r.did));

  // Collect all follows from verified researchers
  const followCounts = new Map(); // DID -> { count, profiles: [...] }

  for (let i = 0; i < verified.length; i++) {
    const researcher = verified[i];
    console.log(`[${i + 1}/${verified.length}] Fetching follows for @${researcher.handle}...`);

    try {
      const follows = await getFollows(researcher.did);
      console.log(`  Found ${follows.length} follows`);

      for (const follow of follows) {
        // Skip already verified accounts
        if (verifiedDids.has(follow.did)) continue;

        if (!followCounts.has(follow.did)) {
          followCounts.set(follow.did, {
            count: 0,
            followedBy: [],
            profile: follow,
          });
        }

        const entry = followCounts.get(follow.did);
        entry.count++;
        entry.followedBy.push(researcher.handle);
      }
    } catch (error) {
      console.log(`  Error: ${error.message}`);
    }

    await delay(200); // Rate limiting between users
  }

  console.log(`\nAnalyzing ${followCounts.size} unique accounts...\n`);

  // Filter and score candidates
  const candidates = [];

  for (const [did, data] of followCounts) {
    if (data.count < minFollows) continue;

    const { score: academicScore, matchedKeywords } = getAcademicScore(data.profile);

    candidates.push({
      did,
      handle: data.profile.handle,
      displayName: data.profile.displayName || '',
      description: data.profile.description || '',
      followedByCount: data.count,
      followedBy: data.followedBy,
      academicScore,
      matchedKeywords,
      // Combined score: follows count * 2 + academic keywords
      totalScore: data.count * 2 + academicScore,
    });
  }

  // Sort by total score
  candidates.sort((a, b) => b.totalScore - a.totalScore);

  console.log(`Found ${candidates.length} candidates followed by ${minFollows}+ verified researchers\n`);
  console.log('=' .repeat(80));

  // Display top candidates
  const top = candidates.slice(0, 50);
  for (let i = 0; i < top.length; i++) {
    const c = top[i];
    console.log(`\n${i + 1}. @${c.handle} ${c.displayName ? `(${c.displayName})` : ''}`);
    console.log(`   Followed by: ${c.followedByCount} verified researchers`);
    if (c.academicScore > 0) {
      console.log(`   Academic keywords: ${c.matchedKeywords.join(', ')}`);
    }
    console.log(`   Bio: ${c.description.slice(0, 100)}${c.description.length > 100 ? '...' : ''}`);
    console.log(`   Followed by: ${c.followedBy.slice(0, 3).join(', ')}${c.followedBy.length > 3 ? ` +${c.followedBy.length - 3} more` : ''}`);
  }

  // Summary stats
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 Summary:\n');
  console.log(`Total candidates: ${candidates.length}`);
  console.log(`With academic keywords: ${candidates.filter(c => c.academicScore > 0).length}`);
  console.log(`Followed by 5+ researchers: ${candidates.filter(c => c.followedByCount >= 5).length}`);
  console.log(`Followed by 10+ researchers: ${candidates.filter(c => c.followedByCount >= 10).length}`);

  // Output to file if requested
  if (outputFile) {
    const fs = require('fs');
    fs.writeFileSync(outputFile, JSON.stringify(candidates, null, 2));
    console.log(`\nSaved ${candidates.length} candidates to ${outputFile}`);
  }

  console.log('\n✅ Done!\n');
  console.log('Next steps:');
  console.log('1. Review the candidates above');
  console.log('2. Label them in Ozone: https://ozone.example.com');
  console.log('3. Run the sync: curl -X POST https://client-kappa-weld-68.vercel.app/api/labeler/sync-to-db');
}

main().catch(console.error);
