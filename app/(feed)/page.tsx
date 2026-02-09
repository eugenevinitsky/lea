'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getBlueskyProfile, buildPostUrl } from '@/lib/bluesky';
import { useFeeds } from '@/lib/feeds';
import { useFeedLayout } from './layout';
import Feed from '@/components/Feed';
import ThreadView from '@/components/ThreadView';
import FeedDiscovery from '@/components/FeedDiscovery';
import Onboarding from '@/components/Onboarding';
import ProfileEditor from '@/components/ProfileEditor';
import RemixSettings from '@/components/RemixSettings';

export default function HomePage() {
  const router = useRouter();
  const { session, isOAuthCallback, navigateToProfile, postCreatedKey } = useFeedLayout();

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStartStep, setOnboardingStartStep] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showFeedDiscovery, setShowFeedDiscovery] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [activeFeedUri, setActiveFeedUri] = useState<string | null>(null);
  const [threadUri, setThreadUri] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [showRemixSettings, setShowRemixSettings] = useState(false);

  // Pull-to-refresh state
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const mainContentRef = useRef<HTMLElement>(null);

  const feedsContainerRef = React.useRef<HTMLDivElement>(null);
  const { pinnedFeeds, isLoaded: feedsLoaded, removeFeed, reorderFeeds } = useFeeds();

  // Open thread using client-side navigation with scroll position save
  const openThread = useCallback(async (uri: string | null) => {
    if (!uri) {
      setThreadUri(null);
      return;
    }

    const match = uri.match(/^at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/);
    if (match) {
      const [, did, rkey] = match;
      // Save scroll position before navigating so we can restore it on back
      sessionStorage.setItem('lea-scroll-position', window.scrollY.toString());
      sessionStorage.setItem('lea-scroll-feed', activeFeedUri || '');
      try {
        const profile = await getBlueskyProfile(did);
        if (profile?.handle) {
          router.push(buildPostUrl(profile.handle, rkey, profile.did));
          return;
        }
      } catch {
        // Fall through to use DID
      }
      router.push(buildPostUrl(did, rkey));
    } else {
      // Fallback: open in modal if URI format doesn't match
      setThreadUri(uri);
    }
  }, [activeFeedUri, router]);

  // Set active feed once feeds are loaded from localStorage
  useEffect(() => {
    // Wait until feeds are loaded from localStorage
    if (!feedsLoaded || pinnedFeeds.length === 0) return;
    
    // Only set if we haven't set one yet
    if (activeFeedUri === null) {
      // First check sessionStorage (for thread navigation back)
      let sessionFeed: string | null = null;
      let savedLocalFeed: string | null = null;
      try {
        sessionFeed = sessionStorage.getItem('lea-scroll-feed');
        savedLocalFeed = localStorage.getItem('lea-active-feed');
      } catch {
        // localStorage may fail in private browsing
      }
      // Then check localStorage (for page refresh persistence)
      const savedFeed = sessionFeed || savedLocalFeed;
      
      if (savedFeed && pinnedFeeds.some(f => f.uri === savedFeed)) {
        // Saved feed exists and is in pinned feeds
        setActiveFeedUri(savedFeed);
      } else {
        // Default to first feed
        setActiveFeedUri(pinnedFeeds[0].uri);
      }
    } else {
      // Validate current feed is still in pinned feeds
      if (!pinnedFeeds.some(f => f.uri === activeFeedUri)) {
        setActiveFeedUri(pinnedFeeds[0].uri);
      }
    }
  }, [feedsLoaded, pinnedFeeds, activeFeedUri]);

  // Save active feed to localStorage whenever it changes
  useEffect(() => {
    if (activeFeedUri) {
      try {
        localStorage.setItem('lea-active-feed', activeFeedUri);
      } catch {
        // localStorage may fail in private browsing
      }
    }
  }, [activeFeedUri]);

  // Track the previous feed URI to detect actual feed changes
  const prevFeedUriRef = useRef<string | null>(null);

  // Scroll active feed tab into view and scroll page to top when feed changes
  useEffect(() => {
    if (!activeFeedUri || !feedsContainerRef.current) return;
    const container = feedsContainerRef.current;
    const activeIndex = pinnedFeeds.findIndex(f => f.uri === activeFeedUri);
    if (activeIndex === -1) return;
    
    // Find the active button element
    const buttons = container.querySelectorAll('button[draggable="true"]');
    const activeButton = buttons[activeIndex] as HTMLElement | undefined;
    if (activeButton) {
      // Scroll the button into view within the container
      const containerRect = container.getBoundingClientRect();
      const buttonRect = activeButton.getBoundingClientRect();
      
      // Check if button is outside visible area
      if (buttonRect.left < containerRect.left || buttonRect.right > containerRect.right) {
        activeButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
    
    // Scroll page to top when switching feeds (but not on initial load)
    if (prevFeedUriRef.current !== null && prevFeedUriRef.current !== activeFeedUri) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    prevFeedUriRef.current = activeFeedUri;
  }, [activeFeedUri, pinnedFeeds]);

  // Scroll restoration after back navigation is handled by Feed.tsx's useLayoutEffect
  // which fires at the right time — after cached posts are committed to the DOM.

  // Handle onboarding detection
  useEffect(() => {
    if (!session?.did) return;

    if (isOAuthCallback) {
      // Check for force onboarding flag from login page
      const forceOnboarding = sessionStorage.getItem('lea-force-onboarding');
      if (forceOnboarding) {
        sessionStorage.removeItem('lea-force-onboarding');
        setShowOnboarding(true);
      } else {
        let onboardingComplete: string | null = null;
        try {
          onboardingComplete = localStorage.getItem('lea-onboarding-complete');
        } catch {
          // localStorage may fail in private browsing
        }
        if (!onboardingComplete) {
          setShowOnboarding(true);
        }
      }
    } else {
      // Session restored (not a callback)
      let onboardingComplete: string | null = null;
      try {
        onboardingComplete = localStorage.getItem('lea-onboarding-complete');
      } catch {
        // localStorage may fail in private browsing
      }
      if (!onboardingComplete) {
        setShowOnboarding(true);
      }
    }
  }, [session?.did, isOAuthCallback]);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    setOnboardingStartStep(1); // Reset for next time
  };

  // Refresh feed when a post is created via the composer
  useEffect(() => {
    if (postCreatedKey > 0) {
      setRefreshKey(k => k + 1);
    }
  }, [postCreatedKey]);

  // Pull-to-refresh handlers
  const PULL_THRESHOLD = 80;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only enable pull-to-refresh when at top of page
    if (window.scrollY === 0) {
      touchStartY.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling || isRefreshing) return;

    const currentY = e.touches[0].clientY;
    const distance = Math.max(0, currentY - touchStartY.current);

    // Apply resistance to pull
    const resistedDistance = Math.min(distance * 0.5, 120);
    setPullDistance(resistedDistance);
  }, [isPulling, isRefreshing]);

  const handleTouchEnd = useCallback(() => {
    if (!isPulling) return;

    if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
      // Trigger refresh
      setIsRefreshing(true);
      setPullDistance(50); // Keep some distance while refreshing
      setRefreshKey(k => k + 1);

      // Reset after a delay
      setTimeout(() => {
        setIsRefreshing(false);
        setPullDistance(0);
      }, 1000);
    } else {
      setPullDistance(0);
    }

    setIsPulling(false);
  }, [isPulling, pullDistance, isRefreshing]);

  if (showOnboarding) {
    return (
      <div className="fixed inset-0 z-50">
        <Onboarding onComplete={handleOnboardingComplete} startAtStep={onboardingStartStep} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-start min-w-0 max-w-full lg:max-w-[calc(576px+180px)]">
      {/* Main content - full width on mobile, constrained on desktop */}
      <main
        ref={mainContentRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="flex-1 w-full min-w-0 max-w-full lg:max-w-xl bg-white dark:bg-gray-950 min-h-screen lg:border-l border-gray-200 dark:border-gray-800 lg:border-r"
        style={{ transform: `translateY(${pullDistance}px)`, transition: isPulling ? 'none' : 'transform 0.2s ease-out' }}
      >
        {/* Pull-to-refresh indicator */}
        {(pullDistance > 0 || isRefreshing) && (
          <div
            className="lg:hidden absolute left-0 right-0 flex items-center justify-center pointer-events-none"
            style={{ top: -50, height: 50 }}
          >
            <div className={`w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full ${isRefreshing ? 'animate-spin' : ''}`}
              style={{ transform: `rotate(${pullDistance * 3}deg)` }}
            />
          </div>
        )}

        {/* Mobile Feed Tabs - horizontal, sticky below header */}
        <div className="lg:hidden relative border-b border-gray-200 dark:border-gray-800 sticky top-14 z-10 bg-white dark:bg-gray-950">
          <div
            ref={feedsContainerRef}
            className="flex overflow-x-auto scrollbar-hide"
          >
            {pinnedFeeds.map((feed, index) => {
              const isActive = activeFeedUri === feed.uri || (activeFeedUri === null && index === 0);
              const isSkygest = feed.uri.includes('preprintdigest');
              const isKeyword = feed.type === 'keyword';
              const isRemix = feed.type === 'remix' || feed.uri === 'remix';

              return (
                <button
                  key={feed.uri}
                  onClick={() => setActiveFeedUri(feed.uri)}
                  className={`flex-shrink-0 px-4 py-3 text-base font-medium transition-colors relative flex items-center justify-center gap-1 ${
                    isActive
                      ? (isSkygest || isKeyword) ? 'text-purple-500' : isRemix ? 'text-emerald-500' : 'text-blue-500'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  {isSkygest && (
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  )}
                  {isKeyword && (
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  )}
                  {isRemix && (
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  )}
                  <span className="whitespace-nowrap">{feed.displayName}</span>
                  {isActive && (
                    <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${
                      (isSkygest || isKeyword) ? 'bg-purple-500' : isRemix ? 'bg-emerald-500' : 'bg-blue-500'
                    }`} />
                  )}
                </button>
              );
            })}
            {/* Feed settings button in mobile tab bar */}
            <button
              onClick={() => setShowFeedDiscovery(true)}
              className="flex-shrink-0 px-3 py-3 text-gray-400 hover:text-blue-500 transition-colors"
              title="Manage feeds"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
              </svg>
            </button>
          </div>
        </div>

        {/* Feed Content */}
        {activeFeedUri && (() => {
          const activeFeed = pinnedFeeds.find(f => f.uri === activeFeedUri);
          return (
            <Feed
              key={activeFeedUri}
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

      {/* Right Sidebar - Vertical Feed Tabs (desktop only) */}
      <aside className="hidden lg:flex flex-col w-[180px] flex-shrink-0 sticky top-14 self-start max-h-[calc(100vh-3.5rem)] bg-gray-50 dark:bg-gray-900 border-r border-l border-gray-200 dark:border-gray-800">
        {/* Top buttons: Refresh and Scroll to top */}
        <div className="flex border-b border-gray-200 dark:border-gray-800">
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            className="flex-1 p-2 text-gray-500 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center justify-center"
            title="Refresh feed"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex-1 p-2 text-gray-500 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center justify-center border-l border-gray-200 dark:border-gray-800"
            title="Scroll to top"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </button>
        </div>

        {/* Feed tabs */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700">
          {pinnedFeeds.map((feed, index) => {
            const isActive = activeFeedUri === feed.uri || (activeFeedUri === null && index === 0);
            const isSkygest = feed.uri.includes('preprintdigest');
            const isKeyword = feed.type === 'keyword';
            const isRemix = feed.type === 'remix' || feed.uri === 'remix';
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
                className={`w-full px-3 py-2.5 text-sm font-medium transition-colors relative flex items-center gap-1.5 group cursor-grab active:cursor-grabbing ${
                  isDragging ? 'opacity-50' : ''
                } ${
                  isDragOver ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                } ${
                  isActive
                    ? `bg-white dark:bg-gray-950 border-l-0 ${
                        (isSkygest || isKeyword) ? 'text-purple-500' : isRemix ? 'text-emerald-500' : 'text-blue-500'
                      }`
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                title="Drag to reorder"
              >
                {isSkygest && (
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
                {isKeyword && (
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                )}
                {isRemix && (
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                <span className="truncate flex-1 text-left">{feed.displayName}</span>
                {/* Settings button for Remix feed */}
                {isRemix && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowRemixSettings(true);
                    }}
                    className="p-0.5 text-gray-400 hover:text-emerald-500 transition-colors opacity-0 group-hover:opacity-100"
                    title="Remix settings"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                  </button>
                )}
                {/* Info button for custom feed generators */}
                {feed.uri.includes('/app.bsky.feed.generator/') && (() => {
                  const match = feed.uri.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.generator\/([^/]+)$/);
                  if (match) {
                    const [, didOrHandle, rkey] = match;
                    return (
                      <a
                        href={`/feed/${didOrHandle}/${rkey}`}
                        onClick={(e) => e.stopPropagation()}
                        className="p-0.5 text-gray-400 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100"
                        title="Feed info"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </a>
                    );
                  }
                  return null;
                })()}
                {isDragOver && (
                  <div className="absolute left-0 right-0 top-0 h-0.5 bg-blue-500" />
                )}
              </button>
            );
          })}
          {/* Settings button - right after last feed tab */}
          <button
            onClick={() => setShowFeedDiscovery(true)}
            className="w-full px-3 py-2.5 text-gray-500 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-2 border-t border-gray-200 dark:border-gray-800"
            title="Manage feeds"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-sm font-medium">Feeds</span>
          </button>
        </div>
      </aside>

      {/* Thread View Modal */}
      {threadUri && (
        <ThreadView uri={threadUri} onClose={() => openThread(null)} />
      )}

      {/* Feed Discovery modal */}
      {showFeedDiscovery && <FeedDiscovery onClose={() => setShowFeedDiscovery(false)} />}

      {/* Profile Editor modal */}
      {showProfileEditor && <ProfileEditor onClose={() => setShowProfileEditor(false)} />}

      {/* Remix Settings modal */}
      <RemixSettings
        isOpen={showRemixSettings}
        onClose={() => setShowRemixSettings(false)}
      />
    </div>
  );
}
