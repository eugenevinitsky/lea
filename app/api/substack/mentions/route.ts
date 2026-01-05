import { NextRequest, NextResponse } from 'next/server';
import { db, discoveredSubstackPosts, substackMentions } from '@/lib/db';
import { eq, desc, count } from 'drizzle-orm';

// GET /api/substack/mentions?id=substack:eugenewei/status-as-a-service
// Fetches all post URIs that mention a Substack post
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const normalizedId = searchParams.get('id');
  const limit = parseInt(searchParams.get('limit') || '100', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  if (!normalizedId) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
  }

  try {
    // Find the Substack post by normalized ID
    const [post] = await db
      .select()
      .from(discoveredSubstackPosts)
      .where(eq(discoveredSubstackPosts.normalizedId, normalizedId))
      .limit(1);

    if (!post) {
      return NextResponse.json({
        post: null,
        mentions: [],
        total: 0
      });
    }

    // Get actual count of mentions (not weighted)
    const [countResult] = await db
      .select({ count: count() })
      .from(substackMentions)
      .where(eq(substackMentions.substackPostId, post.id));
    const totalMentions = countResult?.count ?? 0;

    // Fetch mentions for this post
    const mentions = await db
      .select({
        id: substackMentions.id,
        postUri: substackMentions.postUri,
        authorDid: substackMentions.authorDid,
        authorHandle: substackMentions.authorHandle,
        postText: substackMentions.postText,
        createdAt: substackMentions.createdAt,
        isVerifiedResearcher: substackMentions.isVerifiedResearcher,
      })
      .from(substackMentions)
      .where(eq(substackMentions.substackPostId, post.id))
      .orderBy(desc(substackMentions.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      post: {
        id: post.id,
        normalizedId: post.normalizedId,
        url: post.url,
        subdomain: post.subdomain,
        slug: post.slug,
        title: post.title,
        description: post.description,
        author: post.author,
        newsletterName: post.newsletterName,
        imageUrl: post.imageUrl,
        mentionCount: post.mentionCount, // weighted count (for ranking)
        firstSeenAt: post.firstSeenAt,
        lastSeenAt: post.lastSeenAt,
      },
      mentions,
      total: totalMentions, // actual post count
    });
  } catch (error) {
    console.error('Failed to fetch Substack mentions:', error);
    return NextResponse.json({ error: 'Failed to fetch mentions' }, { status: 500 });
  }
}
