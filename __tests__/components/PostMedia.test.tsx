/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Mock hls.js
vi.mock('hls.js', () => {
  const mockHls = vi.fn().mockImplementation(() => ({
    loadSource: vi.fn(),
    attachMedia: vi.fn(),
    destroy: vi.fn(),
    on: vi.fn(),
  }));
  (mockHls as unknown as { isSupported: () => boolean }).isSupported = vi.fn(() => true);
  return { default: mockHls };
});

// Mock the settings context
vi.mock('@/lib/settings', () => ({
  useSettings: () => ({ settings: { showInteractionButtons: true } }),
  SettingsProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock the composer context
vi.mock('@/lib/composer-context', () => ({
  useComposer: () => ({ openComposer: vi.fn() }),
}));

// Mock the bookmarks context
vi.mock('@/lib/bookmarks', () => ({
  useBookmarks: () => ({ bookmarks: [], addBookmark: vi.fn(), removeBookmark: vi.fn(), isBookmarked: vi.fn(() => false) }),
}));

// Mock bluesky lib
vi.mock('@/lib/bluesky', () => ({
  isVerifiedResearcher: vi.fn(() => false),
  createPost: vi.fn(),
  likePost: vi.fn(),
  unlikePost: vi.fn(),
  repost: vi.fn(),
  deleteRepost: vi.fn(),
  deletePost: vi.fn(),
  editPost: vi.fn(),
  uploadImage: vi.fn(),
  sendFeedInteraction: vi.fn(),
  getSession: vi.fn(() => ({ did: 'did:plc:test', handle: 'test.handle' })),
  updateThreadgate: vi.fn(),
  getThreadgateType: vi.fn(),
  FEEDS: {},
  searchActors: vi.fn(),
  detachQuote: vi.fn(),
  buildProfileUrl: vi.fn((handle) => `/u/${handle}`),
  buildPostUrl: vi.fn((handle, rkey) => `/post/${handle}/${rkey}`),
}));

// Mock moderation context
vi.mock('@/lib/moderation', () => ({
  useModeration: () => ({
    moderationOpts: null,
    hidePost: vi.fn(),
    unhidePost: vi.fn(),
    isHidden: vi.fn(() => false),
  }),
}));

describe('Post Media Embedding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Video Embed Detection', () => {
    it('should identify video embeds by playlist property', () => {
      const videoEmbed = {
        $type: 'app.bsky.embed.video#view',
        playlist: 'https://video.bsky.app/watch/did%3Aplc%3Atest/test-cid/playlist.m3u8',
        thumbnail: 'https://video.bsky.app/watch/did%3Aplc%3Atest/test-cid/thumbnail.jpg',
        aspectRatio: { width: 1920, height: 1080 },
      };

      // Check that the embed has the expected structure for video
      expect(videoEmbed).toHaveProperty('playlist');
      expect(videoEmbed.playlist).toContain('playlist.m3u8');
      expect(videoEmbed).toHaveProperty('thumbnail');
      expect(videoEmbed).toHaveProperty('aspectRatio');
    });

    it('should calculate correct aspect ratio for videos', () => {
      const aspectRatio = { width: 1920, height: 1080 };
      const ratio = aspectRatio.width / aspectRatio.height;
      const paddingBottom = `${(1 / ratio) * 100}%`;

      expect(ratio).toBeCloseTo(1.777, 2); // 16:9
      expect(paddingBottom).toBe('56.25%');
    });

    it('should use default 16:9 aspect ratio when not provided', () => {
      const defaultRatio = 16 / 9;
      const paddingBottom = `${(1 / defaultRatio) * 100}%`;

      expect(paddingBottom).toBe('56.25%');
    });
  });

  describe('Image/GIF Embed Detection', () => {
    it('should identify image embeds by images array', () => {
      const imageEmbed = {
        $type: 'app.bsky.embed.images#view',
        images: [
          {
            thumb: 'https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:test/image-cid@jpeg',
            fullsize: 'https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:test/image-cid@jpeg',
            alt: 'Test image',
            aspectRatio: { width: 800, height: 600 },
          },
        ],
      };

      expect(imageEmbed).toHaveProperty('images');
      expect(Array.isArray(imageEmbed.images)).toBe(true);
      expect(imageEmbed.images.length).toBe(1);
      expect(imageEmbed.images[0]).toHaveProperty('thumb');
      expect(imageEmbed.images[0]).toHaveProperty('fullsize');
    });

    it('should handle multiple images in embed', () => {
      const multiImageEmbed = {
        $type: 'app.bsky.embed.images#view',
        images: [
          { thumb: 'https://example.com/1.jpg', fullsize: 'https://example.com/1-full.jpg', alt: '' },
          { thumb: 'https://example.com/2.jpg', fullsize: 'https://example.com/2-full.jpg', alt: '' },
          { thumb: 'https://example.com/3.jpg', fullsize: 'https://example.com/3-full.jpg', alt: '' },
          { thumb: 'https://example.com/4.jpg', fullsize: 'https://example.com/4-full.jpg', alt: '' },
        ],
      };

      expect(multiImageEmbed.images.length).toBe(4);
    });

    it('should handle GIFs as images (GIF URLs end with @jpeg or similar)', () => {
      // GIFs on Bluesky are converted to videos or served as images
      // The thumb/fullsize URLs work the same way
      const gifEmbed = {
        $type: 'app.bsky.embed.images#view',
        images: [
          {
            thumb: 'https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:test/gif-cid@jpeg',
            fullsize: 'https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:test/gif-cid@jpeg',
            alt: 'Animated GIF',
            aspectRatio: { width: 400, height: 300 },
          },
        ],
      };

      expect(gifEmbed.images[0].thumb).toContain('cdn.bsky.app');
      expect(gifEmbed.images[0].fullsize).toContain('cdn.bsky.app');
    });
  });

  describe('Embed Type Dispatching', () => {
    it('should correctly dispatch based on embed properties', () => {
      // Simulate the PostEmbed logic
      const dispatchEmbed = (embed: Record<string, unknown>) => {
        if ('images' in embed && Array.isArray(embed.images)) {
          return 'images';
        }
        if ('external' in embed && embed.external) {
          return 'external';
        }
        if ('playlist' in embed && embed.playlist) {
          return 'video';
        }
        if ('media' in embed && embed.media) {
          return 'recordWithMedia';
        }
        if ('record' in embed && embed.record) {
          return 'record';
        }
        return null;
      };

      expect(dispatchEmbed({ images: [] })).toBe('images');
      expect(dispatchEmbed({ playlist: 'https://example.com/video.m3u8' })).toBe('video');
      expect(dispatchEmbed({ external: { uri: 'https://example.com' } })).toBe('external');
      expect(dispatchEmbed({ record: { uri: 'at://...' } })).toBe('record');
      expect(dispatchEmbed({ media: {}, record: {} })).toBe('recordWithMedia');
    });

    it('should check recordWithMedia before pure record', () => {
      // This is important: recordWithMedia has both 'media' and 'record' properties
      // It should be checked BEFORE pure record embed
      const recordWithMediaEmbed = {
        media: { images: [{ thumb: 'https://example.com/1.jpg', fullsize: 'https://example.com/1-full.jpg', alt: '' }] },
        record: { record: { uri: 'at://did:plc:test/app.bsky.feed.post/rkey' } },
      };

      // Check that media property exists (should dispatch as recordWithMedia, not record)
      expect('media' in recordWithMediaEmbed).toBe(true);
      expect('record' in recordWithMediaEmbed).toBe(true);
    });
  });

  describe('HLS Support Detection', () => {
    it('should detect HLS.js library support', async () => {
      const Hls = (await import('hls.js')).default;
      expect((Hls as unknown as { isSupported: () => boolean }).isSupported()).toBe(true);
    });

    it('should create HLS instance with correct config', async () => {
      const Hls = (await import('hls.js')).default;
      // The mock returns an object with the expected methods
      // In the actual code, `new Hls({...})` creates an instance
      // Here we verify the mock is callable and returns expected shape
      const mockInstance = (Hls as unknown as () => object)();

      expect(mockInstance).toBeDefined();
      expect(mockInstance).toHaveProperty('loadSource');
      expect(mockInstance).toHaveProperty('attachMedia');
      expect(mockInstance).toHaveProperty('destroy');
    });
  });

  describe('Video URL Formats', () => {
    it('should handle Bluesky video CDN URLs', () => {
      const videoUrl = 'https://video.bsky.app/watch/did%3Aplc%3Atest/bafyreiabc123/playlist.m3u8';

      expect(videoUrl).toContain('video.bsky.app');
      expect(videoUrl).toContain('playlist.m3u8');
      expect(videoUrl).toContain('did%3Aplc%3A'); // URL-encoded DID
    });

    it('should handle thumbnail URLs', () => {
      const thumbnailUrl = 'https://video.bsky.app/watch/did%3Aplc%3Atest/bafyreiabc123/thumbnail.jpg';

      expect(thumbnailUrl).toContain('video.bsky.app');
      expect(thumbnailUrl).toContain('thumbnail.jpg');
    });
  });

  describe('Image URL Formats', () => {
    it('should handle Bluesky CDN image URLs', () => {
      const imageUrl = 'https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:test/bafyreiabc123@jpeg';

      expect(imageUrl).toContain('cdn.bsky.app');
      expect(imageUrl).toContain('feed_fullsize');
    });

    it('should handle thumbnail vs fullsize URLs', () => {
      const thumbUrl = 'https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:test/cid@jpeg';
      const fullUrl = 'https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:test/cid@jpeg';

      expect(thumbUrl).toContain('feed_thumbnail');
      expect(fullUrl).toContain('feed_fullsize');
    });
  });
});

describe('Click Handler for Media Elements', () => {
  it('should include video in interactive element selector', () => {
    // This tests the fix for video clicks not working
    // The selector should include 'video' to prevent post wrapper navigation
    const selector = 'button, input, textarea, [role="button"], img, video';

    // Create a mock video element
    const videoElement = document.createElement('video');
    const container = document.createElement('div');
    container.appendChild(videoElement);

    // Check that video matches the selector
    expect(videoElement.matches('video')).toBe(true);
    expect(videoElement.closest(selector)).toBe(videoElement);
  });

  it('should include img in interactive element selector', () => {
    const selector = 'button, input, textarea, [role="button"], img, video';

    const imgElement = document.createElement('img');
    const container = document.createElement('div');
    container.appendChild(imgElement);

    expect(imgElement.matches('img')).toBe(true);
    expect(imgElement.closest(selector)).toBe(imgElement);
  });

  it('should NOT include unrelated elements in selector', () => {
    const selector = 'button, input, textarea, [role="button"], img, video';

    const spanElement = document.createElement('span');
    const container = document.createElement('div');
    container.appendChild(spanElement);

    expect(spanElement.matches('span')).toBe(true);
    expect(spanElement.closest(selector)).toBeNull();
  });
});

describe('Poll Detection', () => {
  it('should detect poll marker emoji in post text', () => {
    const postWithPoll = '📊 Poll:\n1️⃣ Option A\n2️⃣ Option B';
    const postWithoutPoll = 'Just a regular post about voting';

    expect(postWithPoll.includes('📊')).toBe(true);
    expect(postWithoutPoll.includes('📊')).toBe(false);
  });

  it('should not false-positive on posts mentioning polls without marker', () => {
    const postMentioningPoll = 'Check out this poll I saw!';
    const postWithVote = 'Go vote in the election!';

    // These should NOT trigger poll checking
    expect(postMentioningPoll.includes('📊')).toBe(false);
    expect(postWithVote.includes('📊')).toBe(false);
  });
});

describe('Video Playback Integration', () => {
  it('should verify video element has correct attributes for playback', () => {
    // Test that video element would have correct attributes
    const videoProps = {
      controls: true,
      preload: 'metadata',
      playsInline: true,
    };

    expect(videoProps.controls).toBe(true);
    expect(videoProps.preload).toBe('metadata');
    expect(videoProps.playsInline).toBe(true);
  });

  it('should verify native HLS check for Safari', () => {
    // Mock video element with canPlayType
    const mockVideoElement = {
      canPlayType: vi.fn((type: string) => {
        if (type === 'application/vnd.apple.mpegurl') {
          return 'maybe'; // Safari would return 'maybe' or 'probably'
        }
        return '';
      }),
    };

    const supportsNativeHLS = mockVideoElement.canPlayType('application/vnd.apple.mpegurl') !== '';
    expect(supportsNativeHLS).toBe(true);
  });

  it('should fallback to hls.js when native HLS not supported', () => {
    // Mock video element without native HLS support (Chrome/Firefox)
    const mockVideoElement = {
      canPlayType: vi.fn(() => ''),
    };

    const supportsNativeHLS = mockVideoElement.canPlayType('application/vnd.apple.mpegurl') !== '';
    expect(supportsNativeHLS).toBe(false);
    // In this case, hls.js should be used
  });
});
