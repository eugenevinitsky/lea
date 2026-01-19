import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { db, substackMentions, paperMentions } from '@/lib/db';
import { sql } from 'drizzle-orm';

async function main() {
  // Get all paper mentioners with 50+ mentions (likely bots)
  const highVolume = await db
    .select({
      authorDid: paperMentions.authorDid,
      count: sql<number>`count(*)`.as('count'),
    })
    .from(paperMentions)
    .groupBy(paperMentions.authorDid)
    .having(sql`count(*) >= 50`)
    .orderBy(sql`count(*) desc`);

  console.log('High-volume paper mentioners (50+ mentions, likely bots):');
  for (const row of highVolume) {
    console.log(`'${row.authorDid}', // ${row.count} mentions`);
  }

  process.exit(0);
}

main().catch(console.error);
