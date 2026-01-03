import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

// GET /api/feeds/migrate - Create the user_feeds table
export async function GET() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_feeds (
        id VARCHAR(50) PRIMARY KEY,
        user_did VARCHAR(255) NOT NULL,
        feed_uri VARCHAR(500) NOT NULL,
        display_name VARCHAR(255) NOT NULL,
        accepts_interactions BOOLEAN DEFAULT FALSE,
        feed_type VARCHAR(20),
        keyword VARCHAR(255),
        position INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS user_feeds_user_idx ON user_feeds(user_did)`);

    return NextResponse.json({ success: true, message: 'Table created successfully' });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json({ error: 'Migration failed', details: String(error) }, { status: 500 });
  }
}
