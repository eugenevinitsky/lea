'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { restoreSession, getSession, getBlueskyProfile, searchActors, searchPosts, isVerifiedResearcher, Label } from '@/lib/bluesky';
import { SettingsProvider } from '@/lib/settings';
import { BookmarksProvider, useBookmarks } from '@/lib/bookmarks';
import { FeedsProvider } from '@/lib/feeds';
import { FollowingProvider } from '@/lib/following-context';
import Login from '@/components/Login';
import Settings from '@/components/Settings';
import Bookmarks from '@/components/Bookmarks';
import DMSidebar from '@/components/DMSidebar';
import Notifications from '@/components/Notifications';
import ModerationBox from '@/components/ModerationBox';
import SafetyPanel from '@/components/SafetyPanel';
import ResearcherSearch from '@/components/ResearcherSearch';
import Post from '@/components/Post';
import { AppBskyFeedDefs } from '@atproto/api';

interface Researcher {
  did: string;
  handle: string;
  name: string | null;
  institution: string | null;
}

interface UserResult {
  did: string;
  handle: string;
  displayName: string | null;
  description: string | null;
  avatar?: string;
  isVerified: boolean;
}

function SearchPageContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') || '';
  
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'posts'>('users');
  const [userResults, setUserResults] = useState<UserResult[]>([]);
  const [postResults, setPostResults] = useState<AppBskyFeedDefs.PostView[]>([]);
  const [researchers, setResearchers] = useState<Researcher[]>([]);
  const [searching, setSearching] = useState(false);
  const [userCursor, setUserCursor] = useState<string | undefined>();
  const [postCursor, setPostCursor] = useState<string | undefined>();
  const [hasMoreUsers, setHasMoreUsers] = useState(true);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const { setUserDid } = useBookmarks();

  // Restore session on mount
  useEffect(() => {
    restoreSession().then((restored) => {
      if (restored) {
        setIsLoggedIn(true);
        const session = getSession();
        if (session?.did) {
          setUserDid(session.did);
          fetch(`/api/researchers?did=${session.did}`)
            .then(res => res.json())
            .then(data => {
              if (data.researchers?.some((r: { did: string }) => r.did === session.did)) {
                setIsVerified(true);
              }
            })
            .catch(() => {});
        }
      }
      setIsLoading(false);
    });
  }, [setUserDid]);

  // Fetch verified researchers list
  useEffect(() => {
    async function fetchResearchers() {
      try {
        const res = await fetch('/api/researchers');
        if (res.ok) {
          const data = await res.json();
          setResearchers(data.researchers || []);
        }
      } catch (err) {
        console.error('Failed to fetch researchers:', err);
      }
    }
    fetchResearchers();
  }, []);

  // Search when query changes
  useEffect(() => {
    if (!query.trim() || !isLoggedIn) return;

    async function performSearch() {
      setSearching(true);
      setUserResults([]);
      setPostResults([]);
      setUserCursor(undefined);
      setPostCursor(undefined);
      setHasMoreUsers(true);
      setHasMorePosts(true);

      try {
        const verifiedDids = new Set(researchers.map(r => r.did));
        
        // Search users and posts in parallel
        const [actorResults, postsResponse] = await Promise.all([
          searchActors(query, 25),
          searchPosts(query, undefined, 'top'),
        ]);

        // Process user results
        const users: UserResult[] = actorResults.map(actor => ({
          did: actor.did,
          handle: actor.handle,
          displayName: actor.displayName || null,
          description: actor.description || null,
          avatar: actor.avatar,
          isVerified: verifiedDids.has(actor.did) || isVerifiedResearcher(actor.labels as Label[] | undefined),
        }));

        // Sort: verified first
        users.sort((a, b) => {
          if (a.isVerified && !b.isVerified) return -1;
          if (!a.isVerified && b.isVerified) return 1;
          return 0;
        });

        setUserResults(users);
        setPostResults(postsResponse.posts);
        setPostCursor(postsResponse.cursor);
        setHasMorePosts(!!postsResponse.cursor);
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setSearching(false);
      }
    }

    performSearch();
  }, [query, isLoggedIn, researchers]);

  const loadMorePosts = useCallback(async () => {
    if (!postCursor || !hasMorePosts || searching) return;

    setSearching(true);
    try {
      const response = await searchPosts(query, postCursor, 'top');
      setPostResults(prev => [...prev, ...response.posts]);
      setPostCursor(response.cursor);
      setHasMorePosts(!!response.cursor);
    } catch (err) {
      console.error('Failed to load more posts:', err);
    } finally {
      setSearching(false);
    }
  }, [query, postCursor, hasMorePosts, searching]);

  const handleLogin = () => {
    setIsLoggedIn(true);
    const session = getSession();
    if (session?.did) {
      setUserDid(session.did);
    }
  };

  const navigateToProfile = useCallback(async (did: string) => {
    try {
      const profile = await getBlueskyProfile(did);
      if (profile?.handle) {
        window.location.href = `/u/${profile.handle}`;
      } else {
        window.location.href = `/u/${did}`;
      }
    } catch {
      window.location.href = `/u/${did}`;
    }
  }, []);

  const openThread = useCallback(async (uri: string | null) => {
    if (!uri) return;
    const match = uri.match(/^at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/);
    if (match) {
      const [, did, rkey] = match;
      try {
        const profile = await getBlueskyProfile(did);
        if (profile?.handle) {
          window.location.href = `/post/${profile.handle}/${rkey}`;
          return;
        }
      } catch {
        // Fall through
      }
      window.location.href = `/post/${did}/${rkey}`;
    }
  }, []);

  const handleSearch = useCallback((newQuery: string) => {
    window.location.href = `/search?q=${encodeURIComponent(newQuery)}`;
  }, []);

  const session = getSession();

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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/80 dark:bg-black/80 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1
              className="text-xl font-bold text-blue-500 cursor-pointer hover:text-blue-600 transition-colors"
              onClick={() => window.location.href = '/'}
            >Lea</h1>
          </div>
          <div className="flex items-center gap-3">
            <ResearcherSearch 
              onSelectResearcher={navigateToProfile} 
              onOpenThread={openThread}
              onSearch={handleSearch}
            />
            <button
              onClick={() => window.location.href = `/u/${session?.handle}`}
              className="px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-full transition-colors"
            >
              @{session?.handle}
            </button>
            {isVerified ? (
              <span
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 rounded-full"
                title="You are a verified researcher"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                </svg>
                Verified
              </span>
            ) : (
              <a
                href="https://lea-verify.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-500 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-full transition-colors"
                title="Get verified"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Get verified
              </a>
            )}
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
              title="Settings"
            >
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main layout */}
      <div className="max-w-5xl mx-auto flex gap-4 px-4">
        {/* Left Sidebar */}
        <aside className="hidden lg:block w-72 flex-shrink-0 sticky top-16 max-h-[calc(100vh-5rem)] overflow-y-auto pt-4 pb-4 space-y-4 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700">
          <Bookmarks onOpenPost={openThread} onOpenProfile={navigateToProfile} />
          <DMSidebar />
          <Notifications onOpenPost={openThread} onOpenProfile={navigateToProfile} />
          <ModerationBox onOpenProfile={navigateToProfile} />
          <SafetyPanel onOpenProfile={navigateToProfile} onOpenThread={openThread} />
        </aside>

        {/* Main content */}
        <main className="flex-1 max-w-xl bg-white dark:bg-gray-950 min-h-screen border-x border-gray-200 dark:border-gray-800">
          {/* Search header */}
          <div className="sticky top-14 z-10 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
            <div className="px-4 py-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                Search results for &ldquo;{query}&rdquo;
              </h2>
              <a
                href={`/search/advanced?q=${encodeURIComponent(query)}`}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                Advanced
              </a>
            </div>
            {/* Tabs */}
            <div className="flex border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setActiveTab('users')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'users'
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500 -mb-px'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                Users ({userResults.length})
              </button>
              <button
                onClick={() => setActiveTab('posts')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'posts'
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500 -mb-px'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                Posts ({postResults.length})
              </button>
            </div>
          </div>

          {/* Results */}
          {searching && userResults.length === 0 && postResults.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
          ) : (
            <>
              {/* Users tab */}
              {activeTab === 'users' && (
                <div className="divide-y divide-gray-200 dark:divide-gray-800">
                  {userResults.length === 0 ? (
                    <div className="px-4 py-12 text-center text-gray-500">
                      No users found for &ldquo;{query}&rdquo;
                    </div>
                  ) : (
                    userResults.map(user => (
                      <button
                        key={user.did}
                        onClick={() => navigateToProfile(user.did)}
                        className="w-full px-4 py-4 flex items-start gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                      >
                        {/* Avatar */}
                        <div className="relative flex-shrink-0">
                          {user.avatar ? (
                            <img
                              src={user.avatar}
                              alt=""
                              className="w-12 h-12 rounded-full"
                            />
                          ) : (
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                              user.isVerified 
                                ? 'bg-emerald-100 dark:bg-emerald-900/30' 
                                : 'bg-gray-200 dark:bg-gray-700'
                            }`}>
                              <span className={`text-lg font-medium ${
                                user.isVerified
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-gray-500 dark:text-gray-400'
                              }`}>
                                {(user.displayName || user.handle)[0].toUpperCase()}
                              </span>
                            </div>
                          )}
                          {user.isVerified && (
                            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center ring-2 ring-white dark:ring-gray-950">
                              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                        </div>
                        {/* User info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                              {user.displayName || user.handle}
                            </p>
                          </div>
                          <p className="text-sm text-gray-500 truncate">@{user.handle}</p>
                          {user.description && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                              {user.description}
                            </p>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* Posts tab */}
              {activeTab === 'posts' && (
                <div>
                  {postResults.length === 0 ? (
                    <div className="px-4 py-12 text-center text-gray-500">
                      No posts found for &ldquo;{query}&rdquo;
                    </div>
                  ) : (
                    <>
                      {postResults.map(post => (
                        <Post
                          key={post.uri}
                          post={post}
                          onOpenThread={openThread}
                          onOpenProfile={navigateToProfile}
                        />
                      ))}
                      {hasMorePosts && (
                        <div className="px-4 py-4 flex justify-center">
                          <button
                            onClick={loadMorePosts}
                            disabled={searching}
                            className="px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-colors disabled:opacity-50"
                          >
                            {searching ? 'Loading...' : 'Load more posts'}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Settings modal */}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default function SearchPage() {
  return (
    <SettingsProvider>
      <BookmarksProvider>
        <FeedsProvider>
          <FollowingProvider>
            <Suspense fallback={
              <div className="min-h-screen bg-gray-50 dark:bg-black flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
              </div>
            }>
              <SearchPageContent />
            </Suspense>
          </FollowingProvider>
        </FeedsProvider>
      </BookmarksProvider>
    </SettingsProvider>
  );
}
