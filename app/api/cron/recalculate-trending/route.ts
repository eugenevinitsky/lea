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

// Recalculate trending scores for papers
async function recalculatePaperScores(): Promise<{ updated: number }> {
  // Update papers that have been active in the last 7 days
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
    WHERE p.last_seen_at > NOW() - INTERVAL '7 days'
  `);

  return { updated: result.rowCount ?? 0 };
}

// Recalculate trending scores for Substack posts
async function recalculateSubstackScores(): Promise<{ updated: number }> {
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
    WHERE p.last_seen_at > NOW() - INTERVAL '7 days'
  `);

  return { updated: result.rowCount ?? 0 };
}

// Recalculate trending scores for articles
async function recalculateArticleScores(): Promise<{ updated: number }> {
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
    WHERE a.last_seen_at > NOW() - INTERVAL '7 days'
  `);

  return { updated: result.rowCount ?? 0 };
}

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sets this automatically)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Always require authentication - fail if secret is not configured
  if (!cronSecret) {
    console.error('CRON_SECRET not configured');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }
  if (!verifyBearerSecret(authHeader, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
  };

  try {
    // Recalculate all trending scores
    const [paperResults, substackResults, articleResults] = await Promise.all([
      recalculatePaperScores(),
      recalculateSubstackScores(),
      recalculateArticleScores(),
    ]);

    results.papers = paperResults;
    results.substack = substackResults;
    results.articles = articleResults;
    results.durationMs = Date.now() - startTime;
    results.success = true;

    console.log(`[TRENDING RECALC] papers=${paperResults.updated} substack=${substackResults.updated} articles=${articleResults.updated} duration=${results.durationMs}ms`);

    return NextResponse.json(results);
  } catch (error) {
    console.error('Trending recalculation error:', error);
    results.error = String(error);
    results.durationMs = Date.now() - startTime;
    return NextResponse.json(results, { status: 500 });
  }
}
