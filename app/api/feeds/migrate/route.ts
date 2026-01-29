import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';

// Timing-safe secret comparison
function verifyBearerSecret(authHeader: string | null, expected: string): boolean {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const provided = authHeader.slice(7);
  try {
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);
    if (providedBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

// GET /api/feeds/migrate - Create the user_feeds table
// Requires PAPER_FIREHOSE_SECRET for authentication
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const secret = process.env.PAPER_FIREHOSE_SECRET;

  if (!secret) {
    console.error('PAPER_FIREHOSE_SECRET not configured');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }
  if (!verifyBearerSecret(authHeader, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
    return NextResponse.json({ error: 'Migration failed' }, { status: 500 });
  }
}
