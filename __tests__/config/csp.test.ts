/**
 * Tests for Content Security Policy configuration
 * Ensures required domains for video/media playback are allowed
 */
import { describe, it, expect } from 'vitest';
import nextConfig from '../../next.config';

describe('Content Security Policy Configuration', () => {
  // Extract CSP header from next.config
  const getCSPHeader = async () => {
    const headers = await nextConfig.headers?.();
    if (!headers) return null;

    const allRoutesHeaders = headers.find(h => h.source === '/:path*');
    if (!allRoutesHeaders) return null;

    const cspHeader = allRoutesHeaders.headers.find(h => h.key === 'Content-Security-Policy');
    return cspHeader?.value || null;
  };

  describe('connect-src directive', () => {
    it('should allow all HTTPS origins for federated ATProto PDS support', async () => {
      const csp = await getCSPHeader();
      expect(csp).not.toBeNull();
      expect(csp).toContain("connect-src 'self' https:");
    });

    it('should allow WebSocket connections to bsky.network', async () => {
      const csp = await getCSPHeader();
      expect(csp).toContain('wss://*.bsky.network');
    });
  });

  describe('img-src directive', () => {
    it('should allow https: for all HTTPS image sources', async () => {
      const csp = await getCSPHeader();
      expect(csp).toContain("img-src 'self' data: https:");
    });

    it('should allow blob: for locally created images', async () => {
      const csp = await getCSPHeader();
      expect(csp).toContain('blob:');
    });
  });

  describe('script-src directive', () => {
    it('should allow Vercel analytics scripts', async () => {
      const csp = await getCSPHeader();
      expect(csp).toContain('va.vercel-scripts.com');
    });
  });

  describe('Required Bluesky connectivity', () => {
    it('should allow https: to cover all ATProto PDS domains', async () => {
      const csp = await getCSPHeader();
      // https: covers bsky.social, public.api.bsky.app, video.bsky.app,
      // video.cdn.bsky.app, plc.directory, and any self-hosted PDS
      expect(csp).toContain('https:');
    });
  });
});

describe('Video URL Validation', () => {
  it('should recognize Bluesky video CDN URLs', () => {
    const videoUrl = 'https://video.bsky.app/watch/did%3Aplc%3Atest/bafyreiabc123/playlist.m3u8';
    const url = new URL(videoUrl);

    expect(url.hostname).toBe('video.bsky.app');
    expect(url.pathname).toContain('playlist.m3u8');
  });

  it('should recognize Bluesky image CDN URLs', () => {
    const imageUrl = 'https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:test/bafyreiabc123@jpeg';
    const url = new URL(imageUrl);

    expect(url.hostname).toBe('cdn.bsky.app');
    expect(url.pathname).toContain('feed_fullsize');
  });

  it('should handle URL-encoded DIDs in video URLs', () => {
    const videoUrl = 'https://video.bsky.app/watch/did%3Aplc%3Atq6gqh5aaohgi55y2yofylwj/bafkreicuycu6p5h7pgx5tbrmsjcdwyegnm7jiky2hg5l2zixbaasp6rj2u/playlist.m3u8';
    const url = new URL(videoUrl);

    // Decode the path to verify DID format
    const decodedPath = decodeURIComponent(url.pathname);
    expect(decodedPath).toContain('did:plc:');
  });
});
