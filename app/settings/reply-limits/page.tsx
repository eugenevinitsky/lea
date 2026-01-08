'use client';

import { useState, useEffect, useCallback } from 'react';
import { restoreSession, getSession, getBlueskyProfile, getUserPostsForThreadgate, updateThreadgate, ThreadgateType, buildProfileUrl } from '@/lib/bluesky';
import { SettingsProvider, useSettings } from '@/lib/settings';
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

function ReplyLimitsContent() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerified, setIsVerified] = useState(false);
  const { setUserDid } = useBookmarks();
  const { settings, updateSettings } = useSettings();

  // Reply limits state
  const [replyLimit, setReplyLimit] = useState<ThreadgateType>('following');
  const [applyingTo, setApplyingTo] = useState<'future' | 'past' | 'both' | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState<string | null>(null);

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

  // Load saved preference on mount
  useEffect(() => {
    const saved = localStorage.getItem('lea-default-threadgate');
    if (saved && ['following', 'verified', 'researchers', 'open'].includes(saved)) {
      setReplyLimit(saved as ThreadgateType);
    }
  }, []);

  const handleReplyLimitChange = (newLimit: ThreadgateType) => {
    setReplyLimit(newLimit);
    setApplyError(null);
    setApplySuccess(null);
  };

  const applyToFuture = async () => {
    setApplyingTo('future');
    setApplyError(null);
    setApplySuccess(null);
    try {
      localStorage.setItem('lea-default-threadgate', replyLimit);
      setApplySuccess('Default saved for future posts');
    } catch {
      setApplyError('Failed to save preference');
    } finally {
      setApplyingTo(null);
    }
  };

  const applyToPast = async () => {
    setApplyingTo('past');
    setApplyError(null);
    setApplySuccess(null);
    setProgress({ current: 0, total: 0 });
    
    try {
      const result = await getUserPostsForThreadgate();
      const posts = result.posts;
      setProgress({ current: 0, total: posts.length });
      
      let completed = 0;
      for (const post of posts) {
        await updateThreadgate(post.uri, replyLimit);
        completed++;
        setProgress({ current: completed, total: posts.length });
      }
      
      setApplySuccess(`Updated ${posts.length} posts`);
    } catch (err) {
      console.error('Failed to apply threadgate:', err);
      setApplyError('Failed to update some posts');
    } finally {
      setApplyingTo(null);
      setProgress(null);
    }
  };

  const applyToBoth = async () => {
    setApplyingTo('both');
    setApplyError(null);
    setApplySuccess(null);
    
    try {
      localStorage.setItem('lea-default-threadgate', replyLimit);
      
      setProgress({ current: 0, total: 0 });
      const result = await getUserPostsForThreadgate();
      const posts = result.posts;
      setProgress({ current: 0, total: posts.length });
      
      let completed = 0;
      for (const post of posts) {
        await updateThreadgate(post.uri, replyLimit);
        completed++;
        setProgress({ current: completed, total: posts.length });
      }
      
      setApplySuccess(`Saved default and updated ${posts.length} posts`);
    } catch (err) {
      console.error('Failed to apply threadgate:', err);
      setApplyError('Failed to update some posts');
    } finally {
      setApplyingTo(null);
      setProgress(null);
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
          window.location.href = `/post/${profile.handle}/${rkey}`;
          return;
        }
      } catch {
        // Fall through
      }
      window.location.href = `/post/${did}/${rkey}`;
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
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Reply Limits</h2>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Control who can reply to your posts. You can set a default for future posts and apply limits to your existing posts.
            </p>
          </div>

          {/* Content */}
          <div className="p-4 space-y-6">
            {/* Auto-apply toggle */}
            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <label className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">Auto-apply to new posts</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Automatically apply your chosen limit when you post</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.autoThreadgate}
                  onChange={(e) => updateSettings({ autoThreadgate: e.target.checked })}
                  className="w-5 h-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                />
              </label>
            </div>

            {/* Reply limit options */}
            <div className="space-y-3">
              <h3 className="font-medium text-gray-900 dark:text-gray-100">Who can reply?</h3>
              
              <div className="space-y-2">
                {[
                  { value: 'following', label: 'People I follow', description: 'Only accounts you follow can reply' },
                  { value: 'researchers', label: 'Verified researchers only', description: 'Only verified researchers can reply' },
                  { value: 'open', label: 'Everyone', description: 'Anyone can reply to your posts' },
                ].map((option) => (
                  <label
                    key={option.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      replyLimit === option.value
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <input
                      type="radio"
                      name="replyLimit"
                      value={option.value}
                      checked={replyLimit === option.value}
                      onChange={(e) => handleReplyLimitChange(e.target.value as ThreadgateType)}
                      className="mt-1 w-4 h-4 text-blue-500 focus:ring-blue-500"
                    />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{option.label}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{option.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-3">
              <h3 className="font-medium text-gray-900 dark:text-gray-100">Apply settings</h3>
              
              <button
                onClick={applyToFuture}
                disabled={applyingTo !== null}
                className="w-full px-4 py-2.5 text-sm font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
              >
                Set as default for future posts
              </button>
              
              <button
                onClick={applyToPast}
                disabled={applyingTo !== null}
                className="w-full px-4 py-2.5 text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {applyingTo === 'past' ? 'Applying...' : 'Apply to all past posts'}
              </button>
              
              <button
                onClick={applyToBoth}
                disabled={applyingTo !== null}
                className="w-full px-4 py-2.5 text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                Apply to all (future + past)
              </button>
            </div>

            {/* Progress indicator */}
            {progress && (
              <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                  <span>Updating posts...</span>
                  <span>{progress.current} / {progress.total}</span>
                </div>
                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {/* Success/Error messages */}
            {applySuccess && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                <p className="text-sm text-emerald-700 dark:text-emerald-300">{applySuccess}</p>
              </div>
            )}
            {applyError && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-700 dark:text-red-300">{applyError}</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function ReplyLimitsPage() {
  return (
    <SettingsProvider>
      <BookmarksProvider>
        <FeedsProvider>
          <FollowingProvider>
            <ReplyLimitsContent />
          </FollowingProvider>
        </FeedsProvider>
      </BookmarksProvider>
    </SettingsProvider>
  );
}
