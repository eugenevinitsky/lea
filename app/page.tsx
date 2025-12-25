'use client';

import { useState, useCallback, useEffect } from 'react';
import { getSession, logout, restoreSession } from '@/lib/bluesky';
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
import FeedDiscovery from '@/components/FeedDiscovery';

function AppContent() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showFeedDiscovery, setShowFeedDiscovery] = useState(false);
  const [activeFeedUri, setActiveFeedUri] = useState<string | null>(null);
  const [threadUri, setThreadUri] = useState<string | null>(null);
  const { pinnedFeeds, removeFeed } = useFeeds();

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
          <Bookmarks onOpenPost={setThreadUri} />
          <DMSidebar />
        </aside>

        {/* Main content */}
        <main className="flex-1 max-w-xl bg-white dark:bg-gray-950 min-h-screen border-x border-gray-200 dark:border-gray-800">
          {/* Composer */}
          <Composer onPost={handlePost} />

          {/* Feed Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-800">
            {pinnedFeeds.map((feed) => {
              const isActive = activeFeedUri === feed.uri;
              const isSkygest = feed.uri.includes('preprintdigest');

              return (
                <button
                  key={feed.uri}
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
                  className={`flex-1 py-3 text-sm font-medium transition-colors relative flex items-center justify-center gap-1.5 group ${
                    isActive
                      ? isSkygest ? 'text-purple-500' : 'text-blue-500'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                  title="Right-click to unpin"
                >
                  {isSkygest && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  )}
                  <span className="truncate max-w-[80px]">{feed.displayName}</span>
                  {isActive && (
                    <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${
                      isSkygest ? 'bg-purple-500' : 'bg-blue-500'
                    }`} />
                  )}
                </button>
              );
            })}
            {/* Add feed button */}
            <button
              onClick={() => setShowFeedDiscovery(true)}
              className="px-3 py-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Add feeds"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          {/* Feed Content */}
          {activeFeedUri && (
            <Feed
              feedUri={activeFeedUri}
              feedName={pinnedFeeds.find(f => f.uri === activeFeedUri)?.displayName}
              acceptsInteractions={pinnedFeeds.find(f => f.uri === activeFeedUri)?.acceptsInteractions}
              refreshKey={refreshKey}
            />
          )}
        </main>
      </div>

      {/* Thread View Modal */}
      {threadUri && (
        <ThreadView uri={threadUri} onClose={() => setThreadUri(null)} />
      )}

      {/* Settings modal */}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}

      {/* Feed Discovery modal */}
      {showFeedDiscovery && <FeedDiscovery onClose={() => setShowFeedDiscovery(false)} />}
    </div>
  );
}

export default function Home() {
  return (
    <SettingsProvider>
      <BookmarksProvider>
        <FeedsProvider>
          <AppContent />
        </FeedsProvider>
      </BookmarksProvider>
    </SettingsProvider>
  );
}
