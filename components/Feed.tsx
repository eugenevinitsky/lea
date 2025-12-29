'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AppBskyFeedDefs, AppBskyFeedPost, AppBskyEmbedExternal } from '@atproto/api';
import { getTimeline, getFeed, getListFeed, searchPosts, FEEDS, FeedId, isVerifiedResearcher, Label, isSelfReply, getReplyRootUri, getSelfThread, SelfThreadResult } from '@/lib/bluesky';
import { useSettings } from '@/lib/settings';
import { detectPaperLink } from '@/lib/papers';
import Post from './Post';
import ThreadView from './ThreadView';
import SelfThread from './SelfThread';

interface FeedProps {
  feedId?: FeedId;
  feedUri?: string;
  feedName?: string;
  acceptsInteractions?: boolean;
  refreshKey?: number;
  // Feed type: 'feed' for generators, 'keyword' for search, 'list' for list feeds, 'verified' for timeline filtered to verified researchers
  feedType?: 'feed' | 'keyword' | 'list' | 'verified';
  keyword?: string;
  // Callback to open a profile in the main view
  onOpenProfile?: (did: string) => void;
  // Callback to open a thread (if provided, Feed won't render its own ThreadView)
  onOpenThread?: (uri: string) => void;
}

export default function Feed({ feedId, feedUri, feedName, acceptsInteractions, refreshKey, feedType, keyword, onOpenProfile, onOpenThread }: FeedProps) {
  const { settings } = useSettings();
  const [posts, setPosts] = useState<AppBskyFeedDefs.FeedViewPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loadedPages, setLoadedPages] = useState(0);
  const [internalThreadUri, setInternalThreadUri] = useState<string | null>(null);
  
  // Self-thread expansion state
  const [expandedThreads, setExpandedThreads] = useState<Map<string, SelfThreadResult>>(new Map());
  const [loadingThreads, setLoadingThreads] = useState<Set<string>>(new Set());
  // Track which root URIs we've already shown, to avoid duplicates
  const seenRootUris = useRef<Set<string>>(new Set());

  // Use external handler if provided, otherwise use internal state
  const handleOpenThread = onOpenThread || setInternalThreadUri;

  // Support both old feedId-based and new feedUri-based props
  const feedConfig = feedId ? FEEDS[feedId] : null;
  const effectiveFeedUri = feedUri || feedConfig?.uri || null;
  const effectiveFeedName = feedName || feedConfig?.name || 'Feed';
  const effectiveAcceptsInteractions = acceptsInteractions ?? feedConfig?.acceptsInteractions ?? false;

  const isPapersFeed = feedId === 'papers';
  const isVerifiedFeed = feedId === 'verified' || feedType === 'verified' || feedUri === 'verified-following';
  const isKeywordFeed = feedType === 'keyword' || (feedUri?.startsWith('keyword:') ?? false);
  const isListFeed = (feedType === 'list' || (effectiveFeedUri?.includes('/app.bsky.graph.list/') ?? false)) && !isVerifiedFeed;
  const effectiveKeyword = keyword || (feedUri?.startsWith('keyword:') ? feedUri.slice(8).replace(/-/g, ' ') : null);

  // Observer ref for cleanup
  const observerRef = useRef<IntersectionObserver | null>(null);

  const loadFeed = async (loadMore = false, currentCursor?: string) => {
    try {
      setLoading(true);
      setError(null);

      let feedPosts: AppBskyFeedDefs.FeedViewPost[];
      let newCursor: string | undefined;

      if (isKeywordFeed && effectiveKeyword) {
        // Keyword feed - use search API
        const searchResult = await searchPosts(effectiveKeyword, loadMore ? (currentCursor || cursor) : undefined);
        // Convert PostView[] to FeedViewPost[] format
        feedPosts = searchResult.posts.map(post => ({ post }));
        newCursor = searchResult.cursor;
      } else if (isVerifiedFeed) {
        // Verified feed - get posts from all verified researchers list, then filter to only those you follow
        const VERIFIED_LIST = 'at://did:plc:7c7tx56n64jhzezlwox5dja6/app.bsky.graph.list/3masawnn3xj23';
        const response = await getListFeed(VERIFIED_LIST, loadMore ? (currentCursor || cursor) : undefined);
        feedPosts = response.data.feed;
        newCursor = response.data.cursor;
      } else if (isListFeed && effectiveFeedUri) {
        // List feed - posts from list members
        const response = await getListFeed(effectiveFeedUri, loadMore ? (currentCursor || cursor) : undefined);
        feedPosts = response.data.feed;
        newCursor = response.data.cursor;
      } else if (effectiveFeedUri && effectiveFeedUri !== 'timeline' && effectiveFeedUri !== 'verified-following') {
        // Custom feed (like Paper Skygest)
        const response = await getFeed(effectiveFeedUri, loadMore ? (currentCursor || cursor) : undefined);
        feedPosts = response.data.feed;
        newCursor = response.data.cursor;
      } else {
        // User's timeline
        const response = await getTimeline(loadMore ? (currentCursor || cursor) : undefined);
        feedPosts = response.data.feed;
        newCursor = response.data.cursor;
      }

      if (loadMore) {
        setPosts(prev => [...prev, ...feedPosts]);
      } else {
        setPosts(feedPosts);
      }
      setCursor(newCursor);
      setLoadedPages(prev => prev + 1);
      return newCursor;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feed');
      return undefined;
    } finally {
      setLoading(false);
    }
  };

  // Reset and reload when feed changes or refresh triggered
  useEffect(() => {
    setPosts([]);
    setCursor(undefined);
    setLoadedPages(0);
    // Reset self-thread state
    setExpandedThreads(new Map());
    setLoadingThreads(new Set());
    seenRootUris.current = new Set();

    // For papers feed or verified feed, scan multiple pages
    if (isPapersFeed || isVerifiedFeed) {
      const initialScan = async () => {
        let currentCursor: string | undefined;
        const MIN_PAGES = 5;

        currentCursor = await loadFeed();
        for (let i = 1; i < MIN_PAGES && currentCursor; i++) {
          await new Promise(resolve => setTimeout(resolve, 100));
          currentCursor = await loadFeed(true, currentCursor);
        }
      };
      initialScan();
    } else {
      loadFeed();
    }
  }, [feedId, feedUri, refreshKey, isKeywordFeed, effectiveKeyword]);

  // Track values in refs for IntersectionObserver callback (avoids stale closures)
  const loadingRef = useRef(loading);
  const cursorRef = useRef(cursor);
  const loadFeedRef = useRef(loadFeed);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);
  useEffect(() => { loadFeedRef.current = loadFeed; });

  // Callback ref for sentinel - reattaches observer whenever element changes
  const sentinelCallbackRef = useCallback((node: HTMLDivElement | null) => {
    // Cleanup old observer
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && !loadingRef.current && cursorRef.current) {
          loadFeedRef.current(true);
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(node);
    observerRef.current = observer;
  }, []);

  // Filter posts based on settings and feed type
  const { filteredPosts, hiddenCount, totalScanned } = useMemo(() => {
    let filtered = posts;
    let hidden = 0;

    // Apply paper filtering for Papers feed
    if (isPapersFeed) {
      const papers: AppBskyFeedDefs.FeedViewPost[] = [];
      for (const item of posts) {
        const record = item.post.record as AppBskyFeedPost.Record;
        const embed = item.post.embed;

        let embedUri: string | undefined;
        if (embed && 'external' in embed) {
          const external = embed as AppBskyEmbedExternal.View;
          embedUri = external.external?.uri;
        }

        const { hasPaper } = detectPaperLink(record.text, embedUri);
        if (hasPaper) {
          papers.push(item);
        }
      }
      filtered = papers;
    }

    // Apply following filter for Verified feed
    // Posts are already from verified researchers (loaded from list), just filter to those you follow
    // Also exclude replies - only show top-level posts
    if (isVerifiedFeed) {
      const followed: AppBskyFeedDefs.FeedViewPost[] = [];
      for (const item of posts) {
        const author = item.post.author as AppBskyFeedDefs.PostView['author'] & { viewer?: { following?: string } };
        const record = item.post.record as AppBskyFeedPost.Record;
        // Only include if: user follows the author AND it's not a reply
        if (author.viewer?.following && !record.reply) {
          followed.push(item);
        }
      }
      filtered = followed;
    }

    // Apply high-follower filter
    if (settings.highFollowerThreshold !== null) {
      const afterHighFollower: AppBskyFeedDefs.FeedViewPost[] = [];
      for (const item of filtered) {
        const author = item.post.author as { followsCount?: number };
        const followingCount = author.followsCount ?? 0;
        if (followingCount > settings.highFollowerThreshold) {
          hidden++;
        } else {
          afterHighFollower.push(item);
        }
      }
      filtered = afterHighFollower;
    }

    return { filteredPosts: filtered, hiddenCount: hidden, totalScanned: posts.length };
  }, [posts, settings.highFollowerThreshold, isPapersFeed, isVerifiedFeed]);

  // Function to expand a self-thread
  const expandSelfThread = useCallback(async (postUri: string) => {
    if (expandedThreads.has(postUri) || loadingThreads.has(postUri)) return;
    
    setLoadingThreads(prev => new Set(prev).add(postUri));
    try {
      const result = await getSelfThread(postUri);
      if (result && result.posts.length > 1) {
        setExpandedThreads(prev => new Map(prev).set(postUri, result));
        // Mark the root URI as seen to avoid showing duplicates
        seenRootUris.current.add(result.rootUri);
      }
    } finally {
      setLoadingThreads(prev => {
        const next = new Set(prev);
        next.delete(postUri);
        return next;
      });
    }
  }, [expandedThreads, loadingThreads]);

  // Effect to auto-expand self-threads when posts load
  useEffect(() => {
    if (!settings.expandSelfThreads) {
      console.log('[SelfThread] Setting disabled');
      return;
    }
    
    console.log('[SelfThread] Checking', filteredPosts.length, 'posts for self-replies');
    let foundCount = 0;
    for (const item of filteredPosts) {
      const selfReply = isSelfReply(item);
      if (selfReply) {
        foundCount++;
        console.log('[SelfThread] Found self-reply:', item.post.uri);
        const rootUri = getReplyRootUri(item);
        // Skip if we've already shown this thread root
        if (rootUri && seenRootUris.current.has(rootUri)) {
          console.log('[SelfThread] Skipping (already seen root):', rootUri);
          continue;
        }
        // Expand the thread
        console.log('[SelfThread] Expanding thread for:', item.post.uri);
        expandSelfThread(item.post.uri);
      }
    }
    console.log('[SelfThread] Found', foundCount, 'self-replies total');
  }, [filteredPosts, settings.expandSelfThreads, expandSelfThread]);

  if (error) {
    return (
      <div className="p-4 text-center">
        <p className="text-red-500">{error}</p>
        <button
          onClick={() => loadFeed()}
          className="mt-2 px-4 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-black/80 backdrop-blur border-b border-gray-200 dark:border-gray-800 p-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">{effectiveFeedName}</h2>
            {isPapersFeed && (
              <p className="text-xs text-gray-500">
                {filteredPosts.length} paper{filteredPosts.length !== 1 ? 's' : ''} found in {totalScanned} posts
              </p>
            )}
            {isVerifiedFeed && (
              <p className="text-xs text-gray-500">
                {filteredPosts.length} post{filteredPosts.length !== 1 ? 's' : ''} from verified researchers in {totalScanned} scanned
              </p>
            )}
            {isKeywordFeed && effectiveKeyword && (
              <p className="text-xs text-purple-500 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Search: &quot;{effectiveKeyword}&quot;
              </p>
            )}
          </div>
          <button
            onClick={() => {
              setPosts([]);
              setCursor(undefined);
              setLoadedPages(0);
              loadFeed();
            }}
            disabled={loading}
            className="px-3 py-1.5 text-sm text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Hidden posts indicator */}
      {hiddenCount > 0 && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {hiddenCount} post{hiddenCount !== 1 ? 's' : ''} hidden from high-follower accounts
            <span className="text-amber-500 ml-1">(following {settings.highFollowerThreshold?.toLocaleString()}+)</span>
          </p>
        </div>
      )}

      {/* Empty state for papers feed */}
      {!loading && isPapersFeed && filteredPosts.length === 0 && (
        <div className="p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">No papers found yet</h3>
          <p className="text-sm text-gray-500 mb-4">
            We've scanned {totalScanned} posts from your timeline.
            <br />
            Load more to find papers from your network.
          </p>
          <button
            onClick={() => loadFeed(true)}
            disabled={loading || !cursor}
            className="px-4 py-2 bg-purple-500 text-white rounded-full hover:bg-purple-600 disabled:opacity-50"
          >
            Load more posts
          </button>
        </div>
      )}

      {/* Empty state for verified feed */}
      {!loading && isVerifiedFeed && filteredPosts.length === 0 && (
        <div className="p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">No verified researchers found</h3>
          <p className="text-sm text-gray-500 mb-4">
            We've scanned {totalScanned} posts from your timeline.
            <br />
            Load more to find posts from verified researchers.
          </p>
          <button
            onClick={() => loadFeed(true)}
            disabled={loading || !cursor}
            className="px-4 py-2 bg-emerald-500 text-white rounded-full hover:bg-emerald-600 disabled:opacity-50"
          >
            Load more posts
          </button>
        </div>
      )}

      {/* Posts */}
      {filteredPosts.map((item, index) => {
        const postUri = item.post.uri;
        const rootUri = getReplyRootUri(item);
        
        // Check if this post has an expanded self-thread
        const expandedThread = expandedThreads.get(postUri);
        if (expandedThread) {
          return (
            <SelfThread
              key={`thread-${postUri}`}
              posts={expandedThread.posts}
              onOpenThread={handleOpenThread}
              onOpenProfile={onOpenProfile}
              feedContext={item.feedContext}
              reqId={item.reqId}
              supportsInteractions={effectiveAcceptsInteractions}
              feedUri={effectiveFeedUri || undefined}
            />
          );
        }
        
        // Skip posts that belong to a thread already shown (dedupe by root URI)
        if (settings.expandSelfThreads && rootUri && seenRootUris.current.has(rootUri) && !expandedThreads.has(postUri)) {
          return null;
        }
        
        return (
          <Post
            key={`${postUri}-${index}`}
            post={item.post}
            onOpenThread={handleOpenThread}
            feedContext={item.feedContext}
            reqId={item.reqId}
            supportsInteractions={effectiveAcceptsInteractions}
            feedUri={effectiveFeedUri || undefined}
            onOpenProfile={onOpenProfile}
            reason={item.reason as AppBskyFeedDefs.ReasonRepost | undefined}
          />
        );
      })}

      {/* Thread View Modal - only render if using internal state (no external handler) */}
      {!onOpenThread && internalThreadUri && (
        <ThreadView uri={internalThreadUri} onClose={() => setInternalThreadUri(null)} />
      )}

      {/* Load more - infinite scroll for all feeds */}
      {filteredPosts.length > 0 && cursor && (
        <div ref={sentinelCallbackRef} className="p-4 text-center text-gray-500">
          {loading ? 'Loading more...' : ''}
        </div>
      )}

      {/* Loading indicator */}
      {loading && posts.length > 0 && (
        <div className="p-4 text-center text-gray-500">
          {isPapersFeed ? 'Scanning for papers...' : isVerifiedFeed ? 'Scanning for verified researchers...' : 'Loading...'}
        </div>
      )}

      {loading && posts.length === 0 && (
        <div className="p-8 text-center text-gray-500">
          Loading {effectiveFeedName.toLowerCase()}...
        </div>
      )}
    </div>
  );
}
