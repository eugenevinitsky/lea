'use client';

import { useState, useEffect, useCallback, createContext, useContext, ReactNode, Suspense } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getSession, logout, getBlueskyProfile, buildProfileUrl, buildPostUrl, checkVerificationStatus, refreshAgent, configureAgentLabelers, setCachedHandle } from '@/lib/bluesky';
import { initOAuth } from '@/lib/oauth';
import { SettingsProvider } from '@/lib/settings';
import { BookmarksProvider, useBookmarks } from '@/lib/bookmarks';
import { FeedsProvider, useFeeds } from '@/lib/feeds';
import { FollowingProvider } from '@/lib/following-context';
import { useModeration } from '@/lib/moderation';
import { ComposerProvider, useComposer } from '@/lib/composer-context';
import Login from '@/components/Login';
import Sidebar from '@/components/Sidebar';
import Composer from '@/components/Composer';
import ResearcherSearch from '@/components/ResearcherSearch';
import ErrorBoundary from '@/components/ErrorBoundary';

// --- Context ---

interface FeedLayoutContextValue {
  session: ReturnType<typeof getSession>;
  isLoggedIn: boolean;
  isVerified: boolean;
  isOAuthCallback: boolean;
  navigateToProfile: (did: string) => Promise<void>;
  openThread: (uri: string | null) => Promise<void>;
  handleLogout: () => void;
  hasModerationAlerts: boolean;
  postCreatedKey: number;
}

const FeedLayoutContext = createContext<FeedLayoutContextValue | null>(null);

export function useFeedLayout() {
  const ctx = useContext(FeedLayoutContext);
  if (!ctx) throw new Error('useFeedLayout must be used within FeedLayout');
  return ctx;
}

// --- Inner layout (needs provider hooks) ---

function FeedLayoutInner({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isHomepage = pathname === '/' || pathname === '';

  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerified, setIsVerified] = useState(false);
  const [isOAuthCallback, setIsOAuthCallback] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [hasModerationAlerts, setHasModerationAlerts] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [postCreatedKey, setPostCreatedKey] = useState(0);

  const { isOpen: showComposer, quotePost, openComposer, closeComposer } = useComposer();
  const { setUserDid: setBookmarksUserDid } = useBookmarks();
  const { setUserDid: setFeedsUserDid } = useFeeds();
  const { refreshModerationOpts } = useModeration();

  // Check for active moderation alerts
  useEffect(() => {
    try {
      const activeAlerts = JSON.parse(localStorage.getItem('lea-active-alert-ids') || '[]');
      setHasModerationAlerts(activeAlerts.length > 0);
    } catch { /* ignore */ }
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setShowMobileMenu(false);
  }, [pathname]);

  // Initialize OAuth and restore session
  useEffect(() => {
    const initAuth = async () => {
      try {
        const result = await initOAuth();

        if (result?.session) {
          refreshAgent();

          const session = getSession();
          if (session?.did) {
            // Check if user is authorized (verified researcher)
            try {
              const accessResponse = await fetch(`/api/auth/check-access?did=${encodeURIComponent(session.did)}`);
              const accessData = await accessResponse.json();
              if (!accessData.authorized) {
                setAccessDenied(true);
                setIsLoading(false);
                return;
              }
            } catch (err) {
              console.error('Failed to check access:', err);
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
            } catch {
              // Ignore
            }

            // Configure labelers
            await configureAgentLabelers();

            // Refresh moderation options
            refreshModerationOpts();

            // Check verification status
            checkVerificationStatus(session.did).then(setIsVerified);
          }

          setIsLoggedIn(true);

          if (result.isCallback) {
            setIsOAuthCallback(true);
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

  const handleLogin = () => {
    window.location.reload();
  };

  const handleLogout = useCallback(() => {
    logout();
    setIsLoggedIn(false);
    setBookmarksUserDid(null);
    setFeedsUserDid(null);
  }, [setBookmarksUserDid, setFeedsUserDid]);

  // Navigation helpers using client-side routing
  const navigateToProfile = useCallback(async (did: string) => {
    try {
      const profile = await getBlueskyProfile(did);
      if (profile?.handle) {
        router.push(buildProfileUrl(profile.handle, profile.did));
      } else {
        router.push(buildProfileUrl(did));
      }
    } catch {
      router.push(buildProfileUrl(did));
    }
  }, [router]);

  const openThread = useCallback(async (uri: string | null) => {
    if (!uri) return;

    const match = uri.match(/^at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/);
    if (match) {
      const [, did, rkey] = match;
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
    }
  }, [router]);

  const session = getSession();

  // --- Loading ---
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  // --- Login ---
  if (!isLoggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  // --- Access denied ---
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

  // --- Authenticated shell ---
  const contextValue: FeedLayoutContextValue = {
    session,
    isLoggedIn,
    isVerified,
    isOAuthCallback,
    navigateToProfile,
    openThread,
    handleLogout,
    hasModerationAlerts,
    postCreatedKey,
  };

  return (
    <FeedLayoutContext.Provider value={contextValue}>
      <div className="min-h-screen bg-gray-50 dark:bg-black">
        {/* Header */}
        <header className="sticky top-0 z-20 bg-white/80 dark:bg-black/80 backdrop-blur border-b border-gray-200 dark:border-gray-800">
          <div className="max-w-5xl mx-auto px-4 py-3">
            {isHomepage ? (
              <>
                {/* Desktop header - two-column layout matching sidebar */}
                <div className="hidden lg:flex items-center gap-4">
                  <div className="w-56 flex-shrink-0">
                    <h1
                      className="text-xl font-bold text-blue-500 cursor-pointer hover:text-blue-600 transition-colors"
                      onClick={() => window.location.reload()}
                    >Lea</h1>
                  </div>
                  <div className="flex-1 max-w-xl flex items-center justify-end gap-3">
                    <ResearcherSearch onSelectResearcher={navigateToProfile} onOpenThread={openThread} onSearch={(q) => router.push(`/search?q=${encodeURIComponent(q)}`)} />
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

                {/* Mobile header - hamburger + centered logo */}
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

                  <div className="w-10" /> {/* Spacer for centering */}
                </div>
              </>
            ) : (
              /* Non-homepage header - single row with back button */
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => router.back()}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
                    title="Go back"
                  >
                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </button>
                  <h1
                    className="text-xl font-bold text-blue-500 cursor-pointer hover:text-blue-600 transition-colors"
                    onClick={() => router.push('/')}
                  >Lea</h1>
                </div>
                <div className="flex items-center gap-3">
                  <ResearcherSearch onSelectResearcher={navigateToProfile} onOpenThread={openThread} onSearch={(q) => router.push(`/search?q=${encodeURIComponent(q)}`)} />
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
            )}
          </div>

          {/* Mobile dropdown menu (homepage only) */}
          {isHomepage && showMobileMenu && (
            <div className="lg:hidden border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-4 py-3 space-y-3">
              <a href="/bookmarks" className="flex items-center gap-2 text-gray-700 dark:text-gray-300 w-full">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                <span>Bookmarks</span>
              </a>
              <a href="/notifications" className="flex items-center gap-2 text-gray-700 dark:text-gray-300 w-full">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span>Notifications</span>
              </a>
              <a href="/moderation" className="flex items-center gap-2 text-gray-700 dark:text-gray-300 w-full">
                <div className="relative">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  {hasModerationAlerts && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full" />
                  )}
                </div>
                <span>Moderation</span>
              </a>
              <a href="/discover" className="flex items-center gap-2 text-gray-700 dark:text-gray-300 w-full">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span>Discover</span>
              </a>
              <a href="/messages" className="flex items-center gap-2 text-gray-700 dark:text-gray-300 w-full">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span>Messages</span>
              </a>
              <a href="/settings/display" className="flex items-center gap-2 text-gray-700 dark:text-gray-300 w-full">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Settings</span>
              </a>
              <button
                onClick={() => { handleLogout(); setShowMobileMenu(false); }}
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
            <Sidebar openComposer={openComposer} />
            {children}
          </div>
        </div>

        {/* Composer Modal */}
        {showComposer && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                closeComposer();
              }
            }}
          >
            <div className="w-full h-full lg:w-[600px] lg:h-auto lg:max-h-[80vh] lg:rounded-2xl bg-white dark:bg-gray-950 flex flex-col lg:shadow-2xl">
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
                <div className="w-14" />
              </div>
              <div className="flex-1 overflow-y-auto">
              <Composer onPost={() => { setPostCreatedKey(k => k + 1); closeComposer(); }} quotePost={quotePost} />
              </div>
            </div>
          </div>
        )}
      </div>
    </FeedLayoutContext.Provider>
  );
}

// --- Outer layout with providers ---

export default function FeedLayout({ children }: { children: ReactNode }) {
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
                  <FeedLayoutInner>{children}</FeedLayoutInner>
                </Suspense>
              </ComposerProvider>
            </FollowingProvider>
          </FeedsProvider>
        </BookmarksProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}
