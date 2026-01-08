'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { restoreSession, getSession, getBlueskyProfile, resolveHandle, buildProfileUrl, buildPostUrl } from '@/lib/bluesky';
import { SettingsProvider } from '@/lib/settings';
import { BookmarksProvider, useBookmarks } from '@/lib/bookmarks';
import { FeedsProvider } from '@/lib/feeds';
import { FollowingProvider } from '@/lib/following-context';
import Login from '@/components/Login';
import ThreadView from '@/components/ThreadView';
import Bookmarks from '@/components/Bookmarks';
import DMSidebar from '@/components/DMSidebar';
import Notifications from '@/components/Notifications';
import ModerationBox from '@/components/ModerationBox';
import SafetyPanel from '@/components/SafetyPanel';
import ResearcherSearch from '@/components/ResearcherSearch';

function PostPageContent() {
  const params = useParams();
  const router = useRouter();
  const handle = params.handle as string;
  const rkey = params.rkey as string;

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [postUri, setPostUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
          // Check verification status
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

  // Resolve handle to DID and construct post URI
  useEffect(() => {
    async function resolvePost() {
      if (!isLoggedIn || !handle || !rkey) return;

      try {
        // Handle could be a DID or handle - resolve it
        let did = handle;
        if (!handle.startsWith('did:')) {
          const resolved = await resolveHandle(handle);
          if (!resolved) {
            setError('User not found');
            return;
          }
          did = resolved;
        }

        // Construct AT URI
        const uri = `at://${did}/app.bsky.feed.post/${rkey}`;
        setPostUri(uri);
      } catch (err) {
        console.error('Failed to resolve post:', err);
        setError('Failed to load post');
      }
    }

    resolvePost();
  }, [isLoggedIn, handle, rkey]);

  const handleLogin = () => {
    setIsLoggedIn(true);
    const session = getSession();
    if (session?.did) {
      setUserDid(session.did);
    }
  };

  // Navigate to a profile
  const navigateToProfile = useCallback(async (did: string) => {
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

  // Navigate to a different thread
  const navigateToThread = useCallback(async (uri: string) => {
    // Parse the AT URI to extract handle and rkey
    // Format: at://did:plc:xxx/app.bsky.feed.post/rkey
    const match = uri.match(/^at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/);
    if (match) {
      const [, did, postRkey] = match;
      // Resolve DID to handle for cleaner URL
      try {
        const profile = await getBlueskyProfile(did);
        if (profile?.handle) {
          router.push(buildPostUrl(profile.handle, postRkey, profile.did));
          return;
        }
      } catch {
        // Fall through to use DID
      }
      router.push(buildPostUrl(did, postRkey));
    }
  }, [router]);

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
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
              title="Go back"
            >
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <h1
              className="text-xl font-bold text-blue-500 cursor-pointer hover:text-blue-600 transition-colors"
              onClick={() => window.location.href = '/'}
            >Lea</h1>
          </div>
          <div className="flex items-center gap-3">
            <ResearcherSearch onSelectResearcher={navigateToProfile} onOpenThread={navigateToThread} onSearch={(q) => window.location.href = `/search?q=${encodeURIComponent(q)}`} />
            <button
              onClick={() => window.location.href = `/u/${session?.handle}`}
              className="px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-full transition-colors"
            >
              @{session?.handle}
            </button>
            {isVerified ? (
              <span
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 rounded-full"
                title="You are a verified researcher"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                </svg>
                Verified
              </span>
            ) : (
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
        {/* Left Sidebar - Bookmarks & Messages */}
        <aside className="hidden lg:block w-72 flex-shrink-0 sticky top-16 max-h-[calc(100vh-5rem)] overflow-y-auto pt-4 pb-4 space-y-4 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700">
          <Bookmarks onOpenPost={navigateToThread} onOpenProfile={navigateToProfile} />
          <DMSidebar />
          <Notifications onOpenPost={navigateToThread} onOpenProfile={navigateToProfile} />
          <ModerationBox onOpenProfile={navigateToProfile} />
          <SafetyPanel onOpenProfile={navigateToProfile} onOpenThread={navigateToThread} />
        </aside>

        {/* Main content */}
        <main className="flex-1 w-full lg:max-w-xl bg-white dark:bg-gray-950 min-h-screen border-x border-gray-200 dark:border-gray-800">
          {/* Thread header */}
          <div className="sticky top-14 z-10 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Thread</h2>
          </div>

          {error ? (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="w-16 h-16 mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Post not found</p>
              <p className="text-gray-500">{error}</p>
              <button
                onClick={() => window.location.href = '/'}
                className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600"
              >
                Back to feed
              </button>
            </div>
          ) : postUri ? (
            <ThreadView
              uri={postUri}
              onClose={() => window.location.href = '/'}
              onOpenThread={navigateToThread}
              onOpenProfile={navigateToProfile}
              inline
            />
          ) : (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function PostPage() {
  return (
    <SettingsProvider>
      <BookmarksProvider>
        <FeedsProvider>
          <FollowingProvider>
            <PostPageContent />
          </FollowingProvider>
        </FeedsProvider>
      </BookmarksProvider>
    </SettingsProvider>
  );
}
