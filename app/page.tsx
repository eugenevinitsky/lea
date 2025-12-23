'use client';

import { useState, useCallback } from 'react';
import { getSession, logout } from '@/lib/bluesky';
import Login from '@/components/Login';
import Timeline from '@/components/Timeline';
import Composer from '@/components/Composer';

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleLogin = () => {
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    logout();
    setIsLoggedIn(false);
  };

  const handlePost = useCallback(() => {
    // Trigger timeline refresh after posting
    setRefreshKey(k => k + 1);
  }, []);

  const session = getSession();

  if (!isLoggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/80 dark:bg-black/80 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-blue-500">Lea</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              @{session?.handle}
            </span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-xl mx-auto bg-white dark:bg-gray-950 min-h-screen border-x border-gray-200 dark:border-gray-800">
        {/* Composer */}
        <Composer onPost={handlePost} />

        {/* Timeline */}
        <Timeline key={refreshKey} />
      </main>
    </div>
  );
}
