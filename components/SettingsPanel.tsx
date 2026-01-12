'use client';

import { useState, useEffect } from 'react';
import { useSettings } from '@/lib/settings';
import { logout } from '@/lib/bluesky';

interface SettingsPanelProps {
  defaultExpanded?: boolean;
  embedded?: boolean;
}

export default function SettingsPanel({ defaultExpanded = false, embedded = false }: SettingsPanelProps) {
  const { settings, updateSettings } = useSettings();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded || embedded || settings.settingsPanelExpanded);

  // Sync expansion state with settings (for persistence across navigation)
  useEffect(() => {
    if (!embedded && !defaultExpanded) {
      setIsExpanded(settings.settingsPanelExpanded);
    }
  }, [settings.settingsPanelExpanded, embedded, defaultExpanded]);

  const handleToggleExpanded = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    if (!embedded) {
      updateSettings({ settingsPanelExpanded: newExpanded });
    }
  };

  const handleLogout = () => {
    logout();
    window.location.reload();
  };

  return (
    <div className={`bg-white dark:bg-gray-900 overflow-hidden ${embedded ? '' : 'rounded-xl border border-gray-200 dark:border-gray-800'}`}>
      {/* Header - always visible, hidden when embedded */}
      {!embedded && (
        <button
          onClick={handleToggleExpanded}
          className="w-full p-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="font-semibold text-gray-900 dark:text-gray-100">Settings</span>
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div className={embedded ? '' : 'border-t border-gray-200 dark:border-gray-800'}>
          {/* Display Link */}
          <a
            href="/settings/display"
            className="flex items-center gap-2 px-3 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-3.5 h-3.5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span className="text-xs font-medium text-purple-700 dark:text-purple-300">Display</span>
            <svg className="w-3.5 h-3.5 text-purple-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </a>

          {/* Sign Out Button */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
          >
            <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );
}
