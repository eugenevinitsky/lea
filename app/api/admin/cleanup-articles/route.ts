import { NextRequest, NextResponse } from 'next/server';
import { db, discoveredArticles, articleMentions } from '@/lib/db';
import { inArray, sql, eq } from 'drizzle-orm';
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

// Extract year from URL (for MIT Tech Review and Quanta)
function getYearFromUrl(url: string): number | null {
  // MIT Tech Review format: /2024/09/19/...
  const mitMatch = url.match(/technologyreview\.com\/(\d{4})\//);
  if (mitMatch) return parseInt(mitMatch[1]);

  // Quanta format: ...-20240914/ (date at end of slug)
  const quantaMatch = url.match(/quantamagazine\.org\/.*-(\d{4})\d{4}\/?$/);
  if (quantaMatch) return parseInt(quantaMatch[1]);

  return null;
}

// Cleanup endpoint to remove duplicates and old articles
export async function POST(request: NextRequest) {
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
    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun !== false; // Default to dry run
    const minYear = body.minYear || 2025; // Default to filtering pre-2025

    // Fetch all articles with their mention counts
    const allArticles = await db
      .select({
        id: discoveredArticles.id,
        url: discoveredArticles.url,
        normalizedId: discoveredArticles.normalizedId,
        title: discoveredArticles.title,
        mentionCount: discoveredArticles.mentionCount,
        firstSeenAt: discoveredArticles.firstSeenAt,
      })
      .from(discoveredArticles);

    // Group by normalizedId to find duplicates
    const byNormalizedId = new Map<string, typeof allArticles>();
    for (const article of allArticles) {
      const key = article.normalizedId;
      if (!byNormalizedId.has(key)) {
        byNormalizedId.set(key, []);
      }
      byNormalizedId.get(key)!.push(article);
    }

    const duplicatesToRemove: { id: number; normalizedId: string; reason: string }[] = [];
    const oldToRemove: { id: number; url: string; year: number; title: string | null }[] = [];
    const kept: { id: number; normalizedId: string }[] = [];

    // Find duplicates (keep the one with most mentions, or oldest if tie)
    for (const [normalizedId, articles] of byNormalizedId) {
      if (articles.length > 1) {
        // Sort by mentionCount desc, then firstSeenAt asc
        articles.sort((a, b) => {
          if (b.mentionCount !== a.mentionCount) return b.mentionCount - a.mentionCount;
          return new Date(a.firstSeenAt).getTime() - new Date(b.firstSeenAt).getTime();
        });

        // Keep first, remove rest
        kept.push({ id: articles[0].id, normalizedId });
        for (let i = 1; i < articles.length; i++) {
          duplicatesToRemove.push({
            id: articles[i].id,
            normalizedId,
            reason: `duplicate of id=${articles[0].id}`,
          });
        }
      }
    }

    // Find old articles (pre-minYear)
    for (const article of allArticles) {
      // Skip if already marked for removal as duplicate
      if (duplicatesToRemove.some(d => d.id === article.id)) continue;

      const year = getYearFromUrl(article.url);
      if (year && year < minYear) {
        oldToRemove.push({
          id: article.id,
          url: article.url,
          year,
          title: article.title,
        });
      }
    }

    const allToRemove = [
      ...duplicatesToRemove.map(d => d.id),
      ...oldToRemove.map(o => o.id),
    ];

    let deletedMentions = 0;
    let deletedArticles = 0;

    if (!dryRun && allToRemove.length > 0) {
      // Delete mentions first (foreign key constraint)
      const mentionResult = await db
        .delete(articleMentions)
        .where(inArray(articleMentions.articleId, allToRemove));
      deletedMentions = mentionResult.rowCount || 0;

      // Delete articles
      const articleResult = await db
        .delete(discoveredArticles)
        .where(inArray(discoveredArticles.id, allToRemove));
      deletedArticles = articleResult.rowCount || 0;
    }

    return NextResponse.json({
      success: true,
      dryRun,
      minYear,
      totalArticles: allArticles.length,
      duplicatesFound: duplicatesToRemove.length,
      oldArticlesFound: oldToRemove.length,
      totalToRemove: allToRemove.length,
      deletedMentions: dryRun ? 0 : deletedMentions,
      deletedArticles: dryRun ? 0 : deletedArticles,
      duplicates: duplicatesToRemove,
      oldArticles: oldToRemove.map(o => ({
        id: o.id,
        year: o.year,
        title: o.title?.slice(0, 60),
        url: o.url,
      })),
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// GET for dry-run preview
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const secret = process.env.PAPER_FIREHOSE_SECRET;

  if (!secret) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }
  if (!verifyBearerSecret(authHeader, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Forward to POST with dryRun=true
  const mockRequest = new NextRequest(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify({ dryRun: true }),
  });

  return POST(mockRequest);
}
