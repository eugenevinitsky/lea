'use client';

import { useSettings } from '@/lib/settings';

interface SettingsProps {
  onClose: () => void;
}

export default function Settings({ onClose }: SettingsProps) {
  const { settings, updateSettings, resetSettings } = useSettings();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 p-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Settings</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Protective Defaults Section */}
          <section>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Protective Defaults
            </h3>

            {/* Auto-threadgate */}
            <div className="space-y-4">
              <label className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">Auto-apply threadgate</p>
                  <p className="text-sm text-gray-500">Limit who can reply to your posts</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.autoThreadgate}
                  onChange={(e) => updateSettings({ autoThreadgate: e.target.checked })}
                  className="w-5 h-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                />
              </label>

              {settings.autoThreadgate && (
                <div className="ml-4 pl-4 border-l-2 border-gray-200 dark:border-gray-700">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Who can reply?</p>
                  <div className="space-y-2">
                    {[
                      { value: 'following', label: 'People you follow', description: '' },
                      { value: 'researchers', label: 'Verified researchers only', description: 'Only verified researchers' },
                      { value: 'verified', label: 'My community', description: 'Verified + 1-hop from you' },
                      { value: 'open', label: 'Anyone', description: '' },
                    ].map((option) => (
                      <label key={option.value} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="threadgateType"
                          value={option.value}
                          checked={settings.threadgateType === option.value}
                          onChange={(e) => updateSettings({ threadgateType: e.target.value as typeof settings.threadgateType })}
                          className="text-blue-500 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {option.label}
                          {option.description && (
                            <span className="text-gray-400 ml-1">({option.description})</span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* High-follower blocking */}
              <div className="pt-2">
                <label className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">Hide high-follower accounts</p>
                    <p className="text-sm text-gray-500">Hide posts from accounts following many people (often bots)</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.highFollowerThreshold !== null}
                    onChange={(e) => updateSettings({ highFollowerThreshold: e.target.checked ? 10000 : null })}
                    className="w-5 h-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                  />
                </label>

                {settings.highFollowerThreshold !== null && (
                  <div className="mt-3 ml-4 pl-4 border-l-2 border-gray-200 dark:border-gray-700">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Hide if following more than:
                    </p>
                    <div className="flex gap-2">
                      {[5000, 10000, 20000].map((threshold) => (
                        <button
                          key={threshold}
                          onClick={() => updateSettings({ highFollowerThreshold: threshold })}
                          className={`px-3 py-1.5 text-sm rounded-full border ${
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
            </div>
          </section>

          {/* Display Section */}
          <section>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Display
            </h3>

            <div className="space-y-4">
              <label className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">Highlight paper links</p>
                  <p className="text-sm text-gray-500">Show indicator on posts with arXiv, DOI links</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showPaperHighlights}
                  onChange={(e) => updateSettings({ showPaperHighlights: e.target.checked })}
                  className="w-5 h-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                />
              </label>

              <label className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">Dim non-verified replies</p>
                  <p className="text-sm text-gray-500">Reduce visibility of non-researcher accounts</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.dimNonVerified}
                  onChange={(e) => updateSettings({ dimNonVerified: e.target.checked })}
                  className="w-5 h-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                />
              </label>
            </div>
          </section>

          {/* Reset */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
            <button
              onClick={resetSettings}
              className="text-sm text-red-500 hover:text-red-600"
            >
              Reset to defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
