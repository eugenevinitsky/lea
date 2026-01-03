import { sql } from '@vercel/postgres';

async function migrate() {
  try {
    await sql`
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
    `;
    await sql`CREATE INDEX IF NOT EXISTS user_feeds_user_idx ON user_feeds(user_did)`;
    console.log('Table created successfully');
  } catch (e: unknown) {
    console.error('Error:', (e as Error).message);
  }
  process.exit(0);
}

migrate();
