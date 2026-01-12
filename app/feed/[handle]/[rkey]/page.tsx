'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { restoreSession, getSession, getBlueskyProfile, logout, getFeedGenerator, likeFeed, unlikeFeed, FeedGeneratorInfo, buildProfileUrl } from '@/lib/bluesky';
import { SettingsProvider } from '@/lib/settings';
import { BookmarksProvider, useBookmarks } from '@/lib/bookmarks';
import { FeedsProvider, useFeeds } from '@/lib/feeds';
import { FollowingProvider } from '@/lib/following-context';
import Login from '@/components/Login';
import Bookmarks from '@/components/Bookmarks';
import DMSidebar from '@/components/DMSidebar';
import Notifications from '@/components/Notifications';
import ModerationBox from '@/components/ModerationBox';
import SafetyPanel from '@/components/SafetyPanel';
import SettingsPanel from '@/components/SettingsPanel';
import ResearcherSearch from '@/components/ResearcherSearch';
import ThreadView from '@/components/ThreadView';
import Onboarding from '@/components/Onboarding';

function FeedPageContent() {
  const params = useParams();
  const handle = params.handle as string;
  const rkey = params.rkey as string;
  
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [feedInfo, setFeedInfo] = useState<FeedGeneratorInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [threadUri, setThreadUri] = useState<string | null>(null);
  const [liking, setLiking] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStartStep, setOnboardingStartStep] = useState(1);
  const { setUserDid } = useBookmarks();
  const { pinnedFeeds, addFeed, removeFeed } = useFeeds();

  // Restore session on mount
  useEffect(() => {
    restoreSession().then((restored) => {
      if (restored) {
        setIsLoggedIn(true);
        const session = getSession();
        if (session?.did) {
          setUserDid(session.did);
          // Check verification status
          fetch(`/api/researchers/check?did=${session.did}`)
            .then(res => res.json())
            .then(data => {
              if (data.isVerified) {
                setIsVerified(true);
              }
            })
            .catch(() => {});
        }
      }
      setIsLoading(false);
    });
  }, [setUserDid]);

  // Load feed info once logged in
  useEffect(() => {
    async function loadFeed() {
      if (!isLoggedIn || !handle || !rkey) return;
      
      try {
        // The handle param might be a DID (did:plc:xxx) or a handle (user.bsky.social)
        // URL decoding is needed because colons get encoded
        const decodedHandle = decodeURIComponent(handle);
        
        let creatorDid = decodedHandle;
        if (!decodedHandle.startsWith('did:')) {
          // It's a handle, resolve to DID
          const profile = await getBlueskyProfile(decodedHandle);
          if (profile) {
            creatorDid = profile.did;
          } else {
            setError('Creator not found');
            return;
          }
        }
        
        // Construct feed URI
        const feedUri = `at://${creatorDid}/app.bsky.feed.generator/${rkey}`;
        
        // Get feed info
        const info = await getFeedGenerator(feedUri);
        setFeedInfo(info);
      } catch (err) {
        console.error('Failed to load feed:', err);
        setError('Failed to load feed');
      }
    }
    
    loadFeed();
  }, [isLoggedIn, handle, rkey]);

  const handleLogin = () => {
    setIsLoggedIn(true);
    const session = getSession();
    if (session?.did) {
      setUserDid(session.did);
    }
  };

  const handleLogout = () => {
    logout();
    setIsLoggedIn(false);
    setUserDid(null);
  };

  const handleOpenProfile = (did: string) => {
    getBlueskyProfile(did).then(profile => {
      if (profile?.handle) {
        window.location.href = buildProfileUrl(profile.handle, profile.did);
      } else {
        window.location.href = buildProfileUrl(did);
      }
    }).catch(() => {
      window.location.href = buildProfileUrl(did);
    });
  };

  const openThread = useCallback(async (uri: string | null) => {
    if (!uri) {
      setThreadUri(null);
      return;
    }

    const match = uri.match(/^at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/);
    if (match) {
      const [, did, postRkey] = match;
      try {
        const profile = await getBlueskyProfile(did);
        if (profile?.handle) {
          window.location.href = `/post/${profile.handle}/${postRkey}`;
          return;
        }
      } catch {
        // Fall through to use DID
      }
      window.location.href = `/post/${did}/${postRkey}`;
    } else {
      setThreadUri(uri);
    }
  }, []);

  const handleLike = async () => {
    if (!feedInfo || liking) return;
    
    setLiking(true);
    try {
      if (feedInfo.viewer?.like) {
        // Unlike
        await unlikeFeed(feedInfo.viewer.like);
        setFeedInfo({
          ...feedInfo,
          likeCount: (feedInfo.likeCount || 1) - 1,
          viewer: { ...feedInfo.viewer, like: undefined },
        });
      } else {
        // Like
        const result = await likeFeed(feedInfo.uri, feedInfo.cid);
        setFeedInfo({
          ...feedInfo,
          likeCount: (feedInfo.likeCount || 0) + 1,
          viewer: { ...feedInfo.viewer, like: result.uri },
        });
      }
    } catch (err) {
      console.error('Failed to like/unlike feed:', err);
    } finally {
      setLiking(false);
    }
  };

  const isPinned = feedInfo ? pinnedFeeds.some(f => f.uri === feedInfo.uri) : false;

  const handlePin = () => {
    if (!feedInfo) return;
    
    if (isPinned) {
      removeFeed(feedInfo.uri);
    } else {
      addFeed({
        uri: feedInfo.uri,
        displayName: feedInfo.displayName,
        type: 'feed',
        acceptsInteractions: feedInfo.acceptsInteractions ?? false,
      });
    }
  };

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

  if (showOnboarding) {
    return <Onboarding onComplete={() => { setShowOnboarding(false); setOnboardingStartStep(1); }} startAtStep={onboardingStartStep} />;
  }

  const session = getSession();

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
            <ResearcherSearch onSelectResearcher={handleOpenProfile} onOpenThread={openThread} onSearch={(q) => window.location.href = `/search?q=${encodeURIComponent(q)}`} />
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
            {!isVerified && (
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
          {/* Back button */}
          <div className="sticky top-14 z-10 bg-white/80 dark:bg-gray-950/80 backdrop-blur border-b border-gray-200 dark:border-gray-800 p-3">
            <button
              onClick={() => window.history.back()}
              className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
          </div>

          {/* Error state */}
          {error && (
            <div className="p-8 text-center">
              <p className="text-red-500">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600"
              >
                Retry
              </button>
            </div>
          )}

          {/* Loading state */}
          {!error && !feedInfo && (
            <div className="p-8 flex justify-center">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
          )}

          {/* Feed info */}
          {feedInfo && (
            <div className="p-6">
              {/* Feed header */}
              <div className="flex items-start gap-4 mb-6">
                {/* Feed avatar */}
                {feedInfo.avatar ? (
                  <img
                    src={feedInfo.avatar}
                    alt={feedInfo.displayName}
                    className="w-20 h-20 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
                    <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                    </svg>
                  </div>
                )}

                {/* Feed name and creator */}
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {feedInfo.displayName}
                  </h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    by{' '}
                    <button
                      onClick={() => handleOpenProfile(feedInfo.creator.did)}
                      className="text-blue-500 hover:underline"
                    >
                      @{feedInfo.creator.handle}
                    </button>
                  </p>
                </div>
              </div>

              {/* Description */}
              {feedInfo.description && (
                <p className="text-gray-700 dark:text-gray-300 mb-6 whitespace-pre-wrap">
                  {feedInfo.description}
                </p>
              )}

              {/* Stats and actions */}
              <div className="flex items-center gap-4 mb-6">
                {/* Like button */}
                <button
                  onClick={handleLike}
                  disabled={liking}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full transition-colors ${
                    feedInfo.viewer?.like
                      ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  <svg
                    className={`w-5 h-5 ${feedInfo.viewer?.like ? 'fill-current' : ''}`}
                    fill={feedInfo.viewer?.like ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  <span>{feedInfo.likeCount?.toLocaleString() || 0}</span>
                </button>

                {/* Pin/Unpin button */}
                <button
                  onClick={handlePin}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full transition-colors ${
                    isPinned
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  <svg className="w-5 h-5" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  <span>{isPinned ? 'Pinned' : 'Pin to feeds'}</span>
                </button>
              </div>

              {/* Additional metadata */}
              <div className="border-t border-gray-200 dark:border-gray-800 pt-4 space-y-3">
                {feedInfo.indexedAt && (
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>Created {new Date(feedInfo.indexedAt).toLocaleDateString()}</span>
                  </div>
                )}
                
                {feedInfo.acceptsInteractions && (
                  <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                    </svg>
                    <span>This feed learns from your interactions</span>
                  </div>
                )}

                {/* Link to Bluesky */}
                <div className="pt-2">
                  <a
                    href={`https://bsky.app/profile/${feedInfo.creator.handle}/feed/${rkey}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-500 hover:text-blue-600"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    View on Bluesky
                  </a>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Thread View Modal */}
      {threadUri && (
        <ThreadView uri={threadUri} onClose={() => setThreadUri(null)} />
      )}
    </div>
  );
}

export default function FeedPage() {
  return (
    <SettingsProvider>
      <BookmarksProvider>
        <FeedsProvider>
          <FollowingProvider>
            <FeedPageContent />
          </FollowingProvider>
        </FeedsProvider>
      </BookmarksProvider>
    </SettingsProvider>
  );
}
