/**
 * Migration script to create and populate the bot_accounts table
 * Run with: npx tsx scripts/migrate-bot-accounts.ts
 */

import 'dotenv/config';
import { db, botAccounts } from '@/lib/db';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('Creating bot_accounts table...');

  // Create table if not exists
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS bot_accounts (
      did VARCHAR(255) PRIMARY KEY,
      handle VARCHAR(255),
      added_at TIMESTAMP DEFAULT NOW() NOT NULL,
      reason VARCHAR(100)
    )
  `);

  console.log('Table created. Loading bot data from CSV...');

  // Read the CSV file
  const csvPath = '/Users/eugenevinitsky/Downloads/bot_handles.csv';
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.trim().split('\n').slice(1); // Skip header

  console.log(`Found ${lines.length} bots in CSV`);

  // Parse CSV and insert bots in batches
  const bots: { did: string; handle: string; reason: string }[] = [];

  for (const line of lines) {
    const [did, handle, includesBotKeyword, highFrequency] = line.split(',');
    if (!did || !did.startsWith('did:')) continue;

    let reason = 'manual';
    if (includesBotKeyword === 'True') reason = 'keyword';
    else if (highFrequency === 'True') reason = 'high_frequency';

    bots.push({ did, handle, reason });
  }

  console.log(`Inserting ${bots.length} bots...`);

  // Insert in batches of 100
  const batchSize = 100;
  let inserted = 0;

  for (let i = 0; i < bots.length; i += batchSize) {
    const batch = bots.slice(i, i + batchSize);

    await db.insert(botAccounts)
      .values(batch.map(b => ({
        did: b.did,
        handle: b.handle,
        reason: b.reason,
      })))
      .onConflictDoNothing();

    inserted += batch.length;
    console.log(`  Inserted ${inserted}/${bots.length}`);
  }

  // Verify count
  const result = await db.execute(sql`SELECT COUNT(*) as count FROM bot_accounts`);
  console.log(`\nDone! Total bots in table: ${(result.rows[0] as { count: string }).count}`);
}

main().catch(console.error);
