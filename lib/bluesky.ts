import { BskyAgent, RichText } from '@atproto/api';

let agent: BskyAgent | null = null;

// Cache for list URIs
let communityListUri: string | null = null;
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

// Feed definitions
export const FEEDS = {
  skygest: {
    id: 'skygest',
    name: 'Paper Skygest',
    uri: 'at://did:plc:uaadt6f5bbda6cycbmatcm3z/app.bsky.feed.generator/preprintdigest',
  },
  verified: {
    id: 'verified',
    name: 'Verified',
    uri: null as string | null, // Filtered from timeline
  },
  timeline: {
    id: 'timeline',
    name: 'Timeline',
    uri: null as string | null,
  },
  papers: {
    id: 'papers',
    name: 'Papers',
    uri: null as string | null,
  },
} as const;

export type FeedId = keyof typeof FEEDS;

export async function getThread(uri: string, depth = 10) {
  if (!agent) throw new Error('Not logged in');
  return agent.getPostThread({ uri, depth });
}

export type ThreadgateType = 'following' | 'verified' | 'researchers' | 'open';

// Fetch community list URI from API
async function getCommunityListUri(): Promise<string | null> {
  if (communityListUri) return communityListUri;

  try {
    const response = await fetch('/api/list/uri?type=community');
    if (response.ok) {
      const data = await response.json();
      communityListUri = data.listUri;
      return communityListUri;
    }
  } catch (error) {
    console.error('Failed to fetch community list URI:', error);
  }
  return null;
}

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
      // Use the personal list for 1-hop from YOU (not all verified researchers)
      const listUri = await getPersonalListUri();
      if (listUri) {
        allow.push({
          $type: 'app.bsky.feed.threadgate#listRule',
          list: listUri,
        });
      } else {
        // Fallback to global community list if personal not available
        const fallbackUri = await getCommunityListUri();
        if (fallbackUri) {
          console.warn('Personal list not available, using global community list');
          allow.push({
            $type: 'app.bsky.feed.threadgate#listRule',
            list: fallbackUri,
          });
        } else {
          // Fallback to following if no list available
          console.warn('No community list available, falling back to following');
          allow.push({ $type: 'app.bsky.feed.threadgate#followingRule' });
        }
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
