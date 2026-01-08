import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  const client = await pool.connect();

  try {
    // Create discovered_articles table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discovered_articles (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL,
        normalized_id VARCHAR(255) NOT NULL UNIQUE,
        source VARCHAR(50) NOT NULL,
        slug VARCHAR(500),
        title TEXT,
        description TEXT,
        author VARCHAR(255),
        image_url TEXT,
        category VARCHAR(100),
        published_at TIMESTAMP,
        first_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
        mention_count INTEGER NOT NULL DEFAULT 1
      )
    `);
    console.log('Created discovered_articles table');

    // Create indexes
    await client.query(`CREATE INDEX IF NOT EXISTS discovered_articles_source_idx ON discovered_articles(source)`);
    await client.query(`CREATE INDEX IF NOT EXISTS discovered_articles_last_seen_idx ON discovered_articles(last_seen_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS discovered_articles_mention_count_idx ON discovered_articles(mention_count)`);
    console.log('Created discovered_articles indexes');

    // Create article_mentions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS article_mentions (
        id SERIAL PRIMARY KEY,
        article_id INTEGER NOT NULL,
        post_uri VARCHAR(500) NOT NULL,
        author_did VARCHAR(255) NOT NULL,
        post_text TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        is_verified_researcher BOOLEAN DEFAULT FALSE
      )
    `);
    console.log('Created article_mentions table');

    // Create indexes
    await client.query(`CREATE INDEX IF NOT EXISTS article_mentions_article_idx ON article_mentions(article_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS article_mentions_author_idx ON article_mentions(author_did)`);
    await client.query(`CREATE INDEX IF NOT EXISTS article_mentions_created_idx ON article_mentions(created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS article_mentions_verified_idx ON article_mentions(is_verified_researcher)`);
    console.log('Created article_mentions indexes');

    console.log('Done!');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
