import { NextRequest, NextResponse } from 'next/server';
import { db, discoveredSubstackPosts, substackMentions, discoveredArticles, articleMentions } from '@/lib/db';
import { eq, desc, count } from 'drizzle-orm';

// GET /api/substack/mentions?id=substack:eugenewei/status-as-a-service
// Also handles articles: ?id=quanta:12345 or ?id=mittechreview:slug
// Fetches all post URIs that mention a blog post or article
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const normalizedId = searchParams.get('id');
  const limit = parseInt(searchParams.get('limit') || '100', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  if (!normalizedId) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
  }

  // Check if this is an article (Quanta, MIT Tech Review) or Substack post
  const isArticle = normalizedId.startsWith('quanta:') || normalizedId.startsWith('mittechreview:');

  try {
    if (isArticle) {
      return await fetchArticleMentions(normalizedId, limit, offset);
    } else {
      return await fetchSubstackMentions(normalizedId, limit, offset);
    }
  } catch (error) {
    console.error('Failed to fetch mentions:', error);
    return NextResponse.json({ error: 'Failed to fetch mentions' }, { status: 500 });
  }
}

async function fetchSubstackMentions(normalizedId: string, limit: number, offset: number) {
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
      mentionCount: post.mentionCount,
      firstSeenAt: post.firstSeenAt,
      lastSeenAt: post.lastSeenAt,
    },
    mentions,
    total: totalMentions,
  });
}

async function fetchArticleMentions(normalizedId: string, limit: number, offset: number) {
  // Find the article by normalized ID
  const [article] = await db
    .select()
    .from(discoveredArticles)
    .where(eq(discoveredArticles.normalizedId, normalizedId))
    .limit(1);

  if (!article) {
    return NextResponse.json({
      post: null,
      mentions: [],
      total: 0
    });
  }

  // Get actual count of mentions
  const [countResult] = await db
    .select({ count: count() })
    .from(articleMentions)
    .where(eq(articleMentions.articleId, article.id));
  const totalMentions = countResult?.count ?? 0;

  // Fetch mentions for this article
  const mentions = await db
    .select({
      id: articleMentions.id,
      postUri: articleMentions.postUri,
      authorDid: articleMentions.authorDid,
      postText: articleMentions.postText,
      createdAt: articleMentions.createdAt,
      isVerifiedResearcher: articleMentions.isVerifiedResearcher,
    })
    .from(articleMentions)
    .where(eq(articleMentions.articleId, article.id))
    .orderBy(desc(articleMentions.createdAt))
    .limit(limit)
    .offset(offset);

  // Map source to display name
  const newsletterName = article.source === 'quanta' ? 'Quanta Magazine' :
                        article.source === 'mittechreview' ? 'MIT Technology Review' :
                        article.source;

  return NextResponse.json({
    post: {
      id: article.id,
      normalizedId: article.normalizedId,
      url: article.url,
      subdomain: article.source,
      slug: article.slug,
      title: article.title,
      description: article.description,
      author: article.author,
      newsletterName,
      imageUrl: article.imageUrl,
      mentionCount: article.mentionCount,
      firstSeenAt: article.firstSeenAt,
      lastSeenAt: article.lastSeenAt,
    },
    mentions: mentions.map(m => ({
      ...m,
      authorHandle: null, // Articles table doesn't store author handles
    })),
    total: totalMentions,
  });
}
