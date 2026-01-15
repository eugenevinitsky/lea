'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { AppBskyFeedDefs, AppBskyEmbedExternal } from '@atproto/api';
import { restoreSession, getSession, getBlueskyProfile, getPostsByUris, searchPosts, buildProfileUrl } from '@/lib/bluesky';
import { getUrlFromPaperId, getPaperTypeFromId, getSearchQueryForPaper, extractPaperUrl, extractAnyUrl, getPaperIdFromUrl, LinkFacet } from '@/lib/papers';
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

interface PaperInfo {
  title?: string;
  authors?: string[];
  url?: string;
  source?: string;
  mentionCount?: number;
}

function PaperPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  // The ID is URL-encoded and might contain special characters
  const rawId = Array.isArray(params.id) ? params.id.join('/') : (params.id as string);
  const paperId = decodeURIComponent(rawId);
  // Original URL passed from Post component (used as fallback for paper link)
  const originalUrl = searchParams.get('url');

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [posts, setPosts] = useState<AppBskyFeedDefs.PostView[]>([]);
  const [fallbackPosts, setFallbackPosts] = useState<CachedMention[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [searchCursor, setSearchCursor] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [paperInfo, setPaperInfo] = useState<PaperInfo>({});
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

  // Fetch posts mentioning this paper from database
  const fetchPosts = useCallback(async (loadMore = false) => {
    if (!paperId) return;

    setPostsLoading(true);
    setError(null);

    try {
      const currentOffset = loadMore ? offset : 0;
      const limit = 50;

      // Fetch mentions from database
      const response = await fetch(`/api/papers/mentions?id=${encodeURIComponent(paperId)}&limit=${limit}&offset=${currentOffset}`);
      if (!response.ok) {
        throw new Error('Failed to fetch mentions');
      }

      const data = await response.json();

      // Update paper info from database
      if (data.paper) {
        setPaperInfo({
          title: data.paper.title,
          authors: data.paper.authors,
          url: data.paper.url,
          source: data.paper.source,
          mentionCount: data.paper.mentionCount,
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
        console.log('[Paper] Fetching', postUris.length, 'posts from Bluesky');
        dbPosts = await getPostsByUris(postUris);
        console.log('[Paper] Got', dbPosts.length, 'posts from Bluesky');

        // Find posts that weren't returned (deleted from Bluesky)
        const returnedUris = new Set(dbPosts.map(p => p.uri));
        newFallbackPosts = mentions.filter(m => !returnedUris.has(m.postUri));
        if (newFallbackPosts.length > 0) {
          console.log('[Paper] Found', newFallbackPosts.length, 'deleted posts, using cached data');
        }
      }

      // Multi-strategy Bluesky search (from old implementation)
      let searchResults: AppBskyFeedDefs.PostView[] = [];
      let newSearchCursor: string | undefined;
      try {
        let result: { posts: AppBskyFeedDefs.PostView[]; cursor?: string } = { posts: [], cursor: undefined };

        // Strategy 1: Search for the original full URL (most accurate for finding link shares)
        if (!loadMore && originalUrl) {
          console.log('[Paper Search] Strategy 1 (full URL):', originalUrl);
          result = await searchPosts(originalUrl, undefined, 'latest');
          console.log('[Paper Search] Strategy 1 results:', result.posts.length);
        }

        // Strategy 2: Try the URL without query params
        if (!loadMore && result.posts.length === 0 && originalUrl) {
          const urlNoParams = originalUrl.replace(/\?.*$/, '');
          if (urlNoParams !== originalUrl) {
            console.log('[Paper Search] Strategy 2 (URL without params):', urlNoParams);
            result = await searchPosts(urlNoParams, undefined, 'latest');
            console.log('[Paper Search] Strategy 2 results:', result.posts.length);
          }
        }

        // Strategy 3: Search for the DOI or paper ID (also used for pagination)
        if (result.posts.length === 0 || loadMore) {
          const searchQuery = getSearchQueryForPaper(paperId);
          console.log('[Paper Search] Strategy 3 (paper ID):', searchQuery, loadMore ? `cursor: ${searchCursor}` : '');
          const idResult = await searchPosts(searchQuery, loadMore ? searchCursor : undefined, 'latest');
          console.log('[Paper Search] Strategy 3 results:', idResult.posts.length);
          if (loadMore || result.posts.length === 0) {
            result = idResult;
          }
        }

        // Strategy 4: Try domain search as last resort
        if (!loadMore && result.posts.length === 0) {
          const fallbackUrl = originalUrl || getUrlFromPaperId(paperId);
          const domainMatch = fallbackUrl.match(/https?:\/\/([^/]+)/);
          if (domainMatch) {
            const pathParts = fallbackUrl.replace(/^https?:\/\/[^/]+/, '').split('/').filter(p => p && p.length > 3);
            const lastPart = pathParts[pathParts.length - 1]?.replace(/\?.*$/, '');
            if (lastPart) {
              const combinedQuery = `domain:${domainMatch[1]} ${lastPart}`;
              console.log('[Paper Search] Strategy 4 (domain + id):', combinedQuery);
              result = await searchPosts(combinedQuery, undefined, 'latest');
              console.log('[Paper Search] Strategy 4 results:', result.posts.length);
            }
          }
        }

        console.log('[Paper Search] Total raw results before filtering:', result.posts.length);
        newSearchCursor = result.cursor;

        // Filter results to only include posts that mention THIS specific paper
        searchResults = result.posts.filter(post => {
          const record = post.record as { text?: string; facets?: LinkFacet[] };
          const embedUri = post.embed && 'external' in post.embed
            ? (post.embed as AppBskyEmbedExternal.View).external?.uri
            : undefined;

          // Extract paper URL from the post
          const paperUrl = extractPaperUrl(record.text || '', embedUri, record.facets);
          if (paperUrl) {
            // Check if this paper URL matches the paper we're viewing
            const extractedPaperId = getPaperIdFromUrl(paperUrl);
            if (extractedPaperId === paperId) {
              return true;
            }
          }

          // Also accept posts containing the original URL we're searching for
          if (originalUrl) {
            const anyUrl = extractAnyUrl(record.text || '', embedUri, record.facets);
            if (anyUrl && (anyUrl === originalUrl || anyUrl.includes(originalUrl) || originalUrl.includes(anyUrl))) {
              return true;
            }
          }

          return false;
        });

        console.log('[Paper Search] Filtered results:', searchResults.length);
      } catch (searchErr) {
        console.log('[Paper Search] Search failed (continuing with DB results):', searchErr);
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

      console.log('[Paper] Total unique posts:', allPosts.length);

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
      console.error('Failed to fetch paper posts:', err);
      setError('Failed to load discussions');
    } finally {
      setPostsLoading(false);
    }
  }, [paperId, offset, searchCursor, originalUrl]);

  // Initial fetch when logged in
  useEffect(() => {
    if (isLoggedIn && paperId) {
      fetchPosts();
    }
  }, [isLoggedIn, paperId]); // Intentionally exclude fetchPosts to avoid re-fetching

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

  // Get unique authors who discussed this paper (from both live and fallback posts)
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
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
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
              onClick={() => window.location.href = buildProfileUrl(session?.handle || '', session?.did)}
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
            <span className="font-semibold text-gray-900 dark:text-gray-100">Paper Discussion</span>
          </div>

          {/* Paper Info Card */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-800">
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-800 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-purple-600 dark:text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  {paperInfo.title ? (
                    <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                      {paperInfo.title}
                    </h2>
                  ) : (
                    <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                      {getPaperTypeFromId(paperId)} Paper
                    </h2>
                  )}
                  <a
                    href={paperInfo.url || originalUrl || getUrlFromPaperId(paperId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    View on {paperInfo.source || getPaperTypeFromId(paperId)}
                  </a>
                </div>
              </div>

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
                  <span>{totalDiscussantCount} researcher{totalDiscussantCount !== 1 ? 's' : ''}</span>
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
                <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" />
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
                  Be the first to share your thoughts on this paper!
                </p>
                <a
                  href={paperInfo.url || originalUrl || getUrlFromPaperId(paperId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-4 py-2 text-sm bg-purple-500 text-white rounded-full hover:bg-purple-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  View paper
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
                      className="px-4 py-2 text-sm text-purple-500 hover:text-purple-600 disabled:opacity-50"
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

export default function PaperPage() {
  return (
    <SettingsProvider>
      <BookmarksProvider>
        <FeedsProvider>
          <FollowingProvider>
            <ComposerProvider>
              <Suspense fallback={
                <div className="min-h-screen bg-gray-50 dark:bg-black flex items-center justify-center">
                  <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
                </div>
              }>
                <PaperPageContent />
              </Suspense>
            </ComposerProvider>
          </FollowingProvider>
        </FeedsProvider>
      </BookmarksProvider>
    </SettingsProvider>
  );
}
