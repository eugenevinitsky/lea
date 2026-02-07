'use client';

import SafetyPanel from '@/components/SafetyPanel';
import { useModerationLayout } from './layout';

export default function ModerationPage() {
  const { handleOpenProfile, openThread } = useModerationLayout();

  return (
    <>
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
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Moderation</h2>
          </div>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Manage your safety settings, alerts, content filtering, and block lists.
        </p>
      </div>

      {/* SafetyPanel content */}
      <div className="p-0">
        <SafetyPanel embedded onOpenProfile={handleOpenProfile} onOpenThread={openThread} />
      </div>
    </>
  );
}
