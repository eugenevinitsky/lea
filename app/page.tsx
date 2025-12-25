'use client';

import { useState, useCallback, useEffect } from 'react';
import { getSession, logout, restoreSession, FEEDS, FeedId } from '@/lib/bluesky';
import { SettingsProvider } from '@/lib/settings';
import { BookmarksProvider } from '@/lib/bookmarks';
import Login from '@/components/Login';
import Feed from '@/components/Feed';
import Composer from '@/components/Composer';
import Settings from '@/components/Settings';
import Bookmarks from '@/components/Bookmarks';
import ThreadView from '@/components/ThreadView';
import DirectMessages, { useUnreadMessageCount } from '@/components/DirectMessages';

const FEED_ORDER: FeedId[] = ['skygest', 'foryou', 'timeline'];

function AppContent() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showDMs, setShowDMs] = useState(false);
  const [activeFeed, setActiveFeed] = useState<FeedId>('skygest');
  const [threadUri, setThreadUri] = useState<string | null>(null);
  const unreadMessageCount = useUnreadMessageCount();

  // Try to restore session on mount
  useEffect(() => {
    restoreSession().then((restored) => {
      if (restored) {
        setIsLoggedIn(true);
      }
      setIsLoading(false);
    });
  }, []);

  const handleLogin = () => {
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    logout();
    setIsLoggedIn(false);
  };

  const handlePost = useCallback(() => {
    setRefreshKey(k => k + 1);
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
          <h1 className="text-xl font-bold text-blue-500">Lea</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              @{session?.handle}
            </span>
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
            <button
              onClick={() => setShowDMs(true)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full relative"
              title="Messages"
            >
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {unreadMessageCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                </span>
              )}
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
        {/* Left Sidebar - Bookmarks */}
        <aside className="hidden lg:block w-72 flex-shrink-0 sticky top-16 h-fit pt-4">
          <Bookmarks onOpenPost={setThreadUri} />
        </aside>

        {/* Main content */}
        <main className="flex-1 max-w-xl bg-white dark:bg-gray-950 min-h-screen border-x border-gray-200 dark:border-gray-800">
          {/* Composer */}
          <Composer onPost={handlePost} />

          {/* Feed Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-800">
            {FEED_ORDER.map((feedId) => {
              const feed = FEEDS[feedId];
              const isActive = activeFeed === feedId;
              const isSkygest = feedId === 'skygest';

              return (
                <button
                  key={feedId}
                  onClick={() => setActiveFeed(feedId)}
                  className={`flex-1 py-3 text-sm font-medium transition-colors relative flex items-center justify-center gap-1.5 ${
                    isActive
                      ? isSkygest ? 'text-purple-500' : 'text-blue-500'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  {isSkygest && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  )}
                  {feed.name}
                  {isActive && (
                    <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${
                      isSkygest ? 'bg-purple-500' : 'bg-blue-500'
                    }`} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Feed Content */}
          <Feed feedId={activeFeed} refreshKey={refreshKey} />
        </main>
      </div>

      {/* Thread View Modal */}
      {threadUri && (
        <ThreadView uri={threadUri} onClose={() => setThreadUri(null)} />
      )}

      {/* Settings modal */}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}

      {/* DMs modal */}
      {showDMs && (
        <DirectMessages
          onClose={() => setShowDMs(false)}
          isVisible={showDMs}
        />
      )}
    </div>
  );
}

export default function Home() {
  return (
    <SettingsProvider>
      <BookmarksProvider>
        <AppContent />
      </BookmarksProvider>
    </SettingsProvider>
  );
}
