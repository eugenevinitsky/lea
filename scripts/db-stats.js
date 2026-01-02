const fs = require('fs');
const { sql } = require('@vercel/postgres');

// Load env manually
const envContent = fs.readFileSync('.env.local', 'utf8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match && !match[1].startsWith('#')) {
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

async function main() {
  try {
    const papersResult = await sql`SELECT COUNT(*) as count FROM discovered_papers`;
    console.log('Total papers discovered:', papersResult.rows[0].count);

    const mentionsResult = await sql`SELECT COUNT(*) as count FROM paper_mentions`;
    console.log('Total paper mentions:', mentionsResult.rows[0].count);

    const verifiedMentions = await sql`SELECT COUNT(*) as count FROM paper_mentions WHERE is_verified_researcher = true`;
    console.log('Mentions by verified researchers:', verifiedMentions.rows[0].count);

    const authors = await sql`SELECT COUNT(DISTINCT author_did) as count FROM paper_mentions`;
    console.log('Unique authors mentioning papers:', authors.rows[0].count);

    const dateRange = await sql`SELECT MIN(first_seen_at) as first, MAX(last_seen_at) as last FROM discovered_papers`;
    console.log('\nDate range:');
    console.log('  First paper:', dateRange.rows[0].first);
    console.log('  Latest activity:', dateRange.rows[0].last);

    const recent = await sql`SELECT COUNT(*) as count FROM paper_mentions WHERE created_at > NOW() - INTERVAL '24 hours'`;
    console.log('\nMentions in last 24 hours:', recent.rows[0].count);

    const bySource = await sql`SELECT source, COUNT(*) as count FROM discovered_papers GROUP BY source ORDER BY count DESC`;
    console.log('\nPapers by source:');
    for (const row of bySource.rows) {
      console.log('  ' + row.source + ': ' + row.count);
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}
main();
