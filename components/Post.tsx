'use client';

import { AppBskyFeedDefs, AppBskyFeedPost } from '@atproto/api';

interface PostProps {
  post: AppBskyFeedDefs.PostView;
}

export default function Post({ post }: PostProps) {
  const record = post.record as AppBskyFeedPost.Record;
  const author = post.author;

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

  return (
    <article className="border-b border-gray-200 dark:border-gray-800 p-4 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="flex-shrink-0">
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
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-1 text-sm">
            <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">
              {author.displayName || author.handle}
            </span>
            <span className="text-gray-500 truncate">@{author.handle}</span>
            <span className="text-gray-500">·</span>
            <span className="text-gray-500">{formatDate(record.createdAt)}</span>
          </div>

          {/* Post text */}
          <p className="mt-1 text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
            {record.text}
          </p>

          {/* Engagement stats */}
          <div className="flex gap-6 mt-3 text-sm text-gray-500">
            <span>{post.replyCount || 0} replies</span>
            <span>{post.repostCount || 0} reposts</span>
            <span>{post.likeCount || 0} likes</span>
          </div>
        </div>
      </div>
    </article>
  );
}
