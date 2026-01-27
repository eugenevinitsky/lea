import { NextRequest, NextResponse } from 'next/server';
import { db, discoveredSubstackPosts, discoveredArticles } from '@/lib/db';
import { desc, sql } from 'drizzle-orm';

// Validation constants
const MAX_HOURS = 168; // 1 week max
const MAX_LIMIT = 100;
const MAX_OFFSET = 10000;

// Map hours to the nearest trending score bucket column name
function getScoreColumnName(hours: number): string {
  if (hours <= 1) return 'trendingScore1h';
  if (hours <= 6) return 'trendingScore6h';
  if (hours <= 24) return 'trendingScore24h';
  if (hours <= 168) return 'trendingScore7d';
  return 'trendingScoreAllTime';
}

// GET /api/substack/trending?hours=24&limit=50&offset=0 - Get trending blog posts (Substack + Quanta + MIT Tech Review)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse and validate all query params
    const rawHours = parseInt(searchParams.get('hours') || '24');
    const rawLimit = parseInt(searchParams.get('limit') || '50');
    const rawOffset = parseInt(searchParams.get('offset') || '0');

    const hours = Number.isNaN(rawHours) || rawHours < 1 ? 24 : Math.min(rawHours, MAX_HOURS);
    const limit = Number.isNaN(rawLimit) || rawLimit < 1 ? 50 : Math.min(rawLimit, MAX_LIMIT);
    const offset = Number.isNaN(rawOffset) || rawOffset < 0 ? 0 : Math.min(rawOffset, MAX_OFFSET);

    // Fetch more items to handle pagination on combined results
    const fetchLimit = limit + offset;

    // Get the appropriate score column name
    const scoreColumnName = getScoreColumnName(hours);

    // Get Substack posts using denormalized trending scores (fast column reads)
    const substackScoreColumn = discoveredSubstackPosts[scoreColumnName as keyof typeof discoveredSubstackPosts] as typeof discoveredSubstackPosts.trendingScore24h;
    const substackPosts = await db
      .select({
        id: discoveredSubstackPosts.id,
        url: discoveredSubstackPosts.url,
        normalizedId: discoveredSubstackPosts.normalizedId,
        subdomain: discoveredSubstackPosts.subdomain,
        slug: discoveredSubstackPosts.slug,
        title: discoveredSubstackPosts.title,
        description: discoveredSubstackPosts.description,
        author: discoveredSubstackPosts.author,
        newsletterName: discoveredSubstackPosts.newsletterName,
        imageUrl: discoveredSubstackPosts.imageUrl,
        firstSeenAt: discoveredSubstackPosts.firstSeenAt,
        lastSeenAt: discoveredSubstackPosts.lastSeenAt,
        mentionCount: discoveredSubstackPosts.mentionCount,
        // Use all-time score as total post count proxy
        postCount: discoveredSubstackPosts.trendingScoreAllTime,
        // Use the appropriate time-bucket score
        recentMentions: substackScoreColumn,
        // For display, use the same score (approximation)
        recentPostCount: substackScoreColumn,
      })
      .from(discoveredSubstackPosts)
      .where(
        sql`${discoveredSubstackPosts.title} IS NOT NULL`
      )
      .orderBy(
        desc(substackScoreColumn),
        desc(discoveredSubstackPosts.trendingScoreAllTime)
      )
      .limit(fetchLimit);

    // Get articles (Quanta, MIT Tech Review, etc.) using denormalized scores
    const articleScoreColumn = discoveredArticles[scoreColumnName as keyof typeof discoveredArticles] as typeof discoveredArticles.trendingScore24h;
    const articles = await db
      .select({
        id: discoveredArticles.id,
        url: discoveredArticles.url,
        normalizedId: discoveredArticles.normalizedId,
        source: discoveredArticles.source,
        slug: discoveredArticles.slug,
        title: discoveredArticles.title,
        description: discoveredArticles.description,
        author: discoveredArticles.author,
        imageUrl: discoveredArticles.imageUrl,
        category: discoveredArticles.category,
        firstSeenAt: discoveredArticles.firstSeenAt,
        lastSeenAt: discoveredArticles.lastSeenAt,
        mentionCount: discoveredArticles.mentionCount,
        // Use all-time score as total post count proxy
        postCount: discoveredArticles.trendingScoreAllTime,
        // Use the appropriate time-bucket score
        recentMentions: articleScoreColumn,
        // For display, use the same score (approximation)
        recentPostCount: articleScoreColumn,
      })
      .from(discoveredArticles)
      .where(
        sql`${discoveredArticles.title} IS NOT NULL`
      )
      .orderBy(
        desc(articleScoreColumn),
        desc(discoveredArticles.trendingScoreAllTime)
      )
      .limit(fetchLimit);

    // Normalize articles to match Substack post structure
    const normalizedArticles = articles.map(article => ({
      id: article.id,
      url: article.url,
      normalizedId: article.normalizedId,
      subdomain: article.source, // Use source as subdomain for display
      slug: article.slug,
      title: article.title,
      description: article.description,
      author: article.author,
      newsletterName: article.source === 'quanta' ? 'Quanta Magazine' :
                      article.source === 'mittechreview' ? 'MIT Technology Review' :
                      article.source,
      imageUrl: article.imageUrl,
      firstSeenAt: article.firstSeenAt,
      lastSeenAt: article.lastSeenAt,
      mentionCount: article.mentionCount,
      postCount: article.postCount,
      recentMentions: article.recentMentions,
      recentPostCount: article.recentPostCount,
    }));

    // Combine and sort by recentMentions
    const sortedPosts = [...substackPosts, ...normalizedArticles]
      .sort((a, b) => {
        // Sort by recent mentions first, then by total post count
        const aRecent = Number(a.recentMentions) || 0;
        const bRecent = Number(b.recentMentions) || 0;
        if (bRecent !== aRecent) return bRecent - aRecent;
        const aCount = Number(a.postCount) || 0;
        const bCount = Number(b.postCount) || 0;
        return bCount - aCount;
      });

    // Apply offset and limit
    const allPosts = sortedPosts.slice(offset, offset + limit);
    const hasMore = sortedPosts.length > offset + limit;

    return NextResponse.json({ posts: allPosts, hasMore }, {
      headers: {
        // Cache at CDN for 5 minutes, stale-while-revalidate for 10 min
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Failed to fetch trending blog posts:', error);
    return NextResponse.json({ error: 'Failed to fetch trending blog posts' }, { status: 500 });
  }
}
