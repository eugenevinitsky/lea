'use client';

import { useState, useEffect, useMemo } from 'react';
import { AppBskyFeedDefs } from '@atproto/api';
import { getTimeline } from '@/lib/bluesky';
import { useSettings } from '@/lib/settings';
import Post from './Post';
import ThreadView from './ThreadView';

export default function Timeline() {
  const { settings } = useSettings();
  const [posts, setPosts] = useState<AppBskyFeedDefs.FeedViewPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [threadUri, setThreadUri] = useState<string | null>(null);

  const loadTimeline = async (loadMore = false) => {
    try {
      setLoading(true);
      setError(null);
      const response = await getTimeline(loadMore ? cursor : undefined);

      if (loadMore) {
        setPosts(prev => [...prev, ...response.data.feed]);
      } else {
        setPosts(response.data.feed);
      }
      setCursor(response.data.cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load timeline');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTimeline();
  }, []);

  // Filter posts based on settings
  const { filteredPosts, hiddenCount } = useMemo(() => {
    if (settings.highFollowerThreshold === null) {
      return { filteredPosts: posts, hiddenCount: 0 };
    }

    const filtered: AppBskyFeedDefs.FeedViewPost[] = [];
    let hidden = 0;

    for (const item of posts) {
      // followsCount may not be on ProfileViewBasic, cast to access it
      const author = item.post.author as { followsCount?: number };
      const followingCount = author.followsCount ?? 0;
      if (followingCount > settings.highFollowerThreshold) {
        hidden++;
      } else {
        filtered.push(item);
      }
    }

    return { filteredPosts: filtered, hiddenCount: hidden };
  }, [posts, settings.highFollowerThreshold]);

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
      {/* Refresh button */}
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-black/80 backdrop-blur border-b border-gray-200 dark:border-gray-800 p-3">
        <button
          onClick={() => loadTimeline()}
          disabled={loading}
          className="w-full py-2 text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Hidden posts indicator */}
      {hiddenCount > 0 && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {hiddenCount} post{hiddenCount !== 1 ? 's' : ''} hidden from high-follower accounts
            <span className="text-amber-500 ml-1">(following {settings.highFollowerThreshold?.toLocaleString()}+)</span>
          </p>
        </div>
      )}

      {/* Posts */}
      {filteredPosts.map((item, index) => (
        <Post
          key={`${item.post.uri}-${index}`}
          post={item.post}
          onOpenThread={setThreadUri}
        />
      ))}

      {/* Thread View Modal */}
      {threadUri && (
        <ThreadView uri={threadUri} onClose={() => setThreadUri(null)} />
      )}

      {/* Load more */}
      {cursor && !loading && (
        <div className="p-4">
          <button
            onClick={() => loadTimeline(true)}
            className="w-full py-3 text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg"
          >
            Load more
          </button>
        </div>
      )}

      {loading && posts.length === 0 && (
        <div className="p-8 text-center text-gray-500">
          Loading your timeline...
        </div>
      )}
    </div>
  );
}
