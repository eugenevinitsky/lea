'use client';

import { useState, useEffect, useCallback } from 'react';
import { searchFeeds, FeedGeneratorInfo, getFeedGenerators, getSavedFeeds, getSavedFeedUris, saveFeed, unsaveFeed, likeFeed, unlikeFeed, getMyLists, ListView } from '@/lib/bluesky';
import { useFeeds, SUGGESTED_FEEDS, PinnedFeed } from '@/lib/feeds';

interface FeedDiscoveryProps {
  onClose: () => void;
}

function KeywordFeedCreator({ onAdd }: { onAdd: (keyword: string) => void }) {
  const [keyword, setKeyword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (keyword.trim()) {
      onAdd(keyword.trim());
      setKeyword('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-3 bg-purple-50 dark:bg-purple-900/20 border-b border-purple-200 dark:border-purple-800">
      <h3 className="text-xs font-medium text-purple-700 dark:text-purple-300 mb-2 flex items-center gap-1.5">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        Create Keyword Feed
      </h3>
      <div className="flex gap-2">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="e.g., ICLR, machine learning, climate..."
          className="flex-1 px-3 py-1.5 bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <button
          type="submit"
          disabled={!keyword.trim()}
          className="px-3 py-1.5 bg-purple-500 text-white text-sm font-medium rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>
      <p className="text-[10px] text-purple-600 dark:text-purple-400 mt-1.5">
        Creates a feed showing posts matching your keyword via search
      </p>
    </form>
  );
}

function ListFeedCreator({ onAdd, pinnedListUris }: { onAdd: (list: ListView) => void; pinnedListUris: Set<string> }) {
  const [lists, setLists] = useState<ListView[]>([]);
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const loadLists = async () => {
    if (hasLoaded) return;
    setLoading(true);
    try {
      const myLists = await getMyLists();
      // Filter to only curated lists (not mod lists)
      const curatedLists = myLists.filter(l => l.purpose === 'app.bsky.graph.defs#curatelist');
      setLists(curatedLists);
      setHasLoaded(true);
    } catch (err) {
      console.error('Failed to load lists:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExpand = () => {
    setIsExpanded(!isExpanded);
    if (!hasLoaded && !isExpanded) {
      loadLists();
    }
  };

  // Filter out already pinned lists
  const availableLists = lists.filter(l => !pinnedListUris.has(`list:${l.uri}`));

  return (
    <div className="border-b border-indigo-200 dark:border-indigo-800">
      <button
        onClick={handleExpand}
        className="w-full p-3 bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-between hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
      >
        <h3 className="text-xs font-medium text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          Create Feed from List
        </h3>
        <svg
          className={`w-4 h-4 text-indigo-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="p-3 bg-indigo-50/50 dark:bg-indigo-900/10">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full" />
            </div>
          ) : lists.length === 0 ? (
            <div className="text-center py-3">
              <p className="text-xs text-indigo-600 dark:text-indigo-400">No lists found</p>
              <a
                href="/lists"
                className="text-xs text-indigo-500 hover:underline mt-1 inline-block"
              >
                Create a list first →
              </a>
            </div>
          ) : availableLists.length === 0 ? (
            <div className="text-center py-3">
              <p className="text-xs text-indigo-600 dark:text-indigo-400">All your lists are already pinned</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {availableLists.map((list) => (
                <button
                  key={list.uri}
                  onClick={() => onAdd(list)}
                  className="w-full flex items-center gap-2 p-2 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors text-left"
                >
                  {list.avatar ? (
                    <img src={list.avatar} alt="" className="w-8 h-8 rounded-lg flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-800 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {list.name}
                    </p>
                    <p className="text-[10px] text-gray-500 truncate">
                      {list.listItemCount ?? 0} member{(list.listItemCount ?? 0) !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              ))}
            </div>
          )}
          <p className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-2">
            Creates a feed showing posts from members of your list
          </p>
        </div>
      )}
    </div>
  );
}

function FeedCard({ feed, isPinned, onTogglePin, onLikeChange, isSaved: initialIsSaved, onSaveChange }: {
  feed: {
    uri: string;
    cid?: string;
    displayName: string;
    description?: string;
    avatar?: string;
    acceptsInteractions?: boolean;
    likeCount?: number;
    creator?: { handle: string; displayName?: string };
    viewer?: { like?: string };
    leaExclusive?: boolean;
  };
  isPinned: boolean;
  onTogglePin: () => void;
  onLikeChange?: (uri: string, liked: boolean, likeUri?: string) => void;
  isSaved?: boolean;
  onSaveChange?: (uri: string, saved: boolean) => void;
}) {
  const [isLiked, setIsLiked] = useState(!!feed.viewer?.like);
  const [likeUri, setLikeUri] = useState<string | undefined>(feed.viewer?.like);
  const [likeCount, setLikeCount] = useState(feed.likeCount || 0);
  const [isLiking, setIsLiking] = useState(false);
  const [isSaved, setIsSaved] = useState(initialIsSaved || false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Update isSaved when prop changes
  useEffect(() => {
    setIsSaved(initialIsSaved || false);
  }, [initialIsSaved]);
  
  // Check if this is a real AT Protocol feed (can be liked/saved)
  const canLike = feed.uri.startsWith('at://') && feed.cid;
  const canSave = feed.uri.startsWith('at://');

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canLike || isLiking || !feed.cid) return;
    
    setIsLiking(true);
    try {
      if (isLiked && likeUri) {
        await unlikeFeed(likeUri);
        setIsLiked(false);
        setLikeUri(undefined);
        setLikeCount(prev => Math.max(0, prev - 1));
        onLikeChange?.(feed.uri, false);
      } else {
        const result = await likeFeed(feed.uri, feed.cid);
        setIsLiked(true);
        setLikeUri(result.uri);
        setLikeCount(prev => prev + 1);
        onLikeChange?.(feed.uri, true, result.uri);
      }
    } catch (err) {
      console.error('Failed to like/unlike feed:', err);
    } finally {
      setIsLiking(false);
    }
  };
  
  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canSave || isSaving) return;
    
    setIsSaving(true);
    try {
      if (isSaved) {
        await unsaveFeed(feed.uri);
        setIsSaved(false);
        onSaveChange?.(feed.uri, false);
      } else {
        await saveFeed(feed.uri);
        setIsSaved(true);
        onSaveChange?.(feed.uri, true);
      }
    } catch (err) {
      console.error('Failed to save/unsave feed:', err);
    } finally {
      setIsSaving(false);
    }
  };

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
            <div className="flex items-center gap-1.5">
              <button
                onClick={onTogglePin}
                className={`flex-shrink-0 p-1.5 rounded-full transition-colors ${
                  isPinned
                    ? 'text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                    : 'text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                title={isPinned ? 'Unpin feed' : 'Pin feed'}
              >
                <svg className="w-4 h-4" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 4v4l2 2v2h-5v8l-1 1-1-1v-8H6v-2l2-2V4a1 1 0 011-1h6a1 1 0 011 1z" />
                </svg>
              </button>
              {canSave && (
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className={`flex-shrink-0 p-1.5 rounded-full transition-colors disabled:opacity-50 ${
                    isSaved
                      ? 'text-green-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30'
                      : 'text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                  title={isSaved ? 'Unsave feed' : 'Save feed'}
                >
                  <svg 
                    className={`w-4 h-4 ${isSaving ? 'animate-pulse' : ''}`} 
                    fill={isSaved ? 'currentColor' : 'none'} 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" 
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
          {feed.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
              {feed.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-400">
            {feed.leaExclusive && (
              <span className="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded font-medium">
                Only in Lea
              </span>
            )}
            {feed.creator && (
              <span>by @{feed.creator.handle}</span>
            )}
            {canLike && (
              <button
                onClick={handleLike}
                disabled={isLiking}
                className={`flex items-center gap-1 transition-colors disabled:opacity-50 ${
                  isLiked 
                    ? 'text-pink-500 hover:text-pink-600' 
                    : 'text-gray-400 hover:text-pink-500'
                }`}
              >
                <svg 
                  className={`w-3.5 h-3.5 ${isLiking ? 'animate-pulse' : ''}`} 
                  fill={isLiked ? 'currentColor' : 'none'} 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" 
                  />
                </svg>
                {likeCount > 0 && <span>{likeCount.toLocaleString()}</span>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type Tab = 'suggested' | 'liked';

export default function FeedDiscovery({ onClose }: FeedDiscoveryProps) {
  const [activeTab, setActiveTab] = useState<Tab>('suggested');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FeedGeneratorInfo[]>([]);
  const [suggestedFeeds, setSuggestedFeeds] = useState<FeedGeneratorInfo[]>([]);
  const [savedFeeds, setSavedFeeds] = useState<FeedGeneratorInfo[]>([]);
  const [savedFeedUris, setSavedFeedUris] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pinnedFeeds, addFeed, removeFeed, isPinned } = useFeeds();

  // Load suggested feeds info and saved feed URIs
  useEffect(() => {
    const loadSuggested = async () => {
      try {
        // Load saved feed URIs first (for showing save state)
        const savedUris = await getSavedFeedUris();
        setSavedFeedUris(savedUris);
        
        // Filter to only real AT Protocol feed URIs (not special ones like 'verified-following')
        const realFeedUris = SUGGESTED_FEEDS
          .filter(f => f.uri.startsWith('at://'))
          .map(f => f.uri);
        
        // Fetch info for real feeds from the API
        const feedsFromApi = realFeedUris.length > 0 
          ? await getFeedGenerators(realFeedUris) 
          : [];
        
        // Create a map of URI to feed info from API
        const feedInfoMap = new Map(feedsFromApi.map(f => [f.uri, f]));
        
        // Merge: use API info if available, otherwise use static definition
        const mergedFeeds = SUGGESTED_FEEDS.map(staticFeed => {
          const apiInfo = feedInfoMap.get(staticFeed.uri);
          if (apiInfo) {
            // Merge API info with static info (API provides avatar, creator, likeCount etc.)
            return {
              ...apiInfo,
              // Keep our custom description if it's better
              description: staticFeed.description || apiInfo.description,
              // Preserve Lea-exclusive flag
              leaExclusive: 'leaExclusive' in staticFeed ? staticFeed.leaExclusive : undefined,
            };
          }
          // For special feeds like 'verified-following', use static definition
          return staticFeed as unknown as FeedGeneratorInfo;
        });
        
        setSuggestedFeeds(mergedFeeds);
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

  // Load saved feeds when tab is selected
  useEffect(() => {
    if (activeTab === 'liked' && savedFeeds.length === 0 && !loadingSaved) {
      const loadSavedList = async () => {
        setLoadingSaved(true);
        try {
          const feeds = await getSavedFeeds();
          setSavedFeeds(feeds);
        } catch (err) {
          console.error('Failed to load saved feeds:', err);
        } finally {
          setLoadingSaved(false);
        }
      };
      loadSavedList();
    }
  }, [activeTab, savedFeeds.length, loadingSaved]);
  
  // Handle save/unsave changes to update UI
  const handleSaveChange = (uri: string, saved: boolean) => {
    if (saved) {
      setSavedFeedUris(prev => new Set([...prev, uri]));
    } else {
      setSavedFeedUris(prev => {
        const newSet = new Set(prev);
        newSet.delete(uri);
        return newSet;
      });
      // Also remove from savedFeeds list if currently viewing that tab
      setSavedFeeds(prev => prev.filter(f => f.uri !== uri));
    }
  };

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
      // Determine the feed type - check if it's a special feed from SUGGESTED_FEEDS
      const suggestedFeed = SUGGESTED_FEEDS.find(f => f.uri === feed.uri);
      const feedType = suggestedFeed?.type || 'feed';
      
      const pinnedFeed: PinnedFeed = {
        uri: feed.uri,
        displayName: feed.displayName,
        avatar: feed.avatar,
        acceptsInteractions: feed.acceptsInteractions || false,
        type: feedType,
      };
      addFeed(pinnedFeed);
    }
  };

  const handleAddKeywordFeed = (keyword: string) => {
    // Create a unique URI for keyword feeds
    const uri = `keyword:${keyword.toLowerCase().replace(/\s+/g, '-')}`;

    // Don't add if already exists
    if (isPinned(uri)) return;

    const pinnedFeed: PinnedFeed = {
      uri,
      displayName: keyword,
      acceptsInteractions: false,
      type: 'keyword',
      keyword,
    };
    addFeed(pinnedFeed);
  };

  const handleAddListFeed = (list: ListView) => {
    // Create a unique URI for list feeds
    const uri = `list:${list.uri}`;

    // Don't add if already exists
    if (isPinned(uri)) return;

    const pinnedFeed: PinnedFeed = {
      uri,
      displayName: list.name,
      avatar: list.avatar,
      acceptsInteractions: false,
      type: 'list',
    };
    addFeed(pinnedFeed);
  };

  // Get set of already pinned list URIs
  const pinnedListUris = new Set(
    pinnedFeeds
      .filter(f => f.type === 'list')
      .map(f => f.uri)
  );

  const isSearching = searchQuery.trim().length > 0;
  const displayFeeds = isSearching 
    ? searchResults 
    : (activeTab === 'suggested' ? suggestedFeeds : savedFeeds);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg max-h-[80vh] bg-white dark:bg-gray-900 rounded-xl shadow-xl overflow-hidden flex flex-col mx-4">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Manage Feeds</h2>
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

        {/* Keyword feed creator */}
        {!isSearching && (
          <KeywordFeedCreator onAdd={handleAddKeywordFeed} />
        )}

        {/* List feed creator */}
        {!isSearching && (
          <ListFeedCreator onAdd={handleAddListFeed} pinnedListUris={pinnedListUris} />
        )}

        {/* Pinned feeds section */}
        {pinnedFeeds.length > 0 && !isSearching && (
          <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
            <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Your Pinned Feeds</h3>
            <div className="flex flex-wrap gap-1.5">
              {pinnedFeeds.map((feed) => (
                <span
                  key={feed.uri}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border ${
                    feed.type === 'keyword'
                      ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700'
                      : feed.type === 'list'
                      ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600'
                  }`}
                >
                  {feed.type === 'keyword' && (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  )}
                  {feed.type === 'list' && (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  )}
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

        {/* Tabs - only show when not searching */}
        {!isSearching && (
          <div className="flex border-b border-gray-200 dark:border-gray-800">
            <button
              onClick={() => setActiveTab('suggested')}
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'suggested'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Suggested
            </button>
            <button
              onClick={() => setActiveTab('liked')}
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'liked'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Your Saved Feeds
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="p-4 text-center text-red-500 text-sm">{error}</div>
          )}

          {(loading || (activeTab === 'suggested' && loadingSuggestions) || (activeTab === 'liked' && loadingSaved)) && !error && (
            <div className="p-8 flex items-center justify-center">
              <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
            </div>
          )}

          {!loading && !((activeTab === 'suggested' && loadingSuggestions) || (activeTab === 'liked' && loadingSaved)) && !error && (
            <>
              {isSearching && searchResults.length === 0 && (
                <div className="p-8 text-center text-gray-500 text-sm">
                  No feeds found for &quot;{searchQuery}&quot;
                </div>
              )}

              {!isSearching && activeTab === 'liked' && savedFeeds.length === 0 && (
                <div className="p-8 text-center">
                  <svg className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  <p className="text-sm text-gray-500 dark:text-gray-400">No saved feeds yet</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Save feeds from Bluesky to see them here</p>
                </div>
              )}

              {displayFeeds.map((feed) => (
                <FeedCard
                  key={feed.uri}
                  feed={feed}
                  isPinned={isPinned(feed.uri)}
                  onTogglePin={() => handleTogglePin(feed)}
                  isSaved={savedFeedUris.has(feed.uri)}
                  onSaveChange={handleSaveChange}
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
