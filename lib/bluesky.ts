import { BskyAgent, RichText, AppBskyFeedDefs } from '@atproto/api';

let agent: BskyAgent | null = null;

// Cache for list URIs
let verifiedOnlyListUri: string | null = null;
let personalListUri: string | null = null;

const SESSION_KEY = 'lea-bsky-session';

export function getAgent(): BskyAgent | null {
  return agent;
}

// Restore session from localStorage if available
export async function restoreSession(): Promise<boolean> {
  if (agent?.session) return true; // Already have a session

  if (typeof window === 'undefined') return false; // SSR

  const stored = localStorage.getItem(SESSION_KEY);
  if (!stored) return false;

  try {
    const sessionData = JSON.parse(stored);
    agent = new BskyAgent({ service: 'https://bsky.social' });
    await agent.resumeSession(sessionData);
    return true;
  } catch (error) {
    console.error('Failed to restore session:', error);
    localStorage.removeItem(SESSION_KEY);
    return false;
  }
}

export async function login(identifier: string, password: string): Promise<BskyAgent> {
  agent = new BskyAgent({ service: 'https://bsky.social' });
  await agent.login({ identifier, password });

  // Persist session to localStorage
  if (typeof window !== 'undefined' && agent.session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(agent.session));
  }

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

// Search posts by keyword
export async function searchPosts(
  query: string,
  cursor?: string,
  sort: 'top' | 'latest' = 'latest'
): Promise<{ posts: AppBskyFeedDefs.PostView[]; cursor?: string }> {
  if (!agent) throw new Error('Not logged in');
  const response = await agent.app.bsky.feed.searchPosts({
    q: query,
    limit: 30,
    cursor,
    sort,
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
    name: 'Timeline',
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

export async function sendFeedInteraction(
  postUri: string,
  event: InteractionEvent,
  feedContext?: string,
  reqId?: string
) {
  if (!agent) throw new Error('Not logged in');

  const eventType = event === 'requestMore'
    ? 'app.bsky.feed.defs#requestMore'
    : 'app.bsky.feed.defs#requestLess';

  return agent.api.app.bsky.feed.sendInteractions({
    interactions: [{
      item: postUri,
      event: eventType,
      feedContext,
      reqId,
    }],
  });
}

export async function getThread(uri: string, depth = 10) {
  if (!agent) throw new Error('Not logged in');
  return agent.getPostThread({ uri, depth });
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
  quote?: QuoteRef
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
