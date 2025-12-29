'use client';

import { useState, useEffect } from 'react';
import ProfileHoverCard from './ProfileHoverCard';

interface RecentResearcher {
  did: string;
  handle: string | null;
  name: string | null;
  verifiedAt: string | null;
}

interface ModerationBoxProps {
  onOpenProfile?: (did: string) => void;
}

function formatTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function ModerationBox({ onOpenProfile }: ModerationBoxProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [researchers, setResearchers] = useState<RecentResearcher[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isExpanded && researchers.length === 0) {
      fetchRecent();
    }
  }, [isExpanded]);

  const fetchRecent = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/researchers/recent');
      const data = await response.json();
      if (data.researchers) {
        setResearchers(data.researchers);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span className="font-semibold text-gray-900 dark:text-gray-100">Discover</span>
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

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-gray-200 dark:border-gray-800">
          {error && (
            <div className="p-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs">
              {error}
            </div>
          )}

          {/* Recently Verified Section */}
          <div>
            <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-100 dark:border-emerald-900/30">
              <h4 className="text-xs font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Recently Verified
              </h4>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full" />
              </div>
            ) : researchers.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-xs text-gray-400">No recent verifications</p>
              </div>
            ) : (
              <div className="max-h-[300px] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
                {researchers.map((researcher) => (
                  <ProfileHoverCard
                    key={researcher.did}
                    did={researcher.did}
                    handle={researcher.handle || undefined}
                    onOpenProfile={() => onOpenProfile?.(researcher.did)}
                  >
                    <button
                      onClick={() => onOpenProfile?.(researcher.did)}
                      className="w-full p-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {(researcher.name || researcher.handle || '?')[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                              {researcher.name || researcher.handle || 'Unknown'}
                            </span>
                            <span className="flex-shrink-0 w-3.5 h-3.5 bg-emerald-500 rounded-full flex items-center justify-center">
                              <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            {researcher.handle && (
                              <span className="truncate">@{researcher.handle}</span>
                            )}
                            {researcher.verifiedAt && (
                              <>
                                <span>·</span>
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  {formatTime(researcher.verifiedAt)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  </ProfileHoverCard>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
