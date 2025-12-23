'use client';

import { useState } from 'react';
import { AppBskyFeedDefs, AppBskyFeedPost, AppBskyEmbedExternal } from '@atproto/api';
import { isVerifiedResearcher, Label, createPost, ReplyRef, QuoteRef, likePost, unlikePost, repost, deleteRepost } from '@/lib/bluesky';
import { useSettings } from '@/lib/settings';

interface PostProps {
  post: AppBskyFeedDefs.PostView;
}

// Paper link detection
const PAPER_DOMAINS = [
  'arxiv.org',
  'doi.org',
  'semanticscholar.org',
  'aclanthology.org',
  'openreview.net',
  'biorxiv.org',
  'medrxiv.org',
  'ssrn.com',
  'nature.com',
  'science.org',
  'pnas.org',
  'acm.org/doi',
  'ieee.org',
  'springer.com',
  'wiley.com',
];

function containsPaperLink(text: string, embed?: AppBskyFeedDefs.PostView['embed']): { hasPaper: boolean; domain?: string } {
  // Check text for paper URLs
  for (const domain of PAPER_DOMAINS) {
    if (text.toLowerCase().includes(domain)) {
      return { hasPaper: true, domain };
    }
  }

  // Check embed for external links
  if (embed && 'external' in embed) {
    const external = embed as AppBskyEmbedExternal.View;
    const uri = external.external?.uri?.toLowerCase() || '';
    for (const domain of PAPER_DOMAINS) {
      if (uri.includes(domain)) {
        return { hasPaper: true, domain };
      }
    }
  }

  return { hasPaper: false };
}

function PaperIndicator({ domain }: { domain?: string }) {
  const label = domain?.includes('arxiv') ? 'arXiv' :
                domain?.includes('doi.org') ? 'DOI' :
                domain?.includes('semanticscholar') ? 'S2' :
                domain?.includes('biorxiv') ? 'bioRxiv' :
                domain?.includes('medrxiv') ? 'medRxiv' :
                'Paper';

  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full">
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      {label}
    </span>
  );
}

function VerifiedBadge() {
  return (
    <span
      className="inline-flex items-center justify-center w-4 h-4 bg-emerald-500 rounded-full flex-shrink-0"
      title="Verified Researcher"
    >
      <svg
        className="w-2.5 h-2.5 text-white"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
    </span>
  );
}

export default function Post({ post, onReply }: PostProps & { onReply?: () => void }) {
  const { settings } = useSettings();
  const [showReplyComposer, setShowReplyComposer] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // Like state
  const [isLiked, setIsLiked] = useState(!!post.viewer?.like);
  const [likeUri, setLikeUri] = useState<string | undefined>(post.viewer?.like);
  const [likeCount, setLikeCount] = useState(post.likeCount || 0);
  const [liking, setLiking] = useState(false);

  // Repost state
  const [isReposted, setIsReposted] = useState(!!post.viewer?.repost);
  const [repostUri, setRepostUri] = useState<string | undefined>(post.viewer?.repost);
  const [repostCount, setRepostCount] = useState(post.repostCount || 0);
  const [reposting, setReposting] = useState(false);

  // Quote state
  const [showQuoteComposer, setShowQuoteComposer] = useState(false);
  const [quoteText, setQuoteText] = useState('');
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const record = post.record as AppBskyFeedPost.Record;
  const author = post.author;
  const isVerified = isVerifiedResearcher(author.labels as Label[] | undefined);
  const { hasPaper, domain } = containsPaperLink(record.text, post.embed);

  const handleLike = async () => {
    if (liking) return;
    setLiking(true);
    try {
      if (isLiked && likeUri) {
        await unlikePost(likeUri);
        setIsLiked(false);
        setLikeUri(undefined);
        setLikeCount((c) => Math.max(0, c - 1));
      } else {
        const result = await likePost(post.uri, post.cid);
        setIsLiked(true);
        setLikeUri(result.uri);
        setLikeCount((c) => c + 1);
      }
    } catch (err) {
      console.error('Failed to like/unlike:', err);
    } finally {
      setLiking(false);
    }
  };

  const handleRepost = async () => {
    if (reposting) return;
    setReposting(true);
    try {
      if (isReposted && repostUri) {
        await deleteRepost(repostUri);
        setIsReposted(false);
        setRepostUri(undefined);
        setRepostCount((c) => Math.max(0, c - 1));
      } else {
        const result = await repost(post.uri, post.cid);
        setIsReposted(true);
        setRepostUri(result.uri);
        setRepostCount((c) => c + 1);
      }
    } catch (err) {
      console.error('Failed to repost/unrepost:', err);
    } finally {
      setReposting(false);
    }
  };

  const handleQuote = async () => {
    if (!quoteText.trim() || quoting) return;

    try {
      setQuoting(true);
      setQuoteError(null);

      const quoteRef: QuoteRef = {
        uri: post.uri,
        cid: post.cid,
      };

      await createPost(
        quoteText,
        settings.autoThreadgate ? settings.threadgateType : 'open',
        undefined,
        quoteRef
      );

      setQuoteText('');
      setShowQuoteComposer(false);
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : 'Failed to quote');
    } finally {
      setQuoting(false);
    }
  };

  const handleReply = async () => {
    if (!replyText.trim() || replying) return;

    try {
      setReplying(true);
      setReplyError(null);

      // For replies, we need root and parent
      // If this post is already a reply, use its root; otherwise this post is the root
      const existingReply = record.reply as ReplyRef | undefined;
      const replyRef: ReplyRef = {
        root: existingReply?.root || { uri: post.uri, cid: post.cid },
        parent: { uri: post.uri, cid: post.cid },
      };

      await createPost(
        replyText,
        settings.autoThreadgate ? settings.threadgateType : 'open',
        replyRef
      );

      setReplyText('');
      setShowReplyComposer(false);
      onReply?.();
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'Failed to reply');
    } finally {
      setReplying(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
  };

  // Dim non-verified if setting enabled
  const dimmed = settings.dimNonVerified && !isVerified;

  return (
    <article className={`border-b border-gray-200 dark:border-gray-800 p-4 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors ${dimmed ? 'opacity-60' : ''}`}>
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="flex-shrink-0 relative">
          {author.avatar ? (
            <img
              src={author.avatar}
              alt={author.displayName || author.handle}
              className="w-12 h-12 rounded-full"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
              {(author.displayName || author.handle)[0].toUpperCase()}
            </div>
          )}
          {/* Badge on avatar */}
          {isVerified && (
            <div className="absolute -bottom-1 -right-1">
              <VerifiedBadge />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-1 text-sm flex-wrap">
            <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">
              {author.displayName || author.handle}
            </span>
            {isVerified && (
              <span className="text-emerald-500 text-xs font-medium px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 rounded">
                Researcher
              </span>
            )}
            <span className="text-gray-500 truncate">@{author.handle}</span>
            <span className="text-gray-500">·</span>
            <span className="text-gray-500">{formatDate(record.createdAt)}</span>
            {/* Paper indicator */}
            {hasPaper && settings.showPaperHighlights && (
              <PaperIndicator domain={domain} />
            )}
          </div>

          {/* Post text */}
          <p className="mt-1 text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
            {record.text}
          </p>

          {/* Engagement actions */}
          <div className="flex gap-4 mt-3 text-sm text-gray-500">
            {/* Reply button */}
            <button
              onClick={() => setShowReplyComposer(!showReplyComposer)}
              className="flex items-center gap-1 hover:text-blue-500 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {post.replyCount || 0}
            </button>

            {/* Repost button */}
            <button
              onClick={handleRepost}
              disabled={reposting}
              className={`flex items-center gap-1 transition-colors ${
                isReposted
                  ? 'text-green-500 hover:text-green-600'
                  : 'hover:text-green-500'
              } ${reposting ? 'opacity-50' : ''}`}
              title="Repost"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {repostCount}
            </button>

            {/* Quote button */}
            <button
              onClick={() => setShowQuoteComposer(!showQuoteComposer)}
              className="flex items-center gap-1 hover:text-blue-500 transition-colors"
              title="Quote post"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </button>

            {/* Like button */}
            <button
              onClick={handleLike}
              disabled={liking}
              className={`flex items-center gap-1 transition-colors ${
                isLiked
                  ? 'text-red-500 hover:text-red-600'
                  : 'hover:text-red-500'
              } ${liking ? 'opacity-50' : ''}`}
            >
              <svg
                className="w-4 h-4"
                fill={isLiked ? 'currentColor' : 'none'}
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              {likeCount}
            </button>
          </div>

          {/* Reply composer */}
          {showReplyComposer && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={`Reply to @${author.handle}...`}
                className="w-full p-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                rows={3}
                disabled={replying}
              />
              {replyError && (
                <p className="mt-1 text-xs text-red-500">{replyError}</p>
              )}
              <div className="flex justify-between items-center mt-2">
                <span className={`text-xs ${replyText.length > 300 ? 'text-red-500' : 'text-gray-400'}`}>
                  {replyText.length}/300
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowReplyComposer(false);
                      setReplyText('');
                      setReplyError(null);
                    }}
                    className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReply}
                    disabled={!replyText.trim() || replying || replyText.length > 300}
                    className="px-3 py-1 text-sm bg-blue-500 text-white rounded-full hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {replying ? 'Posting...' : 'Reply'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Quote composer */}
          {showQuoteComposer && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
              <textarea
                value={quoteText}
                onChange={(e) => setQuoteText(e.target.value)}
                placeholder="Add your thoughts..."
                className="w-full p-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                rows={3}
                disabled={quoting}
              />
              {/* Preview of quoted post */}
              <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-xs">
                <div className="flex items-center gap-1 text-gray-500">
                  <span className="font-medium text-gray-700 dark:text-gray-300">@{author.handle}</span>
                </div>
                <p className="mt-1 text-gray-600 dark:text-gray-400 line-clamp-2">{record.text}</p>
              </div>
              {quoteError && (
                <p className="mt-1 text-xs text-red-500">{quoteError}</p>
              )}
              <div className="flex justify-between items-center mt-2">
                <span className={`text-xs ${quoteText.length > 300 ? 'text-red-500' : 'text-gray-400'}`}>
                  {quoteText.length}/300
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowQuoteComposer(false);
                      setQuoteText('');
                      setQuoteError(null);
                    }}
                    className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleQuote}
                    disabled={!quoteText.trim() || quoting || quoteText.length > 300}
                    className="px-3 py-1 text-sm bg-blue-500 text-white rounded-full hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {quoting ? 'Posting...' : 'Quote'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
