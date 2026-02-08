'use client';

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { getSession, getBlueskyProfile, buildProfileUrl, buildPostUrl, checkVerificationStatus } from '@/lib/bluesky';
import { initOAuth } from '@/lib/oauth';
import { refreshAgent } from '@/lib/bluesky';
import { SettingsProvider, useSettings } from '@/lib/settings';
import { BookmarksProvider, useBookmarks } from '@/lib/bookmarks';
import { FeedsProvider } from '@/lib/feeds';
import { FollowingProvider } from '@/lib/following-context';
import { ComposerProvider, useComposer } from '@/lib/composer-context';
import Login from '@/components/Login';
import Sidebar from '@/components/Sidebar';
import Composer from '@/components/Composer';
import ResearcherSearch from '@/components/ResearcherSearch';

interface ModerationLayoutContextValue {
  handleOpenProfile: (did: string) => void;
  openThread: (uri: string | null) => void;
  session: ReturnType<typeof getSession>;
  isVerified: boolean;
}

const ModerationLayoutContext = createContext<ModerationLayoutContextValue | null>(null);

export function useModerationLayout() {
  const ctx = useContext(ModerationLayoutContext);
  if (!ctx) throw new Error('useModerationLayout must be used within ModerationLayout');
  return ctx;
}

function ModerationLayoutInner({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerified, setIsVerified] = useState(false);
  const { setUserDid } = useBookmarks();
  const { isOpen: showComposer, quotePost, openComposer, closeComposer } = useComposer();

  useEffect(() => {
    initOAuth().then((result) => {
      refreshAgent();
      const restored = !!result?.session;
      if (restored) {
        setIsLoggedIn(true);
        const session = getSession();
        if (session?.did) {
          setUserDid(session.did);
          checkVerificationStatus(session.did).then(setIsVerified);
        }
      }
      setIsLoading(false);
    });
  }, [setUserDid]);

  const handleOpenProfile = useCallback(async (did: string) => {
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
          window.location.href = buildPostUrl(profile.handle, rkey, profile.did);
          return;
        }
      } catch {
        // Fall through to use DID
      }
      window.location.href = buildPostUrl(did, rkey);
    }
  }, []);

  const handleLogin = () => {
    setIsLoggedIn(true);
    const session = getSession();
    if (session?.did) {
      setUserDid(session.did);
    }
  };

  const session = getSession();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <ModerationLayoutContext.Provider value={{ handleOpenProfile, openThread, session, isVerified }}>
      <div className="min-h-screen bg-gray-50 dark:bg-black">
        {/* Header */}
        <header className="sticky top-0 z-20 bg-white/80 dark:bg-black/80 backdrop-blur border-b border-gray-200 dark:border-gray-800">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <h1
              className="text-xl font-bold text-blue-500 cursor-pointer hover:text-blue-600 transition-colors"
              onClick={() => window.location.href = '/'}
            >Lea</h1>
            <div className="flex items-center gap-3">
              <ResearcherSearch
                onSelectResearcher={handleOpenProfile}
                onOpenThread={openThread}
                onSearch={(q) => window.location.href = `/search?q=${encodeURIComponent(q)}`}
              />
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
        </header>

        {/* Main layout with sidebar */}
        <div className="max-w-5xl mx-auto px-0 lg:px-4">
          <div className="flex lg:gap-4 lg:items-start">
          <Sidebar openComposer={openComposer} />

          {/* Main content */}
          <main className="flex-1 w-full lg:max-w-xl bg-white dark:bg-gray-950 min-h-screen border-x border-gray-200 dark:border-gray-800">
            {children}
          </main>
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
                <Composer onPost={() => closeComposer()} quotePost={quotePost} />
              </div>
            </div>
          </div>
        )}
      </div>
    </ModerationLayoutContext.Provider>
  );
}

export default function ModerationLayout({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider>
      <BookmarksProvider>
        <FeedsProvider>
          <FollowingProvider>
            <ComposerProvider>
              <ModerationLayoutInner>{children}</ModerationLayoutInner>
            </ComposerProvider>
          </FollowingProvider>
        </FeedsProvider>
      </BookmarksProvider>
    </SettingsProvider>
  );
}
