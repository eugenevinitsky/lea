'use client';

import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { AppBskyFeedDefs, AppBskyFeedPost, AppBskyEmbedExternal } from '@atproto/api';
import { getTimeline, getFeed, getListFeed, searchPosts, FEEDS, FeedId, isVerifiedResearcher, Label, hasReplies, isReplyPost, getSelfThread, SelfThreadResult, getModerationOpts, moderatePost, ModerationOpts } from '@/lib/bluesky';
import { VERIFIED_RESEARCHERS_LIST } from '@/lib/constants';
import { useSettings } from '@/lib/settings';
import { useFeeds, PinnedFeed, RemixSettings } from '@/lib/feeds';
import { detectPaperLink } from '@/lib/papers';
import { recordResearcherSighting } from '@/lib/feed-tracking';
import { getModerationUI, ModerationUIInfo } from '@/lib/moderation';
import Post from './Post';
import ThreadView from './ThreadView';
import SelfThread from './SelfThread';
import ModerationWrapper from './ModerationWrapper';

interface FeedProps {
  feedId?: FeedId;
  feedUri?: string;
  feedName?: string;
  acceptsInteractions?: boolean;
  refreshKey?: number;
  // Feed type: 'feed' for generators, 'keyword' for search, 'list' for list feeds, 'verified' for timeline filtered to verified researchers, 'remix' for mixed feed
  feedType?: 'feed' | 'keyword' | 'list' | 'verified' | 'remix';
  keyword?: string;
  // Callback to open a profile in the main view
  onOpenProfile?: (did: string) => void;
  // Callback to open a thread (if provided, Feed won't render its own ThreadView)
  onOpenThread?: (uri: string) => void;
}

// Extended post type for remix feed with source attribution
export interface RemixFeedViewPost extends AppBskyFeedDefs.FeedViewPost {
  sourceFeed?: {
    uri: string;
    displayName: string;
  };
}

// Remix stats tracking
export interface RemixStats {
  // Number of posts from each feed
  postCounts: Map<string, number>;
  // Total posts loaded
  totalPosts: number;
}

export default function Feed({ feedId, feedUri, feedName, acceptsInteractions, refreshKey, feedType, keyword, onOpenProfile, onOpenThread }: FeedProps) {
  const { settings } = useSettings();
  const { pinnedFeeds, getRemixWeight, isRemixExcluded, remixSettings } = useFeeds();
  const [posts, setPosts] = useState<RemixFeedViewPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loadedPages, setLoadedPages] = useState(0);
  const [internalThreadUri, setInternalThreadUri] = useState<string | null>(null);
  
  // Remix feed state - track cursors for each source feed
  const [remixCursors, setRemixCursors] = useState<Map<string, string | undefined>>(new Map());
  const [remixSourceIndex, setRemixSourceIndex] = useState(0);
  const [remixStats, setRemixStats] = useState<RemixStats>({ postCounts: new Map(), totalPosts: 0 });
  
  // Persistent set of seen post URIs for remix feed deduplication across refreshes
  // Using a ref so it persists across re-renders and refreshes within the session
  const remixSeenPostsRef = useRef<Set<string>>(new Set());
  
  // Self-thread expansion state
  const [expandedThreads, setExpandedThreads] = useState<Map<string, SelfThreadResult>>(new Map());
  // Use refs for tracking to avoid re-triggering effects
  const loadingThreadsRef = useRef<Set<string>>(new Set());
  const checkedUrisRef = useRef<Set<string>>(new Set());

  // Track whether we restored from cache so async dep changes (e.g. remixSettings
  // loading from localStorage) don't trigger a reload
  const restoredFeedRef = useRef<{ feedKey: string; refreshKey: number } | null>(null);

  // Track pending scroll restoration after cache restore
  const pendingScrollRestoreRef = useRef(false);

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
  const isListFeed = (feedType === 'list' || (feedUri?.startsWith('list:') ?? false) || (effectiveFeedUri?.includes('/app.bsky.graph.list/') ?? false)) && !isVerifiedFeed;
  const isRemixFeed = feedType === 'remix' || feedUri === 'remix';
  const effectiveKeyword = keyword || (feedUri?.startsWith('keyword:') ? feedUri.slice(8).replace(/-/g, ' ') : null);
  // Extract actual list URI from list: prefix
  const effectiveListUri = feedUri?.startsWith('list:') ? feedUri.slice(5) : effectiveFeedUri;
  
  // Get feeds to remix (all pinned feeds except Remix itself, filtered by exclusions)
  const remixSourceFeeds = useMemo(() => {
    if (!isRemixFeed) return [];
    return pinnedFeeds.filter(f => 
      f.uri !== 'remix' && 
      f.type !== 'remix' && 
      !isRemixExcluded(f.uri)
    );
  }, [isRemixFeed, pinnedFeeds, isRemixExcluded]);
  
  // Check if this is a feed generator that has a detail page
  const isCustomFeedGenerator = effectiveFeedUri?.includes('/app.bsky.feed.generator/') ?? false;
  
  // Parse feed URI to get handle and rkey for link
  const feedDetailUrl = useMemo(() => {
    if (!isCustomFeedGenerator || !effectiveFeedUri) return null;
    // Format: at://did:plc:xxx/app.bsky.feed.generator/rkey
    const match = effectiveFeedUri.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.generator\/([^/]+)$/);
    if (match) {
      const [, didOrHandle, rkey] = match;
      return `/feed/${didOrHandle}/${rkey}`;
    }
    return null;
  }, [isCustomFeedGenerator, effectiveFeedUri]);

  // Observer ref for cleanup
  const observerRef = useRef<IntersectionObserver | null>(null);
  
  // Moderation state
  const [moderationOpts, setModerationOpts] = useState<ModerationOpts | null>(null);
  
  // Load moderation options
  useEffect(() => {
    getModerationOpts().then(opts => {
      if (opts) setModerationOpts(opts);
    });
  }, []);

  // Helper to fetch posts from a single feed source
  const fetchFromSource = async (feed: PinnedFeed, feedCursor?: string): Promise<{ posts: AppBskyFeedDefs.FeedViewPost[]; cursor?: string }> => {
    if (feed.type === 'keyword' && feed.keyword) {
      const result = await searchPosts(feed.keyword, feedCursor);
      return { posts: result.posts.map(post => ({ post })), cursor: result.cursor };
    } else if (feed.type === 'verified' || feed.uri === 'verified-following') {
      const response = await getListFeed(VERIFIED_RESEARCHERS_LIST, feedCursor);
      return { posts: response.data.feed, cursor: response.data.cursor };
    } else if (feed.type === 'list' || feed.uri.startsWith('list:') || feed.uri.includes('/app.bsky.graph.list/')) {
      // Extract actual list URI from list: prefix if present
      const listUri = feed.uri.startsWith('list:') ? feed.uri.slice(5) : feed.uri;
      const response = await getListFeed(listUri, feedCursor);
      return { posts: response.data.feed, cursor: response.data.cursor };
    } else if (feed.uri === 'timeline') {
      const response = await getTimeline(feedCursor);
      return { posts: response.data.feed, cursor: response.data.cursor };
    } else if (feed.uri.startsWith('at://')) {
      const response = await getFeed(feed.uri, feedCursor);
      return { posts: response.data.feed, cursor: response.data.cursor };
    }
    return { posts: [] };
  };

  // Fisher-Yates shuffle for randomizing posts
  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Check if a post is pinned in its feed (has reason of type reasonPin)
  const isPinnedInFeed = (post: AppBskyFeedDefs.FeedViewPost): boolean => {
    const reason = post.reason as { $type?: string } | undefined;
    return reason?.$type === 'app.bsky.feed.defs#reasonPin';
  };

  // Load remix feed - fetch from all pinned feeds with weighted sampling
  const loadRemixFeed = async (loadMore = false): Promise<string | undefined> => {
    if (remixSourceFeeds.length === 0) {
      setPosts([]);
      setRemixStats({ postCounts: new Map(), totalPosts: 0 });
      setLoading(false);
      return undefined;
    }

    try {
      setLoading(true);
      setError(null);

      const TOTAL_POSTS_TARGET = 50; // Total posts to fetch across all feeds
      const MIN_NEW_POSTS = 10; // Minimum new posts we want to show
      const MAX_SEEN_POSTS = 500; // Limit seen posts set size to prevent unbounded growth
      const allPosts: RemixFeedViewPost[] = [];
      const newCursors = new Map(remixCursors);
      const postCountsByFeed = new Map<string, number>(loadMore ? remixStats.postCounts : undefined);
      
      // Use the persistent seen set for deduplication across refreshes
      // On fresh load (not loadMore), we still use the persistent set to avoid showing
      // posts that were shown in previous refreshes during this session
      const seenUris = remixSeenPostsRef.current;
      
      // Trim the seen set if it's gotten too large (keep most recent entries)
      if (seenUris.size > MAX_SEEN_POSTS) {
        const entries = Array.from(seenUris);
        const toRemove = entries.slice(0, entries.length - MAX_SEEN_POSTS);
        toRemove.forEach(uri => seenUris.delete(uri));
      }
      
      // Also add current posts to seen set (in case of loadMore)
      if (loadMore) {
        posts.forEach(p => seenUris.add(p.post.uri));
      }

      // Calculate weighted posts per feed
      const totalWeight = remixSourceFeeds.reduce((sum, feed) => sum + getRemixWeight(feed.uri), 0);
      const postsPerFeed = new Map<string, number>();
      
      for (const feed of remixSourceFeeds) {
        const weight = getRemixWeight(feed.uri);
        // Calculate proportional posts, minimum 1 per feed to ensure variety
        const proportion = totalWeight > 0 ? weight / totalWeight : 1 / remixSourceFeeds.length;
        const targetPosts = Math.max(1, Math.round(TOTAL_POSTS_TARGET * proportion));
        postsPerFeed.set(feed.uri, targetPosts);
      }

      // Fetch from each source feed in parallel
      const fetchPromises = remixSourceFeeds.map(async (feed) => {
        try {
          const feedCursor = loadMore ? remixCursors.get(feed.uri) : undefined;
          const targetCount = postsPerFeed.get(feed.uri) || 10;
          const result = await fetchFromSource(feed, feedCursor);
          newCursors.set(feed.uri, result.cursor);
          // Filter out pinned posts from feeds
          const filteredPosts = result.posts.filter(p => !isPinnedInFeed(p));
          return { feed, posts: filteredPosts.slice(0, targetCount) };
        } catch (err) {
          console.error(`Failed to fetch from ${feed.displayName}:`, err);
          return { feed, posts: [] };
        }
      });

      const results = await Promise.all(fetchPromises);

      // Round-robin interleave posts from all feeds, with source attribution
      const maxLen = Math.max(...results.map(r => r.posts.length));
      for (let i = 0; i < maxLen; i++) {
        for (const result of results) {
          if (i < result.posts.length) {
            const post = result.posts[i];
            // Deduplicate posts that appear in multiple feeds
            if (!seenUris.has(post.post.uri)) {
              // Add to persistent seen set
              remixSeenPostsRef.current.add(post.post.uri);
              // Attach source feed info
              const remixPost: RemixFeedViewPost = {
                ...post,
                sourceFeed: {
                  uri: result.feed.uri,
                  displayName: result.feed.displayName,
                },
              };
              allPosts.push(remixPost);
              // Track post count for this feed
              const currentCount = postCountsByFeed.get(result.feed.uri) || 0;
              postCountsByFeed.set(result.feed.uri, currentCount + 1);
            }
          }
        }
      }

      // Check if any feed has more posts
      let hasMore = Array.from(newCursors.values()).some(c => c !== undefined);
      
      // If we got too few new posts and there's more content available,
      // fetch additional pages to find fresh content (up to 3 extra attempts)
      let extraFetches = 0;
      const MAX_EXTRA_FETCHES = 3;
      
      while (!loadMore && allPosts.length < MIN_NEW_POSTS && hasMore && extraFetches < MAX_EXTRA_FETCHES) {
        extraFetches++;
        
        // Fetch next page from each source feed
        const extraFetchPromises = remixSourceFeeds.map(async (feed) => {
          try {
            const feedCursor = newCursors.get(feed.uri);
            if (!feedCursor) return { feed, posts: [] };
            
            const targetCount = postsPerFeed.get(feed.uri) || 10;
            const result = await fetchFromSource(feed, feedCursor);
            newCursors.set(feed.uri, result.cursor);
            const filteredPosts = result.posts.filter(p => !isPinnedInFeed(p));
            return { feed, posts: filteredPosts.slice(0, targetCount) };
          } catch (err) {
            console.error(`Failed to fetch more from ${feed.displayName}:`, err);
            return { feed, posts: [] };
          }
        });
        
        const extraResults = await Promise.all(extraFetchPromises);
        
        // Add new posts
        const extraMaxLen = Math.max(...extraResults.map(r => r.posts.length));
        for (let i = 0; i < extraMaxLen; i++) {
          for (const result of extraResults) {
            if (i < result.posts.length) {
              const post = result.posts[i];
              if (!seenUris.has(post.post.uri)) {
                remixSeenPostsRef.current.add(post.post.uri);
                const remixPost: RemixFeedViewPost = {
                  ...post,
                  sourceFeed: {
                    uri: result.feed.uri,
                    displayName: result.feed.displayName,
                  },
                };
                allPosts.push(remixPost);
                const currentCount = postCountsByFeed.get(result.feed.uri) || 0;
                postCountsByFeed.set(result.feed.uri, currentCount + 1);
              }
            }
          }
        }
        
        hasMore = Array.from(newCursors.values()).some(c => c !== undefined);
      }

      // Shuffle the posts randomly (on initial load, not load more)
      const finalPosts = loadMore ? allPosts : shuffleArray(allPosts);

      setRemixCursors(newCursors);
      
      // Update remix stats
      const totalPostsLoaded = loadMore 
        ? remixStats.totalPosts + finalPosts.length 
        : finalPosts.length;
      setRemixStats({
        postCounts: postCountsByFeed,
        totalPosts: totalPostsLoaded,
      });
      
      const remixCursor = hasMore ? 'remix-has-more' : undefined;
      setCursor(remixCursor);

      if (loadMore) {
        // Shuffle new posts before appending
        setPosts(prev => [...prev, ...shuffleArray(finalPosts)]);
      } else {
        setPosts(finalPosts);
      }
      setLoadedPages(prev => prev + 1);
      return remixCursor;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load remix feed');
      return undefined;
    } finally {
      setLoading(false);
    }
  };

  const loadFeed = async (loadMore = false, currentCursor?: string): Promise<string | undefined> => {
    // Remix feed has its own loading logic
    if (isRemixFeed) {
      return loadRemixFeed(loadMore);
    }

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
        const response = await getListFeed(VERIFIED_RESEARCHERS_LIST, loadMore ? (currentCursor || cursor) : undefined);
        feedPosts = response.data.feed;
        newCursor = response.data.cursor;
      } else if (isListFeed && effectiveListUri) {
        // List feed - posts from list members
        const response = await getListFeed(effectiveListUri, loadMore ? (currentCursor || cursor) : undefined);
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
    const currentFeedKey = feedUri || feedId || '';

    // If we already restored from cache on this mount, skip subsequent re-runs
    // caused by async dep changes (e.g. remixSettings loading from localStorage)
    // unless the feed identity or refreshKey actually changed.
    if (restoredFeedRef.current) {
      if (restoredFeedRef.current.feedKey === currentFeedKey &&
          restoredFeedRef.current.refreshKey === refreshKey) {
        return;
      }
      // Feed or refreshKey changed — clear flag and proceed with normal load
      restoredFeedRef.current = null;
    }

    // Check if we're returning from thread navigation with cached feed state
    try {
      const scrollPosition = sessionStorage.getItem('lea-scroll-position');
      if (scrollPosition) {
        const cached = sessionStorage.getItem('lea-feed-cache');
        if (cached) {
          const data = JSON.parse(cached);
          if (data.feedKey === currentFeedKey && data.posts?.length > 0) {
            // Restore cached state instead of refetching
            setPosts(data.posts);
            setCursor(data.cursor);
            setLoadedPages(data.loadedPages || 1);
            setLoading(false);

            if (isRemixFeed) {
              if (data.remixCursors) {
                setRemixCursors(new Map(data.remixCursors));
              }
              if (data.remixStats) {
                setRemixStats({
                  postCounts: new Map(data.remixStats.postCounts),
                  totalPosts: data.remixStats.totalPosts,
                });
              }
              // Rebuild seen posts set from cached posts
              for (const p of data.posts) {
                remixSeenPostsRef.current.add(p.post.uri);
              }
            }

            sessionStorage.removeItem('lea-feed-cache');
            restoredFeedRef.current = { feedKey: currentFeedKey, refreshKey: refreshKey ?? 0 };
            pendingScrollRestoreRef.current = true;
            return;
          }
        }
      }
    } catch {
      // Fall through to normal load
    }

    setPosts([]);
    setCursor(undefined);
    setLoadedPages(0);
    // Reset self-thread state
    setExpandedThreads(new Map());
    loadingThreadsRef.current = new Set();
    checkedUrisRef.current = new Set();
    // Reset remix state
    setRemixCursors(new Map());
    setRemixSourceIndex(0);
    setRemixStats({ postCounts: new Map(), totalPosts: 0 });

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
  // Include remixSettings in deps so remix feed reloads when weights change
  }, [feedId, feedUri, refreshKey, isKeywordFeed, effectiveKeyword, isRemixFeed, remixSourceFeeds.length, remixSettings]);

  // Restore scroll position after cache-restored posts are committed to DOM
  useLayoutEffect(() => {
    if (!pendingScrollRestoreRef.current || posts.length === 0) return;
    pendingScrollRestoreRef.current = false;

    try {
      const savedPosition = sessionStorage.getItem('lea-scroll-position');
      if (savedPosition) {
        const targetY = parseInt(savedPosition, 10);
        window.scrollTo(0, targetY);
      }
    } catch {}

    try {
      sessionStorage.removeItem('lea-scroll-position');
      sessionStorage.removeItem('lea-scroll-feed');
    } catch {}
  }, [posts]);

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

  // Filter posts based on settings, feed type, and moderation
  const { filteredPosts, hiddenCount, totalScanned, moderatedCount, postModerationMap } = useMemo(() => {
    let filtered = posts;
    let hidden = 0;
    let moderated = 0;
    const moderationMap = new Map<string, ModerationUIInfo>();

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

    // Apply content moderation filtering
    if (moderationOpts) {
      const afterModeration: AppBskyFeedDefs.FeedViewPost[] = [];
      for (const item of filtered) {
        try {
          const decision = moderatePost(item.post, moderationOpts);
          const contentMod = getModerationUI(decision, 'contentList');
          const mediaMod = getModerationUI(decision, 'contentMedia');
          
          // Store moderation info for this post
          moderationMap.set(item.post.uri, contentMod);
          
          // Filter out posts that should be hidden (filter=true)
          if (contentMod.filter) {
            moderated++;
            continue;
          }
          
          afterModeration.push(item);
        } catch (err) {
          // If moderation fails, show the post anyway
          console.error('Moderation error for post:', err);
          afterModeration.push(item);
        }
      }
      filtered = afterModeration;
    }

    return { 
      filteredPosts: filtered, 
      hiddenCount: hidden, 
      totalScanned: posts.length,
      moderatedCount: moderated,
      postModerationMap: moderationMap,
    };
  }, [posts, settings.highFollowerThreshold, isPapersFeed, isVerifiedFeed, moderationOpts]);

  // Function to expand a self-thread
  const expandSelfThread = useCallback(async (postUri: string, authorDid: string) => {
    // Check refs to avoid duplicate requests
    if (loadingThreadsRef.current.has(postUri) || checkedUrisRef.current.has(postUri)) return;
    
    loadingThreadsRef.current.add(postUri);
    checkedUrisRef.current.add(postUri);
    
    try {
      const result = await getSelfThread(postUri, authorDid);
      if (result && result.posts.length > 1) {
        console.log('[SelfThread] Expanded thread with', result.posts.length, 'posts');
        setExpandedThreads(prev => new Map(prev).set(postUri, result));
      }
    } finally {
      loadingThreadsRef.current.delete(postUri);
    }
  }, []);

  // Effect to auto-expand self-threads when posts load
  useEffect(() => {
    if (!settings.expandSelfThreads) return;
    
    let checkedCount = 0;
    
    for (const item of filteredPosts) {
      // Skip posts that are themselves replies (we only expand from root posts)
      if (isReplyPost(item)) continue;

      // Skip reposts - don't expand threads from non-followed users
      const isRepost = item.reason && '$type' in item.reason &&
        (item.reason as { $type: string }).$type === 'app.bsky.feed.defs#reasonRepost';
      if (isRepost) continue;

      // Skip posts we've already checked
      if (checkedUrisRef.current.has(item.post.uri)) continue;

      // Check if post has replies (potential for self-thread)
      if (hasReplies(item)) {
        checkedCount++;
        expandSelfThread(item.post.uri, item.post.author.did);
      }
    }
    
    if (checkedCount > 0) {
      console.log('[SelfThread] Checking', checkedCount, 'posts with replies');
    }
  }, [filteredPosts, settings.expandSelfThreads, expandSelfThread]);

  // Save feed state to sessionStorage for restoration after back navigation
  useEffect(() => {
    if (posts.length === 0) return;
    try {
      const data: Record<string, unknown> = {
        feedKey: feedUri || feedId || '',
        posts,
        cursor,
        loadedPages,
      };
      if (isRemixFeed) {
        data.remixCursors = Array.from(remixCursors.entries());
        data.remixStats = {
          postCounts: Array.from(remixStats.postCounts.entries()),
          totalPosts: remixStats.totalPosts,
        };
      }
      sessionStorage.setItem('lea-feed-cache', JSON.stringify(data));
    } catch {
      // Ignore - sessionStorage may be full or unavailable
    }
  }, [posts, cursor, loadedPages, feedUri, feedId, isRemixFeed, remixCursors, remixStats]);

  // Track verified researchers seen in this feed (only count each post once)
  useEffect(() => {
    if (posts.length === 0 || !effectiveFeedUri) return;

    for (const item of posts) {
      const postUri = item.post.uri;
      const author = item.post.author;
      const labels = author.labels as Label[] | undefined;

      // Only track if verified researcher (recordResearcherSighting handles deduplication)
      if (labels && isVerifiedResearcher(labels)) {
        recordResearcherSighting(
          postUri,
          author.did,
          author.handle,
          author.displayName,
          author.avatar,
          effectiveFeedUri,
          effectiveFeedName
        );
      }
    }
  }, [posts, effectiveFeedUri, effectiveFeedName]);

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
    <div className="w-full max-w-full overflow-hidden">
      {/* Hidden posts indicator */}
      {hiddenCount > 0 && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {hiddenCount} post{hiddenCount !== 1 ? 's' : ''} hidden from high-follower accounts
            <span className="text-amber-500 ml-1">(following {settings.highFollowerThreshold?.toLocaleString()}+)</span>
          </p>
        </div>
      )}

      {/* Moderated posts indicator */}
      {moderatedCount > 0 && (
        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {moderatedCount} post{moderatedCount !== 1 ? 's' : ''} hidden by your moderation settings
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
        
        // Extract reply parent info if available
        const parentPost = item.reply?.parent && 'author' in item.reply.parent ? item.reply.parent : null;
        const parentAuthor = parentPost?.author && 'handle' in parentPost.author ? parentPost.author : null;
        const replyParent = parentAuthor
          ? {
              author: {
                did: parentAuthor.did,
                handle: parentAuthor.handle,
                displayName: parentAuthor.displayName,
              }
            }
          : undefined;
        
        // Get moderation info for this post
        const contentMod = postModerationMap.get(postUri) || {
          filter: false, blur: false, alert: false, inform: false,
          noOverride: false, alerts: [], informs: [],
        };
        
        return (
          <ModerationWrapper
            key={`${postUri}-${index}`}
            contentModeration={contentMod}
          >
            <Post
              post={item.post}
              onOpenThread={handleOpenThread}
              feedContext={item.feedContext}
              reqId={item.reqId}
              supportsInteractions={effectiveAcceptsInteractions}
              feedUri={effectiveFeedUri || undefined}
              onOpenProfile={onOpenProfile}
              reason={item.reason as AppBskyFeedDefs.ReasonRepost | undefined}
              replyParent={replyParent}
              sourceFeed={(item as RemixFeedViewPost).sourceFeed}
            />
          </ModerationWrapper>
        );
      })}

      {/* Thread View Modal - only render if using internal state (no external handler) */}
      {!onOpenThread && internalThreadUri && (
        <ThreadView uri={internalThreadUri} onClose={() => setInternalThreadUri(null)} />
      )}

      {/* Load more - infinite scroll for all feeds */}
      {filteredPosts.length > 0 && cursor && (
        <div ref={sentinelCallbackRef} className="h-20">
          {loading && (
            <div className="p-4 text-center text-gray-500">Loading more...</div>
          )}
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
