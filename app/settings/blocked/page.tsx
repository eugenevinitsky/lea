'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getSession, getBlueskyProfile, getBlockedAccounts, unblockUser, BlockedAccount, MassBlockUser, parsePostUrl, getAllLikers, getAllReposters, blockMultipleUsers, buildProfileUrl, buildPostUrl, checkVerificationStatus } from '@/lib/bluesky';
import { initOAuth } from '@/lib/oauth';
import { refreshAgent } from '@/lib/bluesky';
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
import SettingsPanel from '@/components/SettingsPanel';
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
  
  // Mass block state
  const [massBlockExpanded, setMassBlockExpanded] = useState(false);
  const [blockedListExpanded, setBlockedListExpanded] = useState(false);
  const [postUrl, setPostUrl] = useState('');
  const [blockLikers, setBlockLikers] = useState(true);
  const [blockReposters, setBlockReposters] = useState(true);
  const [massBlockLoading, setMassBlockLoading] = useState(false);
  const [massBlockProgress, setMassBlockProgress] = useState('');
  const [massBlockUsers, setMassBlockUsers] = useState<MassBlockUser[]>([]);
  const [massBlockExcluded, setMassBlockExcluded] = useState<Set<string>>(new Set());
  const [massBlockError, setMassBlockError] = useState('');
  const [isExecutingBlock, setIsExecutingBlock] = useState(false);
  const [blockExecutionProgress, setBlockExecutionProgress] = useState('');

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

  // Mass block handlers
  const handleFetchPostEngagers = async () => {
    if (!postUrl.trim()) return;
    if (!blockLikers && !blockReposters) {
      setMassBlockError('Select at least one option: likers or reposters');
      return;
    }
    
    setMassBlockLoading(true);
    setMassBlockError('');
    setMassBlockProgress('Parsing URL...');
    setMassBlockUsers([]);
    setMassBlockExcluded(new Set());
    
    try {
      const uri = await parsePostUrl(postUrl.trim());
      if (!uri) {
        setMassBlockError('Invalid post URL. Use a bsky.app post link or AT URI.');
        setMassBlockLoading(false);
        return;
      }
      
      const allUsers: MassBlockUser[] = [];
      const seenDids = new Set<string>();
      
      if (blockLikers) {
        setMassBlockProgress('Fetching likers...');
        const likers = await getAllLikers(uri, (count) => {
          setMassBlockProgress(`Fetching likers... (${count} found)`);
        });
        for (const user of likers) {
          if (!seenDids.has(user.did)) {
            seenDids.add(user.did);
            allUsers.push(user);
          }
        }
      }
      
      if (blockReposters) {
        setMassBlockProgress('Fetching reposters...');
        const reposters = await getAllReposters(uri, (count) => {
          setMassBlockProgress(`Fetching reposters... (${count} found)`);
        });
        for (const user of reposters) {
          if (!seenDids.has(user.did)) {
            seenDids.add(user.did);
            allUsers.push(user);
          }
        }
      }
      
      if (allUsers.length === 0) {
        setMassBlockError('No likers or reposters found for this post.');
      } else {
        setMassBlockUsers(allUsers);
      }
    } catch (err) {
      console.error('Failed to fetch engagers:', err);
      setMassBlockError('Failed to fetch post engagers. Check the URL and try again.');
    } finally {
      setMassBlockLoading(false);
      setMassBlockProgress('');
    }
  };

  const toggleExclude = (did: string) => {
    setMassBlockExcluded(prev => {
      const next = new Set(prev);
      if (next.has(did)) {
        next.delete(did);
      } else {
        next.add(did);
      }
      return next;
    });
  };

  // Sort users: relationships first, then alphabetically
  const sortedMassBlockUsers = useMemo(() => {
    return [...massBlockUsers].sort((a, b) => {
      const aHasRelationship = (a.followsYou || a.youFollow) && !a.alreadyBlocked;
      const bHasRelationship = (b.followsYou || b.youFollow) && !b.alreadyBlocked;
      if (aHasRelationship && !bHasRelationship) return -1;
      if (!aHasRelationship && bHasRelationship) return 1;
      // Already blocked at the bottom
      if (a.alreadyBlocked && !b.alreadyBlocked) return 1;
      if (!a.alreadyBlocked && b.alreadyBlocked) return -1;
      // Alphabetical by display name or handle
      const aName = (a.displayName || a.handle).toLowerCase();
      const bName = (b.displayName || b.handle).toLowerCase();
      return aName.localeCompare(bName);
    });
  }, [massBlockUsers]);

  const usersToBlock = useMemo(() => {
    return massBlockUsers.filter(u => !massBlockExcluded.has(u.did) && !u.alreadyBlocked);
  }, [massBlockUsers, massBlockExcluded]);

  const relationshipWarnings = useMemo(() => {
    return usersToBlock.filter(u => u.followsYou || u.youFollow);
  }, [usersToBlock]);

  const handleExecuteMassBlock = async () => {
    if (usersToBlock.length === 0) return;
    
    setIsExecutingBlock(true);
    setBlockExecutionProgress(`Blocking 0/${usersToBlock.length}...`);
    
    try {
      const result = await blockMultipleUsers(
        usersToBlock.map(u => u.did),
        (completed, total) => {
          setBlockExecutionProgress(`Blocking ${completed}/${total}...`);
        }
      );
      
      // Refresh the blocked accounts list
      loadBlocks();
      
      // Clear mass block state
      setMassBlockUsers([]);
      setMassBlockExcluded(new Set());
      setPostUrl('');
      setBlockExecutionProgress('');
      
      // Show result
      if (result.failed > 0) {
        setMassBlockError(`Blocked ${result.succeeded} accounts. ${result.failed} failed.`);
      }
    } catch (err) {
      console.error('Mass block failed:', err);
      setMassBlockError('Mass block failed. Please try again.');
    } finally {
      setIsExecutingBlock(false);
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
              onClick={() => window.location.href = buildProfileUrl(session?.handle || '', session?.did)}
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
          <SettingsPanel />
        </aside>

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
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Block Management</h2>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Manage your blocked accounts and use mass blocking to quickly block everyone who engaged with a specific post—useful when dealing with pile-ons or coordinated harassment.
            </p>
            
            {/* Mass Block Section */}
            <div className="mb-4">
              <button
                onClick={() => setMassBlockExpanded(!massBlockExpanded)}
                className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${massBlockExpanded ? 'rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Mass Block from Post
              </button>
              
              {massBlockExpanded && (
                <div className="mt-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-3">
                  {/* URL input */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Post URL</label>
                    <input
                      type="text"
                      placeholder="Paste a Bluesky or Lea post URL"
                      value={postUrl}
                      onChange={(e) => setPostUrl(e.target.value)}
                      disabled={massBlockLoading || isExecutingBlock}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    />
                  </div>
                  
                  {/* Options */}
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={blockLikers}
                        onChange={(e) => setBlockLikers(e.target.checked)}
                        disabled={massBlockLoading || isExecutingBlock}
                        className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                      />
                      Block likers
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={blockReposters}
                        onChange={(e) => setBlockReposters(e.target.checked)}
                        disabled={massBlockLoading || isExecutingBlock}
                        className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                      />
                      Block reposters
                    </label>
                  </div>
                  
                  {/* Fetch button */}
                  <button
                    onClick={handleFetchPostEngagers}
                    disabled={!postUrl.trim() || massBlockLoading || isExecutingBlock}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {massBlockLoading ? massBlockProgress : 'Fetch Accounts'}
                  </button>
                  
                  {/* Error message */}
                  {massBlockError && (
                    <p className="text-sm text-red-500">{massBlockError}</p>
                  )}
                  
                  {/* Results preview */}
                  {massBlockUsers.length > 0 && (
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Found {massBlockUsers.length} account{massBlockUsers.length !== 1 ? 's' : ''}
                          {massBlockUsers.filter(u => u.alreadyBlocked).length > 0 && (
                            <span className="text-gray-500"> ({massBlockUsers.filter(u => u.alreadyBlocked).length} already blocked)</span>
                          )}
                        </p>
                        <p className="text-sm text-gray-500">
                          {usersToBlock.length} to block
                        </p>
                      </div>
                      
                      {/* Relationship warnings */}
                      {relationshipWarnings.length > 0 && (
                        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                          <div className="flex items-start gap-2">
                            <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <div>
                              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                                Warning: {relationshipWarnings.length} account{relationshipWarnings.length !== 1 ? 's have' : ' has'} a relationship with you
                              </p>
                              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                                These are marked below. Uncheck them to skip blocking.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* User list */}
                      <div className="max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
                        {sortedMassBlockUsers.map((user) => (
                          <div
                            key={user.did}
                            className={`flex items-center gap-3 px-3 py-2 ${
                              user.alreadyBlocked ? 'bg-gray-100 dark:bg-gray-800 opacity-60' : ''
                            } ${(user.followsYou || user.youFollow) && !user.alreadyBlocked ? 'bg-amber-50 dark:bg-amber-900/10' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={!massBlockExcluded.has(user.did) && !user.alreadyBlocked}
                              onChange={() => toggleExclude(user.did)}
                              disabled={user.alreadyBlocked || isExecutingBlock}
                              className="rounded border-gray-300 text-blue-500 focus:ring-blue-500 disabled:opacity-50"
                            />
                            {user.avatar ? (
                              <img src={user.avatar} alt="" className="w-8 h-8 rounded-full" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                                <span className="text-xs font-medium text-gray-500">
                                  {(user.displayName || user.handle)[0].toUpperCase()}
                                </span>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                {user.displayName || user.handle}
                              </p>
                              <p className="text-xs text-gray-500 truncate">@{user.handle}</p>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {user.alreadyBlocked && (
                                <span className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
                                  Blocked
                                </span>
                              )}
                              {user.youFollow && !user.alreadyBlocked && (
                                <span className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">
                                  Following
                                </span>
                              )}
                              {user.followsYou && !user.alreadyBlocked && (
                                <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full">
                                  Follows you
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {/* Execute button */}
                      <div className="flex items-center justify-between pt-2">
                        <button
                          onClick={() => {
                            setMassBlockUsers([]);
                            setMassBlockExcluded(new Set());
                          }}
                          disabled={isExecutingBlock}
                          className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 disabled:opacity-50"
                        >
                          Clear
                        </button>
                        <button
                          onClick={handleExecuteMassBlock}
                          disabled={usersToBlock.length === 0 || isExecutingBlock}
                          className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isExecutingBlock ? blockExecutionProgress : `Block ${usersToBlock.length} Account${usersToBlock.length !== 1 ? 's' : ''}`}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* View Blocked Accounts Section */}
            <div>
              <button
                onClick={() => setBlockedListExpanded(!blockedListExpanded)}
                className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${blockedListExpanded ? 'rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                View Blocked Accounts
              </button>
              
              {blockedListExpanded && (
                <div className="mt-3">
                  {/* Search input */}
                  <div className="relative mb-3">
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
                  
                  {/* Blocked accounts list */}
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700 max-h-96 overflow-y-auto">
                    {loadingBlocks && blockedAccounts.length === 0 ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin w-6 h-6 border-3 border-blue-500 border-t-transparent rounded-full"></div>
                      </div>
                    ) : filteredAccounts.length === 0 ? (
                      <div className="text-center py-8 px-4">
                        <svg className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                        <p className="text-sm text-gray-500">
                          {searchQuery ? 'No blocked accounts match your search' : 'No blocked accounts'}
                        </p>
                      </div>
                    ) : (
                      <>
                        {filteredAccounts.map((account) => (
                          <div
                            key={account.did}
                            className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
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
                                  className="w-10 h-10 rounded-full"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                                  <span className="text-sm font-medium text-gray-500">
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
                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate hover:underline">
                                  {account.displayName || account.handle}
                                </p>
                                <p className="text-xs text-gray-500 truncate">@{account.handle}</p>
                              </button>
                            </div>

                            {/* Unblock button */}
                            <button
                              onClick={() => handleUnblock(account)}
                              disabled={unblockingDid === account.did}
                              className="px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full transition-colors disabled:opacity-50 flex-shrink-0"
                            >
                              {unblockingDid === account.did ? '...' : 'Unblock'}
                            </button>
                          </div>
                        ))}

                        {/* Load more button */}
                        {hasMore && !searchQuery && (
                          <div className="p-3 text-center border-t border-gray-200 dark:border-gray-700">
                            <button
                              onClick={() => loadBlocks(true)}
                              disabled={loadingBlocks}
                              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50"
                            >
                              {loadingBlocks ? 'Loading...' : 'Load more'}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
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
