import { NextRequest, NextResponse } from 'next/server';
import { db, discoveredSubstackPosts, substackMentions } from '@/lib/db';
import { eq, inArray } from 'drizzle-orm';
import { isTechnicalContent, classifyContent } from '@/lib/substack-classifier';

// One-time cleanup endpoint to apply BOW classifier to existing posts
export async function POST(request: NextRequest) {
  // Basic auth check - require a secret
  const authHeader = request.headers.get('Authorization');
  const secret = process.env.PAPER_FIREHOSE_SECRET;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fetch all existing posts
    const allPosts = await db.select().from(discoveredSubstackPosts);

    const kept: { id: number; title: string | null }[] = [];
    const removed: { id: number; title: string | null; reason: string }[] = [];

    for (const post of allPosts) {
      const isTechnical = isTechnicalContent(post.title || '', post.description || '');

      if (isTechnical) {
        kept.push({ id: post.id, title: post.title });
      } else {
        // Get classification details for logging
        const details = classifyContent(post.title || '', post.description || '');
        removed.push({
          id: post.id,
          title: post.title,
          reason: `political keywords: ${details.matchedPolitical.join(', ') || 'none'}, technical: ${details.matchedTechnical.join(', ') || 'none'}`,
        });
      }
    }

    // Delete mentions for removed posts first (foreign key constraint)
    if (removed.length > 0) {
      const removedIds = removed.map((p) => p.id);
      await db.delete(substackMentions).where(inArray(substackMentions.substackPostId, removedIds));

      // Delete the posts
      await db.delete(discoveredSubstackPosts).where(inArray(discoveredSubstackPosts.id, removedIds));
    }

    return NextResponse.json({
      success: true,
      totalProcessed: allPosts.length,
      kept: kept.length,
      removed: removed.length,
      removedPosts: removed,
      keptPosts: kept,
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
