import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('Running trending scores migration...');

  try {
    // Add columns to discovered_papers
    console.log('Adding columns to discovered_papers...');
    await db.execute(sql`ALTER TABLE "discovered_papers" ADD COLUMN IF NOT EXISTS "trending_score_1h" integer DEFAULT 0 NOT NULL`);
    await db.execute(sql`ALTER TABLE "discovered_papers" ADD COLUMN IF NOT EXISTS "trending_score_6h" integer DEFAULT 0 NOT NULL`);
    await db.execute(sql`ALTER TABLE "discovered_papers" ADD COLUMN IF NOT EXISTS "trending_score_24h" integer DEFAULT 0 NOT NULL`);
    await db.execute(sql`ALTER TABLE "discovered_papers" ADD COLUMN IF NOT EXISTS "trending_score_7d" integer DEFAULT 0 NOT NULL`);
    await db.execute(sql`ALTER TABLE "discovered_papers" ADD COLUMN IF NOT EXISTS "trending_score_all_time" integer DEFAULT 0 NOT NULL`);
    await db.execute(sql`ALTER TABLE "discovered_papers" ADD COLUMN IF NOT EXISTS "last_score_update" timestamp`);

    // Add columns to discovered_substack_posts
    console.log('Adding columns to discovered_substack_posts...');
    await db.execute(sql`ALTER TABLE "discovered_substack_posts" ADD COLUMN IF NOT EXISTS "trending_score_1h" integer DEFAULT 0 NOT NULL`);
    await db.execute(sql`ALTER TABLE "discovered_substack_posts" ADD COLUMN IF NOT EXISTS "trending_score_6h" integer DEFAULT 0 NOT NULL`);
    await db.execute(sql`ALTER TABLE "discovered_substack_posts" ADD COLUMN IF NOT EXISTS "trending_score_24h" integer DEFAULT 0 NOT NULL`);
    await db.execute(sql`ALTER TABLE "discovered_substack_posts" ADD COLUMN IF NOT EXISTS "trending_score_7d" integer DEFAULT 0 NOT NULL`);
    await db.execute(sql`ALTER TABLE "discovered_substack_posts" ADD COLUMN IF NOT EXISTS "trending_score_all_time" integer DEFAULT 0 NOT NULL`);
    await db.execute(sql`ALTER TABLE "discovered_substack_posts" ADD COLUMN IF NOT EXISTS "last_score_update" timestamp`);

    // Add columns to discovered_articles
    console.log('Adding columns to discovered_articles...');
    await db.execute(sql`ALTER TABLE "discovered_articles" ADD COLUMN IF NOT EXISTS "trending_score_1h" integer DEFAULT 0 NOT NULL`);
    await db.execute(sql`ALTER TABLE "discovered_articles" ADD COLUMN IF NOT EXISTS "trending_score_6h" integer DEFAULT 0 NOT NULL`);
    await db.execute(sql`ALTER TABLE "discovered_articles" ADD COLUMN IF NOT EXISTS "trending_score_24h" integer DEFAULT 0 NOT NULL`);
    await db.execute(sql`ALTER TABLE "discovered_articles" ADD COLUMN IF NOT EXISTS "trending_score_7d" integer DEFAULT 0 NOT NULL`);
    await db.execute(sql`ALTER TABLE "discovered_articles" ADD COLUMN IF NOT EXISTS "trending_score_all_time" integer DEFAULT 0 NOT NULL`);
    await db.execute(sql`ALTER TABLE "discovered_articles" ADD COLUMN IF NOT EXISTS "last_score_update" timestamp`);

    // Add indexes
    console.log('Adding indexes...');
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_papers_trending_1h" ON "discovered_papers" ("trending_score_1h")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_papers_trending_6h" ON "discovered_papers" ("trending_score_6h")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_papers_trending_24h" ON "discovered_papers" ("trending_score_24h")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_papers_trending_7d" ON "discovered_papers" ("trending_score_7d")`);

    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_substack_trending_1h" ON "discovered_substack_posts" ("trending_score_1h")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_substack_trending_6h" ON "discovered_substack_posts" ("trending_score_6h")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_substack_trending_24h" ON "discovered_substack_posts" ("trending_score_24h")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_substack_trending_7d" ON "discovered_substack_posts" ("trending_score_7d")`);

    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_articles_trending_1h" ON "discovered_articles" ("trending_score_1h")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_articles_trending_6h" ON "discovered_articles" ("trending_score_6h")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_articles_trending_24h" ON "discovered_articles" ("trending_score_24h")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_articles_trending_7d" ON "discovered_articles" ("trending_score_7d")`);

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

main();
