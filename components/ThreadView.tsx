'use client';

import { useState, useEffect, useCallback } from 'react';
import { AppBskyFeedDefs } from '@atproto/api';
import { getThread } from '@/lib/bluesky';
import Post from './Post';
import EngagementTabs from './EngagementTabs';

interface ThreadViewProps {
  uri: string;
  onClose: () => void;
}

type ThreadViewPost = AppBskyFeedDefs.ThreadViewPost;

function isThreadViewPost(node: unknown): node is ThreadViewPost {
  return (
    typeof node === 'object' &&
    node !== null &&
    '$type' in node &&
    (node as { $type: string }).$type === 'app.bsky.feed.defs#threadViewPost'
  );
}

// Recursively collect parent posts (from root to current)
function collectParents(thread: ThreadViewPost): AppBskyFeedDefs.PostView[] {
  const parents: AppBskyFeedDefs.PostView[] = [];

  let current = thread.parent;
  while (current && isThreadViewPost(current)) {
    parents.unshift(current.post);
    current = current.parent;
  }

  return parents;
}

// Reply with nesting level for indentation
interface NestedReply {
  post: AppBskyFeedDefs.PostView;
  depth: number;
}

// Recursively collect all replies with their depth
function collectAllReplies(thread: ThreadViewPost, depth: number = 0): NestedReply[] {
  if (!thread.replies) return [];

  const replies: NestedReply[] = [];
  for (const reply of thread.replies) {
    if (isThreadViewPost(reply)) {
      replies.push({ post: reply.post, depth });
      // Recursively get nested replies
      replies.push(...collectAllReplies(reply, depth + 1));
    }
  }
  return replies;
}

export default function ThreadView({ uri, onClose }: ThreadViewProps) {
  const [currentUri, setCurrentUri] = useState(uri);
  const [history, setHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [parents, setParents] = useState<AppBskyFeedDefs.PostView[]>([]);
  const [mainPost, setMainPost] = useState<AppBskyFeedDefs.PostView | null>(null);
  const [replies, setReplies] = useState<NestedReply[]>([]);

  const navigateToThread = (newUri: string) => {
    setHistory(prev => [...prev, currentUri]);
    setCurrentUri(newUri);
  };

  // Refresh the current thread (e.g., after posting a reply)
  // Uses delay and retry since Bluesky's indexer takes time to process new posts
  const refreshThread = useCallback(async () => {
    const currentReplyCount = replies.length;
    
    // Try up to 5 times with increasing delays
    for (let attempt = 0; attempt < 5; attempt++) {
      // Wait before fetching (longer delays on subsequent attempts)
      const delay = attempt === 0 ? 500 : 1000 * attempt;
      await new Promise(resolve => setTimeout(resolve, delay));
      
      try {
        const response = await getThread(currentUri);
        const thread = response.data.thread;

        if (!isThreadViewPost(thread)) {
          return;
        }

        const newReplies = collectAllReplies(thread);
        
        // If we got more replies than before, update and stop retrying
        if (newReplies.length > currentReplyCount) {
          setMainPost(thread.post);
          setParents(collectParents(thread));
          setReplies(newReplies);
          return;
        }
        
        // On last attempt, update anyway (maybe the reply is deeply nested)
        if (attempt === 4) {
          setMainPost(thread.post);
          setParents(collectParents(thread));
          setReplies(newReplies);
        }
      } catch (err) {
        console.error('Failed to refresh thread:', err);
        // On error, don't retry
        return;
      }
    }
  }, [currentUri, replies.length]);

  const goBack = () => {
    if (history.length > 0) {
      const prevUri = history[history.length - 1];
      setHistory(prev => prev.slice(0, -1));
      setCurrentUri(prevUri);
    }
  };

  useEffect(() => {
    async function loadThread() {
      try {
        setLoading(true);
        setError(null);

        const response = await getThread(currentUri);
        const thread = response.data.thread;

        if (!isThreadViewPost(thread)) {
          setError('Could not load thread');
          return;
        }

        setMainPost(thread.post);
        setParents(collectParents(thread));
        setReplies(collectAllReplies(thread));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load thread');
      } finally {
        setLoading(false);
      }
    }

    loadThread();
  }, [currentUri]);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-950 rounded-2xl max-w-xl w-full my-8 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <button
                onClick={goBack}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
                title="Go back"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Thread</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        {loading && (
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
            <p className="mt-2 text-gray-500">Loading thread...</p>
          </div>
        )}

        {error && (
          <div className="p-8 text-center">
            <p className="text-red-500">{error}</p>
          </div>
        )}

        {!loading && !error && mainPost && (
          <div>
            {/* Parent posts (context) */}
            {parents.length > 0 && (
              <div className="border-l-2 border-blue-300 dark:border-blue-700 ml-6">
                {parents.map((post) => (
                  <div key={post.uri} className="relative">
                    {/* Connector line */}
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-300 dark:bg-blue-700 -ml-[1px]" />
                    <div className="pl-4 opacity-80">
                      <Post post={post} onOpenThread={navigateToThread} onReply={refreshThread} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Main post (highlighted) */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500">
              <Post post={mainPost} onOpenThread={navigateToThread} onReply={refreshThread} />
            </div>

            {/* Engagement tabs (likes, reposts, quotes) */}
            <EngagementTabs
              uri={mainPost.uri}
              likeCount={mainPost.likeCount || 0}
              repostCount={mainPost.repostCount || 0}
              quoteCount={mainPost.quoteCount || 0}
              onOpenThread={navigateToThread}
            />

            {/* Replies */}
            {replies.length > 0 && (
              <div>
                <div className="px-4 py-2 text-sm font-medium text-gray-500 border-b border-gray-200 dark:border-gray-800">
                  {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                </div>
                {replies.map(({ post, depth }) => (
                  <div
                    key={post.uri}
                    style={{ marginLeft: `${Math.min(depth * 16, 64)}px` }}
                    className={depth > 0 ? 'border-l-2 border-gray-200 dark:border-gray-700' : ''}
                  >
                    <Post
                      post={post}
                      onOpenThread={navigateToThread}
                      onReply={refreshThread}
                    />
                  </div>
                ))}
              </div>
            )}

            {replies.length === 0 && (
              <div className="p-4 text-center text-gray-500 text-sm">
                No replies yet
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
