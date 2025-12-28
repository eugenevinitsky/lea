'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { restoreSession, getSession, getBlueskyProfile } from '@/lib/bluesky';
import { SettingsProvider } from '@/lib/settings';
import { BookmarksProvider } from '@/lib/bookmarks';
import { FeedsProvider } from '@/lib/feeds';
import ResearcherList from '@/components/ResearcherList';
import Login from '@/components/Login';

function AffiliationPageContent() {
  const params = useParams();
  const router = useRouter();
  const value = decodeURIComponent(params.value as string);
  
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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

  const handleSelectResearcher = async (did: string) => {
    const profile = await getBlueskyProfile(did);
    if (profile?.handle) {
      router.push(`/${profile.handle}`);
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
            <button
              onClick={() => router.push(`/${session?.handle}`)}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
            >
              @{session?.handle}
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="max-w-5xl mx-auto flex gap-4 px-4">
        <main className="flex-1 max-w-xl mx-auto bg-white dark:bg-gray-950 min-h-screen border-x border-gray-200 dark:border-gray-800">
          {/* Back button */}
          <div className="sticky top-14 z-10 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 p-3 flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
              title="Go back"
            >
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="font-semibold text-gray-900 dark:text-gray-100">Affiliation</span>
          </div>
          
          <ResearcherList 
            field="affiliation" 
            value={value} 
            onSelectResearcher={handleSelectResearcher} 
          />
        </main>
      </div>
    </div>
  );
}

export default function AffiliationPage() {
  return (
    <SettingsProvider>
      <BookmarksProvider>
        <FeedsProvider>
          <AffiliationPageContent />
        </FeedsProvider>
      </BookmarksProvider>
    </SettingsProvider>
  );
}
