'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { VERIFIED_RESEARCHERS_LIST } from './constants';

const FEEDS_STORAGE_KEY = 'lea-pinned-feeds';
const FEEDS_SYNCED_KEY = 'lea-feeds-synced';

// Re-export for backwards compatibility
export { VERIFIED_RESEARCHERS_LIST };

// Suggested feeds for researchers
export const SUGGESTED_FEEDS = [
  {
    uri: 'verified-following',
    displayName: 'Verified Researchers',
    description: 'Posts from verified researchers you follow',
    avatar: undefined,
    acceptsInteractions: false,
    type: 'verified' as const,
  },
  {
    uri: 'at://did:plc:uaadt6f5bbda6cycbmatcm3z/app.bsky.feed.generator/preprintdigest',
    displayName: 'Paper Skygest',
    description: 'A curated feed of preprints and papers shared by the research community',
    avatar: undefined,
    acceptsInteractions: false,
  },
  {
    uri: 'at://did:plc:3guzzweuqraryl3rdkimjamk/app.bsky.feed.generator/for-you',
    displayName: 'For You',
    description: 'Personalized recommendations based on your interests',
    avatar: undefined,
    acceptsInteractions: true,
  },
  {
    uri: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/mutuals',
    displayName: 'Mutuals',
    description: 'Posts from accounts you follow who also follow you back',
    avatar: undefined,
    acceptsInteractions: false,
  },
  {
    uri: 'at://did:plc:vpkhqolt662uhesyj6nxm7ys/app.bsky.feed.generator/infreq',
    displayName: 'Quiet Posters',
    description: 'Surface posts from people who post less frequently',
    avatar: undefined,
    acceptsInteractions: false,
  },
  {
    uri: 'at://did:plc:rbhdulrhadttlidrxnrconpy/app.bsky.feed.generator/academicjobs',
    displayName: 'Academic Jobs',
    description: 'Academic and research job postings',
    avatar: undefined,
    acceptsInteractions: false,
  },
  {
    uri: 'at://did:plc:geoqe3qls5mwezckxxsewys2/app.bsky.feed.generator/aaabrbjcg4hmk',
    displayName: 'BookSky 💙📚',
    description: 'A feed for anyone who likes reading and books. Use 💙📚 or #booksky in your posts.',
    avatar: undefined,
    acceptsInteractions: false,
  },
  {
    uri: 'at://did:plc:prng5tkqrb4b7f5xoishgpjl/app.bsky.feed.generator/highline-chron',
    displayName: 'Highline ⬇️',
    description: 'What you missed from your Following timeline, from oldest to newest: a couple of the most engaged posts from each account + a few reposts.',
    avatar: undefined,
    acceptsInteractions: false,
  },
];

// Default pinned feeds
const DEFAULT_FEEDS: PinnedFeed[] = [
  {
    uri: 'verified-following',
    displayName: 'Verified Researchers',
    acceptsInteractions: false,
    type: 'verified',
  },
  {
    uri: 'at://did:plc:uaadt6f5bbda6cycbmatcm3z/app.bsky.feed.generator/preprintdigest',
    displayName: 'Paper Skygest',
    acceptsInteractions: false,
  },
  {
    uri: 'at://did:plc:3guzzweuqraryl3rdkimjamk/app.bsky.feed.generator/for-you',
    displayName: 'For You',
    acceptsInteractions: true,
  },
  {
    uri: 'timeline',
    displayName: 'Following',
    acceptsInteractions: false,
  },
];

export interface PinnedFeed {
  uri: string;
  displayName: string;
  avatar?: string;
  acceptsInteractions: boolean;
  // Feed type: 'feed' for feed generators, 'keyword' for search, 'list' for list feeds, 'verified' for timeline filtered to verified researchers
  type?: 'feed' | 'keyword' | 'list' | 'verified';
  keyword?: string;
}

interface FeedsContextType {
  pinnedFeeds: PinnedFeed[];
  isLoaded: boolean;
  addFeed: (feed: PinnedFeed) => void;
  removeFeed: (uri: string) => void;
  moveFeed: (uri: string, direction: 'up' | 'down') => void;
  reorderFeeds: (fromIndex: number, toIndex: number) => void;
  isPinned: (uri: string) => boolean;
  setUserDid: (did: string | null) => void;
}

const FeedsContext = createContext<FeedsContextType | null>(null);

export function FeedsProvider({ children }: { children: ReactNode }) {
  const [pinnedFeeds, setPinnedFeeds] = useState<PinnedFeed[]>(DEFAULT_FEEDS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [userDid, setUserDid] = useState<string | null>(null);
  const isSyncing = useRef(false);
  const pendingSync = useRef(false);
  const hasFetchedFromServer = useRef(false); // Track if we've fetched for current user
  const userModifiedFeeds = useRef(false); // Track if user explicitly changed feeds

  // Migrate feeds helper
  const migrateFeeds = useCallback((feeds: PinnedFeed[]): PinnedFeed[] => {
    return feeds.map((feed: PinnedFeed) => {
      if (feed.uri === VERIFIED_RESEARCHERS_LIST ||
          (feed.displayName === 'Verified Researchers' && feed.type === 'list')) {
        return {
          uri: 'verified-following',
          displayName: 'Verified Researchers',
          acceptsInteractions: false,
          type: 'verified' as const,
        };
      }
      return feed;
    });
  }, []);

  // Sync feeds to server
  const syncToServer = useCallback(async (feeds: PinnedFeed[], did: string) => {
    if (isSyncing.current) {
      pendingSync.current = true;
      return;
    }

    isSyncing.current = true;
    try {
      await fetch('/api/feeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ did, feeds }),
      });
      try {
        localStorage.setItem(FEEDS_SYNCED_KEY, 'true');
      } catch {
        // localStorage may fail in private browsing
      }
    } catch (e) {
      console.error('Failed to sync feeds to server:', e);
    } finally {
      isSyncing.current = false;
      if (pendingSync.current) {
        pendingSync.current = false;
        syncToServer(feeds, did);
      }
    }
  }, []);

  // Load feeds from server or localStorage
  useEffect(() => {
    async function loadFeeds() {
      // Reset fetch flag when userDid changes
      hasFetchedFromServer.current = false;
      userModifiedFeeds.current = false;

      // First, load from localStorage as fallback
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(FEEDS_STORAGE_KEY);
      } catch {
        // localStorage may fail in private browsing
      }
      let localFeeds: PinnedFeed[] = DEFAULT_FEEDS;

      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            localFeeds = migrateFeeds(parsed);
          }
        } catch (e) {
          console.error('Failed to parse stored feeds:', e);
        }
      }

      // If we have a user DID, try to load from server
      if (userDid) {
        try {
          const res = await fetch(`/api/feeds?did=${encodeURIComponent(userDid)}`);
          if (res.ok) {
            const data = await res.json();
            hasFetchedFromServer.current = true; // Mark that we've fetched
            if (data.feeds && data.feeds.length > 0) {
              // Server has feeds, use them
              setPinnedFeeds(data.feeds);
              try {
                localStorage.setItem(FEEDS_STORAGE_KEY, JSON.stringify(data.feeds));
              } catch {
                // localStorage may fail in private browsing
              }
              setIsLoaded(true);
              return;
            }
          }
        } catch (e) {
          console.error('Failed to fetch feeds from server:', e);
        }

        // No server feeds - if local has feeds, sync them to server
        let feedsSynced = false;
        try {
          feedsSynced = !!localStorage.getItem(FEEDS_SYNCED_KEY);
        } catch {
          // localStorage may fail in private browsing
        }
        if (localFeeds.length > 0 && !feedsSynced) {
          hasFetchedFromServer.current = true; // We've checked server, it's empty
          syncToServer(localFeeds, userDid);
        }
      }

      setPinnedFeeds(localFeeds);
      setIsLoaded(true);
    }

    loadFeeds();
  }, [userDid, migrateFeeds, syncToServer]);

  // Save to localStorage and sync to server when feeds change
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(FEEDS_STORAGE_KEY, JSON.stringify(pinnedFeeds));
      } catch {
        // localStorage may fail in private browsing
      }
      // Only sync to server if user explicitly modified feeds AND we've already fetched from server
      // This prevents overwriting server data on initial load
      if (userDid && userModifiedFeeds.current && hasFetchedFromServer.current) {
        syncToServer(pinnedFeeds, userDid);
      }
    }
  }, [pinnedFeeds, isLoaded, userDid, syncToServer]);

  const addFeed = (feed: PinnedFeed) => {
    userModifiedFeeds.current = true;
    setPinnedFeeds(prev => {
      if (prev.some(f => f.uri === feed.uri)) return prev;
      return [...prev, feed];
    });
  };

  const removeFeed = useCallback((uri: string) => {
    userModifiedFeeds.current = true;
    hasFetchedFromServer.current = true; // Force sync even if we haven't fetched yet
    setPinnedFeeds(prev => prev.filter(f => f.uri !== uri));
  }, []);

  const moveFeed = (uri: string, direction: 'up' | 'down') => {
    userModifiedFeeds.current = true;
    setPinnedFeeds(prev => {
      const index = prev.findIndex(f => f.uri === uri);
      if (index === -1) return prev;

      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= prev.length) return prev;

      const newFeeds = [...prev];
      [newFeeds[index], newFeeds[newIndex]] = [newFeeds[newIndex], newFeeds[index]];
      return newFeeds;
    });
  };

  const reorderFeeds = (fromIndex: number, toIndex: number) => {
    userModifiedFeeds.current = true;
    setPinnedFeeds(prev => {
      if (fromIndex === toIndex) return prev;
      if (fromIndex < 0 || fromIndex >= prev.length) return prev;
      if (toIndex < 0 || toIndex >= prev.length) return prev;

      const newFeeds = [...prev];
      const [removed] = newFeeds.splice(fromIndex, 1);
      newFeeds.splice(toIndex, 0, removed);
      return newFeeds;
    });
  };

  const isPinned = (uri: string) => {
    return pinnedFeeds.some(f => f.uri === uri);
  };

  return (
    <FeedsContext.Provider value={{ pinnedFeeds, isLoaded, addFeed, removeFeed, moveFeed, reorderFeeds, isPinned, setUserDid }}>
      {children}
    </FeedsContext.Provider>
  );
}

export function useFeeds() {
  const context = useContext(FeedsContext);
  if (!context) {
    throw new Error('useFeeds must be used within a FeedsProvider');
  }
  return context;
}
