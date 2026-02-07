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

// One-time migration endpoint to create Substack tables
// Should be removed after running once
export async function POST(request: NextRequest) {
  // Basic auth check - require a secret
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
    // Create discovered_substack_posts table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "discovered_substack_posts" (
        "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        "url" text NOT NULL,
        "normalized_id" varchar(255) NOT NULL UNIQUE,
        "subdomain" varchar(100) NOT NULL,
        "slug" varchar(255) NOT NULL,
        "title" text,
        "description" text,
        "author" varchar(255),
        "newsletter_name" varchar(255),
        "image_url" text,
        "first_seen_at" timestamp DEFAULT now() NOT NULL,
        "last_seen_at" timestamp DEFAULT now() NOT NULL,
        "mention_count" integer DEFAULT 1 NOT NULL
      )
    `);

    // Create substack_mentions table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "substack_mentions" (
        "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        "substack_post_id" integer NOT NULL,
        "post_uri" varchar(500) NOT NULL,
        "author_did" varchar(255) NOT NULL,
        "author_handle" varchar(255),
        "post_text" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "is_verified_researcher" boolean DEFAULT false
      )
    `);

    // Create indexes
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "discovered_substack_posts_subdomain_idx" ON "discovered_substack_posts" ("subdomain")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "discovered_substack_posts_last_seen_idx" ON "discovered_substack_posts" ("last_seen_at")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "discovered_substack_posts_mention_count_idx" ON "discovered_substack_posts" ("mention_count")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "substack_mentions_post_idx" ON "substack_mentions" ("substack_post_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "substack_mentions_author_idx" ON "substack_mentions" ("author_did")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "substack_mentions_created_idx" ON "substack_mentions" ("created_at")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "substack_mentions_verified_idx" ON "substack_mentions" ("is_verified_researcher")`);

    return NextResponse.json({ success: true, message: 'Substack tables created successfully' });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json({ error: 'Migration operation failed' }, { status: 500 });
  }
}
