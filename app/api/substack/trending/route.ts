import { NextRequest, NextResponse } from 'next/server';
import { db, discoveredSubstackPosts, substackMentions } from '@/lib/db';
import { desc, sql } from 'drizzle-orm';

// GET /api/substack/trending?hours=24&limit=50 - Get trending Substack posts
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const hours = parseInt(searchParams.get('hours') || '24');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Get Substack posts with recent mention counts (verified researchers count 3x)
    const posts = await db
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
        // Order by weighted unique authors in time window
        desc(sql`(
          SELECT COUNT(DISTINCT substack_mentions.author_did) +
                 2 * COUNT(DISTINCT CASE WHEN substack_mentions.is_verified_researcher THEN substack_mentions.author_did END)
          FROM substack_mentions
          WHERE substack_mentions.substack_post_id = discovered_substack_posts.id
          AND substack_mentions.created_at > ${cutoffTime}
        )`),
        // Then by total unique authors
        desc(sql`(
          SELECT COUNT(DISTINCT substack_mentions.author_did)
          FROM substack_mentions
          WHERE substack_mentions.substack_post_id = discovered_substack_posts.id
        )`)
      )
      .limit(limit);

    return NextResponse.json({ posts });
  } catch (error) {
    console.error('Failed to fetch trending Substack posts:', error);
    return NextResponse.json({ error: 'Failed to fetch trending Substack posts' }, { status: 500 });
  }
}
