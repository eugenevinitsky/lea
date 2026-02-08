import { Agent, RichText, AppBskyFeedDefs, AppBskyActorDefs, moderatePost, moderateProfile, ModerationOpts, ModerationDecision, InterpretedLabelValueDefinition } from '@atproto/api';
import { getAgentFromSession, getOAuthSession, oauthLogout } from './oauth';

// Agent is now managed by OAuth - we get it from the OAuth session
let agent: Agent | null = null;

// Cache for list URIs
let verifiedOnlyListUri: string | null = null;
let personalListUri: string | null = null;

const DEFAULT_PDS = 'https://bsky.social';
const PLC_DIRECTORY = 'https://plc.directory';

// ============================================
// PDS Resolution for Custom PDS Support
// ============================================

// DID Document types
interface DidService {
  id: string;
  type: string;
  serviceEndpoint: string;
}

interface DidDocument {
  id: string;
  alsoKnownAs?: string[];
  service?: DidService[];
  verificationMethod?: unknown[];
}

// Current PDS URL for the logged-in user
let currentPdsUrl: string = DEFAULT_PDS;

/**
 * Resolve a DID to its DID Document
 * Supports did:plc (via PLC directory) and did:web (via .well-known)
 */
export async function resolveDid(did: string): Promise<DidDocument> {
  if (did.startsWith('did:plc:')) {
    // Resolve via PLC directory
    const response = await fetch(`${PLC_DIRECTORY}/${did}`);
    if (!response.ok) {
      throw new Error(`Failed to resolve DID ${did}: ${response.status}`);
    }
    return response.json();
  } else if (did.startsWith('did:web:')) {
    // Resolve did:web via .well-known endpoint
    // did:web:example.com -> https://example.com/.well-known/did.json
    // did:web:example.com:path:to:resource -> https://example.com/path/to/resource/did.json
    const parts = did.replace('did:web:', '').split(':');
    const domain = parts[0];
    const path = parts.slice(1).join('/');
    const url = path
      ? `https://${domain}/${path}/did.json`
      : `https://${domain}/.well-known/did.json`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to resolve DID ${did}: ${response.status}`);
    }
    return response.json();
  } else {
    throw new Error(`Unsupported DID method: ${did}`);
  }
}

/**
 * Extract PDS service endpoint from a DID Document
 * Looks for service with id ending in #atproto_pds and type AtprotoPersonalDataServer
 */
export function getPdsFromDidDoc(didDoc: DidDocument): string | null {
  if (!didDoc.service || !Array.isArray(didDoc.service)) {
    return null;
  }
  
  const pdsService = didDoc.service.find(s =>
    s.id?.endsWith('#atproto_pds') &&
    s.type === 'AtprotoPersonalDataServer'
  );
  
  return pdsService?.serviceEndpoint || null;
}

/**
 * Resolve a handle to the user's PDS URL
 * Flow: handle -> DID (via any PDS) -> DID Document -> PDS URL
 */
export async function resolvePdsForHandle(handle: string): Promise<{ did: string; pdsUrl: string }> {
  // First, resolve handle to DID using bsky.social (works for any handle)
  const resolveResponse = await fetch(
    `${DEFAULT_PDS}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
  );
  
  if (!resolveResponse.ok) {
    throw new Error(`Failed to resolve handle ${handle}: ${resolveResponse.status}`);
  }
  
  const { did } = await resolveResponse.json();
  
  // Now resolve the DID to get the DID document
  const didDoc = await resolveDid(did);
  
  // Extract PDS URL from DID document
  const pdsUrl = getPdsFromDidDoc(didDoc);
  
  if (!pdsUrl) {
    console.warn(`No PDS found in DID document for ${did}, falling back to ${DEFAULT_PDS}`);
    return { did, pdsUrl: DEFAULT_PDS };
  }
  
  return { did, pdsUrl };
}

/**
 * Get the current PDS URL for the logged-in user
 */
export function getCurrentPdsUrl(): string {
  return currentPdsUrl;
}

// Helper to build profile URLs that handles dots in custom domain handles
// Next.js interprets .com, .net etc. as file extensions, so we use DIDs for those
// URL format matches Bluesky: /profile/{handle}
export function buildProfileUrl(handleOrDid: string, did?: string): string {
  // If handle contains a dot and we have a DID, use the DID to avoid Next.js extension parsing
  if (handleOrDid.includes('.') && did) {
    return `/profile/${did}`;
  }
  return `/profile/${handleOrDid}`;
}

// Helper to build post URLs
// URL format matches Bluesky: /profile/{handle}/post/{rkey}
export function buildPostUrl(handleOrDid: string, rkey: string, did?: string): string {
  // If handle contains a dot and we have a DID, use the DID
  if (handleOrDid.includes('.') && did) {
    return `/profile/${did}/post/${rkey}`;
  }
  return `/profile/${handleOrDid}/post/${rkey}`;
}

// LEA Labeler DID - needed for receiving verified researcher labels
const LEA_LABELER_DID_CONFIG = 'did:plc:7c7tx56n64jhzezlwox5dja6';

// Configure agent to receive labels from LEA labeler
function configureLabeler() {
  if (agent) {
    agent.configureLabelersHeader([LEA_LABELER_DID_CONFIG]);
  }
}

export function getAgent(): Agent | null {
  // Get agent from OAuth session if we don't have one cached
  if (!agent) {
    agent = getAgentFromSession();
  }
  return agent;
}

// Refresh the agent from OAuth session (call after OAuth init)
export function refreshAgent(): void {
  agent = getAgentFromSession();
  if (agent) {
    // Configure labelers
    configureLabeler();
  }
}

// Configure labelers and return success
export async function configureAgentLabelers(): Promise<boolean> {
  if (!agent) {
    agent = getAgentFromSession();
  }
  if (!agent) return false;
  
  try {
    await configureSubscribedLabelers();
    return true;
  } catch (err) {
    console.error('Failed to configure labelers:', err);
    configureLabeler(); // Fall back to just LEA labeler
    return true;
  }
}

export function logout() {
  agent = null;
  personalListUri = null; // Clear personal list cache on logout
  currentPdsUrl = DEFAULT_PDS; // Reset PDS to default
  clearModerationCache(); // Clear moderation cache on logout
  // Clear cached handle (defined later in file, but logout is called after setup)
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('lea-verified-status'); // Clear verification cache
  }
  // Revoke OAuth session
  oauthLogout();
}

export async function getTimeline(cursor?: string) {
  if (!agent) throw new Error('Not logged in');
  return agent.getTimeline({ limit: 30, cursor });
}

// Fetch a custom feed by URI
export async function getFeed(feedUri: string, cursor?: string) {
  if (!agent) throw new Error('Not logged in');
  return agent.app.bsky.feed.getFeed({ feed: feedUri, limit: 30, cursor });
}

// Fetch posts from a list (all posts from list members)
export async function getListFeed(listUri: string, cursor?: string) {
  if (!agent) throw new Error('Not logged in');
  return agent.app.bsky.feed.getListFeed({ list: listUri, limit: 30, cursor });
}

// Get quote posts for a given post
export async function getQuotes(uri: string, cursor?: string) {
  if (!agent) throw new Error('Not logged in');
  return agent.app.bsky.feed.getQuotes({ uri, limit: 25, cursor });
}

// Get users who liked a post
export async function getLikes(uri: string, cursor?: string) {
  if (!agent) throw new Error('Not logged in');
  return agent.app.bsky.feed.getLikes({ uri, limit: 50, cursor });
}

// Get users who reposted a post
export async function getRepostedBy(uri: string, cursor?: string) {
  if (!agent) throw new Error('Not logged in');
  return agent.app.bsky.feed.getRepostedBy({ uri, limit: 50, cursor });
}

// User info for mass blocking (includes relationship data)
export interface MassBlockUser {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  followsYou: boolean;
  youFollow: boolean;
  alreadyBlocked: boolean;
}

// Get ALL users who liked a post (paginated, with relationship info)
export async function getAllLikers(
  uri: string,
  onProgress?: (loaded: number) => void
): Promise<MassBlockUser[]> {
  if (!agent) throw new Error('Not logged in');
  
  const allUsers: MassBlockUser[] = [];
  let cursor: string | undefined;
  
  do {
    const response = await agent.app.bsky.feed.getLikes({ uri, limit: 100, cursor });
    const likes = response.data.likes || [];
    
    for (const like of likes) {
      const actor = like.actor;
      allUsers.push({
        did: actor.did,
        handle: actor.handle,
        displayName: actor.displayName,
        avatar: actor.avatar,
        followsYou: !!actor.viewer?.followedBy,
        youFollow: !!actor.viewer?.following,
        alreadyBlocked: !!actor.viewer?.blocking,
      });
    }
    
    cursor = response.data.cursor;
    onProgress?.(allUsers.length);
    
    // Small delay to avoid rate limiting
    if (cursor) await new Promise(r => setTimeout(r, 100));
  } while (cursor);
  
  return allUsers;
}

// Get ALL users who reposted a post (paginated, with relationship info)
export async function getAllReposters(
  uri: string,
  onProgress?: (loaded: number) => void
): Promise<MassBlockUser[]> {
  if (!agent) throw new Error('Not logged in');
  
  const allUsers: MassBlockUser[] = [];
  let cursor: string | undefined;
  
  do {
    const response = await agent.app.bsky.feed.getRepostedBy({ uri, limit: 100, cursor });
    const repostedBy = response.data.repostedBy || [];
    
    for (const actor of repostedBy) {
      allUsers.push({
        did: actor.did,
        handle: actor.handle,
        displayName: actor.displayName,
        avatar: actor.avatar,
        followsYou: !!actor.viewer?.followedBy,
        youFollow: !!actor.viewer?.following,
        alreadyBlocked: !!actor.viewer?.blocking,
      });
    }
    
    cursor = response.data.cursor;
    onProgress?.(allUsers.length);
    
    // Small delay to avoid rate limiting
    if (cursor) await new Promise(r => setTimeout(r, 100));
  } while (cursor);
  
  return allUsers;
}

// Parse a Bluesky or Lea post URL to get the AT URI
// Supports: https://bsky.app/profile/handle/post/rkey
//           https://lea.example.com/profile/handle/post/rkey (Lea format - matches Bluesky)
//           https://lea.example.com/post/handle/rkey (Legacy Lea format)
// Returns: at://did/app.bsky.feed.post/rkey
export async function parsePostUrl(url: string): Promise<string | null> {
  if (!agent) return null;

  // Already an AT URI
  if (url.startsWith('at://')) {
    return url;
  }

  let handleOrDid: string | null = null;
  let rkey: string | null = null;

  // Parse /profile/handle/post/rkey format (works for both bsky.app and Lea)
  const profileMatch = url.match(/\/profile\/([^/]+)\/post\/([^/?]+)/);
  if (profileMatch) {
    [, handleOrDid, rkey] = profileMatch;
  }

  // Parse legacy Lea URL: /post/handle/rkey (for backwards compatibility)
  if (!handleOrDid) {
    const legacyMatch = url.match(/\/post\/([^/]+)\/([^/?]+)/);
    if (legacyMatch) {
      [, handleOrDid, rkey] = legacyMatch;
    }
  }
  
  if (!handleOrDid || !rkey) {
    return null;
  }
  
  // If it's already a DID, use it directly
  if (handleOrDid.startsWith('did:')) {
    return `at://${handleOrDid}/app.bsky.feed.post/${rkey}`;
  }
  
  // Otherwise resolve the handle to a DID
  try {
    const resolved = await agent.resolveHandle({ handle: handleOrDid });
    return `at://${resolved.data.did}/app.bsky.feed.post/${rkey}`;
  } catch {
    return null;
  }
}

// Block multiple users with progress callback
export async function blockMultipleUsers(
  dids: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<{ succeeded: number; failed: number }> {
  if (!agent?.did) throw new Error('Not logged in');
  
  let succeeded = 0;
  let failed = 0;
  
  for (let i = 0; i < dids.length; i++) {
    try {
      await agent.api.app.bsky.graph.block.create(
        { repo: agent.assertDid },
        {
          subject: dids[i],
          createdAt: new Date().toISOString(),
        }
      );
      succeeded++;
    } catch (err) {
      console.error(`Failed to block ${dids[i]}:`, err);
      failed++;
    }
    
    onProgress?.(i + 1, dids.length);
    
    // Small delay to avoid rate limiting
    if (i < dids.length - 1) {
      await new Promise(r => setTimeout(r, 50));
    }
  }
  
  return { succeeded, failed };
}

// Feed generator info type
export interface FeedGeneratorInfo {
  uri: string;
  cid: string;
  did: string;
  creator: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  displayName: string;
  description?: string;
  avatar?: string;
  likeCount?: number;
  acceptsInteractions?: boolean;
  indexedAt?: string;
  viewer?: {
    like?: string; // URI of the like record if user has liked this feed
  };
}

// Search for feeds
export async function searchFeeds(query: string, cursor?: string): Promise<{ feeds: FeedGeneratorInfo[]; cursor?: string }> {
  if (!agent) throw new Error('Not logged in');
  const response = await agent.app.bsky.unspecced.getPopularFeedGenerators({
    query,
    limit: 25,
    cursor,
  });
  return {
    feeds: response.data.feeds as FeedGeneratorInfo[],
    cursor: response.data.cursor,
  };
}

// Get popular feeds
export async function getPopularFeeds(cursor?: string): Promise<{ feeds: FeedGeneratorInfo[]; cursor?: string }> {
  if (!agent) throw new Error('Not logged in');
  const response = await agent.app.bsky.unspecced.getPopularFeedGenerators({
    limit: 25,
    cursor,
  });
  return {
    feeds: response.data.feeds as FeedGeneratorInfo[],
    cursor: response.data.cursor,
  };
}

// Get feed generator info by URI
export async function getFeedGenerator(feedUri: string): Promise<FeedGeneratorInfo> {
  if (!agent) throw new Error('Not logged in');
  const response = await agent.app.bsky.feed.getFeedGenerator({ feed: feedUri });
  return response.data.view as FeedGeneratorInfo;
}

// Get multiple feed generators by URI
export async function getFeedGenerators(feedUris: string[]): Promise<FeedGeneratorInfo[]> {
  if (!agent) throw new Error('Not logged in');
  const response = await agent.app.bsky.feed.getFeedGenerators({ feeds: feedUris });
  return response.data.feeds as FeedGeneratorInfo[];
}

// Get user's saved feed URIs (for checking if a feed is saved)
export async function getSavedFeedUris(): Promise<Set<string>> {
  if (!agent) throw new Error('Not logged in');
  
  const prefs = await agent.getPreferences();
  const savedFeeds = prefs.savedFeeds || [];
  
  const feedUris = savedFeeds
    .filter(sf => sf.type === 'feed' && sf.value.startsWith('at://'))
    .map(sf => sf.value);
  
  return new Set(feedUris);
}

// Get user's saved feeds from preferences (feeds they've added to their list)
export async function getSavedFeeds(): Promise<FeedGeneratorInfo[]> {
  if (!agent) throw new Error('Not logged in');
  
  const prefs = await agent.getPreferences();
  const savedFeeds = prefs.savedFeeds || [];
  
  // Get unique feed URIs (type 'feed' means feed generators, filter out lists)
  const feedUris = savedFeeds
    .filter(sf => sf.type === 'feed' && sf.value.startsWith('at://') && sf.value.includes('/app.bsky.feed.generator/'))
    .map(sf => sf.value);
  
  // Deduplicate
  const uniqueUris = [...new Set(feedUris)];
  
  if (uniqueUris.length === 0) {
    return [];
  }
  
  // Fetch full feed info (in batches of 25)
  const allFeeds: FeedGeneratorInfo[] = [];
  for (let i = 0; i < uniqueUris.length; i += 25) {
    const batch = uniqueUris.slice(i, i + 25);
    try {
      const feeds = await getFeedGenerators(batch);
      allFeeds.push(...feeds);
    } catch (err) {
      console.error('Failed to fetch feed batch:', err);
    }
  }
  
  return allFeeds;
}

// Save a feed to user's saved feeds
export async function saveFeed(feedUri: string): Promise<void> {
  if (!agent) throw new Error('Not logged in');
  
  await agent.addSavedFeeds([{
    type: 'feed',
    value: feedUri,
    pinned: false,
  }]);
}

// Remove a feed from user's saved feeds
export async function unsaveFeed(feedUri: string): Promise<void> {
  if (!agent) throw new Error('Not logged in');
  
  // Get current saved feeds to find the ID of the one to remove
  const prefs = await agent.getPreferences();
  const savedFeeds = prefs.savedFeeds || [];
  
  // Find the saved feed entry with this URI
  const feedToRemove = savedFeeds.find(sf => sf.value === feedUri);
  
  if (feedToRemove && feedToRemove.id) {
    await agent.removeSavedFeeds([feedToRemove.id]);
  }
}

// Advanced search filters for posts
export interface SearchPostsFilters {
  author?: string;      // DID or handle - filter to posts by this account
  since?: string;       // ISO date or datetime - posts after this time (inclusive)
  until?: string;       // ISO date or datetime - posts before this time (exclusive)
  mentions?: string;    // DID or handle - posts mentioning this account
  lang?: string;        // ISO language code (e.g., 'en', 'es')
  domain?: string;      // Domain to filter links (e.g., 'arxiv.org')
  url?: string;         // Specific URL to filter
  tag?: string[];       // Hashtags to filter (without #), AND matching
}

// Search posts by keyword with optional advanced filters
export async function searchPosts(
  query: string,
  cursor?: string,
  sort: 'top' | 'latest' = 'latest',
  filters?: SearchPostsFilters
): Promise<{ posts: AppBskyFeedDefs.PostView[]; cursor?: string }> {
  if (!agent) throw new Error('Not logged in');
  const response = await agent.app.bsky.feed.searchPosts({
    q: query,
    limit: 30,
    cursor,
    sort,
    author: filters?.author,
    since: filters?.since,
    until: filters?.until,
    mentions: filters?.mentions,
    lang: filters?.lang,
    domain: filters?.domain,
    url: filters?.url,
    tag: filters?.tag,
  });
  return {
    posts: response.data.posts,
    cursor: response.data.cursor,
  };
}

// Feed definitions
export const FEEDS = {
  skygest: {
    id: 'skygest',
    name: 'Paper Skygest',
    uri: 'at://did:plc:uaadt6f5bbda6cycbmatcm3z/app.bsky.feed.generator/preprintdigest',
    acceptsInteractions: false,
  },
  foryou: {
    id: 'foryou',
    name: 'For You',
    uri: 'at://did:plc:3guzzweuqraryl3rdkimjamk/app.bsky.feed.generator/for-you',
    acceptsInteractions: true,
  },
  verified: {
    id: 'verified',
    name: 'Verified',
    uri: null as string | null,
    acceptsInteractions: false,
  },
  timeline: {
    id: 'timeline',
    name: 'Following',
    uri: null as string | null,
    acceptsInteractions: false,
  },
  papers: {
    id: 'papers',
    name: 'Papers',
    uri: null as string | null,
    acceptsInteractions: false,
  },
} as const;

export type FeedId = keyof typeof FEEDS;

// Send feed interaction (show more/less like this)
export type InteractionEvent = 'requestMore' | 'requestLess';

// Cache for feed generator DIDs
const feedGeneratorDidCache = new Map<string, string>();

export async function sendFeedInteraction(
  postUri: string,
  event: InteractionEvent,
  feedContext?: string,
  reqId?: string,
  feedUri?: string
) {
  if (!agent) throw new Error('Not logged in');

  const eventType = event === 'requestMore'
    ? 'app.bsky.feed.defs#requestMore'
    : 'app.bsky.feed.defs#requestLess';

  // Get the feed generator's service DID (not the repo DID from the URI)
  let proxyDid: string | undefined;
  if (feedUri && feedUri.startsWith('at://')) {
    // Check cache first
    if (feedGeneratorDidCache.has(feedUri)) {
      proxyDid = feedGeneratorDidCache.get(feedUri);
    } else {
      // Fetch feed generator info to get the service DID
      try {
        const feedGenInfo = await agent.api.app.bsky.feed.getFeedGenerator({ feed: feedUri });
        proxyDid = feedGenInfo.data.view.did;
        if (proxyDid) {
          feedGeneratorDidCache.set(feedUri, proxyDid);
        }
      } catch (err) {
        console.error('Failed to get feed generator info:', err);
      }
    }
  }

  // Build request options with proxy header if we have the service DID
  const options: { headers?: Record<string, string> } = {};
  if (proxyDid) {
    options.headers = {
      'atproto-proxy': `${proxyDid}#bsky_fg`
    };
  }

  return agent.api.app.bsky.feed.sendInteractions(
    {
      interactions: [{
        item: postUri,
        event: eventType,
        feedContext,
        reqId,
      }],
    },
    options
  );
}

export async function getThread(uri: string, depth = 10) {
  if (!agent) throw new Error('Not logged in');
  return agent.getPostThread({ uri, depth });
}

// Fetch multiple posts by their URIs (max 25 per request)
export async function getPostsByUris(uris: string[]): Promise<AppBskyFeedDefs.PostView[]> {
  if (!agent) throw new Error('Not logged in');
  if (uris.length === 0) return [];

  // Bluesky API limits to 25 URIs per request
  const chunks: string[][] = [];
  for (let i = 0; i < uris.length; i += 25) {
    chunks.push(uris.slice(i, i + 25));
  }

  const allPosts: AppBskyFeedDefs.PostView[] = [];
  for (const chunk of chunks) {
    const response = await agent.getPosts({ uris: chunk });
    allPosts.push(...response.data.posts);
  }

  return allPosts;
}

// Type guard for ThreadViewPost
function isThreadViewPost(node: unknown): node is AppBskyFeedDefs.ThreadViewPost {
  return (
    typeof node === 'object' &&
    node !== null &&
    '$type' in node &&
    (node as { $type: string }).$type === 'app.bsky.feed.defs#threadViewPost'
  );
}

// Result of fetching a self-thread
export interface SelfThreadResult {
  posts: AppBskyFeedDefs.PostView[];  // Posts from root to the requested post
  rootUri: string;                     // URI of the thread root
}

// Check if a post has replies (potential for self-thread)
export function hasReplies(post: AppBskyFeedDefs.FeedViewPost): boolean {
  return (post.post.replyCount ?? 0) > 0;
}

// Check if a post is itself a reply (for deduplication - skip replies, only expand from root)
export function isReplyPost(post: AppBskyFeedDefs.FeedViewPost): boolean {
  const record = post.post.record as { reply?: unknown };
  return !!record.reply;
}

// Fetch a self-thread: get the post and its self-replies (same author replies)
export async function getSelfThread(uri: string, authorDid: string): Promise<SelfThreadResult | null> {
  if (!agent) throw new Error('Not logged in');
  
  try {
    // Fetch thread with depth to get replies
    const response = await agent.getPostThread({ uri, depth: 10, parentHeight: 0 });
    const thread = response.data.thread;
    
    if (!isThreadViewPost(thread)) {
      return null;
    }
    
    const posts: AppBskyFeedDefs.PostView[] = [thread.post];
    
    // Walk down replies to find self-replies (same author continuing the thread)
    const collectSelfReplies = (replies: typeof thread.replies) => {
      if (!replies) return;
      for (const reply of replies) {
        if (isThreadViewPost(reply) && reply.post.author.did === authorDid) {
          posts.push(reply.post);
          // Recursively check for more self-replies
          collectSelfReplies(reply.replies);
        }
      }
    };
    
    collectSelfReplies(thread.replies);
    
    // Only return if we found self-replies (more than just the root)
    if (posts.length <= 1) {
      return null;
    }
    
    return { posts, rootUri: thread.post.uri };
  } catch (error) {
    console.error('Failed to fetch self-thread:', error);
    return null;
  }
}

// Legacy single-select type (kept for backwards compatibility)
export type ThreadgateType = 'following' | 'verified' | 'researchers' | 'open';

// New multi-select type
export type ReplyRule = 'followers' | 'following' | 'researchers';
export type ReplyRestriction = 'open' | 'nobody' | ReplyRule[];

// Fetch labeler's verified researchers list URI
async function getVerifiedOnlyListUri(): Promise<string | null> {
  if (verifiedOnlyListUri) return verifiedOnlyListUri;

  try {
    // First try the labeler's list (new system)
    const response = await fetch('/api/labeler/init-list');
    if (response.ok) {
      const data = await response.json();
      if (data.listUri) {
        verifiedOnlyListUri = data.listUri;
        return verifiedOnlyListUri;
      }
    }
  } catch (error) {
    console.error('Failed to fetch labeler list URI:', error);
  }

  // Fallback to old system
  try {
    const response = await fetch('/api/list/uri?type=verified');
    if (response.ok) {
      const data = await response.json();
      verifiedOnlyListUri = data.listUri;
      return verifiedOnlyListUri;
    }
  } catch (error) {
    console.error('Failed to fetch verified-only list URI:', error);
  }
  return null;
}

// Fetch personal list URI for the current user
async function getPersonalListUri(): Promise<string | null> {
  if (!agent?.did) return null;
  if (personalListUri) return personalListUri;

  try {
    const response = await fetch(`/api/list/uri?type=personal&did=${agent.assertDid}`);
    if (response.ok) {
      const data = await response.json();
      personalListUri = data.listUri;
      return personalListUri;
    }
  } catch (error) {
    console.error('Failed to fetch personal list URI:', error);
  }
  return null;
}

export interface ReplyRef {
  root: { uri: string; cid: string };
  parent: { uri: string; cid: string };
}

export interface QuoteRef {
  uri: string;
  cid: string;
}

export interface ImageEmbed {
  data: Uint8Array;
  mimeType: string;
  alt: string;
}

// Upload an image to Bluesky and return the blob reference
// Compress image to fit within Bluesky's 1MB limit
async function compressImage(file: File, maxSizeBytes: number = 976000): Promise<{ data: Uint8Array; mimeType: string; width: number; height: number }> {
  // Helper to get image dimensions from a File
  async function getImageDimensions(f: File): Promise<{ width: number; height: number }> {
    const img = new Image();
    const url = URL.createObjectURL(f);
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = url;
    });
    URL.revokeObjectURL(url);
    return { width: img.naturalWidth, height: img.naturalHeight };
  }

  // If file is already small enough and is JPEG/PNG, use it directly
  if (file.size <= maxSizeBytes && (file.type === 'image/jpeg' || file.type === 'image/png')) {
    const arrayBuffer = await file.arrayBuffer();
    const dims = await getImageDimensions(file);
    return { data: new Uint8Array(arrayBuffer), mimeType: file.type, ...dims };
  }

  // Load image into canvas for compression
  const img = new Image();
  const url = URL.createObjectURL(file);

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });

  URL.revokeObjectURL(url);

  // Calculate dimensions - maintain aspect ratio but limit max dimension
  let { width, height } = img;
  const maxDimension = 2048; // Max dimension for any side

  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');

  ctx.drawImage(img, 0, 0, width, height);

  // Try different quality levels to get under the size limit
  let quality = 0.9;
  let blob: Blob | null = null;

  while (quality > 0.1) {
    blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    );

    if (blob && blob.size <= maxSizeBytes) {
      break;
    }
    quality -= 0.1;
  }

  if (!blob || blob.size > maxSizeBytes) {
    // Last resort: reduce dimensions further
    const scale = 0.7;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', 0.8)
    );
  }

  if (!blob) throw new Error('Failed to compress image');

  const arrayBuffer = await blob.arrayBuffer();
  return { data: new Uint8Array(arrayBuffer), mimeType: 'image/jpeg', width: canvas.width, height: canvas.height };
}

export async function uploadImage(file: File): Promise<{ blob: unknown; mimeType: string; width: number; height: number }> {
  if (!agent) throw new Error('Not logged in');

  // Compress image if needed (Bluesky has 1MB limit)
  const { data, mimeType, width, height } = await compressImage(file);

  // Upload to Bluesky
  const response = await agent.uploadBlob(data, {
    encoding: mimeType,
  });

  return {
    blob: response.data.blob,
    mimeType,
    width,
    height,
  };
}

// Fetch metadata for a URL and prepare it for embedding
export async function fetchLinkCard(url: string): Promise<ExternalEmbed | null> {
  if (!agent) return null;

  try {
    // Fetch metadata from our API
    const response = await fetch(`/api/link-meta?url=${encodeURIComponent(url)}`);
    if (!response.ok) return null;

    const meta = await response.json();

    // If there's a thumbnail image, upload it
    let thumb: unknown = undefined;
    if (meta.image) {
      try {
        const imageResponse = await fetch(meta.image);
        if (imageResponse.ok) {
          const imageBlob = await imageResponse.blob();
          // Only upload if it's an image and not too large (1MB limit)
          if (imageBlob.type.startsWith('image/') && imageBlob.size < 1000000) {
            const arrayBuffer = await imageBlob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            const uploadResult = await agent.uploadBlob(uint8Array, {
              encoding: imageBlob.type,
            });
            thumb = uploadResult.data.blob;
          }
        }
      } catch (e) {
        console.warn('Failed to upload thumbnail:', e);
        // Continue without thumbnail
      }
    }

    return {
      uri: meta.url || url,
      title: meta.title || new URL(url).hostname,
      description: meta.description || '',
      thumb,
    };
  } catch (e) {
    console.error('Failed to fetch link card:', e);
    return null;
  }
}

// Extract URL from text
export function extractUrlFromText(text: string): string | null {
  const urlPattern = /https?:\/\/[^\s<>\"\')\]]+/gi;
  const matches = text.match(urlPattern);
  return matches ? matches[0] : null;
}

export interface ExternalEmbed {
  uri: string;
  title: string;
  description: string;
  thumb?: unknown; // Blob reference
}

// Bluesky's character limit
const BLUESKY_CHAR_LIMIT = 300;
const TRUNCATION_SUFFIX = '… [full post on Lea]';

// Count graphemes (what Bluesky uses for character counting)
function countGraphemes(str: string): number {
  // Use Intl.Segmenter for accurate grapheme counting
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
    return [...segmenter.segment(str)].length;
  }
  // Fallback to string length (less accurate for emoji, etc.)
  return str.length;
}

// Truncate string to N graphemes
function truncateToGraphemes(str: string, maxGraphemes: number): string {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
    const segments = [...segmenter.segment(str)];
    if (segments.length <= maxGraphemes) return str;
    return segments.slice(0, maxGraphemes).map(s => s.segment).join('');
  }
  // Fallback
  return str.slice(0, maxGraphemes);
}

export async function createPost(
  text: string,
  replyRestriction: ReplyRestriction = 'open',
  reply?: ReplyRef,
  quote?: QuoteRef,
  disableQuotes: boolean = false,
  images?: { blob: unknown; alt: string; width?: number; height?: number }[],
  external?: ExternalEmbed
) {
  if (!agent) throw new Error('Not logged in');

  // Check if we need to use extended text
  const graphemeCount = countGraphemes(text);
  const needsExtension = graphemeCount > BLUESKY_CHAR_LIMIT;

  let displayText = text;
  let extendedText: string | undefined;

  if (needsExtension) {
    // Store full text in custom field
    extendedText = text;
    // Truncate for standard display, leaving room for suffix
    const truncateLength = BLUESKY_CHAR_LIMIT - countGraphemes(TRUNCATION_SUFFIX);
    displayText = truncateToGraphemes(text, truncateLength) + TRUNCATION_SUFFIX;
  }

  const rt = new RichText({ text: displayText });
  await rt.detectFacets(agent);

  // Also detect facets for the extended text if needed
  let extendedFacets: typeof rt.facets | undefined;
  if (extendedText) {
    const extendedRt = new RichText({ text: extendedText });
    await extendedRt.detectFacets(agent);
    extendedFacets = extendedRt.facets;
  }

  // Build embed based on what we have
  let embed: Record<string, unknown> | undefined;

  const hasImages = images && images.length > 0;
  const hasQuote = !!quote;
  const hasExternal = !!external;

  if (hasImages && hasQuote) {
    // Both images and quote: use recordWithMedia
    embed = {
      $type: 'app.bsky.embed.recordWithMedia',
      record: {
        $type: 'app.bsky.embed.record',
        record: {
          uri: quote.uri,
          cid: quote.cid,
        },
      },
      media: {
        $type: 'app.bsky.embed.images',
        images: images.map(img => ({
          image: img.blob,
          alt: img.alt || '',
          ...(img.width && img.height ? { aspectRatio: { width: img.width, height: img.height } } : {}),
        })),
      },
    };
  } else if (hasExternal && hasQuote) {
    // External link and quote: use recordWithMedia
    const externalData: { uri: string; title: string; description: string; thumb?: unknown } = {
      uri: external.uri,
      title: external.title,
      description: external.description,
    };
    if (external.thumb) {
      externalData.thumb = external.thumb;
    }
    embed = {
      $type: 'app.bsky.embed.recordWithMedia',
      record: {
        $type: 'app.bsky.embed.record',
        record: {
          uri: quote.uri,
          cid: quote.cid,
        },
      },
      media: {
        $type: 'app.bsky.embed.external',
        external: externalData,
      },
    };
  } else if (hasImages) {
    // Images only
    embed = {
      $type: 'app.bsky.embed.images',
      images: images.map(img => ({
        image: img.blob,
        alt: img.alt || '',
        ...(img.width && img.height ? { aspectRatio: { width: img.width, height: img.height } } : {}),
      })),
    };
  } else if (hasExternal) {
    // External link only
    const externalData: { uri: string; title: string; description: string; thumb?: unknown } = {
      uri: external.uri,
      title: external.title,
      description: external.description,
    };
    if (external.thumb) {
      externalData.thumb = external.thumb;
    }
    embed = {
      $type: 'app.bsky.embed.external',
      external: externalData,
    };
  } else if (hasQuote) {
    // Quote only
    embed = {
      $type: 'app.bsky.embed.record',
      record: {
        uri: quote.uri,
        cid: quote.cid,
      },
    };
  }

  // Create the post with optional extended text fields
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const postRecord: any = {
    text: rt.text,
    facets: rt.facets,
    createdAt: new Date().toISOString(),
    ...(reply && { reply }),
    ...(embed && { embed }),
  };

  // Add Lea extended text fields if needed (custom fields ignored by other clients)
  if (extendedText) {
    postRecord.leaExtendedText = extendedText;
    postRecord.leaExtendedFacets = extendedFacets;
  }

  const postResult = await agent.post(postRecord);

  // Apply postgate to disable quotes if requested
  if (disableQuotes && postResult.uri) {
    await agent.api.app.bsky.feed.postgate.create(
      { repo: agent.assertDid, rkey: postResult.uri.split('/').pop()! },
      {
        post: postResult.uri,
        createdAt: new Date().toISOString(),
        detachedEmbeddingUris: [],
        embeddingRules: [{ $type: 'app.bsky.feed.postgate#disableRule' }],
      }
    );
  }

  // Apply threadgate based on restriction
  if (replyRestriction !== 'open' && postResult.uri) {
    const allow: Array<{ $type: string; list?: string }> = [];

    if (replyRestriction === 'nobody') {
      // Empty allow array = nobody can reply
      // We still create the threadgate, just with empty allow
    } else if (Array.isArray(replyRestriction)) {
      // Multi-select rules
      for (const rule of replyRestriction) {
        if (rule === 'followers') {
          allow.push({ $type: 'app.bsky.feed.threadgate#followerRule' });
        } else if (rule === 'following') {
          allow.push({ $type: 'app.bsky.feed.threadgate#followingRule' });
        } else if (rule === 'researchers') {
          // Use the verified-only list (only verified researchers)
          const listUri = await getVerifiedOnlyListUri();
          if (listUri) {
            allow.push({
              $type: 'app.bsky.feed.threadgate#listRule',
              list: listUri,
            });
          } else {
            console.warn('Verified-only list not available, skipping researchers rule');
          }
        }
      }
    }

    // Create threadgate (even with empty allow for 'nobody')
    await agent.api.app.bsky.feed.threadgate.create(
      { repo: agent.assertDid, rkey: postResult.uri.split('/').pop()! },
      {
        post: postResult.uri,
        createdAt: new Date().toISOString(),
        allow,
      }
    );
  }

  return postResult;
}

// Cached handle for the current session (fetched once after login)
// Uses both in-memory cache and sessionStorage for persistence across page navigations
const HANDLE_CACHE_KEY = 'lea-session-handle';
let cachedHandle: string | null = null;

// Initialize in-memory cache from sessionStorage on module load
if (typeof window !== 'undefined') {
  try {
    const stored = sessionStorage.getItem(HANDLE_CACHE_KEY);
    if (stored) {
      const { did: storedDid, handle: storedHandle } = JSON.parse(stored);
      // Verify it's for the current session before using
      const oauthSession = getOAuthSession();
      if (oauthSession && oauthSession.sub === storedDid) {
        cachedHandle = storedHandle;
      }
    }
  } catch {
    // Ignore errors
  }
}

export function getSession(): { did: string; handle: string } | null {
  const oauthSession = getOAuthSession();
  if (!oauthSession) return null;
  
  // If we don't have the handle cached yet, try to load from sessionStorage
  if (!cachedHandle && typeof window !== 'undefined') {
    try {
      const stored = sessionStorage.getItem(HANDLE_CACHE_KEY);
      if (stored) {
        const { did: storedDid, handle: storedHandle } = JSON.parse(stored);
        if (storedDid === oauthSession.sub) {
          cachedHandle = storedHandle;
        }
      }
    } catch {
      // Ignore errors
    }
  }
  
  return {
    did: oauthSession.sub,
    handle: cachedHandle || oauthSession.sub, // Use cached handle or fall back to DID
  };
}

// Set the cached handle after fetching the user's profile
export function setCachedHandle(handle: string): void {
  cachedHandle = handle;
  
  // Also persist to sessionStorage for cross-page persistence
  if (typeof window !== 'undefined') {
    const oauthSession = getOAuthSession();
    if (oauthSession) {
      try {
        sessionStorage.setItem(HANDLE_CACHE_KEY, JSON.stringify({
          did: oauthSession.sub,
          handle,
        }));
      } catch {
        // Ignore storage errors
      }
    }
  }
}

// Clear the cached handle on logout
export function clearCachedHandle(): void {
  cachedHandle = null;
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(HANDLE_CACHE_KEY);
    } catch {
      // Ignore errors
    }
  }
}

const VERIFIED_CACHE_KEY = 'lea-verified-status';

// Check if current user is verified, with session storage caching
export async function checkVerificationStatus(did: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  // Check session storage first
  const cached = sessionStorage.getItem(VERIFIED_CACHE_KEY);
  if (cached !== null) {
    try {
      const { did: cachedDid, isVerified } = JSON.parse(cached);
      // Only use cache if it's for the same user
      if (cachedDid === did) {
        return isVerified;
      }
    } catch {
      // Invalid cache, will refetch
    }
  }

  // Fetch from API
  try {
    const res = await fetch(`/api/researchers/check?did=${did}`);
    const data = await res.json();
    const isVerified = !!data.isVerified;

    // Cache the result
    sessionStorage.setItem(VERIFIED_CACHE_KEY, JSON.stringify({ did, isVerified }));

    return isVerified;
  } catch {
    return false;
  }
}

// Clear verification cache (call on logout)
export function clearVerificationCache() {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(VERIFIED_CACHE_KEY);
  }
}

// Update threadgate for an existing post
export async function updateThreadgate(
  postUri: string,
  threadgateType: ThreadgateType
): Promise<void> {
  if (!agent) throw new Error('Not logged in');
  
  const rkey = postUri.split('/').pop()!;
  
  // First, try to delete existing threadgate (if any)
  try {
    await agent.api.app.bsky.feed.threadgate.delete({
      repo: agent.assertDid,
      rkey,
    });
  } catch {
    // Threadgate may not exist, that's fine
  }
  
  // If setting to 'open', we're done (no threadgate means open)
  if (threadgateType === 'open') {
    return;
  }
  
  // Build the allow rules
  const allow: Array<{ $type: string; list?: string }> = [];
  
  if (threadgateType === 'following') {
    allow.push({ $type: 'app.bsky.feed.threadgate#followingRule' });
  } else if (threadgateType === 'verified') {
    // Use the personal list (your connections + verified researchers)
    const listUri = await getPersonalListUri();
    if (listUri) {
      allow.push({
        $type: 'app.bsky.feed.threadgate#listRule',
        list: listUri,
      });
    } else {
      console.warn('Personal list not available, falling back to following');
      allow.push({ $type: 'app.bsky.feed.threadgate#followingRule' });
    }
  } else if (threadgateType === 'researchers') {
    // Use the verified-only list (only verified researchers)
    const listUri = await getVerifiedOnlyListUri();
    if (listUri) {
      allow.push({
        $type: 'app.bsky.feed.threadgate#listRule',
        list: listUri,
      });
    } else {
      console.warn('Verified-only list not available, falling back to following');
      allow.push({ $type: 'app.bsky.feed.threadgate#followingRule' });
    }
  }
  
  // Create the new threadgate
  if (allow.length > 0) {
    await agent.api.app.bsky.feed.threadgate.create(
      { repo: agent.assertDid, rkey },
      {
        post: postUri,
        createdAt: new Date().toISOString(),
        allow,
      }
    );
  }
}

// Get current threadgate type for a post
export function getThreadgateType(threadgate?: { allow?: Array<{ $type: string; list?: string }> }): ThreadgateType {
  if (!threadgate?.allow || threadgate.allow.length === 0) {
    return 'open';
  }
  
  const rule = threadgate.allow[0];
  if (rule.$type === 'app.bsky.feed.threadgate#followingRule') {
    return 'following';
  }
  if (rule.$type === 'app.bsky.feed.threadgate#listRule') {
    // Check if it's the verified list or personal list
    // For now, we'll just return 'researchers' for any list-based rule
    // since we can't easily distinguish between verified and personal list
    return 'researchers';
  }
  
  return 'open';
}

// Like a post
export async function likePost(uri: string, cid: string): Promise<{ uri: string }> {
  if (!agent) throw new Error('Not logged in');
  const result = await agent.like(uri, cid);
  return result;
}

// Unlike a post
export async function unlikePost(likeUri: string): Promise<void> {
  if (!agent) throw new Error('Not logged in');
  await agent.deleteLike(likeUri);
}

// Like a feed generator
export async function likeFeed(uri: string, cid: string): Promise<{ uri: string }> {
  if (!agent) throw new Error('Not logged in');
  const result = await agent.like(uri, cid);
  return result;
}

// Unlike a feed generator
export async function unlikeFeed(likeUri: string): Promise<void> {
  if (!agent) throw new Error('Not logged in');
  await agent.deleteLike(likeUri);
}

// Repost a post
export async function repost(uri: string, cid: string): Promise<{ uri: string }> {
  if (!agent) throw new Error('Not logged in');
  const result = await agent.repost(uri, cid);
  return result;
}

// Delete a repost
export async function deleteRepost(repostUri: string): Promise<void> {
  if (!agent) throw new Error('Not logged in');
  await agent.deleteRepost(repostUri);
}

// Delete a post
export async function deletePost(postUri: string): Promise<void> {
  if (!agent) throw new Error('Not logged in');
  await agent.deletePost(postUri);
}

// Edit a post by deleting and recreating with the same rkey
// This preserves the URI so likes, reposts, and replies stay attached
export async function editPost(postUri: string, newText: string): Promise<{ uri: string; cid: string }> {
  if (!agent) throw new Error('Not logged in');

  // Parse the URI to get repo and rkey
  // Format: at://did:plc:xxx/app.bsky.feed.post/rkey
  const uriParts = postUri.split('/');
  const rkey = uriParts[uriParts.length - 1];
  const repo = uriParts[2]; // The DID

  // Get the existing post record to preserve metadata
  const existingRecord = await agent.api.app.bsky.feed.post.get({
    repo,
    rkey,
  });

  const oldRecord = existingRecord.value as {
    text: string;
    reply?: ReplyRef;
    embed?: unknown;
    langs?: string[];
    createdAt: string;
  };

  // Create new RichText for the updated text
  const rt = new RichText({ text: newText });
  await rt.detectFacets(agent);

  // Delete the old post
  await agent.api.app.bsky.feed.post.delete({
    repo: agent.assertDid,
    rkey,
  });

  // Build the new post record
  const newRecord: {
    text: string;
    facets?: typeof rt.facets;
    reply?: ReplyRef;
    embed?: unknown;
    langs?: string[];
    createdAt: string;
  } = {
    text: rt.text,
    facets: rt.facets,
    createdAt: oldRecord.createdAt, // Preserve original timestamp
  };

  // Only include optional fields if they exist
  if (oldRecord.reply) newRecord.reply = oldRecord.reply;
  if (oldRecord.embed) newRecord.embed = oldRecord.embed;
  if (oldRecord.langs) newRecord.langs = oldRecord.langs;

  // Create the new post with the same rkey
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await agent.api.app.bsky.feed.post.create(
    { repo: agent.assertDid, rkey },
    newRecord as any
  );

  return result;
}

// Follow a user
export async function followUser(did: string): Promise<{ uri: string }> {
  if (!agent) throw new Error('Not logged in');
  const result = await agent.follow(did);
  return result;
}

// Unfollow a user
export async function unfollowUser(followUri: string): Promise<void> {
  if (!agent) throw new Error('Not logged in');
  await agent.deleteFollow(followUri);
}

// Get user preferences (including labelers)
export interface LabelerPreference {
  did: string;
}

export interface UserPreferences {
  labelers: LabelerPreference[];
}

export async function getPreferences(): Promise<UserPreferences> {
  if (!agent) throw new Error('Not logged in');
  
  const response = await agent.api.app.bsky.actor.getPreferences();
  const prefs = response.data.preferences;
  
  // Extract labeler preferences
  const labelers: LabelerPreference[] = [];
  for (const pref of prefs) {
    if (pref.$type === 'app.bsky.actor.defs#labelersPref' && 'labelers' in pref) {
      const labelerList = pref.labelers as Array<{ did: string }>;
      for (const labeler of labelerList) {
        labelers.push({ did: labeler.did });
      }
    }
  }
  
  return { labelers };
}

// Get labeler info by DID
export interface LabelerInfo {
  did: string;
  handle: string;
  displayName?: string;
  description?: string;
  avatar?: string;
  likeCount?: number;
}

export async function getLabelerInfo(did: string): Promise<LabelerInfo | null> {
  if (!agent) throw new Error('Not logged in');
  
  try {
    const response = await agent.api.app.bsky.labeler.getServices({
      dids: [did],
      detailed: true,
    });
    
    if (response.data.views.length > 0) {
      const view = response.data.views[0] as {
        uri: string;
        cid: string;
        creator: {
          did: string;
          handle: string;
          displayName?: string;
          avatar?: string;
          description?: string;
        };
        likeCount?: number;
      };
      return {
        did: view.creator.did,
        handle: view.creator.handle,
        displayName: view.creator.displayName,
        description: view.creator.description,
        avatar: view.creator.avatar,
        likeCount: view.likeCount,
      };
    }
    return null;
  } catch (error) {
    console.error('Failed to get labeler info:', error);
    return null;
  }
}

// Get user's posts for bulk threadgate updates
// Returns posts that the current user authored (not reposts)
export async function getUserPostsForThreadgate(
  cursor?: string,
  limit: number = 50
): Promise<{ posts: Array<{ uri: string; cid: string }>; cursor?: string }> {
  if (!agent?.did) throw new Error('Not logged in');
  
  const response = await agent.getAuthorFeed({
    actor: agent.assertDid,
    limit,
    cursor,
    filter: 'posts_no_replies', // Get posts only, not replies
  });
  
  // Filter to only posts authored by current user (not reposts)
  const posts = response.data.feed
    .filter(item => {
      // Exclude reposts
      if (item.reason) return false;
      // Only include posts by the current user
      return item.post.author.did === agent!.assertDid;
    })
    .map(item => ({
      uri: item.post.uri,
      cid: item.post.cid,
    }));
  
  return {
    posts,
    cursor: response.data.cursor,
  };
}

// Label utilities
const VERIFIED_RESEARCHER_LABEL = 'verified-researcher';
const LEA_LABELER_DID = 'did:plc:7c7tx56n64jhzezlwox5dja6'; // lea-community.bsky.social

export interface Label {
  src: string;  // DID of the labeler
  uri: string;  // Subject URI
  val: string;  // Label value
  cts: string;  // Creation timestamp
}

export function isVerifiedResearcher(labels?: Label[]): boolean {
  if (!labels || labels.length === 0) return false;

  return labels.some(label =>
    label.val === VERIFIED_RESEARCHER_LABEL &&
    label.src === LEA_LABELER_DID
  );
}

export function getVerifiedLabel(labels?: Label[]): Label | undefined {
  if (!labels) return undefined;

  return labels.find(label =>
    label.val === VERIFIED_RESEARCHER_LABEL &&
    label.src === LEA_LABELER_DID
  );
}

// ============================================
// Direct Messages (DM) API
// ============================================

const CHAT_SERVICE_DID = 'did:web:api.bsky.chat';

// Get headers for chat API proxy
function getChatHeaders() {
  return {
    'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
  };
}

// DM Types
export interface MessageReaction {
  value: string; // The emoji
  sender: {
    did: string;
  };
}

export interface ChatMessage {
  id: string;
  rev: string;
  text: string;
  sender: {
    did: string;
  };
  sentAt: string;
  reactions?: MessageReaction[];
}

export interface ConvoMember {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

export interface Convo {
  id: string;
  rev: string;
  members: ConvoMember[];
  lastMessage?: ChatMessage;
  muted: boolean;
  unreadCount: number;
}

export interface ConvoListResponse {
  convos: Convo[];
  cursor?: string;
}

export interface MessagesResponse {
  messages: ChatMessage[];
  cursor?: string;
}

export interface LogEntry {
  $type: string;
  rev: string;
  convoId: string;
  message?: ChatMessage;
}

export interface LogResponse {
  logs: LogEntry[];
  cursor?: string;
}

// List all conversations
export async function listConvos(cursor?: string): Promise<ConvoListResponse> {
  if (!agent) throw new Error('Not logged in');
  const response = await agent.api.chat.bsky.convo.listConvos(
    { limit: 50, cursor },
    { headers: getChatHeaders() }
  );
  return response.data as ConvoListResponse;
}

// Get a single conversation
export async function getConvo(convoId: string): Promise<{ convo: Convo }> {
  if (!agent) throw new Error('Not logged in');
  const response = await agent.api.chat.bsky.convo.getConvo(
    { convoId },
    { headers: getChatHeaders() }
  );
  return response.data as { convo: Convo };
}

// Get or create a conversation with a user
export async function getConvoForMembers(members: string[]): Promise<{ convo: Convo }> {
  if (!agent) throw new Error('Not logged in');
  const response = await agent.api.chat.bsky.convo.getConvoForMembers(
    { members },
    { headers: getChatHeaders() }
  );
  return response.data as { convo: Convo };
}

// Get messages in a conversation
export async function getMessages(convoId: string, cursor?: string): Promise<MessagesResponse> {
  if (!agent) throw new Error('Not logged in');
  const response = await agent.api.chat.bsky.convo.getMessages(
    { convoId, limit: 50, cursor },
    { headers: getChatHeaders() }
  );
  return response.data as MessagesResponse;
}

// Send a message
export async function sendMessage(convoId: string, text: string): Promise<ChatMessage> {
  if (!agent) throw new Error('Not logged in');
  const response = await agent.api.chat.bsky.convo.sendMessage(
    { convoId, message: { text } },
    { headers: getChatHeaders() }
  );
  return response.data as unknown as ChatMessage;
}

// Get log of updates (for polling)
export async function getChatLog(cursor?: string): Promise<LogResponse> {
  if (!agent) throw new Error('Not logged in');
  const response = await agent.api.chat.bsky.convo.getLog(
    { cursor },
    { headers: getChatHeaders() }
  );
  return response.data as LogResponse;
}

// Mark messages as read
export async function updateRead(convoId: string): Promise<{ convo: Convo }> {
  if (!agent) throw new Error('Not logged in');
  const response = await agent.api.chat.bsky.convo.updateRead(
    { convoId },
    { headers: getChatHeaders() }
  );
  return response.data as { convo: Convo };
}

// Mute a conversation
export async function muteConvo(convoId: string): Promise<{ convo: Convo }> {
  if (!agent) throw new Error('Not logged in');
  const response = await agent.api.chat.bsky.convo.muteConvo(
    { convoId },
    { headers: getChatHeaders() }
  );
  return response.data as { convo: Convo };
}

// Unmute a conversation
export async function unmuteConvo(convoId: string): Promise<{ convo: Convo }> {
  if (!agent) throw new Error('Not logged in');
  const response = await agent.api.chat.bsky.convo.unmuteConvo(
    { convoId },
    { headers: getChatHeaders() }
  );
  return response.data as { convo: Convo };
}

// Leave/delete a conversation
export async function leaveConvo(convoId: string): Promise<void> {
  if (!agent) throw new Error('Not logged in');
  await agent.api.chat.bsky.convo.leaveConvo(
    { convoId },
    { headers: getChatHeaders() }
  );
}

// Add a reaction to a message
export async function addMessageReaction(convoId: string, messageId: string, value: string): Promise<ChatMessage> {
  if (!agent) throw new Error('Not logged in');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (agent.api.chat.bsky.convo as any).addReaction(
    { convoId, messageId, value },
    { headers: getChatHeaders() }
  );
  return response.data.message as ChatMessage;
}

// Remove a reaction from a message
export async function removeMessageReaction(convoId: string, messageId: string, value: string): Promise<ChatMessage> {
  if (!agent) throw new Error('Not logged in');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (agent.api.chat.bsky.convo as any).removeReaction(
    { convoId, messageId, value },
    { headers: getChatHeaders() }
  );
  return response.data.message as ChatMessage;
}

// Block a user - returns the URI of the block record for unblocking later
export async function blockUser(did: string): Promise<{ uri: string }> {
  if (!agent?.did) throw new Error('Not logged in');
  const response = await agent.api.app.bsky.graph.block.create(
    { repo: agent.assertDid },
    {
      subject: did,
      createdAt: new Date().toISOString(),
    }
  );
  return { uri: response.uri };
}

// Unblock a user by deleting the block record
export async function unblockUser(blockUri: string): Promise<void> {
  if (!agent?.did) throw new Error('Not logged in');
  // Parse the rkey from the block URI (at://did:plc:xxx/app.bsky.graph.block/rkey)
  const match = blockUri.match(/\/app\.bsky\.graph\.block\/([^/]+)$/);
  if (!match) throw new Error('Invalid block URI');
  const rkey = match[1];
  await agent.api.app.bsky.graph.block.delete(
    { repo: agent.assertDid, rkey }
  );
}

// Blocked account info
export interface BlockedAccount {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  blockUri: string;
}

// Get list of accounts you have blocked
export async function getBlockedAccounts(cursor?: string): Promise<{ blocks: BlockedAccount[]; cursor?: string }> {
  if (!agent) throw new Error('Not logged in');
  const response = await agent.api.app.bsky.graph.getBlocks({ limit: 50, cursor });
  const blocks = response.data.blocks.map(block => ({
    did: block.did,
    handle: block.handle,
    displayName: block.displayName,
    avatar: block.avatar,
    blockUri: block.viewer?.blocking || '',
  }));
  return {
    blocks,
    cursor: response.data.cursor,
  };
}

// Full Bluesky profile data
export interface BlueskyProfile {
  did: string;
  handle: string;
  displayName?: string;
  description?: string;
  avatar?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
  viewer?: {
    following?: string;
    followedBy?: string;
    blocking?: string;  // URI of the block record if you're blocking this user
    blockedBy?: boolean; // True if this user is blocking you
  };
  labels?: Label[];
}

// Resolve a handle to a DID
export async function resolveHandle(handle: string): Promise<string | null> {
  if (!agent) return null;
  try {
    const response = await agent.resolveHandle({ handle });
    return response.data.did;
  } catch {
    return null;
  }
}

// Get a user's Bluesky profile (avatar, displayName, etc.)
export async function getBlueskyProfile(actor: string): Promise<BlueskyProfile | null> {
  if (!agent) return null;
  try {
    const response = await agent.getProfile({ actor });
    return {
      did: response.data.did,
      handle: response.data.handle,
      displayName: response.data.displayName,
      description: response.data.description,
      avatar: response.data.avatar,
      followersCount: response.data.followersCount,
      followsCount: response.data.followsCount,
      postsCount: response.data.postsCount,
      viewer: response.data.viewer ? {
        following: response.data.viewer.following,
        followedBy: response.data.viewer.followedBy,
        blocking: response.data.viewer.blocking,
        blockedBy: response.data.viewer.blockedBy,
      } : undefined,
      labels: response.data.labels as Label[] | undefined,
    };
  } catch (error) {
    console.error('Failed to fetch Bluesky profile:', error);
    return null;
  }
}

// Known followers result type
export interface KnownFollowersResult {
  followers: { did: string; handle: string; displayName?: string; avatar?: string }[];
  count?: number; // Total count if available from the subject
}

// Get known followers (people you follow who also follow this account)
export async function getKnownFollowers(actor: string, limit: number = 50): Promise<KnownFollowersResult> {
  if (!agent) return { followers: [] };
  try {
    // Use the getKnownFollowers endpoint
    const response = await agent.api.app.bsky.graph.getKnownFollowers({ actor, limit });
    const followers = (response.data.followers || []).map(f => ({
      did: f.did,
      handle: f.handle,
      displayName: f.displayName,
      avatar: f.avatar,
    }));
    
    // The subject might have a knownFollowers count
    const subject = response.data.subject as { knownFollowers?: number } | undefined;
    
    return {
      followers,
      count: subject?.knownFollowers,
    };
  } catch (error) {
    // API might not exist or user has no known followers
    console.error('Failed to fetch known followers:', error);
    return { followers: [] };
  }
}

// Get people this profile follows that the current user doesn't follow
export interface UnknownFollowsResult {
  follows: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  }[];
}

export async function getUnknownFollows(actor: string, myFollowsDids?: Set<string>, limit: number = 50): Promise<UnknownFollowsResult> {
  if (!agent || !agent.did) return { follows: [] };

  try {
    // Get who this profile follows (first page is enough for display)
    const followsResponse = await agent.getFollows({ actor, limit: 100 });
    const profileFollows = followsResponse.data.follows || [];

    // Use provided follows set, or fetch if not provided
    let followsToCheck = myFollowsDids;
    if (!followsToCheck) {
      // Fallback: fetch all follows (slower)
      followsToCheck = new Set<string>();
      let cursor: string | undefined;
      do {
        const response = await agent.getFollows({
          actor: agent.assertDid,
          limit: 100,
          cursor,
        });
        for (const follow of response.data.follows || []) {
          followsToCheck.add(follow.did);
        }
        cursor = response.data.cursor;
      } while (cursor);
    }

    // Also exclude the current user themselves
    const excludeSet = new Set(followsToCheck);
    excludeSet.add(agent.assertDid);

    // Filter to people the current user doesn't follow
    const unknownFollows = profileFollows
      .filter(f => !excludeSet.has(f.did))
      .slice(0, limit)
      .map(f => ({
        did: f.did,
        handle: f.handle,
        displayName: f.displayName,
        avatar: f.avatar,
      }));

    return { follows: unknownFollows };
  } catch (error) {
    console.error('Failed to fetch unknown follows:', error);
    return { follows: [] };
  }
}

// Search for actors (all Bluesky users)
export interface ActorSearchResult {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  description?: string;
  labels?: Label[];
}

export async function searchActors(query: string, limit: number = 10): Promise<ActorSearchResult[]> {
  if (!agent) return [];
  try {
    const response = await agent.searchActorsTypeahead({ q: query, limit });
    return (response.data.actors || []).map(actor => ({
      did: actor.did,
      handle: actor.handle,
      displayName: actor.displayName,
      avatar: actor.avatar,
      description: (actor as { description?: string }).description,
      labels: actor.labels as Label[] | undefined,
    }));
  } catch (error) {
    console.error('Failed to search actors:', error);
    return [];
  }
}

// Get posts by an author
export async function getAuthorFeed(
  actor: string,
  cursor?: string,
  filter: 'posts_and_author_threads' | 'posts_no_replies' | 'posts_with_media' | 'posts_with_replies' = 'posts_no_replies'
): Promise<{ feed: AppBskyFeedDefs.FeedViewPost[]; cursor?: string; pinnedPost?: AppBskyFeedDefs.PostView }> {
  if (!agent) throw new Error('Not logged in');
  
  // First, get the profile to check for pinned post
  let pinnedPost: AppBskyFeedDefs.PostView | undefined;
  try {
    const profileRes = await agent.getProfile({ actor });
    const pinnedUri = profileRes.data.pinnedPost?.uri;
    if (pinnedUri) {
      // Fetch the pinned post
      const postsRes = await agent.getPosts({ uris: [pinnedUri] });
      if (postsRes.data.posts.length > 0) {
        pinnedPost = postsRes.data.posts[0];
      }
    }
  } catch (error) {
    console.error('Failed to fetch pinned post:', error);
  }
  
  // Get the author's feed
  const response = await agent.getAuthorFeed({
    actor,
    limit: 30,
    cursor,
    filter,
  });
  
  return {
    feed: response.data.feed,
    cursor: response.data.cursor,
    pinnedPost,
  };
}

// Starter Pack types and functions
export interface StarterPackView {
  uri: string;
  cid: string;
  record: {
    name: string;
    description?: string;
    list: string;
    createdAt: string;
  };
  creator: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  listItemCount?: number;
  joinedWeekCount?: number;
  joinedAllTimeCount?: number;
  indexedAt: string;
}

// Get starter packs from a specific user
export async function getActorStarterPacks(handle: string): Promise<StarterPackView[]> {
  if (!agent) {
    console.error('Not logged in - cannot get starter packs');
    return [];
  }
  try {
    const response = await agent.api.app.bsky.graph.getActorStarterPacks({ actor: handle, limit: 25 });
    return (response.data.starterPacks || []) as StarterPackView[];
  } catch (error) {
    // Silently fail for users without starter packs
    return [];
  }
}

// Get a specific starter pack by URI
export async function getStarterPack(uri: string): Promise<StarterPackView | null> {
  try {
    const response = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.graph.getStarterPack?` +
      new URLSearchParams({ starterPack: uri })
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.starterPack || null;
  } catch (error) {
    console.error('Failed to get starter pack:', error);
    return null;
  }
}

// Get all members from a starter pack's list
export async function getStarterPackMembers(listUri: string): Promise<{ did: string; handle: string }[]> {
  if (!agent) return [];
  try {
    const members: { did: string; handle: string }[] = [];
    let cursor: string | undefined;

    // Paginate through all members (starter packs can have up to 150)
    do {
      const response = await agent.api.app.bsky.graph.getList({
        list: listUri,
        limit: 100,
        cursor
      });
      for (const item of response.data.items) {
        members.push({
          did: item.subject.did,
          handle: item.subject.handle,
        });
      }
      cursor = response.data.cursor;
    } while (cursor);

    return members;
  } catch (error) {
    console.error('Failed to get starter pack members:', error);
    return [];
  }
}

// Get all accounts the user follows (returns DIDs)
export async function getMyFollows(): Promise<Set<string>> {
  if (!agent?.did) return new Set();
  try {
    const followedDids = new Set<string>();
    let cursor: string | undefined;

    // Paginate through all follows
    do {
      const response = await agent.getFollows({
        actor: agent.assertDid,
        limit: 100,
        cursor,
      });
      for (const follow of response.data.follows) {
        followedDids.add(follow.did);
      }
      cursor = response.data.cursor;
    } while (cursor);

    return followedDids;
  } catch (error) {
    console.error('Failed to fetch follows:', error);
    return new Set();
  }
}

// ============================================
// Safety Alerts
// ============================================

export interface SafetyAlert {
  id: string;
  type: 'high_engagement' | 'big_account_repost' | 'big_account_quote' | 'quote_going_viral';
  postUri: string;
  postText: string;
  message: string;
  timestamp: string;
  relatedAccount?: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
    followersCount: number;
  };
  metrics?: {
    likes?: number;
    reposts?: number;
    replies?: number;
    quotes?: number;
  };
}

// Default thresholds (can be overridden by user settings)
const DEFAULT_HIGH_ENGAGEMENT_THRESHOLD = 50; // likes + reposts + replies
const DEFAULT_BIG_ACCOUNT_FOLLOWER_THRESHOLD = 20000;
const DEFAULT_VIRAL_QUOTE_THRESHOLD = 25; // engagement on a quote of your post

export interface AlertThresholds {
  highEngagement?: number;
  bigAccountFollowers?: number;
  viralQuote?: number;
}

// Get user's recent posts with engagement metrics
export async function getMyRecentPostsWithMetrics(
  limit: number = 20
): Promise<AppBskyFeedDefs.PostView[]> {
  if (!agent?.did) return [];
  
  try {
    const response = await agent.getAuthorFeed({
      actor: agent.assertDid,
      limit,
      filter: 'posts_no_replies',
    });
    
    // Filter to only posts by current user (not reposts) and return PostView
    return response.data.feed
      .filter(item => !item.reason && item.post.author.did === agent!.assertDid)
      .map(item => item.post);
  } catch (error) {
    console.error('Failed to fetch recent posts:', error);
    return [];
  }
}

// Get user's recent posts AND replies (for activity pane)
export async function getMyRecentPostsAndReplies(
  daysBack: number = 7,
  maxPosts: number = 100
): Promise<AppBskyFeedDefs.PostView[]> {
  if (!agent?.did) return [];
  
  const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const posts: AppBskyFeedDefs.PostView[] = [];
  let cursor: string | undefined;
  
  try {
    // Keep fetching until we have enough posts or go past cutoff
    while (posts.length < maxPosts) {
      const response = await agent.getAuthorFeed({
        actor: agent.assertDid,
        limit: 50,
        cursor,
        filter: 'posts_with_replies', // Include replies
      });
      
      for (const item of response.data.feed) {
        // Skip reposts
        if (item.reason) continue;
        // Only include posts by current user
        if (item.post.author.did !== agent.assertDid) continue;
        
        const postDate = new Date(item.post.indexedAt);
        if (postDate < cutoffDate) {
          // Reached posts older than cutoff, stop
          return posts;
        }
        
        posts.push(item.post);
        if (posts.length >= maxPosts) break;
      }
      
      if (!response.data.cursor || response.data.feed.length < 50) {
        break;
      }
      cursor = response.data.cursor;
    }
    
    return posts;
  } catch (error) {
    console.error('Failed to fetch recent posts and replies:', error);
    return posts; // Return what we have so far
  }
}

// Check for safety alerts on user's posts
export async function checkSafetyAlerts(thresholds?: AlertThresholds): Promise<SafetyAlert[]> {
  if (!agent?.did) return [];
  
  // Use provided thresholds or defaults
  const highEngagementThreshold = thresholds?.highEngagement ?? DEFAULT_HIGH_ENGAGEMENT_THRESHOLD;
  const bigAccountFollowerThreshold = thresholds?.bigAccountFollowers ?? DEFAULT_BIG_ACCOUNT_FOLLOWER_THRESHOLD;
  const viralQuoteThreshold = thresholds?.viralQuote ?? DEFAULT_VIRAL_QUOTE_THRESHOLD;
  
  const alerts: SafetyAlert[] = [];
  const seenAlertIds = new Set<string>();
  
  // Load dismissed alerts from localStorage
  let dismissedAlerts: Set<string>;
  try {
    dismissedAlerts = new Set<string>(
      JSON.parse(localStorage.getItem('lea-dismissed-alerts') || '[]')
    );
  } catch {
    dismissedAlerts = new Set<string>();
  }
  
  try {
    // Get recent posts
    const posts = await getMyRecentPostsWithMetrics(15);
    
    // Process posts in batches of 5 to avoid rate limiting
    const BATCH_SIZE = 5;
    for (let b = 0; b < posts.length; b += BATCH_SIZE) {
      const batch = posts.slice(b, b + BATCH_SIZE);
      await Promise.all(batch.map(async (post) => {
        const totalEngagement = (post.likeCount || 0) + (post.repostCount || 0) + (post.replyCount || 0);
        const postText = (post.record as { text?: string })?.text || '';
        const shortText = postText.length > 50 ? postText.substring(0, 50) + '...' : postText;

        // Check for high engagement
        if (totalEngagement >= highEngagementThreshold) {
          const alertId = `high_engagement:${post.uri}`;
          if (!dismissedAlerts.has(alertId) && !seenAlertIds.has(alertId)) {
            seenAlertIds.add(alertId);
            alerts.push({
              id: alertId,
              type: 'high_engagement',
              postUri: post.uri,
              postText: shortText,
              message: `Your post is getting attention (${totalEngagement} interactions)`,
              timestamp: new Date().toISOString(),
              metrics: {
                likes: post.likeCount,
                reposts: post.repostCount,
                replies: post.replyCount,
              },
            });
          }
        }

        // Run repost and quote checks in parallel (they're independent)
        const checkReposts = async () => {
          if ((post.repostCount || 0) < 3) return;
          try {
            const repostedBy = await getRepostedBy(post.uri);
            const reposterProfiles = await Promise.all(
              repostedBy.data.repostedBy.slice(0, 5).map((reposter) => getBlueskyProfile(reposter.did))
            );
            for (const profile of reposterProfiles) {
              if (profile && (profile.followersCount || 0) >= bigAccountFollowerThreshold) {
                const alertId = `big_repost:${post.uri}:${profile.did}`;
                if (!dismissedAlerts.has(alertId) && !seenAlertIds.has(alertId)) {
                  seenAlertIds.add(alertId);
                  alerts.push({
                    id: alertId,
                    type: 'big_account_repost',
                    postUri: post.uri,
                    postText: shortText,
                    message: `@${profile.handle} (${(profile.followersCount || 0).toLocaleString()} followers) reposted your post`,
                    timestamp: new Date().toISOString(),
                    relatedAccount: {
                      did: profile.did,
                      handle: profile.handle,
                      displayName: profile.displayName,
                      avatar: profile.avatar,
                      followersCount: profile.followersCount || 0,
                    },
                  });
                }
              }
            }
          } catch (error) {
            console.error('Failed to check reposters:', error);
          }
        };

        const checkQuotes = async () => {
          if ((post.quoteCount || 0) < 1) return;
          try {
            const quotes = await getQuotes(post.uri);
            const quotePosts = quotes.data.posts.slice(0, 5);
            const quoterProfiles = await Promise.all(
              quotePosts.map((qp) => getBlueskyProfile(qp.author.did))
            );
            for (let i = 0; i < quotePosts.length; i++) {
              const quotePost = quotePosts[i];
              const quoter = quotePost.author;
              const quoterProfile = quoterProfiles[i];

              if (quoterProfile && (quoterProfile.followersCount || 0) >= bigAccountFollowerThreshold) {
                const alertId = `big_quote:${post.uri}:${quoter.did}`;
                if (!dismissedAlerts.has(alertId) && !seenAlertIds.has(alertId)) {
                  seenAlertIds.add(alertId);
                  alerts.push({
                    id: alertId,
                    type: 'big_account_quote',
                    postUri: post.uri,
                    postText: shortText,
                    message: `@${quoterProfile.handle} (${(quoterProfile.followersCount || 0).toLocaleString()} followers) quoted your post`,
                    timestamp: new Date().toISOString(),
                    relatedAccount: {
                      did: quoterProfile.did,
                      handle: quoterProfile.handle,
                      displayName: quoterProfile.displayName,
                      avatar: quoterProfile.avatar,
                      followersCount: quoterProfile.followersCount || 0,
                    },
                  });
                }
              }

              const quoteEngagement = (quotePost.likeCount || 0) + (quotePost.repostCount || 0) + (quotePost.replyCount || 0);
              if (quoteEngagement >= viralQuoteThreshold) {
                const alertId = `viral_quote:${quotePost.uri}`;
                if (!dismissedAlerts.has(alertId) && !seenAlertIds.has(alertId)) {
                  seenAlertIds.add(alertId);
                  const profile = quoterProfile || { did: quoter.did, handle: quoter.handle, displayName: quoter.displayName, avatar: quoter.avatar };
                  alerts.push({
                    id: alertId,
                    type: 'quote_going_viral',
                    postUri: quotePost.uri,
                    postText: shortText,
                    message: `A quote of your post is getting attention (${quoteEngagement} interactions)`,
                    timestamp: new Date().toISOString(),
                    relatedAccount: {
                      did: profile.did,
                      handle: profile.handle,
                      displayName: profile.displayName,
                      avatar: profile.avatar,
                      followersCount: quoterProfile?.followersCount || 0,
                    },
                    metrics: {
                      likes: quotePost.likeCount,
                      reposts: quotePost.repostCount,
                      replies: quotePost.replyCount,
                    },
                  });
                }
              }
            }
          } catch (error) {
            console.error('Failed to check quotes:', error);
          }
        };

        await Promise.all([checkReposts(), checkQuotes()]);
      }));
    }
    
    return alerts;
  } catch (error) {
    console.error('Failed to check safety alerts:', error);
    return [];
  }
}

// Dismiss an alert (won't show again)
export function dismissSafetyAlert(alertId: string): void {
  let dismissed: string[];
  try {
    dismissed = JSON.parse(localStorage.getItem('lea-dismissed-alerts') || '[]');
  } catch {
    dismissed = [];
  }
  if (!dismissed.includes(alertId)) {
    dismissed.push(alertId);
    // Keep only the last 100 dismissed alerts to avoid localStorage bloat
    if (dismissed.length > 100) {
      dismissed.shift();
    }
    localStorage.setItem('lea-dismissed-alerts', JSON.stringify(dismissed));
  }
}

// Clear all dismissed alerts (for testing or reset)
export function clearDismissedAlerts(): void {
  localStorage.removeItem('lea-dismissed-alerts');
}

// ============================================
// Content Moderation API
// ============================================

// Re-export moderation functions for use in components
export { moderatePost, moderateProfile };
export type { ModerationDecision, ModerationOpts, AppBskyActorDefs };

// Moderation preferences interface (subset of what we need)
export interface ModerationPrefs {
  adultContentEnabled: boolean;
  labels: Record<string, 'hide' | 'warn' | 'ignore'>;
  labelers: Array<{
    did: string;
    labels: Record<string, 'hide' | 'warn' | 'ignore'>;
  }>;
  mutedWords: Array<{ value: string; targets: string[] }>;
  hiddenPosts: string[];
}

// Cached moderation options
let cachedModerationOpts: ModerationOpts | null = null;
let moderationOptsLastFetched: number = 0;
const MODERATION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Get full moderation preferences from user's account
export async function getModerationPrefs(): Promise<ModerationPrefs | null> {
  if (!agent) return null;
  
  try {
    const prefs = await agent.getPreferences();
    return prefs.moderationPrefs as ModerationPrefs;
  } catch (error) {
    console.error('Failed to get moderation prefs:', error);
    return null;
  }
}

// Get label definitions from subscribed labelers
export async function getLabelDefinitions(): Promise<Record<string, InterpretedLabelValueDefinition[]>> {
  if (!agent) return {};
  
  try {
    const prefs = await agent.getPreferences();
    const labelDefs = await agent.getLabelDefinitions(prefs);
    return labelDefs as Record<string, InterpretedLabelValueDefinition[]>;
  } catch (error) {
    console.error('Failed to get label definitions:', error);
    return {};
  }
}

// Get complete moderation options (prefs + label definitions)
// This is what you pass to moderatePost()
export async function getModerationOpts(forceRefresh = false): Promise<ModerationOpts | null> {
  if (!agent?.did) return null;
  
  // Return cached if still valid
  const now = Date.now();
  if (!forceRefresh && cachedModerationOpts && (now - moderationOptsLastFetched) < MODERATION_CACHE_TTL) {
    return cachedModerationOpts;
  }
  
  try {
    const prefs = await agent.getPreferences();
    const labelDefs = await agent.getLabelDefinitions(prefs);
    
    cachedModerationOpts = {
      userDid: agent.assertDid,
      prefs: prefs.moderationPrefs,
      labelDefs: labelDefs as Record<string, InterpretedLabelValueDefinition[]>,
    };
    moderationOptsLastFetched = now;
    
    return cachedModerationOpts;
  } catch (error) {
    console.error('Failed to get moderation opts:', error);
    return null;
  }
}

// Configure the agent to request labels from all subscribed labelers
// This should be called after login/session restore
export async function configureSubscribedLabelers(): Promise<void> {
  if (!agent) return;
  
  try {
    // Use raw API to get all preferences and extract labelers
    const response = await agent.api.app.bsky.actor.getPreferences();
    const rawPrefs = response.data.preferences;
    
    console.log('[Moderation] Raw preferences:', rawPrefs);
    
    // Extract labeler DIDs from the raw preferences
    const labelerDids: string[] = [];
    for (const pref of rawPrefs) {
      if (pref.$type === 'app.bsky.actor.defs#labelersPref' && 'labelers' in pref) {
        const labelerList = (pref as { $type: string; labelers: Array<{ did: string }> }).labelers;
        console.log('[Moderation] Found labelersPref:', labelerList);
        for (const labeler of labelerList) {
          if (!labelerDids.includes(labeler.did)) {
            labelerDids.push(labeler.did);
          }
        }
      }
    }
    
    console.log('[Moderation] User subscribed labelers:', labelerDids);
    
    // Always include LEA labeler for verified researcher badges
    if (!labelerDids.includes(LEA_LABELER_DID_CONFIG)) {
      labelerDids.push(LEA_LABELER_DID_CONFIG);
    }
    
    // Also always include Bluesky's moderation labeler for standard labels
    const BLUESKY_MODERATION_DID = 'did:plc:ar7c4by46qjdydhdevvrndac';
    if (!labelerDids.includes(BLUESKY_MODERATION_DID)) {
      labelerDids.push(BLUESKY_MODERATION_DID);
    }
    
    // Configure the agent to request labels from these labelers
    agent.configureLabelersHeader(labelerDids);
    console.log('[Moderation] Configured labelers header with:', labelerDids);
  } catch (error) {
    console.error('[Moderation] Failed to configure subscribed labelers:', error);
    // Fall back to just LEA labeler + Bluesky moderation
    agent.configureLabelersHeader([LEA_LABELER_DID_CONFIG, 'did:plc:ar7c4by46qjdydhdevvrndac']);
  }
}

// Clear cached moderation opts (call on logout)
export function clearModerationCache(): void {
  cachedModerationOpts = null;
  moderationOptsLastFetched = 0;
}

// Detach a quote from your post
// This adds the quoting post's URI to your post's postgate detachedEmbeddingUris
// quotingPostUri: The URI of the post that quotes your post (the one you want to detach from)
// quotedPostUri: Your post's URI (the one being quoted)
export async function detachQuote(
  quotingPostUri: string,
  quotedPostUri: string
): Promise<void> {
  if (!agent) throw new Error('Not logged in');
  
  // Extract rkey from your post's URI
  const rkey = quotedPostUri.split('/').pop()!;
  
  // Track existing postgate data
  let existingDetached: string[] = [];
  let existingRules: Array<{ $type: string }> = [];
  let hasExistingPostgate = false;
  
  // Try to get existing postgate for your post
  try {
    const response = await agent.api.app.bsky.feed.postgate.get({
      repo: agent.assertDid,
      rkey,
    });
    // Extract values from the response
    const record = response.value as { 
      detachedEmbeddingUris?: string[]; 
      embeddingRules?: Array<{ $type: string }>;
    };
    existingDetached = record.detachedEmbeddingUris || [];
    existingRules = record.embeddingRules || [];
    hasExistingPostgate = true;
  } catch {
    // No existing postgate, we'll create a new one
  }
  
  // Add the quoting post URI to detached list if not already there
  if (!existingDetached.includes(quotingPostUri)) {
    existingDetached.push(quotingPostUri);
  }
  
  // If there's an existing postgate, we need to delete and recreate it
  // (ATProto doesn't have a direct update method for records)
  if (hasExistingPostgate) {
    try {
      await agent.api.app.bsky.feed.postgate.delete({
        repo: agent.assertDid,
        rkey,
      });
    } catch {
      // Ignore delete errors
    }
  }
  
  // Create the postgate with updated detachedEmbeddingUris
  await agent.api.app.bsky.feed.postgate.create(
    { repo: agent.assertDid, rkey },
    {
      post: quotedPostUri,
      createdAt: new Date().toISOString(),
      detachedEmbeddingUris: existingDetached,
      ...(existingRules.length > 0 && { embeddingRules: existingRules }),
    }
  );
}

// ============================================
// List Management
// ============================================

export interface ListView {
  uri: string;
  cid: string;
  name: string;
  description?: string;
  avatar?: string;
  purpose: 'app.bsky.graph.defs#curatelist' | 'app.bsky.graph.defs#modlist' | 'app.bsky.graph.defs#referencelist';
  listItemCount?: number;
  indexedAt: string;
  creator: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
}

export interface ListItemView {
  uri: string; // The listitem record URI (needed for removal)
  subject: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
    description?: string;
  };
}

// Get all lists owned by the current user
export async function getMyLists(): Promise<ListView[]> {
  if (!agent?.did) return [];
  
  try {
    const lists: ListView[] = [];
    let cursor: string | undefined;
    
    do {
      const response = await agent.api.app.bsky.graph.getLists({
        actor: agent.assertDid,
        limit: 100,
        cursor,
      });
      
      for (const list of response.data.lists) {
        // Only include curated lists (not moderation lists)
        if (list.purpose === 'app.bsky.graph.defs#curatelist') {
          lists.push(list as ListView);
        }
      }
      
      cursor = response.data.cursor;
    } while (cursor);
    
    return lists;
  } catch (error) {
    console.error('Failed to get lists:', error);
    return [];
  }
}

// Create a new curated list
export async function createList(
  name: string,
  description?: string
): Promise<{ uri: string; cid: string }> {
  if (!agent) throw new Error('Not logged in');
  
  const result = await agent.api.com.atproto.repo.createRecord({
    repo: agent.assertDid,
    collection: 'app.bsky.graph.list',
    record: {
      $type: 'app.bsky.graph.list',
      purpose: 'app.bsky.graph.defs#curatelist',
      name,
      description: description || undefined,
      createdAt: new Date().toISOString(),
    },
  });
  
  return { uri: result.data.uri, cid: result.data.cid };
}

// Update list metadata (name/description)
export async function updateList(
  listUri: string,
  name: string,
  description?: string
): Promise<void> {
  if (!agent) throw new Error('Not logged in');
  
  // Extract rkey from URI: at://did/app.bsky.graph.list/rkey
  const parts = listUri.split('/');
  const rkey = parts[parts.length - 1];
  
  // Get existing record to preserve other fields
  const existing = await agent.api.com.atproto.repo.getRecord({
    repo: agent.assertDid,
    collection: 'app.bsky.graph.list',
    rkey,
  });
  
  // Update with new values
  await agent.api.com.atproto.repo.putRecord({
    repo: agent.assertDid,
    collection: 'app.bsky.graph.list',
    rkey,
    record: {
      ...existing.data.value as object,
      name,
      description: description || undefined,
    },
  });
}

// Delete a list
export async function deleteList(listUri: string): Promise<void> {
  if (!agent) throw new Error('Not logged in');
  
  // Extract rkey from URI
  const parts = listUri.split('/');
  const rkey = parts[parts.length - 1];
  
  await agent.api.com.atproto.repo.deleteRecord({
    repo: agent.assertDid,
    collection: 'app.bsky.graph.list',
    rkey,
  });
}

// Get all members of a list
export async function getListMembers(listUri: string): Promise<ListItemView[]> {
  if (!agent) return [];
  
  try {
    const members: ListItemView[] = [];
    let cursor: string | undefined;
    
    do {
      const response = await agent.api.app.bsky.graph.getList({
        list: listUri,
        limit: 100,
        cursor,
      });
      
      for (const item of response.data.items) {
        members.push({
          uri: item.uri,
          subject: {
            did: item.subject.did,
            handle: item.subject.handle,
            displayName: item.subject.displayName,
            avatar: item.subject.avatar,
            description: item.subject.description,
          },
        });
      }
      
      cursor = response.data.cursor;
    } while (cursor);
    
    return members;
  } catch (error) {
    console.error('Failed to get list members:', error);
    return [];
  }
}

// Add a user to a list
export async function addToList(
  listUri: string,
  subjectDid: string
): Promise<{ uri: string; cid: string }> {
  if (!agent) throw new Error('Not logged in');
  
  const result = await agent.api.com.atproto.repo.createRecord({
    repo: agent.assertDid,
    collection: 'app.bsky.graph.listitem',
    record: {
      $type: 'app.bsky.graph.listitem',
      subject: subjectDid,
      list: listUri,
      createdAt: new Date().toISOString(),
    },
  });
  
  return { uri: result.data.uri, cid: result.data.cid };
}

// Remove a user from a list (requires the listitem URI)
export async function removeFromList(listItemUri: string): Promise<void> {
  if (!agent) throw new Error('Not logged in');
  
  // Extract rkey from URI: at://did/app.bsky.graph.listitem/rkey
  const parts = listItemUri.split('/');
  const rkey = parts[parts.length - 1];
  
  await agent.api.com.atproto.repo.deleteRecord({
    repo: agent.assertDid,
    collection: 'app.bsky.graph.listitem',
    rkey,
  });
}

// Check which of user's lists contain a specific DID
// Returns a map of listUri -> listItemUri (or undefined if not in list)
export async function getListMembershipsForUser(
  targetDid: string
): Promise<Map<string, string | undefined>> {
  if (!agent?.did) return new Map();
  
  const lists = await getMyLists();
  const memberships = new Map<string, string | undefined>();
  
  for (const list of lists) {
    memberships.set(list.uri, undefined);
    
    // Check if target is in this list
    try {
      const members = await getListMembers(list.uri);
      const membership = members.find(m => m.subject.did === targetDid);
      if (membership) {
        memberships.set(list.uri, membership.uri);
      }
    } catch {
      // Ignore errors for individual lists
    }
  }
  
  return memberships;
}
