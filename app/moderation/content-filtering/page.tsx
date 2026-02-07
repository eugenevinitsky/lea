'use client';

import { useSettings } from '@/lib/settings';

export default function ContentFilteringPage() {
  const { settings, updateSettings } = useSettings();

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
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Content Filtering</h2>
          </div>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Filter and adjust the visibility of content in your feed based on account characteristics.
        </p>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* High-follower blocking */}
        <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-4">
          <label className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-100">Hide high-follower accounts</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Accounts following many people are often bots or spam
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.highFollowerThreshold !== null}
              onChange={(e) => updateSettings({ highFollowerThreshold: e.target.checked ? 10000 : null })}
              className="w-5 h-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
            />
          </label>

          {settings.highFollowerThreshold !== null && (
            <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Hide accounts following more than:
              </p>
              <div className="flex gap-2">
                {[5000, 10000, 20000].map((threshold) => (
                  <button
                    key={threshold}
                    onClick={() => updateSettings({ highFollowerThreshold: threshold })}
                    className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      settings.highFollowerThreshold === threshold
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    {(threshold / 1000).toFixed(0)}k
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Dim non-verified */}
        <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <label className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-100">Dim non-verified accounts</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Reduce visibility of posts from accounts that aren&apos;t verified researchers
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.dimNonVerified}
              onChange={(e) => updateSettings({ dimNonVerified: e.target.checked })}
              className="w-5 h-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
            />
          </label>
        </div>

        {/* Dim reposts */}
        <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <label className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-100">Dim reposts</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Reduce visibility of reposted content in your feed
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.dimReposts}
              onChange={(e) => updateSettings({ dimReposts: e.target.checked })}
              className="w-5 h-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
            />
          </label>
        </div>
      </div>
    </>
  );
}
