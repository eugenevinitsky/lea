'use client';

import React, { useState, useCallback, useEffect, Suspense, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, logout, restoreSession, getBlueskyProfile } from '@/lib/bluesky';
import { SettingsProvider } from '@/lib/settings';
import { BookmarksProvider, useBookmarks } from '@/lib/bookmarks';
import { FeedsProvider, useFeeds } from '@/lib/feeds';
import { FollowingProvider } from '@/lib/following-context';
import { useModeration } from '@/lib/moderation';
import Login from '@/components/Login';
import Feed from '@/components/Feed';
import Composer from '@/components/Composer';
import Bookmarks from '@/components/Bookmarks';
import ThreadView from '@/components/ThreadView';
import DMSidebar from '@/components/DMSidebar';
import Notifications from '@/components/Notifications';
import ModerationBox from '@/components/ModerationBox';
import SafetyPanel from '@/components/SafetyPanel';
import FeedDiscovery from '@/components/FeedDiscovery';
import Onboarding from '@/components/Onboarding';
import ProfileEditor from '@/components/ProfileEditor';
import ResearcherSearch from '@/components/ResearcherSearch';

function AppContent() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStartStep, setOnboardingStartStep] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showFeedDiscovery, setShowFeedDiscovery] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [activeFeedUri, setActiveFeedUri] = useState<string | null>(null);
  const [threadUri, setThreadUri] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [showMobileComposer, setShowMobileComposer] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showMobileBookmarks, setShowMobileBookmarks] = useState(false);
  const [showMobileNotifications, setShowMobileNotifications] = useState(false);
  const [showMobileModeration, setShowMobileModeration] = useState(false);
  const [showMobileDMs, setShowMobileDMs] = useState(false);
  const [showMobileDiscoverPapers, setShowMobileDiscoverPapers] = useState(false);

  // Pull-to-refresh state
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const mainContentRef = useRef<HTMLElement>(null);

  const feedsContainerRef = React.useRef<HTMLDivElement>(null);
  const { pinnedFeeds, isLoaded: feedsLoaded, removeFeed, reorderFeeds, setUserDid: setFeedsUserDid } = useFeeds();
  const { setUserDid: setBookmarksUserDid } = useBookmarks();
  const { refreshModerationOpts } = useModeration();

  // Open thread by navigating to shareable post URL
  const openThread = useCallback(async (uri: string | null) => {
    if (!uri) {
      setThreadUri(null);
      return;
    }

    // Parse the AT URI to extract DID and rkey
    // Format: at://did:plc:xxx/app.bsky.feed.post/rkey
    const match = uri.match(/^at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/);
    if (match) {
      const [, did, rkey] = match;
      // Save scroll position before navigating so we can restore it on back
      sessionStorage.setItem('lea-scroll-position', window.scrollY.toString());
      sessionStorage.setItem('lea-scroll-feed', activeFeedUri || '');
      // Try to resolve DID to handle for cleaner URL
      try {
        const profile = await getBlueskyProfile(did);
        if (profile?.handle) {
          window.location.href = `/post/${profile.handle}/${rkey}`;
          return;
        }
      } catch {
        // Fall through to use DID
      }
      window.location.href = `/post/${did}/${rkey}`;
    } else {
      // Fallback: open in modal if URI format doesn't match
      setThreadUri(uri);
    }
  }, [activeFeedUri]);

  // Set active feed once feeds are loaded from localStorage
  useEffect(() => {
    // Wait until feeds are loaded from localStorage
    if (!feedsLoaded || pinnedFeeds.length === 0) return;
    
    // Only set if we haven't set one yet
    if (activeFeedUri === null) {
      // First check sessionStorage (for thread navigation back)
      const sessionFeed = sessionStorage.getItem('lea-scroll-feed');
      // Then check localStorage (for page refresh persistence)
      const savedFeed = sessionFeed || localStorage.getItem('lea-active-feed');
      
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
      localStorage.setItem('lea-active-feed', activeFeedUri);
    }
  }, [activeFeedUri]);

  // Check scroll state for feed tabs
  const checkScrollState = useCallback(() => {
    const container = feedsContainerRef.current;
    if (container) {
      setCanScrollLeft(container.scrollLeft > 0);
      setCanScrollRight(container.scrollLeft < container.scrollWidth - container.clientWidth - 1);
    }
  }, []);

  useEffect(() => {
    const container = feedsContainerRef.current;
    if (container) {
      // Check immediately and after a short delay to catch late renders
      checkScrollState();
      const timer = setTimeout(checkScrollState, 100);
      container.addEventListener('scroll', checkScrollState);
      window.addEventListener('resize', checkScrollState);
      return () => {
        clearTimeout(timer);
        container.removeEventListener('scroll', checkScrollState);
        window.removeEventListener('resize', checkScrollState);
      };
    }
  }, [checkScrollState, pinnedFeeds]);

  // Restore scroll position after navigating back from a thread
  useEffect(() => {
    const savedPosition = sessionStorage.getItem('lea-scroll-position');
    if (savedPosition) {
      const targetY = parseInt(savedPosition, 10);
      // Try to scroll after content loads, with retries
      let attempts = 0;
      const tryScroll = () => {
        attempts++;
        window.scrollTo(0, targetY);
        // If we couldn't scroll far enough and haven't tried too many times, retry
        if (window.scrollY < targetY - 100 && attempts < 10) {
          setTimeout(tryScroll, 200);
        } else {
          // Clear the saved position
          sessionStorage.removeItem('lea-scroll-position');
          sessionStorage.removeItem('lea-scroll-feed');
        }
      };
      // Initial delay to let feed start loading
      const timer = setTimeout(tryScroll, 300);
      return () => clearTimeout(timer);
    }
  }, []);

  // Try to restore session on mount
  useEffect(() => {
    restoreSession().then((restored) => {
      if (restored) {
        setIsLoggedIn(true);
        // Set user DID for bookmarks and feeds
        const session = getSession();
        if (session?.did) {
          setBookmarksUserDid(session.did);
          setFeedsUserDid(session.did);
        }
        // Refresh moderation options now that we have a session
        refreshModerationOpts();
        // Check if onboarding was completed
        const onboardingComplete = localStorage.getItem('lea-onboarding-complete');
        if (!onboardingComplete) {
          setShowOnboarding(true);
        }
        // Check verification status
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
  }, [setBookmarksUserDid, setFeedsUserDid, refreshModerationOpts]);

  const handleLogin = (forceOnboarding?: boolean) => {
    setIsLoggedIn(true);
    // Set user DID for bookmarks and feeds
    const session = getSession();
    if (session?.did) {
      setBookmarksUserDid(session.did);
      setFeedsUserDid(session.did);
    }
    // Refresh moderation options now that we have a session
    refreshModerationOpts();
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
    setBookmarksUserDid(null);
    setFeedsUserDid(null);
  };

  const handlePost = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

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

  // Navigate to a profile by DID - resolves handle for URL, falls back to DID if needed
  const navigateToProfile = useCallback(async (did: string) => {
    try {
      const profile = await getBlueskyProfile(did);
      if (profile?.handle) {
        // Use window.location for reliable navigation (Next.js router.push was unreliable)
        window.location.href = `/u/${profile.handle}`;
      } else {
        // Fallback: use DID directly if profile fetch failed
        window.location.href = `/u/${did}`;
      }
    } catch {
      // Fallback on error: navigate using DID
      window.location.href = `/u/${did}`;
    }
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
    return <Onboarding onComplete={handleOnboardingComplete} startAtStep={onboardingStartStep} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/80 dark:bg-black/80 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          {/* Mobile header - hamburger menu on left */}
          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
          >
            <svg className="w-6 h-6 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Desktop: Lea on left */}
          <h1
            className="hidden lg:block text-xl font-bold text-blue-500 cursor-pointer hover:text-blue-600 transition-colors"
            onClick={() => window.location.reload()}
          >Lea</h1>

          {/* Desktop header items */}
          <div className="hidden lg:flex items-center gap-3">
            <ResearcherSearch onSelectResearcher={navigateToProfile} onOpenThread={openThread} onSearch={(q) => window.location.href = `/search?q=${encodeURIComponent(q)}`} />
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
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Sign out
            </button>
          </div>

          {/* Mobile: Feed settings + Lea on right */}
          <div className="lg:hidden flex items-center gap-2">
            <button
              onClick={() => setShowFeedDiscovery(true)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
              title="Manage feeds"
            >
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
              </svg>
            </button>
            <h1
              className="text-xl font-bold text-blue-500 cursor-pointer hover:text-blue-600 transition-colors"
              onClick={() => window.location.reload()}
            >Lea</h1>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {showMobileMenu && (
          <div className="lg:hidden border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-4 py-3 space-y-3">
            {/* Bookmarks */}
            <button
              onClick={() => {
                setShowMobileBookmarks(true);
                setShowMobileMenu(false);
              }}
              className="flex items-center gap-2 text-gray-700 dark:text-gray-300 w-full"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              <span>Bookmarks</span>
            </button>
            {/* Notifications */}
            <button
              onClick={() => {
                setShowMobileNotifications(true);
                setShowMobileMenu(false);
              }}
              className="flex items-center gap-2 text-gray-700 dark:text-gray-300 w-full"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span>Notifications</span>
            </button>
            {/* Moderation */}
            <button
              onClick={() => {
                setShowMobileModeration(true);
                setShowMobileMenu(false);
              }}
              className="flex items-center gap-2 text-gray-700 dark:text-gray-300 w-full"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Moderation</span>
            </button>
            {/* Discover Researchers */}
            <button
              onClick={() => {
                setOnboardingStartStep(3);
                setShowOnboarding(true);
                setShowMobileMenu(false);
              }}
              className="flex items-center gap-2 text-gray-700 dark:text-gray-300 w-full"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span>Discover Researchers</span>
            </button>
            {/* Discover Papers */}
            <button
              onClick={() => {
                setShowMobileDiscoverPapers(true);
                setShowMobileMenu(false);
              }}
              className="flex items-center gap-2 text-gray-700 dark:text-gray-300 w-full"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Discover Papers</span>
            </button>
            {/* Verification status */}
            {isVerified ? (
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">Verified Researcher</span>
              </div>
            ) : (
              <a
                href="https://lea-verify.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500"
                onClick={() => setShowMobileMenu(false)}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium">Get Verified</span>
              </a>
            )}
            {/* Sign out */}
            <button
              onClick={() => {
                handleLogout();
                setShowMobileMenu(false);
              }}
              className="flex items-center gap-2 text-gray-500 w-full"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Sign out</span>
            </button>
          </div>
        )}
      </header>

      {/* Main layout with sidebar */}
      <div className="max-w-5xl mx-auto flex gap-4 px-0 lg:px-4">
        {/* Left Sidebar - Bookmarks & Messages */}
        <aside className="hidden lg:block w-72 flex-shrink-0 sticky top-16 max-h-[calc(100vh-5rem)] overflow-y-auto pt-4 pb-4 space-y-4 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700">
          <Bookmarks onOpenPost={openThread} onOpenProfile={navigateToProfile} />
          <DMSidebar />
          <Notifications onOpenPost={openThread} onOpenProfile={navigateToProfile} />
          <ModerationBox onOpenProfile={navigateToProfile} />
          <SafetyPanel onOpenProfile={navigateToProfile} onOpenThread={openThread} />
        </aside>

        {/* Main content - full width on mobile, constrained on desktop */}
        <main
          ref={mainContentRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="flex-1 w-full lg:max-w-xl bg-white dark:bg-gray-950 min-h-screen border-x border-gray-200 dark:border-gray-800 pb-16 lg:pb-0"
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

          {/* Composer - hidden on mobile, shown inline on desktop */}
          <div className="hidden lg:block">
            <Composer onPost={handlePost} />
          </div>

          {/* Feed Tabs - sticky below header when scrolling */}
          <div className="relative border-b border-gray-200 dark:border-gray-800 sticky top-14 z-10 bg-white dark:bg-gray-950">
            {/* Left scroll arrow - always visible */}
            <button
              onClick={() => {
                const container = feedsContainerRef.current;
                if (container) container.scrollBy({ left: -150, behavior: 'smooth' });
              }}
              disabled={!canScrollLeft}
              className={`absolute left-0 top-0 bottom-0 w-8 bg-white dark:bg-gray-950 z-10 flex items-center justify-center border-r border-gray-200 dark:border-gray-800 transition-colors ${
                canScrollLeft 
                  ? 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer' 
                  : 'text-gray-300 dark:text-gray-700 cursor-default'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            {/* Right scroll arrow - always visible */}
            <button
              onClick={() => {
                const container = feedsContainerRef.current;
                if (container) container.scrollBy({ left: 150, behavior: 'smooth' });
              }}
              disabled={!canScrollRight}
              className={`absolute right-0 top-0 bottom-0 w-8 bg-white dark:bg-gray-950 z-10 flex items-center justify-center border-l border-gray-200 dark:border-gray-800 transition-colors ${
                canScrollRight 
                  ? 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer' 
                  : 'text-gray-300 dark:text-gray-700 cursor-default'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <div 
              ref={feedsContainerRef}
              className="flex overflow-x-auto scrollbar-hide mx-8"
            >
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
                    className={`flex-shrink-0 px-3 py-2.5 text-sm font-medium transition-colors relative flex items-center justify-center gap-1 group cursor-grab active:cursor-grabbing ${
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
                    {/* Drag handle - visible on hover */}
                    <span className="opacity-0 group-hover:opacity-50 transition-opacity text-gray-400 mr-0.5 cursor-grab">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="9" cy="6" r="2" />
                        <circle cx="15" cy="6" r="2" />
                        <circle cx="9" cy="12" r="2" />
                        <circle cx="15" cy="12" r="2" />
                        <circle cx="9" cy="18" r="2" />
                        <circle cx="15" cy="18" r="2" />
                      </svg>
                    </span>
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
              {/* Manage feeds button */}
              <button
                onClick={() => setShowFeedDiscovery(true)}
                className="flex-shrink-0 px-2.5 py-2.5 text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Manage feeds"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
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

      {/* Feed Discovery modal */}
      {showFeedDiscovery && <FeedDiscovery onClose={() => setShowFeedDiscovery(false)} />}

      {/* Profile Editor modal */}
      {showProfileEditor && <ProfileEditor onClose={() => setShowProfileEditor(false)} />}

      {/* Mobile Bottom Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 z-30 safe-area-inset-bottom">
        <div className="flex items-center justify-around h-14">
          {/* Home */}
          <button
            onClick={() => window.location.href = '/'}
            className="flex flex-col items-center justify-center flex-1 h-full text-blue-500"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L2 12h3v9h6v-6h2v6h6v-9h3L12 2z" />
            </svg>
          </button>
          {/* Search */}
          <button
            onClick={() => window.location.href = '/search'}
            className="flex flex-col items-center justify-center flex-1 h-full text-gray-500"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
          {/* Papers */}
          <button
            onClick={() => setShowMobileDiscoverPapers(true)}
            className="flex flex-col items-center justify-center flex-1 h-full text-gray-500"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>
          {/* Messages/DMs */}
          <button
            onClick={() => setShowMobileDMs(true)}
            className="flex flex-col items-center justify-center flex-1 h-full text-gray-500"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </button>
          {/* Profile */}
          <button
            onClick={() => window.location.href = `/u/${session?.handle}`}
            className="flex flex-col items-center justify-center flex-1 h-full text-gray-500"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile Floating Action Button (FAB) for composing - positioned above bottom nav */}
      <button
        onClick={() => setShowMobileComposer(true)}
        className="lg:hidden fixed bottom-20 right-4 w-14 h-14 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center z-30 transition-transform hover:scale-105 active:scale-95"
        aria-label="Compose post"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* Mobile Composer Modal */}
      {showMobileComposer && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-950">
          {/* Modal header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <button
              onClick={() => setShowMobileComposer(false)}
              className="text-blue-500 hover:text-blue-600 font-medium"
            >
              Cancel
            </button>
            <span className="font-semibold text-gray-900 dark:text-gray-100">New Post</span>
            <div className="w-14" /> {/* Spacer for centering */}
          </div>
          {/* Composer */}
          <div className="flex-1 overflow-y-auto">
            <Composer onPost={() => {
              handlePost();
              setShowMobileComposer(false);
            }} />
          </div>
        </div>
      )}

      {/* Mobile DMs Modal */}
      {showMobileDMs && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-950">
          {/* Modal header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <button
              onClick={() => setShowMobileDMs(false)}
              className="text-blue-500 hover:text-blue-600 font-medium"
            >
              Close
            </button>
            <span className="font-semibold text-gray-900 dark:text-gray-100">Messages</span>
            <div className="w-14" /> {/* Spacer for centering */}
          </div>
          {/* DM Sidebar content */}
          <div className="flex-1 overflow-y-auto p-4">
            <DMSidebar defaultExpanded />
          </div>
        </div>
      )}

      {/* Mobile Bookmarks Modal */}
      {showMobileBookmarks && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-950">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <button
              onClick={() => setShowMobileBookmarks(false)}
              className="text-blue-500 hover:text-blue-600 font-medium"
            >
              Close
            </button>
            <span className="font-semibold text-gray-900 dark:text-gray-100">Bookmarks</span>
            <div className="w-14" />
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <Bookmarks onOpenPost={(uri) => { setShowMobileBookmarks(false); openThread(uri); }} onOpenProfile={(did) => { setShowMobileBookmarks(false); navigateToProfile(did); }} />
          </div>
        </div>
      )}

      {/* Mobile Notifications Modal */}
      {showMobileNotifications && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-950">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <button
              onClick={() => setShowMobileNotifications(false)}
              className="text-blue-500 hover:text-blue-600 font-medium"
            >
              Close
            </button>
            <span className="font-semibold text-gray-900 dark:text-gray-100">Notifications</span>
            <div className="w-14" />
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <Notifications onOpenPost={(uri) => { setShowMobileNotifications(false); openThread(uri); }} onOpenProfile={(did) => { setShowMobileNotifications(false); navigateToProfile(did); }} />
          </div>
        </div>
      )}

      {/* Mobile Moderation Modal */}
      {showMobileModeration && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-950">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <button
              onClick={() => setShowMobileModeration(false)}
              className="text-blue-500 hover:text-blue-600 font-medium"
            >
              Close
            </button>
            <span className="font-semibold text-gray-900 dark:text-gray-100">Moderation</span>
            <div className="w-14" />
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <SafetyPanel defaultExpanded onOpenProfile={(did) => { setShowMobileModeration(false); navigateToProfile(did); }} onOpenThread={(uri) => { setShowMobileModeration(false); openThread(uri); }} />
          </div>
        </div>
      )}

      {/* Mobile Discover Papers Modal */}
      {showMobileDiscoverPapers && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-950">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <button
              onClick={() => setShowMobileDiscoverPapers(false)}
              className="text-blue-500 hover:text-blue-600 font-medium"
            >
              Close
            </button>
            <span className="font-semibold text-gray-900 dark:text-gray-100">Discover Papers</span>
            <div className="w-14" />
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <ModerationBox defaultExpanded onOpenProfile={(did) => { setShowMobileDiscoverPapers(false); navigateToProfile(did); }} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
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
              <AppContent />
            </Suspense>
          </FollowingProvider>
        </FeedsProvider>
      </BookmarksProvider>
    </SettingsProvider>
  );
}
