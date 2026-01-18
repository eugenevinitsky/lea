import { NextRequest, NextResponse } from 'next/server';
import { db, discoveredSubstackPosts, substackMentions, discoveredArticles, articleMentions } from '@/lib/db';
import { desc, sql } from 'drizzle-orm';

// GET /api/substack/trending?hours=24&limit=50&offset=0 - Get trending blog posts (Substack + Quanta + MIT Tech Review)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const hours = parseInt(searchParams.get('hours') || '24');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    // Fetch more items to handle pagination on combined results
    const fetchLimit = limit + offset;

    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Get Substack posts with recent mention counts (verified researchers count 3x)
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
        // Unique author count (not weighted) - each person only counts once
        postCount: sql<number>`(
          SELECT COUNT(DISTINCT substack_mentions.author_did)
          FROM substack_mentions
          WHERE substack_mentions.substack_post_id = discovered_substack_posts.id
        )`.as('post_count'),
        // Weighted unique authors: verified researchers count 3x, others 1x
        recentMentions: sql<number>`(
          SELECT COUNT(DISTINCT substack_mentions.author_did) +
                 2 * COUNT(DISTINCT CASE WHEN substack_mentions.is_verified_researcher THEN substack_mentions.author_did END)
          FROM substack_mentions
          WHERE substack_mentions.substack_post_id = discovered_substack_posts.id
          AND substack_mentions.created_at > ${cutoffTime}
        )`.as('recent_mentions'),
        // Unique authors in time window - for display
        recentPostCount: sql<number>`(
          SELECT COUNT(DISTINCT substack_mentions.author_did)
          FROM substack_mentions
          WHERE substack_mentions.substack_post_id = discovered_substack_posts.id
          AND substack_mentions.created_at > ${cutoffTime}
        )`.as('recent_post_count'),
      })
      .from(discoveredSubstackPosts)
      .where(
        sql`${discoveredSubstackPosts.title} IS NOT NULL`
      )
      .orderBy(
        desc(sql`(
          SELECT COUNT(DISTINCT substack_mentions.author_did) +
                 2 * COUNT(DISTINCT CASE WHEN substack_mentions.is_verified_researcher THEN substack_mentions.author_did END)
          FROM substack_mentions
          WHERE substack_mentions.substack_post_id = discovered_substack_posts.id
          AND substack_mentions.created_at > ${cutoffTime}
        )`),
        desc(sql`(
          SELECT COUNT(DISTINCT substack_mentions.author_did)
          FROM substack_mentions
          WHERE substack_mentions.substack_post_id = discovered_substack_posts.id
        )`)
      )
      .limit(fetchLimit);

    // Get articles (Quanta, MIT Tech Review, etc.)
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
        postCount: sql<number>`(
          SELECT COUNT(DISTINCT article_mentions.author_did)
          FROM article_mentions
          WHERE article_mentions.article_id = discovered_articles.id
        )`.as('post_count'),
        recentMentions: sql<number>`(
          SELECT COUNT(DISTINCT article_mentions.author_did) +
                 2 * COUNT(DISTINCT CASE WHEN article_mentions.is_verified_researcher THEN article_mentions.author_did END)
          FROM article_mentions
          WHERE article_mentions.article_id = discovered_articles.id
          AND article_mentions.created_at > ${cutoffTime}
        )`.as('recent_mentions'),
        recentPostCount: sql<number>`(
          SELECT COUNT(DISTINCT article_mentions.author_did)
          FROM article_mentions
          WHERE article_mentions.article_id = discovered_articles.id
          AND article_mentions.created_at > ${cutoffTime}
        )`.as('recent_post_count'),
      })
      .from(discoveredArticles)
      .where(
        sql`${discoveredArticles.title} IS NOT NULL`
      )
      .orderBy(
        desc(sql`(
          SELECT COUNT(DISTINCT article_mentions.author_did) +
                 2 * COUNT(DISTINCT CASE WHEN article_mentions.is_verified_researcher THEN article_mentions.author_did END)
          FROM article_mentions
          WHERE article_mentions.article_id = discovered_articles.id
          AND article_mentions.created_at > ${cutoffTime}
        )`),
        desc(sql`(
          SELECT COUNT(DISTINCT article_mentions.author_did)
          FROM article_mentions
          WHERE article_mentions.article_id = discovered_articles.id
        )`)
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
