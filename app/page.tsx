'use client';

import React, { useState, useCallback, useEffect, Suspense, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, logout, getBlueskyProfile, buildProfileUrl, checkVerificationStatus, refreshAgent, configureAgentLabelers, setCachedHandle } from '@/lib/bluesky';
import { initOAuth } from '@/lib/oauth';
import { SettingsProvider } from '@/lib/settings';
import { BookmarksProvider, useBookmarks } from '@/lib/bookmarks';
import { FeedsProvider, useFeeds } from '@/lib/feeds';
import { FollowingProvider } from '@/lib/following-context';
import { useModeration } from '@/lib/moderation';
import { ComposerProvider, useComposer } from '@/lib/composer-context';
import Login from '@/components/Login';
import Feed from '@/components/Feed';
import Composer from '@/components/Composer';
import Bookmarks from '@/components/Bookmarks';
import ThreadView from '@/components/ThreadView';
import DMSidebar from '@/components/DMSidebar';
import Notifications from '@/components/Notifications';
import ModerationBox from '@/components/ModerationBox';
import SafetyPanel from '@/components/SafetyPanel';
import SettingsPanel from '@/components/SettingsPanel';
import FeedDiscovery from '@/components/FeedDiscovery';
import Onboarding from '@/components/Onboarding';
import ProfileEditor from '@/components/ProfileEditor';
import ResearcherSearch from '@/components/ResearcherSearch';
import ErrorBoundary from '@/components/ErrorBoundary';
import RemixSettings from '@/components/RemixSettings';

function AppContent() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
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
  const { isOpen: showComposer, quotePost, openComposer, closeComposer } = useComposer();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showMobileBookmarks, setShowMobileBookmarks] = useState(false);
  const [showMobileNotifications, setShowMobileNotifications] = useState(false);
  const [showMobileModeration, setShowMobileModeration] = useState(false);
  const [showMobileDMs, setShowMobileDMs] = useState(false);
  const [showMobileDiscoverPapers, setShowMobileDiscoverPapers] = useState(false);
  const [showRemixSettings, setShowRemixSettings] = useState(false);

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
          window.location.href = `/profile/${profile.handle}/post/${rkey}`;
          return;
        }
      } catch {
        // Fall through to use DID
      }
      window.location.href = `/profile/${did}/post/${rkey}`;
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

  // Initialize OAuth and restore session on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        const result = await initOAuth();
        
        if (result?.session) {
          // Refresh the agent from OAuth session
          refreshAgent();
          
          // Get session info (DID is available immediately)
          const session = getSession();
          if (session?.did) {
            // Check if user is authorized (verified researcher)
            try {
              const accessResponse = await fetch(`/api/auth/check-access?did=${encodeURIComponent(session.did)}`);
              const accessData = await accessResponse.json();
              
              if (!accessData.authorized) {
                // User is not a verified researcher - deny access
                setAccessDenied(true);
                setIsLoading(false);
                return;
              }
            } catch (err) {
              console.error('Failed to check access:', err);
              // On error, deny access to be safe
              setAccessDenied(true);
              setIsLoading(false);
              return;
            }
            
            setBookmarksUserDid(session.did);
            setFeedsUserDid(session.did);
            
            // Fetch and cache the user's handle
            try {
              const profile = await getBlueskyProfile(session.did);
              if (profile?.handle) {
                setCachedHandle(profile.handle);
              }
            } catch (err) {
              console.error('Failed to fetch user profile:', err);
            }
            
            // Configure labelers
            await configureAgentLabelers();
            
            // Refresh moderation options
            refreshModerationOpts();
            
            // Check verification status (for display purposes)
            checkVerificationStatus(session.did).then(setIsVerified);
          }
          
          setIsLoggedIn(true);
          
          // Check if this was an OAuth callback (just logged in)
          if (result.isCallback) {
            // Check for force onboarding flag from login page
            const forceOnboarding = sessionStorage.getItem('lea-force-onboarding');
            if (forceOnboarding) {
              sessionStorage.removeItem('lea-force-onboarding');
              setShowOnboarding(true);
            } else {
              // Check if onboarding was completed
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
        }
      } catch (err) {
        console.error('OAuth init failed:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    initAuth();
  }, [setBookmarksUserDid, setFeedsUserDid, refreshModerationOpts]);

  // Note: With OAuth, login is handled via redirect in initOAuth().
  // This callback is kept for compatibility but typically not called.
  const handleLogin = () => {
    // OAuth callback already handled in useEffect - just reload to reinitialize
    window.location.reload();
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
        // Use buildProfileUrl with DID to handle handles with dots (e.g., victorsvector.com)
        window.location.href = buildProfileUrl(profile.handle, profile.did);
      } else {
        // Fallback: use DID directly if profile fetch failed
        window.location.href = buildProfileUrl(did);
      }
    } catch {
      // Fallback on error: navigate using DID
      window.location.href = buildProfileUrl(did);
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

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl shadow-gray-200/50 dark:shadow-none border border-gray-100 dark:border-gray-800 text-center">
          <div className="w-16 h-16 mx-auto mb-6 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Access Restricted
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Lea is currently in testing and only available to verified researchers.
          </p>
          <button
            onClick={() => {
              logout();
              setAccessDenied(false);
              setIsLoggedIn(false);
            }}
            className="w-full py-3 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 font-medium transition-colors border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (showOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} startAtStep={onboardingStartStep} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/80 dark:bg-black/80 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-5xl mx-auto px-4 py-3">
          {/* Desktop header - matches body layout */}
          <div className="hidden lg:flex items-center gap-4">
            {/* Left section matching sidebar width */}
            <div className="w-64 flex-shrink-0">
              <h1
                className="text-xl font-bold text-blue-500 cursor-pointer hover:text-blue-600 transition-colors"
                onClick={() => window.location.reload()}
              >Lea</h1>
            </div>
            {/* Main section matching main content width */}
            <div className="flex-1 max-w-xl flex items-center justify-end gap-3">
            <ResearcherSearch onSelectResearcher={navigateToProfile} onOpenThread={openThread} onSearch={(q) => window.location.href = `/search?q=${encodeURIComponent(q)}`} />
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
                isVerified
                  ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                  : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50'
              }`}
              title={isVerified ? 'Verified researcher' : undefined}
            >
              @{session?.handle}
              {isVerified && (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                </svg>
              )}
            </button>
            </div>
          </div>

          {/* Mobile header */}
          <div className="lg:hidden flex items-center justify-between relative">
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
            >
              <svg className="w-6 h-6 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <h1
              className="absolute left-1/2 -translate-x-1/2 text-xl font-bold text-blue-500 cursor-pointer hover:text-blue-600 transition-colors"
              onClick={() => window.location.reload()}
            >Lea</h1>

            <button
              onClick={() => setShowFeedDiscovery(true)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
              title="Manage feeds"
            >
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
              </svg>
            </button>
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
            {isVerified && (
              <div className="flex items-center text-emerald-500">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                </svg>
              </div>
            )}
            {/* Settings */}
            <a
              href="/settings/display"
              onClick={() => setShowMobileMenu(false)}
              className="flex items-center gap-2 text-gray-700 dark:text-gray-300 w-full"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>Settings</span>
            </a>
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
      <div className="max-w-5xl mx-auto px-0 lg:px-4">
        <div className="flex lg:gap-4 lg:items-start">
          {/* Left Sidebar - Bookmarks & Messages */}
          <aside className="hidden lg:block w-64 flex-shrink-0 sticky top-14 self-start max-h-[calc(100vh-3.5rem)] overflow-y-auto pt-4 pb-4 space-y-4 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700">
            <Bookmarks onOpenPost={openThread} onOpenProfile={navigateToProfile} />
            <DMSidebar />
            <Notifications onOpenPost={openThread} onOpenProfile={navigateToProfile} />
            <ModerationBox onOpenProfile={navigateToProfile} />
            <SafetyPanel onOpenProfile={navigateToProfile} onOpenThread={openThread} />
            <SettingsPanel />

            {/* Compose Button */}
            <button
              onClick={() => openComposer()}
              className="w-full py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-sm font-medium rounded-full flex items-center justify-center gap-1.5 transition-all shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              New Post
            </button>
          </aside>

          {/* Main content area with feed and vertical tabs */}
          <div className="flex-1 flex items-start min-w-0 max-w-full lg:max-w-[calc(576px+180px)]">
          {/* Main content - full width on mobile, constrained on desktop */}
          <main
            ref={mainContentRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="flex-1 w-full min-w-0 max-w-full lg:max-w-xl bg-white dark:bg-gray-950 min-h-screen lg:border-l border-gray-200 dark:border-gray-800 lg:border-r pb-16 lg:pb-0"
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
        </div>
        </div>
      </div>

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
            onClick={() => window.location.href = buildProfileUrl(session?.handle || '', session?.did)}
            className="flex flex-col items-center justify-center flex-1 h-full text-gray-500"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile Floating Action Button (FAB) for composing */}
      <button
        onClick={() => openComposer()}
        className="lg:hidden fixed w-14 h-14 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center z-30 transition-transform hover:scale-105 active:scale-95 bottom-20 right-4"
        aria-label="Compose post"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* Composer Modal */}
      {showComposer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => {
            // Close on backdrop click (desktop only)
            if (e.target === e.currentTarget) {
              closeComposer();
            }
          }}
        >
          <div className="w-full h-full lg:w-[600px] lg:h-auto lg:max-h-[80vh] lg:rounded-2xl bg-white dark:bg-gray-950 flex flex-col lg:shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
              <button
                onClick={() => closeComposer()}
                className="text-blue-500 hover:text-blue-600 font-medium"
              >
                Cancel
              </button>
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {quotePost ? 'Quote Post' : 'New Post'}
              </span>
              <div className="w-14" /> {/* Spacer for centering */}
            </div>
            {/* Composer */}
            <div className="flex-1 overflow-y-auto">
              <Composer onPost={() => {
                handlePost();
                closeComposer();
              }} quotePost={quotePost} />
            </div>
          </div>
        </div>
      )}

      {/* Mobile DMs Modal */}
      {showMobileDMs && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-950">
          {/* Modal header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 relative">
            <button
              onClick={() => setShowMobileDMs(false)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
            >
              <svg className="w-6 h-6 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="absolute left-1/2 -translate-x-1/2 font-semibold text-gray-900 dark:text-gray-100">Messages</span>
            <div className="w-10" />
          </div>
          {/* DM Sidebar content */}
          <div className="flex-1 overflow-y-auto">
            <DMSidebar embedded />
          </div>
        </div>
      )}

      {/* Mobile Bookmarks Modal */}
      {showMobileBookmarks && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-950">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 relative">
            <button
              onClick={() => setShowMobileBookmarks(false)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
            >
              <svg className="w-6 h-6 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="absolute left-1/2 -translate-x-1/2 font-semibold text-gray-900 dark:text-gray-100">Bookmarks</span>
            <div className="w-10" />
          </div>
          <div className="flex-1 overflow-y-auto [&_.text-xs]:text-sm [&_.text-\[9px\]]:text-xs [&_.w-7]:w-9 [&_.h-7]:h-9">
            <Bookmarks embedded onOpenPost={(uri) => { setShowMobileBookmarks(false); openThread(uri); }} onOpenProfile={(did) => { setShowMobileBookmarks(false); navigateToProfile(did); }} />
          </div>
        </div>
      )}

      {/* Mobile Notifications Modal */}
      {showMobileNotifications && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-950">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 relative">
            <button
              onClick={() => setShowMobileNotifications(false)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
            >
              <svg className="w-6 h-6 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="absolute left-1/2 -translate-x-1/2 font-semibold text-gray-900 dark:text-gray-100">Notifications</span>
            <div className="w-10" />
          </div>
          <div className="flex-1 overflow-y-auto [&_.text-xs]:text-sm [&_.text-\[9px\]]:text-xs [&_.w-7]:w-9 [&_.h-7]:h-9">
            <Notifications embedded onOpenPost={(uri) => { setShowMobileNotifications(false); openThread(uri); }} onOpenProfile={(did) => { setShowMobileNotifications(false); navigateToProfile(did); }} />
          </div>
        </div>
      )}

      {/* Mobile Moderation Modal */}
      {showMobileModeration && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-950">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 relative">
            <button
              onClick={() => setShowMobileModeration(false)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
            >
              <svg className="w-6 h-6 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="absolute left-1/2 -translate-x-1/2 font-semibold text-gray-900 dark:text-gray-100">Moderation</span>
            <div className="w-10" />
          </div>
          <div className="flex-1 overflow-y-auto [&_.text-xs]:text-sm [&_.text-\[9px\]]:text-xs [&_.w-7]:w-9 [&_.h-7]:h-9">
            <SafetyPanel embedded onOpenProfile={(did) => { setShowMobileModeration(false); navigateToProfile(did); }} onOpenThread={(uri) => { setShowMobileModeration(false); openThread(uri); }} />
          </div>
        </div>
      )}

      {/* Mobile Discover Papers Modal */}
      {showMobileDiscoverPapers && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-950">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 relative">
            <button
              onClick={() => setShowMobileDiscoverPapers(false)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
            >
              <svg className="w-6 h-6 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="absolute left-1/2 -translate-x-1/2 font-semibold text-gray-900 dark:text-gray-100">Discover Papers</span>
            <div className="w-10" />
          </div>
          <div className="flex-1 flex flex-col min-h-0 [&_.text-xs]:text-sm [&_.text-\[10px\]]:text-xs">
            <ModerationBox embedded onOpenProfile={(did) => { setShowMobileDiscoverPapers(false); navigateToProfile(did); }} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <ErrorBoundary>
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
                  <AppContent />
                </Suspense>
              </ComposerProvider>
            </FollowingProvider>
          </FeedsProvider>
        </BookmarksProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}
