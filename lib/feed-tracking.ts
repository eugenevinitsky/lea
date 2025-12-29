// Track verified researchers seen in feeds

const STORAGE_KEY = 'lea-feed-researcher-sightings';
const COUNTED_POSTS_KEY = 'lea-feed-counted-posts';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface ResearcherSighting {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  feedUri: string;
  feedName: string;
  count: number;
  lastSeen: number; // timestamp
}

interface SightingsStore {
  // Key is `${did}:${feedUri}`
  sightings: Record<string, ResearcherSighting>;
  lastCleanup: number;
}

interface CountedPostsStore {
  // Set of post URIs that have been counted
  postUris: string[];
  lastCleanup: number;
}

function getStore(): SightingsStore {
  if (typeof window === 'undefined') {
    return { sightings: {}, lastCleanup: Date.now() };
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to parse feed tracking store:', e);
  }

  return { sightings: {}, lastCleanup: Date.now() };
}

function saveStore(store: SightingsStore): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    console.error('Failed to save feed tracking store:', e);
  }
}

// In-memory cache of counted posts (loaded from localStorage on first access)
let countedPostsCache: Set<string> | null = null;

function getCountedPosts(): Set<string> {
  if (countedPostsCache !== null) {
    return countedPostsCache;
  }

  if (typeof window === 'undefined') {
    countedPostsCache = new Set();
    return countedPostsCache;
  }

  try {
    const stored = localStorage.getItem(COUNTED_POSTS_KEY);
    if (stored) {
      const data: CountedPostsStore = JSON.parse(stored);
      // Clean up old entries if needed (keep last 10000 posts max)
      const posts = data.postUris.slice(-10000);
      countedPostsCache = new Set(posts);
      return countedPostsCache;
    }
  } catch (e) {
    console.error('Failed to parse counted posts store:', e);
  }

  countedPostsCache = new Set();
  return countedPostsCache;
}

function saveCountedPosts(): void {
  if (typeof window === 'undefined' || !countedPostsCache) return;

  try {
    // Keep only last 10000 posts to avoid localStorage bloat
    const posts = Array.from(countedPostsCache).slice(-10000);
    const store: CountedPostsStore = {
      postUris: posts,
      lastCleanup: Date.now(),
    };
    localStorage.setItem(COUNTED_POSTS_KEY, JSON.stringify(store));
  } catch (e) {
    console.error('Failed to save counted posts store:', e);
  }
}

// Check if a post has already been counted
export function hasPostBeenCounted(postUri: string): boolean {
  return getCountedPosts().has(postUri);
}

// Mark a post as counted
function markPostAsCounted(postUri: string): void {
  const posts = getCountedPosts();
  posts.add(postUri);
  saveCountedPosts();
}

// Clean up old sightings (older than MAX_AGE_MS)
function cleanupOldSightings(store: SightingsStore): SightingsStore {
  const now = Date.now();
  const cutoff = now - MAX_AGE_MS;

  const cleanedSightings: Record<string, ResearcherSighting> = {};

  for (const [key, sighting] of Object.entries(store.sightings)) {
    if (sighting.lastSeen > cutoff) {
      cleanedSightings[key] = sighting;
    }
  }

  return {
    sightings: cleanedSightings,
    lastCleanup: now,
  };
}

// Record a sighting of a verified researcher in a feed
// Returns true if the post was counted, false if it was already counted
export function recordResearcherSighting(
  postUri: string,
  did: string,
  handle: string,
  displayName: string | undefined,
  avatar: string | undefined,
  feedUri: string,
  feedName: string
): boolean {
  // Check if this post has already been counted
  if (hasPostBeenCounted(postUri)) {
    return false;
  }

  // Mark the post as counted
  markPostAsCounted(postUri);

  let store = getStore();

  // Cleanup once per hour
  if (Date.now() - store.lastCleanup > 60 * 60 * 1000) {
    store = cleanupOldSightings(store);
  }

  const key = `${did}:${feedUri}`;
  const existing = store.sightings[key];

  if (existing) {
    existing.count += 1;
    existing.lastSeen = Date.now();
    // Update profile info in case it changed
    existing.handle = handle;
    existing.displayName = displayName;
    existing.avatar = avatar;
  } else {
    store.sightings[key] = {
      did,
      handle,
      displayName,
      avatar,
      feedUri,
      feedName,
      count: 1,
      lastSeen: Date.now(),
    };
  }

  saveStore(store);
  return true;
}

// Get aggregated sightings (combined across feeds, sorted by total count)
export function getActiveResearchers(): Array<{
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  totalCount: number;
  feeds: Array<{ feedUri: string; feedName: string; count: number }>;
  lastSeen: number;
}> {
  let store = getStore();

  // Cleanup old sightings
  store = cleanupOldSightings(store);
  saveStore(store);

  // Aggregate by DID
  const byDid: Record<string, {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
    totalCount: number;
    feeds: Array<{ feedUri: string; feedName: string; count: number }>;
    lastSeen: number;
  }> = {};

  for (const sighting of Object.values(store.sightings)) {
    if (!byDid[sighting.did]) {
      byDid[sighting.did] = {
        did: sighting.did,
        handle: sighting.handle,
        displayName: sighting.displayName,
        avatar: sighting.avatar,
        totalCount: 0,
        feeds: [],
        lastSeen: 0,
      };
    }

    const entry = byDid[sighting.did];
    entry.totalCount += sighting.count;
    entry.feeds.push({
      feedUri: sighting.feedUri,
      feedName: sighting.feedName,
      count: sighting.count,
    });
    entry.lastSeen = Math.max(entry.lastSeen, sighting.lastSeen);

    // Update profile info to latest
    entry.handle = sighting.handle;
    entry.displayName = sighting.displayName;
    entry.avatar = sighting.avatar;
  }

  // Sort by total count descending
  return Object.values(byDid).sort((a, b) => b.totalCount - a.totalCount);
}

// Clear all tracking data
export function clearFeedTracking(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
