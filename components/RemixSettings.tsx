'use client';

import { useState, useEffect } from 'react';
import { useFeeds, PinnedFeed, RemixSettings as RemixSettingsType } from '@/lib/feeds';

interface RemixSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  // Current stats from the remix feed (optional, for display)
  stats?: {
    postCounts: Map<string, number>;
    totalPosts: number;
  };
}

export default function RemixSettings({ isOpen, onClose, stats }: RemixSettingsProps) {
  const { 
    pinnedFeeds, 
    remixSettings, 
    setRemixWeight, 
    toggleRemixExclude, 
    resetRemixSettings,
    getRemixWeight,
    isRemixExcluded,
  } = useFeeds();

  // Get feeds available for remix (all except remix itself)
  const remixableFeeds = pinnedFeeds.filter(f => f.uri !== 'remix' && f.type !== 'remix');

  // Local state for editing (so changes are batched)
  const [localWeights, setLocalWeights] = useState<Record<string, number>>({});
  const [localExcluded, setLocalExcluded] = useState<Set<string>>(new Set());

  // Sync local state from context when modal opens
  useEffect(() => {
    if (isOpen) {
      const weights: Record<string, number> = {};
      remixableFeeds.forEach(feed => {
        weights[feed.uri] = getRemixWeight(feed.uri);
      });
      setLocalWeights(weights);
      setLocalExcluded(new Set(remixSettings.excluded));
    }
  }, [isOpen, remixSettings]);

  if (!isOpen) return null;

  const handleWeightChange = (uri: string, value: number) => {
    setLocalWeights(prev => ({ ...prev, [uri]: value }));
  };

  const handleToggleExclude = (uri: string) => {
    setLocalExcluded(prev => {
      const next = new Set(prev);
      if (next.has(uri)) {
        next.delete(uri);
      } else {
        next.add(uri);
      }
      return next;
    });
  };

  const handleSave = () => {
    // Apply all weight changes
    Object.entries(localWeights).forEach(([uri, weight]) => {
      if (weight !== getRemixWeight(uri)) {
        setRemixWeight(uri, weight);
      }
    });

    // Apply exclusion changes
    remixableFeeds.forEach(feed => {
      const wasExcluded = isRemixExcluded(feed.uri);
      const nowExcluded = localExcluded.has(feed.uri);
      if (wasExcluded !== nowExcluded) {
        toggleRemixExclude(feed.uri);
      }
    });

    onClose();
  };

  const handleReset = () => {
    resetRemixSettings();
    // Reset local state too
    const weights: Record<string, number> = {};
    remixableFeeds.forEach(feed => {
      weights[feed.uri] = 50; // Default weight
    });
    setLocalWeights(weights);
    setLocalExcluded(new Set());
  };

  // Calculate expected distribution preview
  const includedFeeds = remixableFeeds.filter(f => !localExcluded.has(f.uri));
  const totalWeight = includedFeeds.reduce((sum, f) => sum + (localWeights[f.uri] || 50), 0);

  // Calculate actual stats percentage if available
  const getActualPercentage = (uri: string): number | null => {
    if (!stats || stats.totalPosts === 0) return null;
    const count = stats.postCounts.get(uri) || 0;
    return Math.round((count / stats.totalPosts) * 100);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Remix Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Description */}
        <div className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
          Configure which feeds to include in your Remix and how much to sample from each.
        </div>

        {/* Feed list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {remixableFeeds.map(feed => {
            const weight = localWeights[feed.uri] ?? 50;
            const isExcluded = localExcluded.has(feed.uri);
            const expectedPercent = totalWeight > 0 && !isExcluded
              ? Math.round((weight / totalWeight) * 100)
              : 0;
            const actualPercent = getActualPercentage(feed.uri);

            return (
              <div 
                key={feed.uri}
                className={`p-3 rounded-lg border transition-colors ${
                  isExcluded 
                    ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60' 
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                }`}
              >
                {/* Feed header with toggle */}
                <div className="flex items-center justify-between mb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!isExcluded}
                      onChange={() => handleToggleExclude(feed.uri)}
                      className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span className={`font-medium ${isExcluded ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
                      {feed.displayName}
                    </span>
                  </label>
                  
                  {/* Stats display */}
                  {!isExcluded && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500 dark:text-gray-400">
                        Target: {expectedPercent}%
                      </span>
                      {actualPercent !== null && (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          Actual: {actualPercent}%
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Weight slider */}
                {!isExcluded && (
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={weight}
                      onChange={(e) => handleWeightChange(feed.uri, parseInt(e.target.value))}
                      className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                    <span className="w-10 text-right text-sm text-gray-600 dark:text-gray-400">
                      {weight}
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          {remixableFeeds.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No feeds available for remix. Pin some feeds first!
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <button
            onClick={handleReset}
            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            Reset to defaults
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 text-sm font-medium text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
