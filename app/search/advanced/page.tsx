'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { getSession, getBlueskyProfile, searchPosts, isVerifiedResearcher, Label, SearchPostsFilters, buildProfileUrl, checkVerificationStatus } from '@/lib/bluesky';
import { initOAuth } from '@/lib/oauth';
import { refreshAgent } from '@/lib/bluesky';
import { SettingsProvider } from '@/lib/settings';
import { BookmarksProvider, useBookmarks } from '@/lib/bookmarks';
import { FeedsProvider } from '@/lib/feeds';
import { FollowingProvider } from '@/lib/following-context';
import Login from '@/components/Login';
import Bookmarks from '@/components/Bookmarks';
import DMSidebar from '@/components/DMSidebar';
import Notifications from '@/components/Notifications';
import ModerationBox from '@/components/ModerationBox';
import SafetyPanel from '@/components/SafetyPanel';
import SettingsPanel from '@/components/SettingsPanel';
import ResearcherSearch from '@/components/ResearcherSearch';
import AdvancedSearch from '@/components/AdvancedSearch';
import Onboarding from '@/components/Onboarding';
import Post from '@/components/Post';
import { AppBskyFeedDefs } from '@atproto/api';

interface Researcher {
  did: string;
  handle: string;
  name: string | null;
  institution: string | null;
}

function AdvancedSearchPageContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifiedUser, setIsVerifiedUser] = useState(false);
  const [postResults, setPostResults] = useState<AppBskyFeedDefs.PostView[]>([]);
  const [researchers, setResearchers] = useState<Researcher[]>([]);
  const [searching, setSearching] = useState(false);
  const [postCursor, setPostCursor] = useState<string | undefined>();
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [currentQuery, setCurrentQuery] = useState('');
  const [currentFilters, setCurrentFilters] = useState<SearchPostsFilters>({});
  const [currentVerifiedOnly, setCurrentVerifiedOnly] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStartStep, setOnboardingStartStep] = useState(1);
  const { setUserDid } = useBookmarks();

  // Restore session on mount
  useEffect(() => {
    initOAuth().then((result) => { refreshAgent(); const restored = !!result?.session;
      if (restored) {
        setIsLoggedIn(true);
        const session = getSession();
        if (session?.did) {
          setUserDid(session.did);
          checkVerificationStatus(session.did).then(setIsVerifiedUser);
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

  const performSearch = useCallback(async (query: string, filters: SearchPostsFilters, verifiedOnly: boolean) => {
    setSearching(true);
    setPostResults([]);
    setPostCursor(undefined);
    setHasMorePosts(true);
    setCurrentQuery(query);
    setCurrentFilters(filters);
    setCurrentVerifiedOnly(verifiedOnly);
    setHasSearched(true);

    // Build verified researcher DIDs set for filtering
    const verifiedDids = new Set(researchers.map(r => r.did));

    try {
      // If searching with no query but with filters, use a wildcard
      const searchQuery = query || '*';
      const response = await searchPosts(searchQuery, undefined, 'top', filters);
      
      let posts = response.posts;
      
      // Filter to verified researchers only if requested
      if (verifiedOnly) {
        posts = posts.filter(post => verifiedDids.has(post.author.did));
      }
      
      setPostResults(posts);
      setPostCursor(response.cursor);
      setHasMorePosts(!!response.cursor);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearching(false);
    }
  }, [researchers]);

  const loadMorePosts = useCallback(async () => {
    if (!postCursor || !hasMorePosts || searching) return;

    setSearching(true);
    const verifiedDids = new Set(researchers.map(r => r.did));
    
    try {
      const searchQuery = currentQuery || '*';
      const response = await searchPosts(searchQuery, postCursor, 'top', currentFilters);
      
      let posts = response.posts;
      if (currentVerifiedOnly) {
        posts = posts.filter(post => verifiedDids.has(post.author.did));
      }
      
      setPostResults(prev => [...prev, ...posts]);
      setPostCursor(response.cursor);
      setHasMorePosts(!!response.cursor);
    } catch (err) {
      console.error('Failed to load more posts:', err);
    } finally {
      setSearching(false);
    }
  }, [currentQuery, currentFilters, currentVerifiedOnly, postCursor, hasMorePosts, searching, researchers]);

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
        window.location.href = buildProfileUrl(profile.handle, profile.did);
      } else {
        window.location.href = buildProfileUrl(did);
      }
    } catch {
      window.location.href = buildProfileUrl(did);
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
          window.location.href = `/profile/${profile.handle}/post/${rkey}`;
          return;
        }
      } catch {
        // Fall through
      }
      window.location.href = `/profile/${did}/post/${rkey}`;
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

  if (showOnboarding) {
    return <Onboarding onComplete={() => { setShowOnboarding(false); setOnboardingStartStep(1); }} startAtStep={onboardingStartStep} />;
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
              onClick={() => {
                setOnboardingStartStep(3);
                setShowOnboarding(true);
              }}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
              title="Discover Researchers"
            >
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </button>
            <button
              onClick={() => window.location.href = buildProfileUrl(session?.handle || '', session?.did)}
              className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors flex items-center gap-1.5 ${
                isVerifiedUser
                  ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                  : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50'
              }`}
              title={isVerifiedUser ? 'Verified researcher' : undefined}
            >
              @{session?.handle}
              {isVerifiedUser && (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main layout */}
      <div className="max-w-5xl mx-auto flex gap-4 px-0 lg:px-4">
        {/* Left Sidebar */}
        <aside className="hidden lg:block w-72 flex-shrink-0 sticky top-16 max-h-[calc(100vh-5rem)] overflow-y-auto pt-4 pb-4 space-y-4 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700">
          <Bookmarks onOpenPost={openThread} onOpenProfile={navigateToProfile} />
          <DMSidebar />
          <Notifications onOpenPost={openThread} onOpenProfile={navigateToProfile} />
          <ModerationBox onOpenProfile={navigateToProfile} />
          <SafetyPanel onOpenProfile={navigateToProfile} onOpenThread={openThread} />
          <SettingsPanel />
        </aside>

        {/* Main content */}
        <main className="flex-1 max-w-2xl bg-white dark:bg-gray-950 min-h-screen border-x border-gray-200 dark:border-gray-800">
          {/* Page header */}
          <div className="sticky top-14 z-10 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.history.back()}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                Advanced Search
              </h2>
            </div>
          </div>

          {/* Advanced search form */}
          <div className="p-4">
            <AdvancedSearch 
              initialQuery={initialQuery}
              onSearch={performSearch}
            />
          </div>

          {/* Results */}
          <div className="border-t border-gray-200 dark:border-gray-800">
            {searching && postResults.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
              </div>
            ) : hasSearched ? (
              <>
                {postResults.length === 0 ? (
                  <div className="px-4 py-12 text-center text-gray-500">
                    No posts found matching your criteria
                  </div>
                ) : (
                  <>
                    <div className="px-4 py-2 text-sm text-gray-500 border-b border-gray-200 dark:border-gray-800">
                      {postResults.length} result{postResults.length !== 1 ? 's' : ''}
                    </div>
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
                          {searching ? 'Loading...' : 'Load more'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <div className="px-4 py-12 text-center text-gray-500">
                <svg className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Search with filters
                </p>
                <p className="text-sm">
                  Use the filters above to find posts from specific users, date ranges, or containing certain links.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function AdvancedSearchPage() {
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
              <AdvancedSearchPageContent />
            </Suspense>
          </FollowingProvider>
        </FeedsProvider>
      </BookmarksProvider>
    </SettingsProvider>
  );
}
