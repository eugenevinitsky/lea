import { NextRequest, NextResponse } from 'next/server';
import { db, userBookmarks, userBookmarkCollections } from '@/lib/db';
import { eq, and, asc } from 'drizzle-orm';
import { verifyUserAccess } from '@/lib/server-auth';

// GET /api/bookmarks?did=xxx - Fetch all bookmarks and collections for a user
export async function GET(request: NextRequest) {
  const did = request.nextUrl.searchParams.get('did');

  if (!did) {
    return NextResponse.json({ error: 'DID required' }, { status: 400 });
  }

  // Verify the user is authenticated and requesting their own data
  const auth = await verifyUserAccess(request, did);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    // Fetch bookmarks
    const bookmarks = await db
      .select()
      .from(userBookmarks)
      .where(eq(userBookmarks.userDid, did))
      .orderBy(userBookmarks.createdAt);

    // Fetch collections
    const collections = await db
      .select()
      .from(userBookmarkCollections)
      .where(eq(userBookmarkCollections.userDid, did))
      .orderBy(asc(userBookmarkCollections.position));

    // Parse JSON fields
    const parsedBookmarks = bookmarks.map(b => ({
      ...JSON.parse(b.postData),
      collectionIds: b.collectionIds ? JSON.parse(b.collectionIds) : [],
    }));

    const parsedCollections = collections.map(c => ({
      id: c.id,
      name: c.name,
      color: c.color,
    }));

    return NextResponse.json({
      bookmarks: parsedBookmarks,
      collections: parsedCollections,
    }, {
      headers: {
        // Cache at CDN for 1 minute (per user via query param), stale-while-revalidate for 5 min
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    console.error('Failed to fetch bookmarks:', error);
    return NextResponse.json({ error: 'Failed to fetch bookmarks' }, { status: 500 });
  }
}

// POST /api/bookmarks - Add/update bookmark or collection
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { did, action, ...data } = body;

    if (!did) {
      return NextResponse.json({ error: 'DID required' }, { status: 400 });
    }

    // Verify the user is authenticated and modifying their own data
    const auth = await verifyUserAccess(request, did);
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    switch (action) {
      case 'addBookmark': {
        const { bookmark, collectionIds } = data;
        if (!bookmark?.uri) {
          return NextResponse.json({ error: 'Bookmark URI required' }, { status: 400 });
        }

        // Check if bookmark already exists
        const [existing] = await db
          .select()
          .from(userBookmarks)
          .where(and(
            eq(userBookmarks.userDid, did),
            eq(userBookmarks.postUri, bookmark.uri)
          ))
          .limit(1);

        if (existing) {
          // Update collection IDs
          await db
            .update(userBookmarks)
            .set({ collectionIds: JSON.stringify(collectionIds || []) })
            .where(eq(userBookmarks.id, existing.id));
        } else {
          // Create new bookmark
          const id = `bm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          await db.insert(userBookmarks).values({
            id,
            userDid: did,
            postUri: bookmark.uri,
            postData: JSON.stringify(bookmark),
            collectionIds: JSON.stringify(collectionIds || []),
          });
        }

        return NextResponse.json({ success: true });
      }

      case 'removeBookmark': {
        const { uri } = data;
        if (!uri) {
          return NextResponse.json({ error: 'URI required' }, { status: 400 });
        }

        await db
          .delete(userBookmarks)
          .where(and(
            eq(userBookmarks.userDid, did),
            eq(userBookmarks.postUri, uri)
          ));

        return NextResponse.json({ success: true });
      }

      case 'updateBookmarkCollections': {
        const { uri, collectionIds } = data;
        if (!uri) {
          return NextResponse.json({ error: 'URI required' }, { status: 400 });
        }

        await db
          .update(userBookmarks)
          .set({ collectionIds: JSON.stringify(collectionIds || []) })
          .where(and(
            eq(userBookmarks.userDid, did),
            eq(userBookmarks.postUri, uri)
          ));

        return NextResponse.json({ success: true });
      }

      case 'addCollection': {
        const { name, color } = data;
        if (!name) {
          return NextResponse.json({ error: 'Collection name required' }, { status: 400 });
        }

        // Get max position
        const collections = await db
          .select()
          .from(userBookmarkCollections)
          .where(eq(userBookmarkCollections.userDid, did));
        
        const maxPosition = collections.reduce((max, c) => Math.max(max, c.position), -1);

        const id = `col_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await db.insert(userBookmarkCollections).values({
          id,
          userDid: did,
          name,
          color: color || 'rose',
          position: maxPosition + 1,
        });

        return NextResponse.json({ success: true, id });
      }

      case 'renameCollection': {
        const { id, name } = data;
        if (!id || !name) {
          return NextResponse.json({ error: 'Collection ID and name required' }, { status: 400 });
        }

        await db
          .update(userBookmarkCollections)
          .set({ name })
          .where(and(
            eq(userBookmarkCollections.id, id),
            eq(userBookmarkCollections.userDid, did)
          ));

        return NextResponse.json({ success: true });
      }

      case 'deleteCollection': {
        const { id } = data;
        if (!id) {
          return NextResponse.json({ error: 'Collection ID required' }, { status: 400 });
        }

        // Remove collection from all bookmarks first
        const bookmarks = await db
          .select()
          .from(userBookmarks)
          .where(eq(userBookmarks.userDid, did));

        for (const bookmark of bookmarks) {
          const collectionIds = bookmark.collectionIds ? JSON.parse(bookmark.collectionIds) : [];
          if (collectionIds.includes(id)) {
            const newIds = collectionIds.filter((cid: string) => cid !== id);
            await db
              .update(userBookmarks)
              .set({ collectionIds: JSON.stringify(newIds) })
              .where(eq(userBookmarks.id, bookmark.id));
          }
        }

        // Delete the collection
        await db
          .delete(userBookmarkCollections)
          .where(and(
            eq(userBookmarkCollections.id, id),
            eq(userBookmarkCollections.userDid, did)
          ));

        return NextResponse.json({ success: true });
      }

      case 'reorderCollections': {
        const { fromIndex, toIndex } = data;
        if (fromIndex === undefined || toIndex === undefined) {
          return NextResponse.json({ error: 'fromIndex and toIndex required' }, { status: 400 });
        }

        // Get all collections ordered by position
        const collections = await db
          .select()
          .from(userBookmarkCollections)
          .where(eq(userBookmarkCollections.userDid, did))
          .orderBy(asc(userBookmarkCollections.position));

        // Reorder
        const reordered = [...collections];
        const [moved] = reordered.splice(fromIndex, 1);
        reordered.splice(toIndex, 0, moved);

        // Update positions
        for (let i = 0; i < reordered.length; i++) {
          await db
            .update(userBookmarkCollections)
            .set({ position: i })
            .where(eq(userBookmarkCollections.id, reordered[i].id));
        }

        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Failed to update bookmarks:', error);
    return NextResponse.json({ error: 'Failed to update bookmarks' }, { status: 500 });
  }
}
