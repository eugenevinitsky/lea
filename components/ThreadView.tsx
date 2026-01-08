'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AppBskyFeedDefs } from '@atproto/api';
import { getThread, getBlueskyProfile, getSession, buildProfileUrl } from '@/lib/bluesky';
import { useFollowing } from '@/lib/following-context';
import Post from './Post';
import EngagementTabs from './EngagementTabs';

interface ThreadViewProps {
  uri: string;
  onClose: () => void;
  onOpenThread?: (uri: string) => void;
  onOpenProfile?: (did: string) => void;
  inline?: boolean;
}

type ThreadViewPost = AppBskyFeedDefs.ThreadViewPost;
type SortMode = 'newest' | 'oldest' | 'top';

// Constants for truncation
const REPLIES_PER_LEVEL = 3; // Show 3 replies per nesting level initially
const MAX_VISIBLE_DEPTH = 3; // Collapse threads deeper than this

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

// Tree structure for replies with proper nesting
interface ReplyNode {
  post: AppBskyFeedDefs.PostView;
  depth: number;
  replies: ReplyNode[];
  isOP: boolean; // Is this from the original poster?
  isFollowing: boolean; // Is this from someone you follow?
  isSelf: boolean; // Is this your own reply?
}

// Build a tree of replies
function buildReplyTree(
  thread: ThreadViewPost,
  opDid: string,
  myDid: string | undefined,
  followingDids: Set<string> | null,
  depth: number = 0
): ReplyNode[] {
  if (!thread.replies) return [];

  const nodes: ReplyNode[] = [];
  for (const reply of thread.replies) {
    if (isThreadViewPost(reply)) {
      const authorDid = reply.post.author.did;
      nodes.push({
        post: reply.post,
        depth,
        replies: buildReplyTree(reply, opDid, myDid, followingDids, depth + 1),
        isOP: authorDid === opDid,
        isFollowing: followingDids?.has(authorDid) || false,
        isSelf: authorDid === myDid,
      });
    }
  }
  return nodes;
}

// Sort replies based on mode
function sortReplies(replies: ReplyNode[], mode: SortMode): ReplyNode[] {
  const sorted = [...replies];

  sorted.sort((a, b) => {
    // Always bump OP, self, and following to top (in that priority order)
    const aPriority = a.isOP ? 3 : a.isSelf ? 2 : a.isFollowing ? 1 : 0;
    const bPriority = b.isOP ? 3 : b.isSelf ? 2 : b.isFollowing ? 1 : 0;
    if (aPriority !== bPriority) return bPriority - aPriority;

    // Then sort by mode
    switch (mode) {
      case 'newest':
        return new Date(b.post.indexedAt).getTime() - new Date(a.post.indexedAt).getTime();
      case 'oldest':
        return new Date(a.post.indexedAt).getTime() - new Date(b.post.indexedAt).getTime();
      case 'top':
        return (b.post.likeCount || 0) - (a.post.likeCount || 0);
      default:
        return 0;
    }
  });

  // Recursively sort nested replies
  return sorted.map(node => ({
    ...node,
    replies: sortReplies(node.replies, mode),
  }));
}

// Flatten tree for rendering with visibility tracking
interface FlatReply {
  post: AppBskyFeedDefs.PostView;
  depth: number;
  hasMoreReplies: boolean;
  hiddenReplyCount: number;
  isLastAtDepth: boolean;
  parentUri: string | null;
  isShowMoreMarker: boolean; // True if this is a "show X more" placeholder, not a real post
}

function flattenTree(
  nodes: ReplyNode[],
  expandedPaths: Set<string>,
  depth: number = 0,
  parentUri: string | null = null
): FlatReply[] {
  const result: FlatReply[] = [];

  // Determine how many to show at this level
  const pathKey = parentUri || 'root';
  const isExpanded = expandedPaths.has(pathKey);
  const visibleCount = isExpanded ? nodes.length : Math.min(nodes.length, REPLIES_PER_LEVEL);
  const hiddenCount = nodes.length - visibleCount;

  nodes.slice(0, visibleCount).forEach((node, index) => {
    const isLastAtDepth = index === visibleCount - 1 && hiddenCount === 0;

    // Check if this node's replies are truncated
    const replyPathKey = node.post.uri;
    const repliesExpanded = expandedPaths.has(replyPathKey);
    const visibleReplies = repliesExpanded ? node.replies.length : Math.min(node.replies.length, REPLIES_PER_LEVEL);
    const hiddenReplies = node.replies.length - visibleReplies;

    // Should we show nested replies at all?
    const shouldShowNestedReplies = depth < MAX_VISIBLE_DEPTH || expandedPaths.has(`depth:${node.post.uri}`);

    result.push({
      post: node.post,
      depth,
      hasMoreReplies: node.replies.length > 0 && (!shouldShowNestedReplies || hiddenReplies > 0),
      hiddenReplyCount: shouldShowNestedReplies ? hiddenReplies : node.replies.length,
      isLastAtDepth,
      parentUri,
      isShowMoreMarker: false,
    });

    // Add nested replies if within depth limit or expanded
    if (shouldShowNestedReplies && node.replies.length > 0) {
      result.push(...flattenTree(
        node.replies.slice(0, visibleReplies),
        expandedPaths,
        depth + 1,
        node.post.uri
      ));
    }
  });

  // Add a "show more" marker if there are hidden replies at this level
  if (hiddenCount > 0) {
    result.push({
      post: nodes[visibleCount].post, // Use first hidden post as reference
      depth,
      hasMoreReplies: false,
      hiddenReplyCount: hiddenCount,
      isLastAtDepth: true,
      parentUri,
      isShowMoreMarker: true,
    });
  }

  return result;
}

// Auto-expand sentinel that triggers expansion when scrolled into view
function AutoExpandSentinel({
  onExpand,
  count,
  depth
}: {
  onExpand: () => void;
  count: number;
  depth: number;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasExpandedRef = useRef(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !hasExpandedRef.current) {
          hasExpandedRef.current = true;
          onExpand();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [onExpand]);

  return (
    <div
      ref={sentinelRef}
      style={{ marginLeft: `${Math.min(depth * 24, 96)}px` }}
      className="py-2 pl-4 flex items-center gap-2 text-sm text-gray-400"
    >
      <div className="animate-pulse w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded-full" />
      Loading {count} more {count === 1 ? 'reply' : 'replies'}...
    </div>
  );
}

export default function ThreadView({ uri, onClose, onOpenThread, onOpenProfile, inline }: ThreadViewProps) {
  const [currentUri, setCurrentUri] = useState(uri);
  const [history, setHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [parents, setParents] = useState<AppBskyFeedDefs.PostView[]>([]);
  const [mainPost, setMainPost] = useState<AppBskyFeedDefs.PostView | null>(null);
  const [rawThread, setRawThread] = useState<ThreadViewPost | null>(null); // Store raw thread for rebuilding
  const [sortMode, setSortMode] = useState<SortMode>('top');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  const { followingDids } = useFollowing();
  const session = getSession();
  const myDid = session?.did;

  // Build reply tree from raw thread data (rebuilds when followingDids changes without resetting expandedPaths)
  const replyTree = useMemo(() => {
    if (!rawThread) return [];
    const opDid = rawThread.post.author.did;
    return buildReplyTree(rawThread, opDid, myDid, followingDids);
  }, [rawThread, myDid, followingDids]);

  // Sort and flatten replies for display
  const displayReplies = useMemo(() => {
    const sorted = sortReplies(replyTree, sortMode);
    return flattenTree(sorted, expandedPaths);
  }, [replyTree, sortMode, expandedPaths]);

  // Count total replies
  const totalReplyCount = useMemo(() => {
    function countReplies(nodes: ReplyNode[]): number {
      return nodes.reduce((sum, node) => sum + 1 + countReplies(node.replies), 0);
    }
    return countReplies(replyTree);
  }, [replyTree]);

  const navigateToThread = (newUri: string) => {
    if (onOpenThread) {
      onOpenThread(newUri);
      return;
    }
    setHistory(prev => [...prev, currentUri]);
    setCurrentUri(newUri);
  };

  const navigateToProfile = useCallback(async (did: string) => {
    if (onOpenProfile) {
      onOpenProfile(did);
      return;
    }
    try {
      const profile = await getBlueskyProfile(did);
      if (profile?.handle) {
        window.location.href = buildProfileUrl(profile.handle, profile.did);
      } else {
        window.location.href = buildProfileUrl(did);
      }
    } catch {
      window.location.href = buildProfileUrl(did);
    }
  }, [onOpenProfile]);

  const refreshThread = useCallback(async () => {
    const currentReplyCount = totalReplyCount;

    for (let attempt = 0; attempt < 5; attempt++) {
      const delay = attempt === 0 ? 500 : 1000 * attempt;
      await new Promise(resolve => setTimeout(resolve, delay));

      try {
        const response = await getThread(currentUri);
        const thread = response.data.thread;

        if (!isThreadViewPost(thread)) {
          return;
        }

        // Count replies in the new thread
        function countRepliesInThread(t: ThreadViewPost): number {
          if (!t.replies) return 0;
          return t.replies.reduce((sum, r) => {
            if (isThreadViewPost(r)) {
              return sum + 1 + countRepliesInThread(r);
            }
            return sum;
          }, 0);
        }

        if (countRepliesInThread(thread) > currentReplyCount || attempt === 4) {
          setMainPost(thread.post);
          setParents(collectParents(thread));
          setRawThread(thread); // replyTree will be recomputed via useMemo
          return;
        }
      } catch (err) {
        console.error('Failed to refresh thread:', err);
        return;
      }
    }
  }, [currentUri, totalReplyCount]);

  const goBack = () => {
    if (history.length > 0) {
      const prevUri = history[history.length - 1];
      setHistory(prev => prev.slice(0, -1));
      setCurrentUri(prevUri);
    }
  };

  const expandPath = (pathKey: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      next.add(pathKey);
      return next;
    });
  };

  useEffect(() => {
    async function loadThread() {
      try {
        setLoading(true);
        setError(null);
        setExpandedPaths(new Set()); // Reset expansion state only when loading new thread

        const response = await getThread(currentUri);
        const thread = response.data.thread;

        if (!isThreadViewPost(thread)) {
          setError('Could not load thread');
          return;
        }

        setMainPost(thread.post);
        setParents(collectParents(thread));
        setRawThread(thread); // Store raw thread, replyTree will be computed via useMemo
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load thread');
      } finally {
        setLoading(false);
      }
    }

    loadThread();
  }, [currentUri]); // Only reload when URI changes, not when followingDids changes

  // Thread content
  const threadContent = (
    <>
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
          {/* Parent posts with thread lines */}
          {parents.length > 0 && (
            <div className="relative">
              {parents.map((post, index) => (
                <div key={post.uri} className="relative">
                  {/* Vertical thread line */}
                  <div
                    className="absolute left-[34px] top-0 bottom-0 w-0.5 bg-gray-300 dark:bg-gray-600"
                  />
                  <div className="opacity-75">
                    <Post
                      post={post}
                      onOpenThread={navigateToThread}
                      onOpenProfile={navigateToProfile}
                      onReply={refreshThread}
                      isInThread={true}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Main post (highlighted) */}
          <div className="relative bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500">
            {/* Thread line connecting from parents */}
            {parents.length > 0 && (
              <div className="absolute left-[34px] top-0 h-4 w-0.5 bg-gray-300 dark:bg-gray-600" />
            )}
            <Post
              post={mainPost}
              onOpenThread={navigateToThread}
              onOpenProfile={navigateToProfile}
              onReply={refreshThread}
            />
          </div>

          {/* Engagement tabs */}
          <EngagementTabs
            uri={mainPost.uri}
            likeCount={mainPost.likeCount || 0}
            repostCount={mainPost.repostCount || 0}
            quoteCount={mainPost.quoteCount || 0}
            onOpenThread={navigateToThread}
            onOpenProfile={navigateToProfile}
          />

          {/* Replies section */}
          {totalReplyCount > 0 && (
            <div>
              {/* Reply header with sort options */}
              <div className="px-4 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
                <span className="text-sm font-medium text-gray-500">
                  {totalReplyCount} {totalReplyCount === 1 ? 'reply' : 'replies'}
                </span>
                <div className="flex gap-1">
                  {(['top', 'newest', 'oldest'] as SortMode[]).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setSortMode(mode)}
                      className={`px-2 py-1 text-xs rounded-full transition-colors ${
                        sortMode === mode
                          ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                          : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Replies with thread lines */}
              <div className="relative">
                {displayReplies.map((item) => {
                  // Render auto-expand sentinel for hidden replies
                  if (item.isShowMoreMarker) {
                    return (
                      <AutoExpandSentinel
                        key={`more-${item.parentUri || 'root'}-${item.depth}`}
                        onExpand={() => expandPath(item.parentUri || 'root')}
                        count={item.hiddenReplyCount}
                        depth={item.depth}
                      />
                    );
                  }

                  // Check if there are more nested replies to expand
                  const hasCollapsedReplies = item.hasMoreReplies && item.hiddenReplyCount > 0;
                  const isDeepThread = item.depth >= MAX_VISIBLE_DEPTH;

                  return (
                    <div key={item.post.uri} className="relative">
                      {/* Thread line from parent */}
                      {item.depth > 0 && (
                        <div
                          className="absolute w-0.5 bg-gray-200 dark:bg-gray-700"
                          style={{
                            left: `${Math.min((item.depth - 1) * 24 + 34, 34 + 72)}px`,
                            top: 0,
                            height: item.isLastAtDepth ? '24px' : '100%',
                          }}
                        />
                      )}

                      {/* Horizontal connector */}
                      {item.depth > 0 && (
                        <div
                          className="absolute h-0.5 bg-gray-200 dark:bg-gray-700"
                          style={{
                            left: `${Math.min((item.depth - 1) * 24 + 34, 34 + 72)}px`,
                            top: '24px',
                            width: '12px',
                          }}
                        />
                      )}

                      <div style={{ marginLeft: `${Math.min(item.depth * 24, 96)}px` }}>
                        <Post
                          post={item.post}
                          onOpenThread={navigateToThread}
                          onOpenProfile={navigateToProfile}
                          onReply={refreshThread}
                          isInThread={true}
                        />

                        {/* Auto-expand nested replies when scrolled into view */}
                        {hasCollapsedReplies && (
                          <AutoExpandSentinel
                            onExpand={() => {
                              if (isDeepThread) {
                                expandPath(`depth:${item.post.uri}`);
                              } else {
                                expandPath(item.post.uri);
                              }
                            }}
                            count={item.hiddenReplyCount}
                            depth={item.depth + 1}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {totalReplyCount === 0 && (
            <div className="p-4 text-center text-gray-500 text-sm">
              No replies yet
            </div>
          )}
        </div>
      )}
    </>
  );

  // Inline mode
  if (inline) {
    return <div>{threadContent}</div>;
  }

  // Modal mode
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

        {threadContent}
      </div>
    </div>
  );
}
