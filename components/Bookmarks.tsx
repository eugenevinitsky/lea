'use client';

import { useBookmarks, BookmarkedPost } from '@/lib/bookmarks';

interface BookmarksProps {
  onOpenPost?: (uri: string) => void;
}

function formatDate(dateString: string) {
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
}

function BookmarkItem({ bookmark, onRemove, onOpen }: {
  bookmark: BookmarkedPost;
  onRemove: () => void;
  onOpen?: () => void;
}) {
  return (
    <div
      className="p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 cursor-pointer group"
      onClick={onOpen}
    >
      <div className="flex items-start gap-2">
        {bookmark.authorAvatar ? (
          <img
            src={bookmark.authorAvatar}
            alt={bookmark.authorHandle}
            className="w-8 h-8 rounded-full flex-shrink-0"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {(bookmark.authorDisplayName || bookmark.authorHandle)[0].toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-xs">
            <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
              {bookmark.authorDisplayName || bookmark.authorHandle}
            </span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-400">{formatDate(bookmark.createdAt)}</span>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mt-0.5">
            {bookmark.text}
          </p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-opacity"
          title="Remove bookmark"
        >
          <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function Bookmarks({ onOpenPost }: BookmarksProps) {
  const { bookmarks, removeBookmark } = useBookmarks();

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="p-3 border-b border-gray-200 dark:border-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          Bookmarks
          {bookmarks.length > 0 && (
            <span className="text-xs font-normal text-gray-400">({bookmarks.length})</span>
          )}
        </h3>
      </div>

      <div className="max-h-[400px] overflow-y-auto">
        {bookmarks.length === 0 ? (
          <div className="p-4 text-center">
            <svg className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <p className="text-xs text-gray-400">No bookmarks yet</p>
            <p className="text-xs text-gray-400 mt-1">Click the bookmark icon on posts to save them</p>
          </div>
        ) : (
          bookmarks.map((bookmark) => (
            <BookmarkItem
              key={bookmark.uri}
              bookmark={bookmark}
              onRemove={() => removeBookmark(bookmark.uri)}
              onOpen={() => onOpenPost?.(bookmark.uri)}
            />
          ))
        )}
      </div>
    </div>
  );
}
