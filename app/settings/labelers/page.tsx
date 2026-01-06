'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { restoreSession, getSession, getBlueskyProfile, getPreferences, getLabelerInfo, LabelerInfo } from '@/lib/bluesky';
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

// Suggested labelers
const SUGGESTED_LABELERS = [
  {
    did: 'did:plc:saslbwamakedc4h6c5bmshvz',
    handle: 'labeler.hailey.at',
    displayName: "Hailey's Labeler",
    description: 'A labeler by @hailey.at. Labels are not absolute judgements, but rather information about the type of account or content you may be interacting with.',
  },
  {
    did: 'did:plc:e4elbtctnfqocyfcml6h2lf7',
    handle: 'skywatch.blue',
    displayName: 'Skywatch Blue / Anti-Alf Aktion',
    description: 'Ceaseless watcher, turn your gaze upon this wretched thing. Independent Labeling Service.',
  },
  {
    did: 'did:plc:d2mkddsbmnrgr3domzg5qexf',
    handle: 'moderation.blacksky.app',
    displayName: 'Blacksky Moderation',
    description: 'Building the intercommunal net where communities can use decentralized tools to govern themselves, pool resources, and stay safe on their own terms.',
  },
  {
    did: 'did:plc:oubsyca6hhgqhmbbk27lvs7c',
    handle: 'stechlab-labels.bsky.social',
    displayName: 'STech Lab Labels',
    description: 'A research project from Cornell Tech, investigating using automated signals to help users have more context about the accounts they are interacting with.',
  },
];

function LabelersContent() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerified, setIsVerified] = useState(false);
  const { setUserDid } = useBookmarks();

  // Labelers state
  const [labelers, setLabelers] = useState<LabelerInfo[]>([]);
  const [loadingLabelers, setLoadingLabelers] = useState(false);
  const [showSuggestedModal, setShowSuggestedModal] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Restore session on mount
  useEffect(() => {
    setMounted(true);
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

  // Load labelers when logged in
  useEffect(() => {
    if (isLoggedIn && !loadingLabelers && labelers.length === 0) {
      loadLabelers();
    }
  }, [isLoggedIn]);

  const loadLabelers = async () => {
    setLoadingLabelers(true);
    try {
      const prefs = await getPreferences();
      const labelerInfos: LabelerInfo[] = [];
      
      for (const labeler of prefs.labelers) {
        try {
          const info = await getLabelerInfo(labeler.did);
          if (info) {
            labelerInfos.push(info);
          }
        } catch (err) {
          console.error(`Failed to load labeler ${labeler.did}:`, err);
        }
      }
      
      setLabelers(labelerInfos);
    } catch (err) {
      console.error('Failed to load labelers:', err);
    } finally {
      setLoadingLabelers(false);
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
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Labelers</h2>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Labelers help identify content and accounts. You can subscribe to labelers on Bluesky to see their labels in Lea.
            </p>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Subscribed labelers */}
            <div>
              <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Your subscribed labelers</h3>
              
              {loadingLabelers ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin w-6 h-6 border-3 border-blue-500 border-t-transparent rounded-full"></div>
                </div>
              ) : labelers.length === 0 ? (
                <div className="text-center py-8 px-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <svg className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  <p className="text-sm text-gray-500">No labelers subscribed</p>
                  <p className="text-xs text-gray-400 mt-1">Subscribe to labelers on Bluesky to see them here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {labelers.map((labeler) => (
                    <a
                      key={labeler.did}
                      href={`https://bsky.app/profile/${labeler.handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      {labeler.avatar ? (
                        <img
                          src={labeler.avatar}
                          alt={labeler.displayName || labeler.handle}
                          className="w-10 h-10 rounded-full"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
                          {(labeler.displayName || labeler.handle)[0].toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                          {labeler.displayName || labeler.handle}
                        </p>
                        <p className="text-sm text-gray-500 truncate">@{labeler.handle}</p>
                      </div>
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Discover more button */}
            <button
              onClick={() => setShowSuggestedModal(true)}
              className="w-full py-3 px-4 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Discover more labelers
            </button>

            {/* Refresh button */}
            <button
              onClick={loadLabelers}
              disabled={loadingLabelers}
              className="w-full py-2 px-4 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <svg className={`w-4 h-4 ${loadingLabelers ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {loadingLabelers ? 'Refreshing...' : 'Refresh list'}
            </button>
          </div>
        </main>
      </div>

      {/* Suggested Labelers Modal */}
      {showSuggestedModal && mounted && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 99999, isolation: 'isolate' }}
          onClick={() => setShowSuggestedModal(false)}
        >
          <div className="absolute inset-0 bg-black/50" style={{ zIndex: -1 }} />
          <div
            className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-md w-full max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Suggested Labelers</h3>
              <button
                onClick={() => setShowSuggestedModal(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Labelers help identify content and accounts. You can subscribe to labelers on Bluesky to see their labels in Lea.
              </p>
              <div className="space-y-3">
                {SUGGESTED_LABELERS.map((labeler) => (
                  <a
                    key={labeler.did}
                    href={`https://bsky.app/profile/${labeler.handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
                        {labeler.displayName[0]}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{labeler.displayName}</p>
                        <p className="text-sm text-gray-500">@{labeler.handle}</p>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{labeler.description}</p>
                    <div className="mt-2 flex items-center gap-1 text-xs text-blue-500">
                      <span>View on Bluesky</span>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default function LabelersPage() {
  return (
    <SettingsProvider>
      <BookmarksProvider>
        <FeedsProvider>
          <FollowingProvider>
            <LabelersContent />
          </FollowingProvider>
        </FeedsProvider>
      </BookmarksProvider>
    </SettingsProvider>
  );
}
