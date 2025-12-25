'use client';

import { useState, useEffect, useCallback } from 'react';
import { searchFeeds, FeedGeneratorInfo, getFeedGenerators } from '@/lib/bluesky';
import { useFeeds, SUGGESTED_FEEDS, PinnedFeed } from '@/lib/feeds';

interface FeedDiscoveryProps {
  onClose: () => void;
}

function FeedCard({ feed, isPinned, onTogglePin }: {
  feed: {
    uri: string;
    displayName: string;
    description?: string;
    avatar?: string;
    acceptsInteractions?: boolean;
    likeCount?: number;
    creator?: { handle: string; displayName?: string };
  };
  isPinned: boolean;
  onTogglePin: () => void;
}) {
  return (
    <div className="p-3 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
      <div className="flex items-start gap-3">
        {feed.avatar ? (
          <img src={feed.avatar} alt="" className="w-10 h-10 rounded-lg" />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
            </svg>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">
              {feed.displayName}
            </h3>
            <button
              onClick={onTogglePin}
              className={`flex-shrink-0 px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                isPinned
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              {isPinned ? 'Unpin' : 'Pin'}
            </button>
          </div>
          {feed.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
              {feed.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-400">
            {feed.creator && (
              <span>by @{feed.creator.handle}</span>
            )}
            {feed.likeCount !== undefined && feed.likeCount > 0 && (
              <span>{feed.likeCount.toLocaleString()} likes</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FeedDiscovery({ onClose }: FeedDiscoveryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FeedGeneratorInfo[]>([]);
  const [suggestedFeeds, setSuggestedFeeds] = useState<FeedGeneratorInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { pinnedFeeds, addFeed, removeFeed, isPinned } = useFeeds();

  // Load suggested feeds info
  useEffect(() => {
    const loadSuggested = async () => {
      try {
        const uris = SUGGESTED_FEEDS.map(f => f.uri);
        const feeds = await getFeedGenerators(uris);
        setSuggestedFeeds(feeds);
      } catch (err) {
        console.error('Failed to load suggested feeds:', err);
        // Fall back to static suggestions
        setSuggestedFeeds(SUGGESTED_FEEDS as unknown as FeedGeneratorInfo[]);
      } finally {
        setLoadingSuggestions(false);
      }
    };
    loadSuggested();
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const results = await searchFeeds(searchQuery);
      setSearchResults(results.feeds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (searchQuery.trim()) {
        handleSearch();
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(debounce);
  }, [searchQuery, handleSearch]);

  const handleTogglePin = (feed: FeedGeneratorInfo | typeof SUGGESTED_FEEDS[0]) => {
    if (isPinned(feed.uri)) {
      removeFeed(feed.uri);
    } else {
      const pinnedFeed: PinnedFeed = {
        uri: feed.uri,
        displayName: feed.displayName,
        avatar: feed.avatar,
        acceptsInteractions: feed.acceptsInteractions || false,
      };
      addFeed(pinnedFeed);
    }
  };

  const displayFeeds = searchQuery.trim() ? searchResults : suggestedFeeds;
  const isSearching = searchQuery.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg max-h-[80vh] bg-white dark:bg-gray-900 rounded-xl shadow-xl overflow-hidden flex flex-col mx-4">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Discover Feeds</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
            >
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search input */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search feeds..."
              className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border-0 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Pinned feeds section */}
        {pinnedFeeds.length > 0 && !isSearching && (
          <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
            <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Your Pinned Feeds</h3>
            <div className="flex flex-wrap gap-1.5">
              {pinnedFeeds.map((feed) => (
                <span
                  key={feed.uri}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-white dark:bg-gray-700 rounded-full text-xs text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600"
                >
                  {feed.displayName}
                  <button
                    onClick={() => removeFeed(feed.uri)}
                    className="hover:text-red-500"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="p-4 text-center text-red-500 text-sm">{error}</div>
          )}

          {(loading || loadingSuggestions) && !error && (
            <div className="p-8 flex items-center justify-center">
              <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
            </div>
          )}

          {!loading && !loadingSuggestions && !error && (
            <>
              {!isSearching && (
                <div className="px-4 pt-3 pb-1">
                  <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Suggested for Researchers
                  </h3>
                </div>
              )}

              {isSearching && searchResults.length === 0 && (
                <div className="p-8 text-center text-gray-500 text-sm">
                  No feeds found for &quot;{searchQuery}&quot;
                </div>
              )}

              {displayFeeds.map((feed) => (
                <FeedCard
                  key={feed.uri}
                  feed={feed}
                  isPinned={isPinned(feed.uri)}
                  onTogglePin={() => handleTogglePin(feed)}
                />
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
          <p className="text-xs text-gray-400 text-center">
            Pinned feeds appear in your feed tabs
          </p>
        </div>
      </div>
    </div>
  );
}
