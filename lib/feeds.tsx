'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const FEEDS_STORAGE_KEY = 'lea-pinned-feeds';

// Verified researchers list URI
export const VERIFIED_RESEARCHERS_LIST = 'at://did:plc:7c7tx56n64jhzezlwox5dja6/app.bsky.graph.list/3masawnn3xj23';

// Suggested feeds for researchers
export const SUGGESTED_FEEDS = [
  {
    uri: VERIFIED_RESEARCHERS_LIST,
    displayName: 'Verified Researchers',
    description: 'Posts from verified researchers in the LEA community',
    avatar: undefined,
    acceptsInteractions: false,
    type: 'list' as const,
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
];

// Default pinned feeds
const DEFAULT_FEEDS: PinnedFeed[] = [
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
    displayName: 'Timeline',
    acceptsInteractions: false,
  },
];

export interface PinnedFeed {
  uri: string;
  displayName: string;
  avatar?: string;
  acceptsInteractions: boolean;
  // Feed type: 'feed' for feed generators, 'keyword' for search, 'list' for list feeds
  type?: 'feed' | 'keyword' | 'list';
  keyword?: string;
}

interface FeedsContextType {
  pinnedFeeds: PinnedFeed[];
  addFeed: (feed: PinnedFeed) => void;
  removeFeed: (uri: string) => void;
  moveFeed: (uri: string, direction: 'up' | 'down') => void;
  reorderFeeds: (fromIndex: number, toIndex: number) => void;
  isPinned: (uri: string) => boolean;
}

const FeedsContext = createContext<FeedsContextType | null>(null);

export function FeedsProvider({ children }: { children: ReactNode }) {
  const [pinnedFeeds, setPinnedFeeds] = useState<PinnedFeed[]>(DEFAULT_FEEDS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(FEEDS_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPinnedFeeds(parsed);
        }
      } catch (e) {
        console.error('Failed to parse stored feeds:', e);
      }
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage when feeds change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(FEEDS_STORAGE_KEY, JSON.stringify(pinnedFeeds));
    }
  }, [pinnedFeeds, isLoaded]);

  const addFeed = (feed: PinnedFeed) => {
    setPinnedFeeds(prev => {
      if (prev.some(f => f.uri === feed.uri)) return prev;
      return [...prev, feed];
    });
  };

  const removeFeed = (uri: string) => {
    setPinnedFeeds(prev => prev.filter(f => f.uri !== uri));
  };

  const moveFeed = (uri: string, direction: 'up' | 'down') => {
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
    <FeedsContext.Provider value={{ pinnedFeeds, addFeed, removeFeed, moveFeed, reorderFeeds, isPinned }}>
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
