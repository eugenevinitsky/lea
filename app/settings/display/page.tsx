'use client';

import { useState, useEffect, useCallback } from 'react';
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

function DisplayContent() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerified, setIsVerified] = useState(false);
  const { setUserDid } = useBookmarks();
  const { settings, updateSettings } = useSettings();
  const { isOpen: showComposer, quotePost, openComposer, closeComposer } = useComposer();

  // Restore session on mount
  useEffect(() => {
    initOAuth().then((result) => { refreshAgent(); const restored = !!result?.session;
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

  const handleLogin = () => {
    setIsLoggedIn(true);
    const session = getSession();
    if (session?.did) {
      setUserDid(session.did);
    }
  };

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
        // Fall through
      }
      window.location.href = buildPostUrl(did, rkey);
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
            <ResearcherSearch 
              onSelectResearcher={handleOpenProfile} 
              onOpenThread={openThread}
              onSearch={(q) => window.location.href = `/search?q=${encodeURIComponent(q)}`}
            />
            <button
              onClick={() => window.location.href = buildProfileUrl(session?.handle || '', session?.did)}
              className="px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-full transition-colors"
            >
              @{session?.handle}
            </button>
            {isVerified && (
              <span
                className="flex items-center justify-center w-7 h-7 text-emerald-500"
                title="You are a verified researcher"
              >
                <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                </svg>
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main layout with sidebar */}
      <div className="max-w-5xl mx-auto px-0 lg:px-4">
        <div className="flex lg:gap-4 lg:items-start">
        <Sidebar openComposer={openComposer} />

        {/* Main content */}
        <main className="flex-1 w-full lg:max-w-xl bg-white dark:bg-gray-950 min-h-screen border-x border-gray-200 dark:border-gray-800">
          {/* Header with back button */}
          <div className="sticky top-14 z-10 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 p-4">
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={() => window.history.back()}
                className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
                title="Back"
              >
                <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Display Settings</h2>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Customize how content is displayed in your feed.
            </p>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Paper highlights */}
            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <label className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">Highlight paper links</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Show a &quot;Discussion&quot; indicator on posts containing arXiv or DOI links
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showPaperHighlights}
                  onChange={(e) => updateSettings({ showPaperHighlights: e.target.checked })}
                  className="w-5 h-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                />
              </label>
            </div>

            {/* Expand self-threads */}
            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <label className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">Expand self-threads</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Automatically show the full thread when someone replies to their own posts
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.expandSelfThreads}
                  onChange={(e) => updateSettings({ expandSelfThreads: e.target.checked })}
                  className="w-5 h-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                />
              </label>
            </div>

            {/* Avatar ring indicators section */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Avatar Ring Indicators</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Show colored rings around profile photos to indicate your relationship with the author.
              </p>

              {/* Following ring (blue) */}
              <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg mb-3">
                <label className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 ring-[3px] ring-blue-300 dark:ring-blue-400/60 shadow-[0_0_8px_rgba(147,197,253,0.5)] dark:shadow-[0_0_8px_rgba(96,165,250,0.4)]" />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">People I follow</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Blue ring around people you follow
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.showFollowingRing}
                    onChange={(e) => updateSettings({ showFollowingRing: e.target.checked })}
                    className="w-5 h-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                  />
                </label>
              </div>

              {/* Mutual ring (purple) */}
              <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg mb-3">
                <label className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 ring-[3px] ring-purple-400 dark:ring-purple-400/60 shadow-[0_0_8px_rgba(192,132,252,0.5)] dark:shadow-[0_0_8px_rgba(167,139,250,0.4)]" />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">Mutuals</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Purple ring around people who follow each other
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.showMutualRing}
                    onChange={(e) => updateSettings({ showMutualRing: e.target.checked })}
                    className="w-5 h-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                  />
                </label>
              </div>

              {/* Follower ring (yellow) */}
              <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <label className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 ring-[3px] ring-yellow-400 dark:ring-yellow-400/60 shadow-[0_0_8px_rgba(250,204,21,0.5)] dark:shadow-[0_0_8px_rgba(250,204,21,0.4)]" />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">Followers</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Yellow ring around people who follow you (but you don&apos;t follow back)
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.showFollowerRing}
                    onChange={(e) => updateSettings({ showFollowerRing: e.target.checked })}
                    className="w-5 h-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                  />
                </label>
              </div>
            </div>
          </div>
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
  );
}

export default function DisplayPage() {
  return (
    <SettingsProvider>
      <BookmarksProvider>
        <FeedsProvider>
          <FollowingProvider>
            <ComposerProvider>
              <DisplayContent />
            </ComposerProvider>
          </FollowingProvider>
        </FeedsProvider>
      </BookmarksProvider>
    </SettingsProvider>
  );
}
