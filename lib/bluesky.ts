import { BskyAgent, RichText } from '@atproto/api';

let agent: BskyAgent | null = null;

// Cache for list URIs
let communityListUri: string | null = null;
let verifiedOnlyListUri: string | null = null;

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
  if (typeof window !== 'undefined') {
    localStorage.removeItem(SESSION_KEY);
  }
}

export async function getTimeline(cursor?: string) {
  if (!agent) throw new Error('Not logged in');
  return agent.getTimeline({ limit: 30, cursor });
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

// Fetch verified-only list URI from API
async function getVerifiedOnlyListUri(): Promise<string | null> {
  if (verifiedOnlyListUri) return verifiedOnlyListUri;

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
      // Use the community list for verified community restriction (1-hop)
      const listUri = await getCommunityListUri();
      if (listUri) {
        allow.push({
          $type: 'app.bsky.feed.threadgate#listRule',
          list: listUri,
        });
      } else {
        // Fallback to following if list not available
        console.warn('Community list not available, falling back to following');
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

// Label utilities
const VERIFIED_RESEARCHER_LABEL = 'verified-researcher';
// TODO: Replace with actual Lea labeler DID once deployed
// const LEA_LABELER_DID = 'did:plc:lea-labeler';

export interface Label {
  src: string;  // DID of the labeler
  uri: string;  // Subject URI
  val: string;  // Label value
  cts: string;  // Creation timestamp
}

export function isVerifiedResearcher(labels?: Label[]): boolean {
  if (!labels || labels.length === 0) return false;

  return labels.some(label =>
    label.val === VERIFIED_RESEARCHER_LABEL
    // Once Lea labeler is deployed, also check:
    // && label.src === LEA_LABELER_DID
  );
}

export function getVerifiedLabel(labels?: Label[]): Label | undefined {
  if (!labels) return undefined;

  return labels.find(label =>
    label.val === VERIFIED_RESEARCHER_LABEL
  );
}
