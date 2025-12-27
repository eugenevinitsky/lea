'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { restoreSession, getSession, getBlueskyProfile } from '@/lib/bluesky';
import { SettingsProvider } from '@/lib/settings';
import { BookmarksProvider } from '@/lib/bookmarks';
import { FeedsProvider } from '@/lib/feeds';
import ProfileView from '@/components/ProfileView';
import Login from '@/components/Login';

function ProfilePageContent() {
  const params = useParams();
  const router = useRouter();
  const handle = params.handle as string;
  
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [profileDid, setProfileDid] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // Restore session on mount
  useEffect(() => {
    restoreSession().then((restored) => {
      if (restored) {
        setIsLoggedIn(true);
      }
      setIsLoading(false);
    });
  }, []);

  // Resolve handle to DID once logged in
  useEffect(() => {
    async function resolveHandle() {
      if (!isLoggedIn || !handle) return;
      
      try {
        // getBlueskyProfile accepts both handle and DID
        const profile = await getBlueskyProfile(handle);
        if (profile) {
          setProfileDid(profile.did);
        } else {
          setResolveError('User not found');
        }
      } catch (err) {
        console.error('Failed to resolve handle:', err);
        setResolveError('Failed to load profile');
      }
    }
    
    resolveHandle();
  }, [isLoggedIn, handle]);

  const handleLogin = () => {
    setIsLoggedIn(true);
  };

  const handleClose = () => {
    router.push('/');
  };

  const handleOpenProfile = (did: string) => {
    // We need to get the handle for the URL
    // For now, redirect to the main page with the profile open
    // The main page will handle showing the profile
    getBlueskyProfile(did).then(profile => {
      if (profile?.handle) {
        router.push(`/${profile.handle}`);
      }
    });
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

  const session = getSession();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/80 dark:bg-black/80 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 
            className="text-xl font-bold text-blue-500 cursor-pointer hover:text-blue-600 transition-colors"
            onClick={() => router.push('/')}
          >Lea</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              @{session?.handle}
            </span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="max-w-5xl mx-auto flex gap-4 px-4">
        <main className="flex-1 max-w-xl mx-auto bg-white dark:bg-gray-950 min-h-screen border-x border-gray-200 dark:border-gray-800">
          {resolveError ? (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="w-16 h-16 mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <p className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">@{handle}</p>
              <p className="text-gray-500">{resolveError}</p>
              <button
                onClick={() => router.push('/')}
                className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600"
              >
                Back to feed
              </button>
            </div>
          ) : profileDid ? (
            <ProfileView
              did={profileDid}
              onClose={handleClose}
              onOpenProfile={handleOpenProfile}
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

export default function ProfilePage() {
  return (
    <SettingsProvider>
      <BookmarksProvider>
        <FeedsProvider>
          <ProfilePageContent />
        </FeedsProvider>
      </BookmarksProvider>
    </SettingsProvider>
  );
}
