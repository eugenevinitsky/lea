'use client';

import { useState, useEffect, useMemo } from 'react';
import { AppBskyFeedDefs, AppBskyFeedPost, AppBskyEmbedExternal } from '@atproto/api';
import { getTimeline } from '@/lib/bluesky';
import { useSettings } from '@/lib/settings';
import { detectPaperLink } from '@/lib/papers';
import Post from './Post';

export default function PapersFeed() {
  const { settings } = useSettings();
  const [allPosts, setAllPosts] = useState<AppBskyFeedDefs.FeedViewPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loadedPages, setLoadedPages] = useState(0);

  const loadTimeline = async (loadMore = false) => {
    try {
      setLoading(true);
      setError(null);
      const response = await getTimeline(loadMore ? cursor : undefined);

      if (loadMore) {
        setAllPosts(prev => [...prev, ...response.data.feed]);
      } else {
        setAllPosts(response.data.feed);
      }
      setCursor(response.data.cursor);
      setLoadedPages(prev => prev + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTimeline();
  }, []);

  // Filter posts to only those with paper links
  const { paperPosts, totalScanned } = useMemo(() => {
    const papers: AppBskyFeedDefs.FeedViewPost[] = [];

    for (const item of allPosts) {
      const record = item.post.record as AppBskyFeedPost.Record;
      const embed = item.post.embed;

      // Get embed URL if it's an external link
      let embedUri: string | undefined;
      if (embed && 'external' in embed) {
        const external = embed as AppBskyEmbedExternal.View;
        embedUri = external.external?.uri;
      }

      const { hasPaper } = detectPaperLink(record.text, embedUri);

      if (hasPaper) {
        // Also apply high-follower filter if enabled
        if (settings.highFollowerThreshold !== null) {
          const author = item.post.author as { followsCount?: number };
          if ((author.followsCount ?? 0) > settings.highFollowerThreshold) {
            continue;
          }
        }
        papers.push(item);
      }
    }

    return { paperPosts: papers, totalScanned: allPosts.length };
  }, [allPosts, settings.highFollowerThreshold]);

  if (error) {
    return (
      <div className="p-4 text-center">
        <p className="text-red-500">{error}</p>
        <button
          onClick={() => loadTimeline()}
          className="mt-2 px-4 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-black/80 backdrop-blur border-b border-gray-200 dark:border-gray-800 p-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Papers</h2>
            <p className="text-xs text-gray-500">
              {paperPosts.length} paper{paperPosts.length !== 1 ? 's' : ''} found in {totalScanned} posts
            </p>
          </div>
          <button
            onClick={() => {
              setAllPosts([]);
              setCursor(undefined);
              setLoadedPages(0);
              loadTimeline();
            }}
            disabled={loading}
            className="px-3 py-1.5 text-sm text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Empty state */}
      {!loading && paperPosts.length === 0 && (
        <div className="p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">No papers found yet</h3>
          <p className="text-sm text-gray-500 mb-4">
            We've scanned {totalScanned} posts from your timeline.
            <br />
            Load more to find papers from your network.
          </p>
          <button
            onClick={() => loadTimeline(true)}
            disabled={loading || !cursor}
            className="px-4 py-2 bg-purple-500 text-white rounded-full hover:bg-purple-600 disabled:opacity-50"
          >
            Load more posts
          </button>
        </div>
      )}

      {/* Paper posts */}
      {paperPosts.map((item, index) => (
        <Post key={`${item.post.uri}-${index}`} post={item.post} />
      ))}

      {/* Load more */}
      {paperPosts.length > 0 && cursor && !loading && (
        <div className="p-4">
          <button
            onClick={() => loadTimeline(true)}
            className="w-full py-3 text-purple-500 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg"
          >
            Load more ({loadedPages} page{loadedPages !== 1 ? 's' : ''} scanned)
          </button>
        </div>
      )}

      {/* Loading indicator */}
      {loading && allPosts.length > 0 && (
        <div className="p-4 text-center text-gray-500">
          Scanning for papers...
        </div>
      )}

      {loading && allPosts.length === 0 && (
        <div className="p-8 text-center text-gray-500">
          Loading your timeline...
        </div>
      )}
    </div>
  );
}
