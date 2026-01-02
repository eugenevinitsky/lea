import 'dotenv/config';
import { db, discoveredPapers, paperMentions } from '../lib/db';
import { count, sql, min, max, countDistinct, gt } from 'drizzle-orm';

async function main() {
  try {
    // Total papers
    const [papersCount] = await db.select({ count: count() }).from(discoveredPapers);
    console.log('Total papers discovered:', papersCount.count);
    
    // Total mentions
    const [mentionsCount] = await db.select({ count: count() }).from(paperMentions);
    console.log('Total paper mentions:', mentionsCount.count);
    
    // Verified mentions
    const [verifiedCount] = await db.select({ count: count() })
      .from(paperMentions)
      .where(sql`is_verified_researcher = true`);
    console.log('Mentions by verified researchers:', verifiedCount.count);
    
    // Unique authors
    const [authorsCount] = await db.select({ count: countDistinct(paperMentions.authorDid) }).from(paperMentions);
    console.log('Unique authors mentioning papers:', authorsCount.count);
    
    // Date range
    const [dateRange] = await db.select({
      first: min(discoveredPapers.firstSeenAt),
      last: max(discoveredPapers.lastSeenAt)
    }).from(discoveredPapers);
    console.log('\nDate range:');
    console.log('  First paper:', dateRange.first);
    console.log('  Latest activity:', dateRange.last);
    
    // Recent mentions
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recent] = await db.select({ count: count() })
      .from(paperMentions)
      .where(gt(paperMentions.createdAt, cutoff));
    console.log('\nMentions in last 24 hours:', recent.count);
    
    // Papers by source
    const bySource = await db.select({
      source: discoveredPapers.source,
      count: count()
    })
    .from(discoveredPapers)
    .groupBy(discoveredPapers.source)
    .orderBy(sql`count(*) desc`);
    
    console.log('\nPapers by source:');
    for (const row of bySource) {
      console.log('  ' + row.source + ': ' + row.count);
    }
    
  } catch (e: any) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}

main();
