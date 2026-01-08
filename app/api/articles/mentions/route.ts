import { NextRequest, NextResponse } from 'next/server';
import { db, discoveredArticles, articleMentions } from '@/lib/db';
import { eq, desc, count } from 'drizzle-orm';

// GET /api/articles/mentions?id=quanta:12345
// Fetches all post URIs that mention an article
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const normalizedId = searchParams.get('id');
  const limit = parseInt(searchParams.get('limit') || '100', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  if (!normalizedId) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
  }

  try {
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

    // Get actual count of mentions (not weighted)
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

    // Format response to match substack mentions structure
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
        authorHandle: null, // Articles don't store author handles
      })),
      total: totalMentions,
    });
  } catch (error) {
    console.error('Failed to fetch article mentions:', error);
    return NextResponse.json({ error: 'Failed to fetch mentions' }, { status: 500 });
  }
}
