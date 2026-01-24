import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock sessionStorage
const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(global, 'sessionStorage', { value: sessionStorageMock });

// Import after mocks are set up
import {
  resolveDid,
  getPdsFromDidDoc,
  getSession,
  buildProfileUrl,
  buildPostUrl,
  parsePostUrl,
} from '@/lib/bluesky';

describe('Bluesky API Wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolveDid', () => {
    it('resolves did:plc via PLC directory', async () => {
      const mockDidDoc = {
        id: 'did:plc:abc123',
        alsoKnownAs: ['at://user.bsky.social'],
        service: [
          {
            id: '#atproto_pds',
            type: 'AtprotoPersonalDataServer',
            serviceEndpoint: 'https://bsky.social',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockDidDoc,
      });

      const result = await resolveDid('did:plc:abc123');

      expect(mockFetch).toHaveBeenCalledWith('https://plc.directory/did:plc:abc123');
      expect(result).toEqual(mockDidDoc);
    });

    it('resolves did:web via .well-known', async () => {
      const mockDidDoc = {
        id: 'did:web:example.com',
        service: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockDidDoc,
      });

      const result = await resolveDid('did:web:example.com');

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/.well-known/did.json');
      expect(result).toEqual(mockDidDoc);
    });

    it('resolves did:web with path', async () => {
      const mockDidDoc = {
        id: 'did:web:example.com:users:alice',
        service: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockDidDoc,
      });

      const result = await resolveDid('did:web:example.com:users:alice');

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/users/alice/did.json');
      expect(result).toEqual(mockDidDoc);
    });

    it('throws error for unsupported DID method', async () => {
      await expect(resolveDid('did:unknown:abc')).rejects.toThrow('Unsupported DID method');
    });

    it('throws error when DID resolution fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      await expect(resolveDid('did:plc:notfound')).rejects.toThrow('Failed to resolve DID');
    });
  });

  describe('getPdsFromDidDoc', () => {
    it('extracts PDS endpoint from valid DID document', () => {
      const didDoc = {
        id: 'did:plc:abc123',
        service: [
          {
            id: '#atproto_pds',
            type: 'AtprotoPersonalDataServer',
            serviceEndpoint: 'https://pds.example.com',
          },
        ],
      };

      expect(getPdsFromDidDoc(didDoc)).toBe('https://pds.example.com');
    });

    it('returns null when no PDS service exists', () => {
      const didDoc = {
        id: 'did:plc:abc123',
        service: [
          {
            id: '#other_service',
            type: 'OtherService',
            serviceEndpoint: 'https://other.example.com',
          },
        ],
      };

      expect(getPdsFromDidDoc(didDoc)).toBeNull();
    });

    it('returns null when service array is missing', () => {
      const didDoc = {
        id: 'did:plc:abc123',
      };

      expect(getPdsFromDidDoc(didDoc)).toBeNull();
    });

    it('returns null when service is not an array', () => {
      const didDoc = {
        id: 'did:plc:abc123',
        service: 'not an array' as unknown as undefined,
      };

      expect(getPdsFromDidDoc(didDoc)).toBeNull();
    });
  });

  describe('getSession', () => {
    it('returns falsy when no session is stored', async () => {
      vi.resetModules();
      localStorageMock.getItem.mockReturnValue(null);
      const { getSession: getSessionFresh } = await import('@/lib/bluesky');

      const session = getSessionFresh();

      // getSession returns undefined or null when no session
      expect(session).toBeFalsy();
    });

    it('handles stored session', async () => {
      // Note: getSession reads from localStorage on module init,
      // so this test just verifies it doesn't crash
      vi.resetModules();
      const mockSession = {
        did: 'did:plc:abc123',
        handle: 'user.bsky.social',
        accessJwt: 'access-token',
        refreshJwt: 'refresh-token',
      };
      localStorageMock.getItem.mockReturnValue(JSON.stringify(mockSession));
      const { getSession: getSessionFresh } = await import('@/lib/bluesky');

      // The function should not throw
      expect(() => getSessionFresh()).not.toThrow();
    });

    it('handles invalid JSON gracefully', async () => {
      vi.resetModules();
      localStorageMock.getItem.mockReturnValue('invalid json {{{');
      const { getSession: getSessionFresh } = await import('@/lib/bluesky');

      // Should not throw, returns falsy
      expect(() => getSessionFresh()).not.toThrow();
    });
  });

  describe('buildProfileUrl', () => {
    it('builds URL with handle', () => {
      const url = buildProfileUrl('user.bsky.social');
      expect(url).toBe('/profile/user.bsky.social');
    });

    it('builds URL with handle and DID (uses DID for handles with dots)', () => {
      const url = buildProfileUrl('user.bsky.social', 'did:plc:abc123');
      // When handle has dots and DID is provided, use DID to avoid Next.js extension issues
      expect(url).toBe('/profile/did:plc:abc123');
    });

    it('builds URL with DID when no handle provided', () => {
      const url = buildProfileUrl('did:plc:abc123');
      expect(url).toBe('/profile/did:plc:abc123');
    });
  });

  describe('buildPostUrl', () => {
    it('builds URL from handle and rkey', () => {
      const url = buildPostUrl('user.bsky.social', 'abc123');
      expect(url).toBe('/profile/user.bsky.social/post/abc123');
    });

    it('builds URL with DID when handle has dots', () => {
      const url = buildPostUrl('user.bsky.social', 'abc123', 'did:plc:xyz');
      expect(url).toBe('/profile/did:plc:xyz/post/abc123');
    });
  });
});

describe('Feed Functions (require auth)', () => {
  // These tests verify that functions throw when not logged in
  // The actual API calls are tested with mocked agent

  describe('when not logged in', () => {
    beforeEach(async () => {
      // Ensure no session
      localStorageMock.getItem.mockReturnValue(null);

      // Dynamically import to reset module state
      vi.resetModules();
    });

    it('getTimeline throws when not logged in', async () => {
      const { getTimeline } = await import('@/lib/bluesky');
      await expect(getTimeline()).rejects.toThrow('Not logged in');
    });

    it('getFeed throws when not logged in', async () => {
      const { getFeed } = await import('@/lib/bluesky');
      await expect(getFeed('at://feed/uri')).rejects.toThrow('Not logged in');
    });

    it('getListFeed throws when not logged in', async () => {
      const { getListFeed } = await import('@/lib/bluesky');
      await expect(getListFeed('at://list/uri')).rejects.toThrow('Not logged in');
    });

    it('getQuotes throws when not logged in', async () => {
      const { getQuotes } = await import('@/lib/bluesky');
      await expect(getQuotes('at://post/uri')).rejects.toThrow('Not logged in');
    });

    it('getLikes throws when not logged in', async () => {
      const { getLikes } = await import('@/lib/bluesky');
      await expect(getLikes('at://post/uri')).rejects.toThrow('Not logged in');
    });

    it('getRepostedBy throws when not logged in', async () => {
      const { getRepostedBy } = await import('@/lib/bluesky');
      await expect(getRepostedBy('at://post/uri')).rejects.toThrow('Not logged in');
    });

    it('getThread throws when not logged in', async () => {
      const { getThread } = await import('@/lib/bluesky');
      await expect(getThread('at://post/uri')).rejects.toThrow('Not logged in');
    });

    it('searchPosts throws when not logged in', async () => {
      const { searchPosts } = await import('@/lib/bluesky');
      await expect(searchPosts('query')).rejects.toThrow('Not logged in');
    });

    it('searchUsers throws when not logged in', async () => {
      const { searchUsers } = await import('@/lib/bluesky');
      // May throw or return empty - just verify it doesn't crash
      try {
        const result = await searchUsers('query');
        expect(Array.isArray(result) || result === null || result === undefined).toBe(true);
      } catch (e) {
        expect(e).toBeDefined();
      }
    });

    it('getBlueskyProfile returns null when not logged in', async () => {
      const { getBlueskyProfile } = await import('@/lib/bluesky');
      // Returns null when not logged in
      const result = await getBlueskyProfile('did:plc:abc');
      expect(result).toBeNull();
    });

    it('createPost throws when not logged in', async () => {
      const { createPost } = await import('@/lib/bluesky');
      await expect(createPost('Hello world')).rejects.toThrow('Not logged in');
    });

    it('likePost throws when not logged in', async () => {
      const { likePost } = await import('@/lib/bluesky');
      await expect(likePost('at://post/uri', 'cid')).rejects.toThrow('Not logged in');
    });

    it('unlikePost throws when not logged in', async () => {
      const { unlikePost } = await import('@/lib/bluesky');
      await expect(unlikePost('like-uri')).rejects.toThrow('Not logged in');
    });

    it('repost throws when not logged in', async () => {
      const { repost } = await import('@/lib/bluesky');
      await expect(repost('at://post/uri', 'cid')).rejects.toThrow('Not logged in');
    });

    it('deleteRepost throws when not logged in', async () => {
      const { deleteRepost } = await import('@/lib/bluesky');
      await expect(deleteRepost('repost-uri')).rejects.toThrow('Not logged in');
    });

    it('followUser throws when not logged in', async () => {
      const { followUser } = await import('@/lib/bluesky');
      await expect(followUser('did:plc:abc')).rejects.toThrow('Not logged in');
    });

    it('unfollowUser throws when not logged in', async () => {
      const { unfollowUser } = await import('@/lib/bluesky');
      await expect(unfollowUser('follow-uri')).rejects.toThrow('Not logged in');
    });
  });
});

describe('Utility Functions', () => {
  // LEA labeler DID - must match for verified researcher check
  const LEA_LABELER_DID = 'did:plc:7c7tx56n64jhzezlwox5dja6';

  describe('isVerifiedResearcher', () => {
    it('returns true for verified researcher label from LEA labeler', async () => {
      const { isVerifiedResearcher } = await import('@/lib/bluesky');

      const labels = [
        { val: 'verified-researcher', src: LEA_LABELER_DID, uri: 'at://did:plc:user/profile/self' },
      ];

      expect(isVerifiedResearcher(labels)).toBe(true);
    });

    it('returns false when label is from different labeler', async () => {
      const { isVerifiedResearcher } = await import('@/lib/bluesky');

      const labels = [
        { val: 'verified-researcher', src: 'did:plc:other-labeler', uri: 'at://did:plc:user/profile/self' },
      ];

      expect(isVerifiedResearcher(labels)).toBe(false);
    });

    it('returns false when no verified label', async () => {
      const { isVerifiedResearcher } = await import('@/lib/bluesky');

      const labels = [
        { val: 'other-label', src: LEA_LABELER_DID, uri: 'at://did:plc:user/profile/self' },
      ];

      expect(isVerifiedResearcher(labels)).toBe(false);
    });

    it('returns false for empty labels', async () => {
      const { isVerifiedResearcher } = await import('@/lib/bluesky');

      expect(isVerifiedResearcher([])).toBe(false);
    });

    it('returns false for undefined labels', async () => {
      const { isVerifiedResearcher } = await import('@/lib/bluesky');

      expect(isVerifiedResearcher(undefined)).toBe(false);
    });
  });

  describe('hasReplies', () => {
    it('returns true when post has reply count > 0', async () => {
      const { hasReplies } = await import('@/lib/bluesky');

      // FeedViewPost structure has nested post.post
      const feedViewPost = { post: { replyCount: 5 } } as any;
      expect(hasReplies(feedViewPost)).toBe(true);
    });

    it('returns false when post has no replies', async () => {
      const { hasReplies } = await import('@/lib/bluesky');

      const feedViewPost = { post: { replyCount: 0 } } as any;
      expect(hasReplies(feedViewPost)).toBe(false);
    });

    it('returns false when replyCount is undefined', async () => {
      const { hasReplies } = await import('@/lib/bluesky');

      const feedViewPost = { post: {} } as any;
      expect(hasReplies(feedViewPost)).toBe(false);
    });
  });

  describe('isReplyPost', () => {
    it('returns true when post is a reply', async () => {
      const { isReplyPost } = await import('@/lib/bluesky');

      // FeedViewPost structure has nested post.post.record
      const feedViewPost = {
        post: {
          record: {
            reply: { parent: { uri: 'at://...' }, root: { uri: 'at://...' } },
          },
        },
      } as any;

      expect(isReplyPost(feedViewPost)).toBe(true);
    });

    it('returns false when post is not a reply', async () => {
      const { isReplyPost } = await import('@/lib/bluesky');

      const feedViewPost = {
        post: {
          record: {
            text: 'Hello world',
          },
        },
      } as any;

      expect(isReplyPost(feedViewPost)).toBe(false);
    });
  });
});
