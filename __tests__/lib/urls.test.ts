/**
 * Tests for URL building and parsing functions
 * These tests ensure URL compatibility with Bluesky's URL structure
 */
import { describe, it, expect } from 'vitest';
import { buildProfileUrl, buildPostUrl } from '@/lib/bluesky';

describe('URL Building Functions', () => {
  describe('buildProfileUrl', () => {
    // These tests define the EXPECTED behavior after migration
    it('should build profile URL with simple handle', () => {
      // Expected: /profile/handle
      const url = buildProfileUrl('testuser');
      expect(url).toBe('/profile/testuser');
    });

    it('should build profile URL with .bsky.social handle using DID', () => {
      // Handles with dots should use DID to avoid Next.js extension parsing
      const url = buildProfileUrl('user.bsky.social', 'did:plc:abc123');
      expect(url).toBe('/profile/did:plc:abc123');
    });

    it('should build profile URL with custom domain handle using DID', () => {
      const url = buildProfileUrl('jay.bsky.team', 'did:plc:xyz789');
      expect(url).toBe('/profile/did:plc:xyz789');
    });

    it('should build profile URL with DID directly', () => {
      const url = buildProfileUrl('did:plc:abc123');
      expect(url).toBe('/profile/did:plc:abc123');
    });

    it('should handle handle with dots but no DID provided', () => {
      // Falls back to using handle even with dots if no DID available
      const url = buildProfileUrl('user.bsky.social');
      expect(url).toBe('/profile/user.bsky.social');
    });
  });

  describe('buildPostUrl', () => {
    // These tests define the EXPECTED behavior after migration
    it('should build post URL with simple handle', () => {
      // Expected: /profile/handle/post/rkey
      const url = buildPostUrl('testuser', 'abc123');
      expect(url).toBe('/profile/testuser/post/abc123');
    });

    it('should build post URL with .bsky.social handle using DID', () => {
      const url = buildPostUrl('user.bsky.social', 'abc123', 'did:plc:xyz');
      expect(url).toBe('/profile/did:plc:xyz/post/abc123');
    });

    it('should build post URL with custom domain using DID', () => {
      const url = buildPostUrl('jay.bsky.team', 'post456', 'did:plc:team');
      expect(url).toBe('/profile/did:plc:team/post/post456');
    });

    it('should build post URL with DID directly', () => {
      const url = buildPostUrl('did:plc:abc123', 'rkey789');
      expect(url).toBe('/profile/did:plc:abc123/post/rkey789');
    });

    it('should handle special characters in rkey', () => {
      const url = buildPostUrl('testuser', '3jxjxjxjxjxjx');
      expect(url).toBe('/profile/testuser/post/3jxjxjxjxjxjx');
    });
  });

  describe('URL Compatibility with Bluesky', () => {
    it('profile URL should match Bluesky format (minus domain)', () => {
      // Bluesky: https://bsky.app/profile/handle
      // Lea:     https://lea.app/profile/handle
      const url = buildProfileUrl('testuser');
      expect(url).toMatch(/^\/profile\/[^/]+$/);
    });

    it('post URL should match Bluesky format (minus domain)', () => {
      // Bluesky: https://bsky.app/profile/handle/post/rkey
      // Lea:     https://lea.app/profile/handle/post/rkey
      const url = buildPostUrl('testuser', 'abc123');
      expect(url).toMatch(/^\/profile\/[^/]+\/post\/[^/]+$/);
    });

    it('should generate URLs that work when pasted to Bluesky (after domain swap)', () => {
      const profileUrl = buildProfileUrl('user.bsky.social', 'did:plc:test');
      const postUrl = buildPostUrl('user.bsky.social', 'abc123', 'did:plc:test');

      // After domain swap, these should work on bsky.app
      const bskyProfileUrl = `https://bsky.app${profileUrl}`;
      const bskyPostUrl = `https://bsky.app${postUrl}`;

      expect(bskyProfileUrl).toMatch(/^https:\/\/bsky\.app\/profile\/.+$/);
      expect(bskyPostUrl).toMatch(/^https:\/\/bsky\.app\/profile\/.+\/post\/.+$/);
    });
  });
});

describe('URL Parsing Functions', () => {
  describe('parsePostUrl patterns', () => {
    it('should recognize Bluesky post URL pattern', () => {
      const url = 'https://bsky.app/profile/user.bsky.social/post/abc123';
      const match = url.match(/bsky\.app\/profile\/([^/]+)\/post\/([^/?]+)/);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('user.bsky.social');
      expect(match![2]).toBe('abc123');
    });

    it('should recognize Lea post URL pattern (new format)', () => {
      const url = 'https://lea.app/profile/user.bsky.social/post/abc123';
      // New Lea format matches Bluesky format
      const match = url.match(/\/profile\/([^/]+)\/post\/([^/?]+)/);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('user.bsky.social');
      expect(match![2]).toBe('abc123');
    });

    it('should recognize Lea post URL with DID', () => {
      const url = 'https://lea.app/profile/did:plc:abc123/post/xyz789';
      const match = url.match(/\/profile\/([^/]+)\/post\/([^/?]+)/);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('did:plc:abc123');
      expect(match![2]).toBe('xyz789');
    });

    it('should handle URL with query parameters', () => {
      const url = 'https://bsky.app/profile/user.bsky.social/post/abc123?ref=share';
      const match = url.match(/\/profile\/([^/]+)\/post\/([^/?]+)/);

      expect(match).not.toBeNull();
      expect(match![2]).toBe('abc123');
    });

    it('should handle AT URI format', () => {
      const uri = 'at://did:plc:abc123/app.bsky.feed.post/xyz789';
      expect(uri.startsWith('at://')).toBe(true);

      const match = uri.match(/at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)/);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('did:plc:abc123');
      expect(match![2]).toBe('xyz789');
    });
  });

  describe('parseProfileUrl patterns', () => {
    it('should recognize Bluesky profile URL pattern', () => {
      const url = 'https://bsky.app/profile/user.bsky.social';
      const match = url.match(/bsky\.app\/profile\/([^/?]+)/);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('user.bsky.social');
    });

    it('should recognize Lea profile URL pattern (new format)', () => {
      const url = 'https://lea.app/profile/user.bsky.social';
      const match = url.match(/\/profile\/([^/?]+)/);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('user.bsky.social');
    });

    it('should recognize profile URL with DID', () => {
      const url = 'https://lea.app/profile/did:plc:abc123';
      const match = url.match(/\/profile\/([^/?]+)/);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('did:plc:abc123');
    });
  });
});

describe('Redirect Configuration', () => {
  // These tests verify the redirect patterns work correctly
  describe('Old URL patterns that need redirects', () => {
    it('should identify old profile URL format: /u/:handle', () => {
      const oldUrl = '/u/user.bsky.social';
      expect(oldUrl).toMatch(/^\/u\/(.+)$/);

      const match = oldUrl.match(/^\/u\/(.+)$/);
      expect(match![1]).toBe('user.bsky.social');
    });

    it('should identify old post URL format: /post/:handle/:rkey', () => {
      const oldUrl = '/post/user.bsky.social/abc123';
      expect(oldUrl).toMatch(/^\/post\/([^/]+)\/([^/]+)$/);

      const match = oldUrl.match(/^\/post\/([^/]+)\/([^/]+)$/);
      expect(match![1]).toBe('user.bsky.social');
      expect(match![2]).toBe('abc123');
    });

    it('should map old profile URL to new format', () => {
      const oldUrl = '/u/user.bsky.social';
      const match = oldUrl.match(/^\/u\/(.+)$/);
      const newUrl = `/profile/${match![1]}`;

      expect(newUrl).toBe('/profile/user.bsky.social');
    });

    it('should map old post URL to new format', () => {
      const oldUrl = '/post/user.bsky.social/abc123';
      const match = oldUrl.match(/^\/post\/([^/]+)\/([^/]+)$/);
      const newUrl = `/profile/${match![1]}/post/${match![2]}`;

      expect(newUrl).toBe('/profile/user.bsky.social/post/abc123');
    });
  });
});

describe('Edge Cases', () => {
  it('should handle handles with multiple dots', () => {
    const handle = 'sub.domain.custom.tld';
    const url = buildProfileUrl(handle, 'did:plc:multi');
    expect(url).toBe('/profile/did:plc:multi');
  });

  it('should handle DIDs with special characters', () => {
    const did = 'did:plc:abc123xyz';
    const url = buildProfileUrl(did);
    expect(url).toBe('/profile/did:plc:abc123xyz');
  });

  it('should handle rkeys that look like file extensions', () => {
    // Some rkeys might end with patterns like numbers
    const url = buildPostUrl('testuser', '3jui7qw5znc2i');
    expect(url).toBe('/profile/testuser/post/3jui7qw5znc2i');
  });

  it('should handle empty strings gracefully', () => {
    // These should still produce valid URLs (even if semantically wrong)
    const profileUrl = buildProfileUrl('');
    const postUrl = buildPostUrl('', '');

    expect(profileUrl).toBe('/profile/');
    expect(postUrl).toBe('/profile//post/');
  });
});

describe('Handles with dots (Next.js file extension issue)', () => {
  // Handles like user.bsky.social contain dots which Next.js might interpret as file extensions
  // The solution is to use DIDs when available for handles with dots

  describe('buildProfileUrl with dotted handles', () => {
    it('should use DID for .bsky.social handles when DID is provided', () => {
      const url = buildProfileUrl('alice.bsky.social', 'did:plc:alice123');
      expect(url).toBe('/profile/did:plc:alice123');
      // NOT /profile/alice.bsky.social which could cause Next.js issues
    });

    it('should use DID for custom domain handles when DID is provided', () => {
      const url = buildProfileUrl('jay.bsky.team', 'did:plc:jay456');
      expect(url).toBe('/profile/did:plc:jay456');
    });

    it('should use DID for handles with multiple dots when DID is provided', () => {
      const url = buildProfileUrl('user.custom.domain.com', 'did:plc:custom');
      expect(url).toBe('/profile/did:plc:custom');
    });

    it('should fallback to handle when no DID is provided (even with dots)', () => {
      // This is not ideal but necessary when DID is unavailable
      const url = buildProfileUrl('alice.bsky.social');
      expect(url).toBe('/profile/alice.bsky.social');
    });

    it('should use handle directly when it has no dots', () => {
      const url = buildProfileUrl('alice', 'did:plc:alice123');
      // No dots in handle, so use handle directly (cleaner URL)
      expect(url).toBe('/profile/alice');
    });
  });

  describe('buildPostUrl with dotted handles', () => {
    it('should use DID for .bsky.social handles when DID is provided', () => {
      const url = buildPostUrl('alice.bsky.social', 'abc123', 'did:plc:alice123');
      expect(url).toBe('/profile/did:plc:alice123/post/abc123');
    });

    it('should use DID for custom domain handles when DID is provided', () => {
      const url = buildPostUrl('jay.bsky.team', 'xyz789', 'did:plc:jay456');
      expect(url).toBe('/profile/did:plc:jay456/post/xyz789');
    });

    it('should fallback to handle when no DID is provided (even with dots)', () => {
      const url = buildPostUrl('alice.bsky.social', 'abc123');
      expect(url).toBe('/profile/alice.bsky.social/post/abc123');
    });

    it('should use handle directly when it has no dots', () => {
      const url = buildPostUrl('alice', 'abc123', 'did:plc:alice123');
      expect(url).toBe('/profile/alice/post/abc123');
    });
  });

  describe('Common Bluesky handle patterns', () => {
    const testCases = [
      { handle: 'user.bsky.social', did: 'did:plc:test1' },
      { handle: 'researcher.bsky.social', did: 'did:plc:test2' },
      { handle: 'jay.bsky.team', did: 'did:plc:test3' },
      { handle: 'alice.test.bsky.network', did: 'did:plc:test4' },
    ];

    testCases.forEach(({ handle, did }) => {
      it(`should use DID for profile: ${handle}`, () => {
        const url = buildProfileUrl(handle, did);
        expect(url).toBe(`/profile/${did}`);
        expect(url).not.toContain('.bsky');
      });

      it(`should use DID for post: ${handle}`, () => {
        const url = buildPostUrl(handle, 'rkey123', did);
        expect(url).toBe(`/profile/${did}/post/rkey123`);
        expect(url).not.toContain('.bsky');
      });
    });
  });
});

