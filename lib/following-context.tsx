'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { getMyFollows, getSession } from '@/lib/bluesky';

const CACHE_KEY = 'lea-following-cache';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour - refresh in background after this

interface CachedFollows {
  dids: string[];
  userDid: string;
  timestamp: number;
}

interface FollowingContextType {
  followingDids: Set<string> | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const FollowingContext = createContext<FollowingContextType | null>(null);

function loadFromCache(userDid: string): Set<string> | null {
  if (typeof window === 'undefined') return null;

  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const data: CachedFollows = JSON.parse(cached);

    // Check if cache is for current user
    if (data.userDid !== userDid) return null;

    return new Set(data.dids);
  } catch {
    return null;
  }
}

function saveToCache(dids: Set<string>, userDid: string): void {
  if (typeof window === 'undefined') return;

  try {
    const data: CachedFollows = {
      dids: Array.from(dids),
      userDid,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to cache follows:', e);
  }
}

function isCacheStale(): boolean {
  if (typeof window === 'undefined') return true;

  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return true;

    const data: CachedFollows = JSON.parse(cached);
    return Date.now() - data.timestamp > CACHE_TTL;
  } catch {
    return true;
  }
}

export function FollowingProvider({ children }: { children: ReactNode }) {
  const [followingDids, setFollowingDids] = useState<Set<string> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fetchingRef = useRef(false);
  const hasLoadedFromApiRef = useRef(false);

  const fetchFollows = useCallback(async (forceRefresh = false) => {
    // Prevent duplicate fetches
    if (fetchingRef.current) return;
    if (hasLoadedFromApiRef.current && !forceRefresh) return;

    const session = getSession();
    if (!session) return;

    fetchingRef.current = true;
    setIsLoading(true);
    try {
      const follows = await getMyFollows();
      setFollowingDids(follows);
      saveToCache(follows, session.did);
      hasLoadedFromApiRef.current = true;
    } catch (err) {
      console.error('Failed to fetch following list:', err);
      // Don't overwrite cached data on error
      if (!followingDids) {
        setFollowingDids(new Set());
      }
    } finally {
      setIsLoading(false);
      fetchingRef.current = false;
    }
  }, [followingDids]);

  // Load from cache immediately, then fetch fresh data
  useEffect(() => {
    const session = getSession();

    // If we have a session, try to load from cache first
    if (session) {
      const cached = loadFromCache(session.did);
      if (cached) {
        setFollowingDids(cached);
        // If cache is stale, refresh in background
        if (isCacheStale()) {
          fetchFollows();
        }
        return;
      }
    }

    // No cache - need to fetch
    // Poll for session availability
    const interval = setInterval(() => {
      const currentSession = getSession();
      if (currentSession && !fetchingRef.current && !hasLoadedFromApiRef.current) {
        // Try cache first
        const cached = loadFromCache(currentSession.did);
        if (cached) {
          setFollowingDids(cached);
          clearInterval(interval);
          // Refresh in background if stale
          if (isCacheStale()) {
            fetchFollows();
          }
        } else {
          fetchFollows();
          clearInterval(interval);
        }
      }
    }, 200);

    return () => clearInterval(interval);
  }, [fetchFollows]);

  const refresh = useCallback(async () => {
    hasLoadedFromApiRef.current = false;
    fetchingRef.current = false;
    await fetchFollows(true);
  }, [fetchFollows]);

  return (
    <FollowingContext.Provider value={{ followingDids, isLoading, refresh }}>
      {children}
    </FollowingContext.Provider>
  );
}

export function useFollowing() {
  const context = useContext(FollowingContext);
  if (!context) {
    throw new Error('useFollowing must be used within a FollowingProvider');
  }
  return context;
}
