'use client';

import { useState, useCallback, useEffect, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSession, logout, restoreSession, getBlueskyProfile } from '@/lib/bluesky';
import { SettingsProvider } from '@/lib/settings';
import { BookmarksProvider } from '@/lib/bookmarks';
import { FeedsProvider, useFeeds } from '@/lib/feeds';
import Login from '@/components/Login';
import Feed from '@/components/Feed';
import Composer from '@/components/Composer';
import Settings from '@/components/Settings';
import Bookmarks from '@/components/Bookmarks';
import ThreadView from '@/components/ThreadView';
import DMSidebar from '@/components/DMSidebar';
import Notifications from '@/components/Notifications';
import FeedDiscovery from '@/components/FeedDiscovery';
import Onboarding from '@/components/Onboarding';
import ProfileEditor from '@/components/ProfileEditor';
import ResearcherSearch from '@/components/ResearcherSearch';

function AppContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStartStep, setOnboardingStartStep] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showFeedDiscovery, setShowFeedDiscovery] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [activeFeedUri, setActiveFeedUri] = useState<string | null>(null);
  const [threadUri, setThreadUri] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const { pinnedFeeds, removeFeed, reorderFeeds } = useFeeds();

  // Track if we're intentionally closing to avoid race condition with URL sync
  const isClosingRef = useRef(false);

  // Open thread and update URL
  const openThread = useCallback((uri: string | null) => {
    if (!uri) {
      isClosingRef.current = true;
    }
    setThreadUri(uri);
    if (uri) {
      // Update URL with post parameter (shallow routing)
      const params = new URLSearchParams(searchParams.toString());
      params.set('post', uri);
      router.push(`?${params.toString()}`, { scroll: false });
    } else {
      // Remove post parameter from URL
      const params = new URLSearchParams(searchParams.toString());
      params.delete('post');
      const newUrl = params.toString() ? `?${params.toString()}` : '/';
      router.push(newUrl, { scroll: false });
    }
  }, [router, searchParams]);

  // Check URL for post parameter on mount and when searchParams change
  useEffect(() => {
    const postUri = searchParams.get('post');
    if (postUri && !threadUri && !isClosingRef.current) {
      setThreadUri(postUri);
    }
    // Reset closing flag when URL actually updates (no post param)
    if (!postUri) {
      isClosingRef.current = false;
    }
  }, [searchParams, threadUri]);

  // Set active feed to first pinned feed when feeds load
  useEffect(() => {
    if (pinnedFeeds.length > 0 && activeFeedUri === null) {
      setActiveFeedUri(pinnedFeeds[0].uri);
    }
  }, [pinnedFeeds, activeFeedUri]);

  // Try to restore session on mount
  useEffect(() => {
    restoreSession().then((restored) => {
      if (restored) {
        setIsLoggedIn(true);
        // Check if onboarding was completed
        const onboardingComplete = localStorage.getItem('lea-onboarding-complete');
        if (!onboardingComplete) {
          setShowOnboarding(true);
        }
        // Check verification status
        const session = getSession();
        if (session?.did) {
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
  }, []);

  const handleLogin = (forceOnboarding?: boolean) => {
    setIsLoggedIn(true);
    // Check if this is a first-time user or if onboarding is forced
    const onboardingComplete = localStorage.getItem('lea-onboarding-complete');
    if (forceOnboarding || !onboardingComplete) {
      setShowOnboarding(true);
    }
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    setOnboardingStartStep(1); // Reset for next time
  };

  const handleLogout = () => {
    logout();
    setIsLoggedIn(false);
  };

  const handlePost = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  // Navigate to a profile by DID - resolves handle for URL
  const navigateToProfile = useCallback(async (did: string) => {
    try {
      const profile = await getBlueskyProfile(did);
      if (profile?.handle) {
        router.push(`/${profile.handle}`);
      }
    } catch (err) {
      console.error('Failed to navigate to profile:', err);
    }
  }, [router]);

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
    return <Onboarding onComplete={handleOnboardingComplete} startAtStep={onboardingStartStep} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/80 dark:bg-black/80 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 
            className="text-xl font-bold text-blue-500 cursor-pointer hover:text-blue-600 transition-colors"
            onClick={() => window.location.reload()}
          >Lea</h1>
          <div className="flex items-center gap-3">
            <ResearcherSearch onSelectResearcher={navigateToProfile} />
            <button
              onClick={() => router.push(`/${session?.handle}`)}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
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
              onClick={() => setShowSettings(true)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
              title="Settings"
            >
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main layout with sidebar */}
      <div className="max-w-5xl mx-auto flex gap-4 px-4">
        {/* Left Sidebar - Bookmarks & Messages */}
        <aside className="hidden lg:block w-72 flex-shrink-0 sticky top-16 h-fit pt-4 space-y-4">
          <Bookmarks onOpenPost={openThread} onOpenProfile={navigateToProfile} />
          <DMSidebar />
          <Notifications onOpenPost={openThread} onOpenProfile={navigateToProfile} />
        </aside>

        {/* Main content */}
        <main className="flex-1 max-w-xl bg-white dark:bg-gray-950 min-h-screen border-x border-gray-200 dark:border-gray-800">
          {/* Composer */}
          <Composer onPost={handlePost} />

          {/* Feed Tabs - sticky below header when scrolling */}
          <div className="flex border-b border-gray-200 dark:border-gray-800 sticky top-14 z-10 bg-white dark:bg-gray-950 overflow-x-auto scrollbar-hide">
            {pinnedFeeds.map((feed, index) => {
              const isActive = activeFeedUri === feed.uri || (activeFeedUri === null && index === 0);
              const isSkygest = feed.uri.includes('preprintdigest');
              const isKeyword = feed.type === 'keyword';
              const isDragging = draggedIndex === index;
              const isDragOver = dragOverIndex === index && draggedIndex !== index;

              return (
                <button
                  key={feed.uri}
                  draggable
                  onDragStart={(e) => {
                    setDraggedIndex(index);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDragOverIndex(index);
                  }}
                  onDragLeave={() => {
                    setDragOverIndex(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedIndex !== null && draggedIndex !== index) {
                      reorderFeeds(draggedIndex, index);
                    }
                    setDraggedIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDragEnd={() => {
                    setDraggedIndex(null);
                    setDragOverIndex(null);
                  }}
                  onClick={() => setActiveFeedUri(feed.uri)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (pinnedFeeds.length > 1) {
                      removeFeed(feed.uri);
                      if (isActive) {
                        setActiveFeedUri(pinnedFeeds[0].uri === feed.uri ? pinnedFeeds[1]?.uri : pinnedFeeds[0].uri);
                      }
                    }
                  }}
                  className={`flex-shrink-0 px-4 py-3 text-sm font-medium transition-colors relative flex items-center justify-center gap-1.5 group cursor-grab active:cursor-grabbing ${
                    isDragging ? 'opacity-50' : ''
                  } ${
                    isDragOver ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  } ${
                    isActive
                      ? (isSkygest || isKeyword) ? 'text-purple-500' : 'text-blue-500'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                  title="Drag to reorder • Right-click to unpin"
                >
                  {isSkygest && (
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  )}
                  {isKeyword && (
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  )}
                  <span className="whitespace-nowrap">{feed.displayName}</span>
                  {isActive && (
                    <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${
                      (isSkygest || isKeyword) ? 'bg-purple-500' : 'bg-blue-500'
                    }`} />
                  )}
                  {isDragOver && (
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500" />
                  )}
                </button>
              );
            })}
            {/* Add feed button */}
            <button
              onClick={() => setShowFeedDiscovery(true)}
              className="flex-shrink-0 px-3 py-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Add feeds"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            </button>
          </div>

          {/* Feed Content */}
          {activeFeedUri && (() => {
            const activeFeed = pinnedFeeds.find(f => f.uri === activeFeedUri);
            return (
              <Feed
                feedUri={activeFeedUri}
                feedName={activeFeed?.displayName}
                acceptsInteractions={activeFeed?.acceptsInteractions}
                feedType={activeFeed?.type}
                keyword={activeFeed?.keyword}
                refreshKey={refreshKey}
                onOpenProfile={navigateToProfile}
                onOpenThread={openThread}
              />
            );
          })()}
        </main>
      </div>

      {/* Thread View Modal */}
      {threadUri && (
        <ThreadView uri={threadUri} onClose={() => openThread(null)} />
      )}

      {/* Settings modal */}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}

      {/* Feed Discovery modal */}
      {showFeedDiscovery && <FeedDiscovery onClose={() => setShowFeedDiscovery(false)} />}

      {/* Profile Editor modal */}
      {showProfileEditor && <ProfileEditor onClose={() => setShowProfileEditor(false)} />}
    </div>
  );
}

export default function Home() {
  return (
    <SettingsProvider>
      <BookmarksProvider>
        <FeedsProvider>
          <Suspense fallback={
            <div className="min-h-screen bg-gray-50 dark:bg-black flex items-center justify-center">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
          }>
            <AppContent />
          </Suspense>
        </FeedsProvider>
      </BookmarksProvider>
    </SettingsProvider>
  );
}
