'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { AppBskyFeedDefs } from '@atproto/api';
import { restoreSession, getSession, getBlueskyProfile, getPostsByUris, searchPosts, buildProfileUrl } from '@/lib/bluesky';
import { SettingsProvider } from '@/lib/settings';
import { BookmarksProvider } from '@/lib/bookmarks';
import { FeedsProvider } from '@/lib/feeds';
import { FollowingProvider } from '@/lib/following-context';
import { ComposerProvider } from '@/lib/composer-context';
import Post from '@/components/Post';
import FallbackPost from '@/components/FallbackPost';
import Login from '@/components/Login';
import ThreadView from '@/components/ThreadView';

// Cached mention data for posts that may have been deleted
interface CachedMention {
  postUri: string;
  authorDid: string;
  authorHandle: string | null;
  postText: string | null;
  createdAt: string;
  isVerifiedResearcher: boolean;
}

interface BlogPostInfo {
  title?: string;
  description?: string;
  author?: string;
  newsletterName?: string;
  url?: string;
  imageUrl?: string;
  mentionCount?: number;
}

function BlogPageContent() {
  const params = useParams();
  const router = useRouter();
  // The ID is URL-encoded and might contain special characters
  const rawId = Array.isArray(params.id) ? params.id.join('/') : (params.id as string);
  const blogId = decodeURIComponent(rawId);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [posts, setPosts] = useState<AppBskyFeedDefs.PostView[]>([]);
  const [fallbackPosts, setFallbackPosts] = useState<CachedMention[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [searchCursor, setSearchCursor] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [blogInfo, setBlogInfo] = useState<BlogPostInfo>({});
  const [threadUri, setThreadUri] = useState<string | null>(null);

  // Restore session on mount
  useEffect(() => {
    restoreSession().then((restored) => {
      if (restored) {
        setIsLoggedIn(true);
      }
      setIsLoading(false);
    });
  }, []);

  // Fetch posts mentioning this blog post from database
  const fetchPosts = useCallback(async (loadMore = false) => {
    if (!blogId) return;

    setPostsLoading(true);
    setError(null);

    try {
      const currentOffset = loadMore ? offset : 0;
      const limit = 50;

      // Fetch mentions from database (endpoint handles Substack, Quanta, MIT Tech Review)
      const response = await fetch(`/api/articles/mentions?id=${encodeURIComponent(blogId)}&limit=${limit}&offset=${currentOffset}`);
      if (!response.ok) {
        throw new Error('Failed to fetch mentions');
      }

      const data = await response.json();

      // Update blog info from database
      if (data.post) {
        setBlogInfo({
          title: data.post.title,
          description: data.post.description,
          author: data.post.author,
          newsletterName: data.post.newsletterName,
          url: data.post.url,
          imageUrl: data.post.imageUrl,
          mentionCount: data.post.mentionCount,
        });
      }

      // Store mentions data for fallback display
      const mentions: CachedMention[] = data.mentions.map((m: {
        postUri: string;
        authorDid: string;
        authorHandle: string | null;
        postText: string | null;
        createdAt: string;
        isVerifiedResearcher: boolean;
      }) => ({
        postUri: m.postUri,
        authorDid: m.authorDid,
        authorHandle: m.authorHandle,
        postText: m.postText,
        createdAt: m.createdAt,
        isVerifiedResearcher: m.isVerifiedResearcher,
      }));

      // Fetch posts from Bluesky
      let dbPosts: AppBskyFeedDefs.PostView[] = [];
      let newFallbackPosts: CachedMention[] = [];
      if (mentions.length > 0) {
        const postUris = mentions.map(m => m.postUri);
        console.log('[Blog] Fetching', postUris.length, 'posts from Bluesky');
        dbPosts = await getPostsByUris(postUris);
        console.log('[Blog] Got', dbPosts.length, 'posts from Bluesky');

        // Find posts that weren't returned (deleted from Bluesky)
        const returnedUris = new Set(dbPosts.map(p => p.uri));
        newFallbackPosts = mentions.filter(m => !returnedUris.has(m.postUri));
        if (newFallbackPosts.length > 0) {
          console.log('[Blog] Found', newFallbackPosts.length, 'deleted posts, using cached data');
        }
      }

      // Bluesky search for blog URL (to find posts not yet in our DB)
      let searchResults: AppBskyFeedDefs.PostView[] = [];
      let newSearchCursor: string | undefined;
      const blogUrl = data.post?.url;

      if (blogUrl) {
        try {
          let result: { posts: AppBskyFeedDefs.PostView[]; cursor?: string } = { posts: [], cursor: undefined };

          // Strategy 1: Search for the full Substack URL
          if (!loadMore) {
            console.log('[Blog Search] Strategy 1 (full URL):', blogUrl);
            result = await searchPosts(blogUrl, undefined, 'latest');
            console.log('[Blog Search] Strategy 1 results:', result.posts.length);
          }

          // Strategy 2: Try URL without query params
          if (!loadMore && result.posts.length === 0) {
            const urlNoParams = blogUrl.replace(/\?.*$/, '');
            if (urlNoParams !== blogUrl) {
              console.log('[Blog Search] Strategy 2 (URL without params):', urlNoParams);
              result = await searchPosts(urlNoParams, undefined, 'latest');
              console.log('[Blog Search] Strategy 2 results:', result.posts.length);
            }
          }

          // Strategy 3: Search by subdomain + slug (for pagination or if URL search fails)
          if (result.posts.length === 0 || loadMore) {
            // Extract subdomain.substack.com/p/slug pattern
            const urlMatch = blogUrl.match(/([a-z0-9-]+)\.substack\.com\/p\/([a-z0-9-]+)/i);
            if (urlMatch) {
              const [, subdomain, slug] = urlMatch;
              const searchQuery = `${subdomain}.substack.com ${slug}`;
              console.log('[Blog Search] Strategy 3 (subdomain + slug):', searchQuery, loadMore ? `cursor: ${searchCursor}` : '');
              const slugResult = await searchPosts(searchQuery, loadMore ? searchCursor : undefined, 'latest');
              console.log('[Blog Search] Strategy 3 results:', slugResult.posts.length);
              if (loadMore || result.posts.length === 0) {
                result = slugResult;
              }
            }
          }

          console.log('[Blog Search] Total raw results:', result.posts.length);
          newSearchCursor = result.cursor;

          // Filter to only posts that actually contain this blog URL
          searchResults = result.posts.filter(post => {
            const record = post.record as { text?: string };
            const embedUri = post.embed && 'external' in post.embed
              ? (post.embed as { external?: { uri?: string } }).external?.uri
              : undefined;

            // Check if post text or embed contains the blog URL (or subdomain/slug combo)
            const textHasUrl = record.text?.includes(blogUrl) || record.text?.includes(blogUrl.replace(/\?.*$/, ''));
            const embedHasUrl = embedUri?.includes(blogUrl) || embedUri?.includes(blogUrl.replace(/\?.*$/, ''));

            return textHasUrl || embedHasUrl;
          });

          console.log('[Blog Search] Filtered results:', searchResults.length);
        } catch (searchErr) {
          console.log('[Blog Search] Search failed (continuing with DB results):', searchErr);
        }
      }

      // Merge and deduplicate by URI
      const seenUris = new Set<string>();
      const allPosts: AppBskyFeedDefs.PostView[] = [];

      // Add DB posts first (they're authoritative)
      for (const post of dbPosts) {
        if (!seenUris.has(post.uri)) {
          seenUris.add(post.uri);
          allPosts.push(post);
        }
      }

      // Add search posts that aren't already included
      for (const post of searchResults) {
        if (!seenUris.has(post.uri)) {
          seenUris.add(post.uri);
          allPosts.push(post);
        }
      }

      // Sort by indexedAt to maintain chronological order (newest first)
      allPosts.sort((a, b) => {
        const dateA = new Date(a.indexedAt).getTime();
        const dateB = new Date(b.indexedAt).getTime();
        return dateB - dateA;
      });

      // Filter out fallback posts that now have live versions (from search)
      const finalFallbacks = newFallbackPosts.filter(f => !seenUris.has(f.postUri));

      if (loadMore) {
        setPosts(prev => {
          const prevUris = new Set(prev.map(p => p.uri));
          const newPosts = allPosts.filter(p => !prevUris.has(p.uri));
          return [...prev, ...newPosts];
        });
        setFallbackPosts(prev => {
          const prevUris = new Set(prev.map(p => p.postUri));
          const newFallbacks = finalFallbacks.filter(p => !prevUris.has(p.postUri));
          return [...prev, ...newFallbacks];
        });
      } else {
        setPosts(allPosts);
        setFallbackPosts(finalFallbacks);
      }

      setOffset(currentOffset + data.mentions.length);
      setSearchCursor(newSearchCursor);
      // Has more if either DB has more or search has more results
      setHasMore(data.mentions.length === limit || !!newSearchCursor);
    } catch (err) {
      console.error('Failed to fetch blog posts:', err);
      setError('Failed to load discussions');
    } finally {
      setPostsLoading(false);
    }
  }, [blogId, offset, searchCursor]);

  // Initial fetch when logged in
  useEffect(() => {
    if (isLoggedIn && blogId) {
      fetchPosts();
    }
  }, [isLoggedIn, blogId]); // Intentionally exclude fetchPosts to avoid re-fetching

  const handleLogin = () => {
    setIsLoggedIn(true);
  };

  const navigateToProfile = async (did: string) => {
    const profile = await getBlueskyProfile(did);
    if (profile?.handle) {
      window.location.href = buildProfileUrl(profile.handle, profile.did);
    } else {
      window.location.href = buildProfileUrl(did);
    }
  };

  // Get unique authors who discussed this blog post (from both live and fallback posts)
  const discussants = posts.reduce((acc, post) => {
    if (!acc.some(a => a.did === post.author.did)) {
      acc.push(post.author);
    }
    return acc;
  }, [] as AppBskyFeedDefs.PostView['author'][]);

  // Get unique authors from fallback posts (who aren't already in discussants)
  const fallbackAuthors = fallbackPosts.reduce((acc, post) => {
    if (!discussants.some(d => d.did === post.authorDid) && !acc.some(a => a.did === post.authorDid)) {
      acc.push({
        did: post.authorDid,
        handle: post.authorHandle || post.authorDid,
      });
    }
    return acc;
  }, [] as { did: string; handle: string }[]);

  // Total counts including fallback posts
  const totalPostCount = posts.length + fallbackPosts.length;
  const totalDiscussantCount = discussants.length + fallbackAuthors.length;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  const session = getSession();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/80 dark:bg-black/80 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1
            className="text-xl font-bold text-blue-500 cursor-pointer hover:text-blue-600 transition-colors"
            onClick={() => window.location.href = '/'}
          >Lea</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.location.href = `/u/${session?.handle}`}
              className="px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-full transition-colors"
            >
              @{session?.handle}
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="max-w-5xl mx-auto flex gap-4 px-0 lg:px-4">
        <main className="flex-1 w-full lg:max-w-xl lg:mx-auto bg-white dark:bg-gray-950 min-h-screen border-x border-gray-200 dark:border-gray-800">
          {/* Back button and title */}
          <div className="sticky top-14 z-10 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 p-3 flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
              title="Go back"
            >
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="font-semibold text-gray-900 dark:text-gray-100">Blog Discussion</span>
          </div>

          {/* Blog Info Card */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-800">
            <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-xl p-4">
              <div className="flex items-start gap-3">
                {blogInfo.imageUrl ? (
                  <img
                    src={blogInfo.imageUrl}
                    alt=""
                    className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-orange-100 dark:bg-orange-800 flex items-center justify-center flex-shrink-0">
                    <svg className="w-8 h-8 text-orange-600 dark:text-orange-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                    </svg>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {blogInfo.title ? (
                    <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-1 line-clamp-2">
                      {blogInfo.title}
                    </h2>
                  ) : (
                    <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                      Blog Post
                    </h2>
                  )}
                  {blogInfo.author && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                      by {blogInfo.author}
                      {blogInfo.newsletterName && ` · ${blogInfo.newsletterName}`}
                    </p>
                  )}
                  <a
                    href={blogInfo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    {blogId.startsWith('quanta:') ? 'Read on Quanta' :
                     blogId.startsWith('mittechreview:') ? 'Read on MIT Tech Review' :
                     'Read on Substack'}
                  </a>
                </div>
              </div>

              {/* Description */}
              {blogInfo.description && (
                <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                  {blogInfo.description}
                </p>
              )}

              {/* Stats */}
              <div className="mt-4 flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <span>{totalPostCount} post{totalPostCount !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span>{totalDiscussantCount} discussing</span>
                </div>
              </div>

              {/* Discussants avatars */}
              {discussants.length > 0 && (
                <div className="mt-3 flex items-center">
                  <div className="flex -space-x-2">
                    {discussants.slice(0, 8).map((author) => (
                      <button
                        key={author.did}
                        onClick={() => navigateToProfile(author.did)}
                        className="relative hover:z-10 transition-transform hover:scale-110"
                        title={author.displayName || author.handle}
                      >
                        {author.avatar ? (
                          <img
                            src={author.avatar}
                            alt=""
                            className="w-8 h-8 rounded-full border-2 border-white dark:border-gray-900"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 border-2 border-white dark:border-gray-900" />
                        )}
                      </button>
                    ))}
                  </div>
                  {discussants.length > 8 && (
                    <span className="ml-2 text-xs text-gray-500">+{discussants.length - 8} more</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Posts */}
          <div>
            {postsLoading && totalPostCount === 0 ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full" />
              </div>
            ) : error ? (
              <div className="text-center py-8 text-red-500">{error}</div>
            ) : totalPostCount === 0 ? (
              <div className="text-center py-12 px-4">
                <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <p className="text-gray-500 mb-2">No discussions found</p>
                <p className="text-sm text-gray-400 mb-4">
                  Be the first to share your thoughts on this article!
                </p>
                <a
                  href={blogInfo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-4 py-2 text-sm bg-orange-500 text-white rounded-full hover:bg-orange-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Read article
                </a>
              </div>
            ) : (
              <>
                {/* Live posts from Bluesky */}
                {posts.map((post) => (
                  <Post
                    key={post.uri}
                    post={post}
                    onOpenThread={setThreadUri}
                    onOpenProfile={navigateToProfile}
                  />
                ))}
                {/* Fallback posts (deleted from Bluesky but cached in our DB) */}
                {fallbackPosts.map((post) => (
                  <FallbackPost
                    key={post.postUri}
                    postUri={post.postUri}
                    authorDid={post.authorDid}
                    authorHandle={post.authorHandle}
                    postText={post.postText}
                    createdAt={post.createdAt}
                    isVerifiedResearcher={post.isVerifiedResearcher}
                  />
                ))}
                {hasMore && (
                  <div className="p-4 text-center">
                    <button
                      onClick={() => fetchPosts(true)}
                      disabled={postsLoading}
                      className="px-4 py-2 text-sm text-orange-500 hover:text-orange-600 disabled:opacity-50"
                    >
                      {postsLoading ? 'Loading...' : 'Load more'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {/* Thread View Modal */}
      {threadUri && (
        <ThreadView uri={threadUri} onClose={() => setThreadUri(null)} />
      )}
    </div>
  );
}

export default function BlogPage() {
  return (
    <SettingsProvider>
      <BookmarksProvider>
        <FeedsProvider>
          <FollowingProvider>
            <ComposerProvider>
              <Suspense fallback={
                <div className="min-h-screen bg-gray-50 dark:bg-black flex items-center justify-center">
                  <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full"></div>
                </div>
              }>
                <BlogPageContent />
              </Suspense>
            </ComposerProvider>
          </FollowingProvider>
        </FeedsProvider>
      </BookmarksProvider>
    </SettingsProvider>
  );
}
