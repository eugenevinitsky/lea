import { BskyAgent, RichText } from '@atproto/api';

let agent: BskyAgent | null = null;

export function getAgent(): BskyAgent | null {
  return agent;
}

export async function login(identifier: string, password: string): Promise<BskyAgent> {
  agent = new BskyAgent({ service: 'https://bsky.social' });
  await agent.login({ identifier, password });
  return agent;
}

export function logout() {
  agent = null;
}

export async function getTimeline(cursor?: string) {
  if (!agent) throw new Error('Not logged in');
  return agent.getTimeline({ limit: 30, cursor });
}

export async function createPost(text: string, applyThreadgate: boolean = true) {
  if (!agent) throw new Error('Not logged in');

  const rt = new RichText({ text });
  await rt.detectFacets(agent);

  // Create the post
  const postResult = await agent.post({
    text: rt.text,
    facets: rt.facets,
    createdAt: new Date().toISOString(),
  });

  // Auto-apply threadgate if enabled (verified researchers only)
  if (applyThreadgate && postResult.uri) {
    // For now, restrict to followers only (simplest threadgate)
    // In full version, this would use the Lea verified-researcher list
    await agent.api.app.bsky.feed.threadgate.create(
      { repo: agent.session!.did, rkey: postResult.uri.split('/').pop()! },
      {
        post: postResult.uri,
        createdAt: new Date().toISOString(),
        allow: [
          { $type: 'app.bsky.feed.threadgate#followingRule' }, // People you follow
          // { $type: 'app.bsky.feed.threadgate#listRule', list: LEA_VERIFIED_LIST_URI }
        ],
      }
    );
  }

  return postResult;
}

export function getSession() {
  return agent?.session;
}
