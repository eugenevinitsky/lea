import { BskyAgent, RichText, AppBskyFeedDefs } from '@atproto/api';

let agent: BskyAgent | null = null;

// Cache for list URIs
let verifiedOnlyListUri: string | null = null;
let personalListUri: string | null = null;

const SESSION_KEY = 'lea-bsky-session';

// LEA Labeler DID - needed for receiving verified researcher labels
const LEA_LABELER_DID_CONFIG = 'did:plc:7c7tx56n64jhzezlwox5dja6';

// Configure agent to receive labels from LEA labeler
function configureLabeler() {
  if (agent) {
    agent.configureLabelersHeader([LEA_LABELER_DID_CONFIG]);
  }
}

export function getAgent(): BskyAgent | null {
  return agent;
}

// Save session to localStorage (called on login and token refresh)
function persistSession(evt: string, session?: { did: string; handle: string; accessJwt: string; refreshJwt: string }) {
  if (typeof window === 'undefined') return;

  if (evt === 'create' || evt === 'update') {
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }
  } else if (evt === 'expired') {
    localStorage.removeItem(SESSION_KEY);
  }
}

// Restore session from localStorage if available
export async function restoreSession(): Promise<boolean> {
  if (agent?.session) return true; // Already have a session

  if (typeof window === 'undefined') return false; // SSR

  const stored = localStorage.getItem(SESSION_KEY);
  if (!stored) return false;

  try {
    const sessionData = JSON.parse(stored);
    agent = new BskyAgent({
      service: 'https://bsky.social',
      persistSession: persistSession,
    });
    await agent.resumeSession(sessionData);
    configureLabeler(); // Enable LEA labeler to show verified badges
    return true;
  } catch (error) {
    console.error('Failed to restore session:', error);
    localStorage.removeItem(SESSION_KEY);
    return false;
  }
}

export async function login(identifier: string, password: string): Promise<BskyAgent> {
  agent = new BskyAgent({
    service: 'https://bsky.social',
    persistSession: persistSession,
  });
  await agent.login({ identifier, password });
  configureLabeler(); // Enable LEA labeler to show verified badges

  return agent;
}

export function logout() {
  agent = null;
  personalListUri = null; // Clear personal list cache on logout
  if (typeof window !== 'undefined') {
    localStorage.removeItem(SESSION_KEY);
  }
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

export type ThreadgateType = 'following' | 'verified' | 'researchers' | 'open';

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
  if (!agent?.session?.did) return null;
  if (personalListUri) return personalListUri;

  try {
    const response = await fetch(`/api/list/uri?type=personal&did=${agent.session.did}`);
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

export async function createPost(
  text: string,
  threadgateType: ThreadgateType = 'following',
  reply?: ReplyRef,
  quote?: QuoteRef,
  disableQuotes: boolean = false
) {
  if (!agent) throw new Error('Not logged in');

  const rt = new RichText({ text });
  await rt.detectFacets(agent);

  // Build embed for quote post
  const embed = quote
    ? {
        $type: 'app.bsky.embed.record',
        record: {
          uri: quote.uri,
          cid: quote.cid,
        },
      }
    : undefined;

  // Create the post
  const postResult = await agent.post({
    text: rt.text,
    facets: rt.facets,
    createdAt: new Date().toISOString(),
    ...(reply && { reply }),
    ...(embed && { embed }),
  });

  // Apply postgate to disable quotes if requested
  if (disableQuotes && postResult.uri) {
    await agent.api.app.bsky.feed.postgate.create(
      { repo: agent.session!.did, rkey: postResult.uri.split('/').pop()! },
      {
        post: postResult.uri,
        createdAt: new Date().toISOString(),
        detachedEmbeddingUris: [],
        embeddingRules: [{ $type: 'app.bsky.feed.postgate#disableRule' }],
      }
    );
  }

  // Apply threadgate based on type
  if (threadgateType !== 'open' && postResult.uri) {
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
        // Fallback to following if personal list not available
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
        // Fallback to following if list not available
        console.warn('Verified-only list not available, falling back to following');
        allow.push({ $type: 'app.bsky.feed.threadgate#followingRule' });
      }
    }

    if (allow.length > 0) {
      await agent.api.app.bsky.feed.threadgate.create(
        { repo: agent.session!.did, rkey: postResult.uri.split('/').pop()! },
        {
          post: postResult.uri,
          createdAt: new Date().toISOString(),
          allow,
        }
      );
    }
  }

  return postResult;
}

export function getSession() {
  return agent?.session;
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
      repo: agent.session!.did,
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
      { repo: agent.session!.did, rkey },
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
  if (!agent?.session?.did) throw new Error('Not logged in');
  
  const response = await agent.getAuthorFeed({
    actor: agent.session.did,
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
      return item.post.author.did === agent!.session!.did;
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
export interface ChatMessage {
  id: string;
  rev: string;
  text: string;
  sender: {
    did: string;
  };
  sentAt: string;
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

// Block a user
export async function blockUser(did: string): Promise<void> {
  if (!agent?.session?.did) throw new Error('Not logged in');
  await agent.api.app.bsky.graph.block.create(
    { repo: agent.session.did },
    {
      subject: did,
      createdAt: new Date().toISOString(),
    }
  );
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
  };
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
      } : undefined,
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
  filter: 'posts_and_author_threads' | 'posts_no_replies' | 'posts_with_media' = 'posts_no_replies'
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
  if (!agent?.session?.did) return new Set();
  try {
    const followedDids = new Set<string>();
    let cursor: string | undefined;

    // Paginate through all follows
    do {
      const response = await agent.getFollows({
        actor: agent.session.did,
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

const HIGH_ENGAGEMENT_THRESHOLD = 50; // likes + reposts + replies
const BIG_ACCOUNT_FOLLOWER_THRESHOLD = 20000;
const VIRAL_QUOTE_THRESHOLD = 25; // engagement on a quote of your post

// Get user's recent posts with engagement metrics
export async function getMyRecentPostsWithMetrics(
  limit: number = 20
): Promise<AppBskyFeedDefs.PostView[]> {
  if (!agent?.session?.did) return [];
  
  try {
    const response = await agent.getAuthorFeed({
      actor: agent.session.did,
      limit,
      filter: 'posts_no_replies',
    });
    
    // Filter to only posts by current user (not reposts) and return PostView
    return response.data.feed
      .filter(item => !item.reason && item.post.author.did === agent!.session!.did)
      .map(item => item.post);
  } catch (error) {
    console.error('Failed to fetch recent posts:', error);
    return [];
  }
}

// Check for safety alerts on user's posts
export async function checkSafetyAlerts(): Promise<SafetyAlert[]> {
  if (!agent?.session?.did) return [];
  
  const alerts: SafetyAlert[] = [];
  const seenAlertIds = new Set<string>();
  
  // Load dismissed alerts from localStorage
  const dismissedAlerts = new Set<string>(
    JSON.parse(localStorage.getItem('lea-dismissed-alerts') || '[]')
  );
  
  try {
    // Get recent posts
    const posts = await getMyRecentPostsWithMetrics(15);
    
    for (const post of posts) {
      const totalEngagement = (post.likeCount || 0) + (post.repostCount || 0) + (post.replyCount || 0);
      const postText = (post.record as { text?: string })?.text || '';
      const shortText = postText.length > 50 ? postText.substring(0, 50) + '...' : postText;
      
      // Check for high engagement
      if (totalEngagement >= HIGH_ENGAGEMENT_THRESHOLD) {
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
      
      // Check reposts for big accounts (only if post has significant reposts)
      if ((post.repostCount || 0) >= 3) {
        try {
          const repostedBy = await getRepostedBy(post.uri);
          // Need to fetch full profiles to get follower counts
          for (const reposter of repostedBy.data.repostedBy.slice(0, 5)) {
            const profile = await getBlueskyProfile(reposter.did);
            if (profile && (profile.followersCount || 0) >= BIG_ACCOUNT_FOLLOWER_THRESHOLD) {
              const alertId = `big_repost:${post.uri}:${reposter.did}`;
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
      }
      
      // Check quotes for big accounts and viral quotes
      if ((post.quoteCount || 0) >= 1) {
        try {
          const quotes = await getQuotes(post.uri);
          for (const quotePost of quotes.data.posts.slice(0, 5)) {
            const quoter = quotePost.author;
            // Fetch full profile to get follower count
            const quoterProfile = await getBlueskyProfile(quoter.did);
            
            // Big account quoted
            if (quoterProfile && (quoterProfile.followersCount || 0) >= BIG_ACCOUNT_FOLLOWER_THRESHOLD) {
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
            
            // Quote going viral
            const quoteEngagement = (quotePost.likeCount || 0) + (quotePost.repostCount || 0) + (quotePost.replyCount || 0);
            if (quoteEngagement >= VIRAL_QUOTE_THRESHOLD) {
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
      }
    }
    
    return alerts;
  } catch (error) {
    console.error('Failed to check safety alerts:', error);
    return [];
  }
}

// Dismiss an alert (won't show again)
export function dismissSafetyAlert(alertId: string): void {
  const dismissed = JSON.parse(localStorage.getItem('lea-dismissed-alerts') || '[]');
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
