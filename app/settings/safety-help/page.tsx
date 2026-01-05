'use client';

import { useState, useEffect, useCallback } from 'react';
import { restoreSession, getSession, getBlueskyProfile } from '@/lib/bluesky';
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

function SafetyHelpContent() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerified, setIsVerified] = useState(false);
  const { setUserDid } = useBookmarks();

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
            <div className="flex items-center gap-3">
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
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Safety & Harassment Help</h2>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 space-y-6">
            {/* Intro */}
            <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <div>
                  <h3 className="font-semibold text-rose-800 dark:text-rose-200 mb-1">If you&apos;re being harassed</h3>
                  <p className="text-sm text-rose-700 dark:text-rose-300">
                    Lea has several safety features to help you protect yourself. This guide will walk you through your options.
                  </p>
                </div>
              </div>
            </div>

            {/* Immediate Actions */}
            <section>
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm font-bold">1</span>
                Immediate Actions
              </h3>
              
              <div className="space-y-4">
                {/* Block the account */}
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                    Block the account
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Blocking prevents someone from seeing your posts and interacting with you. On any profile, click the menu (•••) and select &quot;Block Account&quot;. When you block someone on Lea/Bluesky, your block is <i>total</i>: no one will be able to see any of your interactions any more (for example, any replies they left on your posts will disappear), and neither of you will be able to interact in the future.
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    <strong>Tip:</strong> You can manage all your blocks from the Moderation panel → Blocked Accounts.
                  </p>
                </div>

                {/* Mass block */}
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    Block multiple accounts (pile-on)
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    If you&apos;re facing a pile-on, you can block everyone who liked or reposted a specific post all at once. Go to <a href="/settings/blocked" className="text-blue-500 hover:underline">Block Management</a> and expand &quot;Mass Block from Post&quot;.
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    <strong>How it works:</strong> Paste the post URL, preview who will be blocked, exclude any accounts you want to keep, then execute the block.
                  </p>
                </div>
              </div>
            </section>

            {/* Limit Replies */}
            <section>
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-sm font-bold">2</span>
                Control Who Can Reply
              </h3>
              
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Limit who can reply to your posts
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  In the Moderation panel, find &quot;Reply Limits&quot; to control who can reply:
                </p>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1.5 ml-4">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 mt-1">•</span>
                    <span><strong>Everyone</strong> — Anyone can reply (default)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 mt-1">•</span>
                    <span><strong>People I follow</strong> — Only accounts you follow can reply</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 mt-1">•</span>
                    <span><strong>Verified researchers</strong> — Only verified researcher accounts can reply</span>
                  </li>
                </ul>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-3">
                  <strong>Tip:</strong> You can apply these limits to just future posts, just past posts, or both.
                </p>
              </div>
            </section>

            {/* Quote Control */}
            <section>
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-sm font-bold">3</span>
                Control Quotes of Your Posts
              </h3>
              
              <div className="space-y-4">
                {/* Disable quotes on new posts */}
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                    Disable quotes on new posts
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    When composing a post, look for the option to disable quotes. This prevents others from quote-posting your content. Useful if you expect a post might attract negative attention.
                  </p>
                </div>

                {/* Detach from quote */}
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    Detach from an existing quote
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    If someone has already quoted your post in a harassing way, you can &quot;detach&quot; your post from their quote. This removes your content from their post.
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    <strong>How to:</strong> On the quote post, click the menu (•••) and look for &quot;Detach Quote&quot; or similar option.
                  </p>
                </div>
              </div>
            </section>

            {/* Content Filtering */}
            <section>
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-sm font-bold">4</span>
                Filter Your Feed
              </h3>
              
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  Use content filters and labelers
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  In the Moderation panel, find &quot;Content Filtering&quot; to hide certain types of content, and &quot;Labelers&quot; to subscribe to community moderation services that can help filter out bad actors.
                </p>
              </div>
            </section>

            {/* Final note */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-1">Remember</h3>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    You don&apos;t owe anyone your attention or engagement. It&apos;s okay to use these tools liberally to protect your peace of mind. You can always adjust your settings later when things calm down.
                  </p>
                </div>
              </div>
            </div>

            {/* Quick links */}
            <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Quick Links</h4>
              <div className="flex flex-wrap gap-2">
                <a
                  href="/settings/blocked"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  Block Management
                </a>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function SafetyHelpPage() {
  return (
    <SettingsProvider>
      <BookmarksProvider>
        <FeedsProvider>
          <FollowingProvider>
            <SafetyHelpContent />
          </FollowingProvider>
        </FeedsProvider>
      </BookmarksProvider>
    </SettingsProvider>
  );
}
