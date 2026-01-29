/**
 * Backfill trending scores for existing papers, substack posts, and articles
 *
 * Run with: npx tsx scripts/backfill-trending-scores.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

async function backfillPaperScores(): Promise<{ updated: number }> {
  console.log('Backfilling paper trending scores...');

  const result = await db.execute(sql`
    UPDATE discovered_papers p SET
      trending_score_1h = COALESCE((
        SELECT COUNT(DISTINCT m.author_did) +
               2 * COUNT(DISTINCT CASE WHEN m.is_verified_researcher THEN m.author_did END)
        FROM paper_mentions m
        WHERE m.paper_id = p.id AND m.created_at > NOW() - INTERVAL '1 hour'
      ), 0),
      trending_score_6h = COALESCE((
        SELECT COUNT(DISTINCT m.author_did) +
               2 * COUNT(DISTINCT CASE WHEN m.is_verified_researcher THEN m.author_did END)
        FROM paper_mentions m
        WHERE m.paper_id = p.id AND m.created_at > NOW() - INTERVAL '6 hours'
      ), 0),
      trending_score_24h = COALESCE((
        SELECT COUNT(DISTINCT m.author_did) +
               2 * COUNT(DISTINCT CASE WHEN m.is_verified_researcher THEN m.author_did END)
        FROM paper_mentions m
        WHERE m.paper_id = p.id AND m.created_at > NOW() - INTERVAL '24 hours'
      ), 0),
      trending_score_7d = COALESCE((
        SELECT COUNT(DISTINCT m.author_did) +
               2 * COUNT(DISTINCT CASE WHEN m.is_verified_researcher THEN m.author_did END)
        FROM paper_mentions m
        WHERE m.paper_id = p.id AND m.created_at > NOW() - INTERVAL '7 days'
      ), 0),
      trending_score_all_time = COALESCE((
        SELECT COUNT(DISTINCT m.author_did) +
               2 * COUNT(DISTINCT CASE WHEN m.is_verified_researcher THEN m.author_did END)
        FROM paper_mentions m
        WHERE m.paper_id = p.id
      ), 0),
      last_score_update = NOW()
  `);

  const updated = result.rowCount ?? 0;
  console.log(`  Updated ${updated} papers`);
  return { updated };
}

async function backfillSubstackScores(): Promise<{ updated: number }> {
  console.log('Backfilling Substack trending scores...');

  const result = await db.execute(sql`
    UPDATE discovered_substack_posts p SET
      trending_score_1h = COALESCE((
        SELECT COUNT(DISTINCT m.author_did) +
               2 * COUNT(DISTINCT CASE WHEN m.is_verified_researcher THEN m.author_did END)
        FROM substack_mentions m
        WHERE m.substack_post_id = p.id AND m.created_at > NOW() - INTERVAL '1 hour'
      ), 0),
      trending_score_6h = COALESCE((
        SELECT COUNT(DISTINCT m.author_did) +
               2 * COUNT(DISTINCT CASE WHEN m.is_verified_researcher THEN m.author_did END)
        FROM substack_mentions m
        WHERE m.substack_post_id = p.id AND m.created_at > NOW() - INTERVAL '6 hours'
      ), 0),
      trending_score_24h = COALESCE((
        SELECT COUNT(DISTINCT m.author_did) +
               2 * COUNT(DISTINCT CASE WHEN m.is_verified_researcher THEN m.author_did END)
        FROM substack_mentions m
        WHERE m.substack_post_id = p.id AND m.created_at > NOW() - INTERVAL '24 hours'
      ), 0),
      trending_score_7d = COALESCE((
        SELECT COUNT(DISTINCT m.author_did) +
               2 * COUNT(DISTINCT CASE WHEN m.is_verified_researcher THEN m.author_did END)
        FROM substack_mentions m
        WHERE m.substack_post_id = p.id AND m.created_at > NOW() - INTERVAL '7 days'
      ), 0),
      trending_score_all_time = COALESCE((
        SELECT COUNT(DISTINCT m.author_did) +
               2 * COUNT(DISTINCT CASE WHEN m.is_verified_researcher THEN m.author_did END)
        FROM substack_mentions m
        WHERE m.substack_post_id = p.id
      ), 0),
      last_score_update = NOW()
  `);

  const updated = result.rowCount ?? 0;
  console.log(`  Updated ${updated} Substack posts`);
  return { updated };
}

async function backfillArticleScores(): Promise<{ updated: number }> {
  console.log('Backfilling article trending scores...');

  const result = await db.execute(sql`
    UPDATE discovered_articles a SET
      trending_score_1h = COALESCE((
        SELECT COUNT(DISTINCT m.author_did) +
               2 * COUNT(DISTINCT CASE WHEN m.is_verified_researcher THEN m.author_did END)
        FROM article_mentions m
        WHERE m.article_id = a.id AND m.created_at > NOW() - INTERVAL '1 hour'
      ), 0),
      trending_score_6h = COALESCE((
        SELECT COUNT(DISTINCT m.author_did) +
               2 * COUNT(DISTINCT CASE WHEN m.is_verified_researcher THEN m.author_did END)
        FROM article_mentions m
        WHERE m.article_id = a.id AND m.created_at > NOW() - INTERVAL '6 hours'
      ), 0),
      trending_score_24h = COALESCE((
        SELECT COUNT(DISTINCT m.author_did) +
               2 * COUNT(DISTINCT CASE WHEN m.is_verified_researcher THEN m.author_did END)
        FROM article_mentions m
        WHERE m.article_id = a.id AND m.created_at > NOW() - INTERVAL '24 hours'
      ), 0),
      trending_score_7d = COALESCE((
        SELECT COUNT(DISTINCT m.author_did) +
               2 * COUNT(DISTINCT CASE WHEN m.is_verified_researcher THEN m.author_did END)
        FROM article_mentions m
        WHERE m.article_id = a.id AND m.created_at > NOW() - INTERVAL '7 days'
      ), 0),
      trending_score_all_time = COALESCE((
        SELECT COUNT(DISTINCT m.author_did) +
               2 * COUNT(DISTINCT CASE WHEN m.is_verified_researcher THEN m.author_did END)
        FROM article_mentions m
        WHERE m.article_id = a.id
      ), 0),
      last_score_update = NOW()
  `);

  const updated = result.rowCount ?? 0;
  console.log(`  Updated ${updated} articles`);
  return { updated };
}

async function main() {
  console.log('Starting trending scores backfill...\n');
  const startTime = Date.now();

  try {
    const [paperResults, substackResults, articleResults] = await Promise.all([
      backfillPaperScores(),
      backfillSubstackScores(),
      backfillArticleScores(),
    ]);

    const duration = Date.now() - startTime;
    console.log('\n=== Backfill Complete ===');
    console.log(`Papers: ${paperResults.updated}`);
    console.log(`Substack: ${substackResults.updated}`);
    console.log(`Articles: ${articleResults.updated}`);
    console.log(`Duration: ${duration}ms`);
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

main();
