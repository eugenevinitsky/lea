'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const FEEDS_STORAGE_KEY = 'lea-pinned-feeds';

// Suggested feeds for researchers
export const SUGGESTED_FEEDS = [
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
    uri: 'at://did:plc:tenurhgjptubkk5zf5qhi3og/app.bsky.feed.generator/mutuals',
    displayName: 'Mutuals',
    description: 'Posts from accounts you follow who also follow you back',
    avatar: undefined,
    acceptsInteractions: false,
  },
  {
    uri: 'at://did:plc:tenurhgjptubkk5zf5qhi3og/app.bsky.feed.generator/quiet-posters',
    displayName: 'Quiet Posters',
    description: 'Surface posts from people who post less frequently',
    avatar: undefined,
    acceptsInteractions: false,
  },
  {
    uri: 'at://did:plc:65clunuffbtfwwcptrnxtcwj/app.bsky.feed.generator/science-jobs',
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
}

interface FeedsContextType {
  pinnedFeeds: PinnedFeed[];
  addFeed: (feed: PinnedFeed) => void;
  removeFeed: (uri: string) => void;
  moveFeed: (uri: string, direction: 'up' | 'down') => void;
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

  const isPinned = (uri: string) => {
    return pinnedFeeds.some(f => f.uri === uri);
  };

  return (
    <FeedsContext.Provider value={{ pinnedFeeds, addFeed, removeFeed, moveFeed, isPinned }}>
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
