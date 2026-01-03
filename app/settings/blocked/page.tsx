'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { restoreSession, getSession, getBlueskyProfile, getBlockedAccounts, unblockUser, BlockedAccount } from '@/lib/bluesky';
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
import ResearcherSearch from '@/components/ResearcherSearch';

function BlockedAccountsContent() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerified, setIsVerified] = useState(false);
  const { setUserDid } = useBookmarks();

  // Blocked accounts state
  const [blockedAccounts, setBlockedAccounts] = useState<BlockedAccount[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(true);
  const [unblockingDid, setUnblockingDid] = useState<string | null>(null);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Restore session on mount
  useEffect(() => {
    restoreSession().then((restored) => {
      if (restored) {
        setIsLoggedIn(true);
        const session = getSession();
        if (session?.did) {
          setUserDid(session.did);
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
  }, [setUserDid]);

  // Load blocked accounts on mount
  useEffect(() => {
    if (isLoggedIn) {
      loadBlocks();
    }
  }, [isLoggedIn]);

  const loadBlocks = async (loadMore = false) => {
    if (loadingBlocks) return;
    setLoadingBlocks(true);
    try {
      const result = await getBlockedAccounts(loadMore ? cursor : undefined);
      if (loadMore) {
        setBlockedAccounts(prev => [...prev, ...result.blocks]);
      } else {
        setBlockedAccounts(result.blocks);
      }
      setCursor(result.cursor);
      setHasMore(!!result.cursor);
    } catch (err) {
      console.error('Failed to load blocked accounts:', err);
    } finally {
      setLoadingBlocks(false);
    }
  };

  const handleUnblock = async (account: BlockedAccount) => {
    if (!account.blockUri) return;
    setUnblockingDid(account.did);
    try {
      await unblockUser(account.blockUri);
      setBlockedAccounts(prev => prev.filter(a => a.did !== account.did));
    } catch (err) {
      console.error('Failed to unblock:', err);
    } finally {
      setUnblockingDid(null);
    }
  };

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
        window.location.href = `/u/${profile.handle}`;
      } else {
        window.location.href = `/u/${did}`;
      }
    } catch {
      window.location.href = `/u/${did}`;
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
          window.location.href = `/post/${profile.handle}/${rkey}`;
          return;
        }
      } catch {
        // Fall through
      }
      window.location.href = `/post/${did}/${rkey}`;
    }
  }, []);

  // Filter accounts by search query
  const filteredAccounts = useMemo(() => {
    if (!searchQuery.trim()) return blockedAccounts;
    const query = searchQuery.toLowerCase();
    return blockedAccounts.filter(account => 
      account.handle.toLowerCase().includes(query) ||
      account.displayName?.toLowerCase().includes(query)
    );
  }, [blockedAccounts, searchQuery]);

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
              onClick={() => window.location.href = `/u/${session?.handle}`}
              className="px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-full transition-colors"
            >
              @{session?.handle}
            </button>
            {isVerified && (
              <span
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 rounded-full"
                title="You are a verified researcher"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                </svg>
                Verified
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main layout with sidebar */}
      <div className="max-w-5xl mx-auto flex gap-4 px-0 lg:px-4">
        {/* Left Sidebar */}
        <aside className="hidden lg:block w-72 flex-shrink-0 sticky top-16 max-h-[calc(100vh-5rem)] overflow-y-auto pt-4 pb-4 space-y-4 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700">
          <Bookmarks onOpenPost={openThread} onOpenProfile={handleOpenProfile} />
          <DMSidebar />
          <Notifications onOpenPost={openThread} onOpenProfile={handleOpenProfile} />
          <ModerationBox onOpenProfile={handleOpenProfile} />
          <SafetyPanel onOpenProfile={handleOpenProfile} onOpenThread={openThread} />
        </aside>

        {/* Main content */}
        <main className="flex-1 w-full lg:max-w-xl bg-white dark:bg-gray-950 min-h-screen border-x border-gray-200 dark:border-gray-800">
          {/* Header with back button */}
          <div className="sticky top-14 z-10 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 p-4">
            <div className="flex items-center gap-3 mb-4">
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
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Blocked Accounts</h2>
                <p className="text-sm text-gray-500">{blockedAccounts.length} account{blockedAccounts.length !== 1 ? 's' : ''} blocked</p>
              </div>
            </div>
            
            {/* Search input */}
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search blocked accounts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border-0 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full"
                >
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Blocked accounts list */}
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {loadingBlocks && blockedAccounts.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
              </div>
            ) : filteredAccounts.length === 0 ? (
              <div className="text-center py-16 px-4">
                <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                </div>
                <p className="text-gray-500">
                  {searchQuery ? 'No blocked accounts match your search' : 'No blocked accounts'}
                </p>
              </div>
            ) : (
              <>
                {filteredAccounts.map((account) => (
                  <div
                    key={account.did}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
                  >
                    {/* Avatar */}
                    <button
                      onClick={() => handleOpenProfile(account.did)}
                      className="flex-shrink-0"
                    >
                      {account.avatar ? (
                        <img
                          src={account.avatar}
                          alt=""
                          className="w-12 h-12 rounded-full"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                          <span className="text-lg font-medium text-gray-500">
                            {(account.displayName || account.handle)[0].toUpperCase()}
                          </span>
                        </div>
                      )}
                    </button>

                    {/* User info */}
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => handleOpenProfile(account.did)}
                        className="text-left"
                      >
                        <p className="font-semibold text-gray-900 dark:text-gray-100 truncate hover:underline">
                          {account.displayName || account.handle}
                        </p>
                        <p className="text-sm text-gray-500 truncate">@{account.handle}</p>
                      </button>
                    </div>

                    {/* Unblock button */}
                    <button
                      onClick={() => handleUnblock(account)}
                      disabled={unblockingDid === account.did}
                      className="px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full transition-colors disabled:opacity-50 flex-shrink-0"
                    >
                      {unblockingDid === account.did ? (
                        <span className="flex items-center gap-1">
                          <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        </span>
                      ) : (
                        'Unblock'
                      )}
                    </button>
                  </div>
                ))}

                {/* Load more button */}
                {hasMore && !searchQuery && (
                  <div className="p-4 text-center">
                    <button
                      onClick={() => loadBlocks(true)}
                      disabled={loadingBlocks}
                      className="px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-colors disabled:opacity-50"
                    >
                      {loadingBlocks ? 'Loading...' : 'Load more'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function BlockedAccountsPage() {
  return (
    <SettingsProvider>
      <BookmarksProvider>
        <FeedsProvider>
          <FollowingProvider>
            <BlockedAccountsContent />
          </FollowingProvider>
        </FeedsProvider>
      </BookmarksProvider>
    </SettingsProvider>
  );
}
