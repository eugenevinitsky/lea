'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  fetchNotifications,
  groupNotifications,
  countUnread,
  getLastViewedTimestamps,
  markCategoryViewed,
  updateSeenNotifications,
  NotificationItem,
  GroupedNotifications,
} from '@/lib/notifications';

interface NotificationsProps {
  onOpenPost?: (uri: string) => void;
  onOpenProfile?: (did: string) => void;
}

function formatTime(dateString: string) {
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

// Notification item component
function NotificationItemView({
  notification,
  onOpenPost,
  onOpenProfile,
}: {
  notification: NotificationItem;
  onOpenPost?: (uri: string) => void;
  onOpenProfile?: (did: string) => void;
}) {
  const handleClick = () => {
    // For likes/reposts, open the post that was liked/reposted
    if (notification.reasonSubject) {
      onOpenPost?.(notification.reasonSubject);
    } else {
      // For replies/quotes, open the notification itself (which is the reply/quote post)
      onOpenPost?.(notification.uri);
    }
  };

  return (
    <div
      className="p-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer group"
      onClick={handleClick}
    >
      <div className="flex items-start gap-2">
        {notification.author.avatar ? (
          <img
            src={notification.author.avatar}
            alt={notification.author.handle}
            className="w-7 h-7 rounded-full flex-shrink-0 hover:ring-2 hover:ring-blue-400 transition-all"
            onClick={(e) => {
              e.stopPropagation();
              onOpenProfile?.(notification.author.did);
            }}
            title="View profile"
          />
        ) : (
          <div
            className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 hover:ring-2 hover:ring-blue-400 transition-all"
            onClick={(e) => {
              e.stopPropagation();
              onOpenProfile?.(notification.author.did);
            }}
            title="View profile"
          >
            {(notification.author.displayName || notification.author.handle)[0].toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-xs">
            <span
              className="font-medium text-gray-900 dark:text-gray-100 truncate hover:text-blue-500 hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                onOpenProfile?.(notification.author.did);
              }}
              title="View profile"
            >
              {notification.author.displayName || notification.author.handle}
            </span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-400">{formatTime(notification.indexedAt)}</span>
          </div>
          {/* Show preview text for replies/quotes */}
          {notification.record?.text && (
            <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mt-0.5">
              {notification.record.text}
            </p>
          )}
          {/* Show subject post text for likes/reposts */}
          {notification.subjectText && (
            <p className="text-xs text-gray-500 dark:text-gray-500 line-clamp-2 mt-0.5 italic">
              &ldquo;{notification.subjectText}&rdquo;
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Category section component
function CategorySection({
  title,
  icon,
  notifications,
  unreadCount,
  isExpanded,
  onToggle,
  onLoadMore,
  hasMore,
  loading,
  colors,
  onOpenPost,
  onOpenProfile,
}: {
  title: string;
  icon: React.ReactNode;
  notifications: NotificationItem[];
  unreadCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  onLoadMore: () => void;
  hasMore: boolean;
  loading: boolean;
  colors: {
    bg: string;
    border: string;
    text: string;
    icon: string;
    hover: string;
    badge: string;
  };
  onOpenPost?: (uri: string) => void;
  onOpenProfile?: (did: string) => void;
}) {
  if (notifications.length === 0) return null;

  return (
    <div className={`border-l-4 ${colors.border}`}>
      {/* Collapsible header */}
      <button
        onClick={onToggle}
        className={`w-full px-3 py-2 flex items-center justify-between ${colors.bg} ${colors.hover} transition-colors`}
      >
        <div className="flex items-center gap-2">
          <span className={colors.icon}>{icon}</span>
          <h4 className={`text-xs font-medium ${colors.text}`}>{title}</h4>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${colors.badge}`}>
            {notifications.length}
          </span>
          {unreadCount > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
          )}
        </div>
        <svg
          className={`w-3.5 h-3.5 ${colors.icon} transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Items (collapsible) */}
      {isExpanded && (
        <div className="max-h-[200px] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
          {notifications.map((n) => (
            <NotificationItemView
              key={n.uri}
              notification={n}
              onOpenPost={onOpenPost}
              onOpenProfile={onOpenProfile}
            />
          ))}
          {hasMore && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onLoadMore();
              }}
              disabled={loading}
              className="w-full py-2 text-xs text-blue-500 hover:text-blue-600 hover:bg-gray-50 dark:hover:bg-gray-800/50 disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Notifications({ onOpenPost, onOpenProfile }: NotificationsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [grouped, setGrouped] = useState<GroupedNotifications>({
    likes: [],
    reposts: [],
    quotes: [],
    replies: [],
  });
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [lastViewed, setLastViewed] = useState(getLastViewedTimestamps());
  const [unreadCounts, setUnreadCounts] = useState({ likes: 0, reposts: 0, quotes: 0, replies: 0, total: 0 });

  // Track which categories are expanded
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Fetch notifications
  const fetchData = useCallback(async (loadMore = false) => {
    try {
      if (loadMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const result = await fetchNotifications(loadMore ? cursor : undefined);
      const newGrouped = groupNotifications(result.notifications);

      if (loadMore) {
        // Append to existing
        setGrouped((prev) => ({
          likes: [...prev.likes, ...newGrouped.likes],
          reposts: [...prev.reposts, ...newGrouped.reposts],
          quotes: [...prev.quotes, ...newGrouped.quotes],
          replies: [...prev.replies, ...newGrouped.replies],
        }));
      } else {
        setGrouped(newGrouped);
      }

      setCursor(result.cursor);

      // Update unread counts
      const timestamps = getLastViewedTimestamps();
      setLastViewed(timestamps);
      const mergedGrouped = loadMore
        ? {
            likes: [...grouped.likes, ...newGrouped.likes],
            reposts: [...grouped.reposts, ...newGrouped.reposts],
            quotes: [...grouped.quotes, ...newGrouped.quotes],
            replies: [...grouped.replies, ...newGrouped.replies],
          }
        : newGrouped;
      setUnreadCounts(countUnread(mergedGrouped, timestamps));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [cursor, grouped]);

  // Initial fetch and periodic refresh
  useEffect(() => {
    fetchData();

    // Refresh every 60 seconds
    const interval = setInterval(() => {
      if (!loadingMore) fetchData();
    }, 60000);

    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update seen notifications when panel is opened
  useEffect(() => {
    if (isExpanded) {
      updateSeenNotifications();
    }
  }, [isExpanded]);

  // Handle category toggle
  const handleCategoryToggle = (category: 'likes' | 'reposts' | 'quotes' | 'replies') => {
    setExpandedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
        // Mark as viewed when expanding
        markCategoryViewed(category);
        // Update local state
        const newLastViewed = getLastViewedTimestamps();
        setLastViewed(newLastViewed);
        setUnreadCounts(countUnread(grouped, newLastViewed));
      }
      return newSet;
    });
  };

  // Category configurations
  const categories = [
    {
      key: 'likes' as const,
      title: 'Likes',
      items: grouped.likes,
      unread: unreadCounts.likes,
      colors: {
        bg: 'bg-rose-50 dark:bg-rose-900/20',
        border: 'border-l-rose-400',
        text: 'text-rose-700 dark:text-rose-300',
        icon: 'text-rose-500',
        hover: 'hover:bg-rose-100 dark:hover:bg-rose-900/30',
        badge: 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400',
      },
      icon: (
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      ),
    },
    {
      key: 'reposts' as const,
      title: 'Reposts',
      items: grouped.reposts,
      unread: unreadCounts.reposts,
      colors: {
        bg: 'bg-emerald-50 dark:bg-emerald-900/20',
        border: 'border-l-emerald-400',
        text: 'text-emerald-700 dark:text-emerald-300',
        icon: 'text-emerald-500',
        hover: 'hover:bg-emerald-100 dark:hover:bg-emerald-900/30',
        badge: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
      },
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ),
    },
    {
      key: 'quotes' as const,
      title: 'Quotes',
      items: grouped.quotes,
      unread: unreadCounts.quotes,
      colors: {
        bg: 'bg-purple-50 dark:bg-purple-900/20',
        border: 'border-l-purple-400',
        text: 'text-purple-700 dark:text-purple-300',
        icon: 'text-purple-500',
        hover: 'hover:bg-purple-100 dark:hover:bg-purple-900/30',
        badge: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
      },
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      ),
    },
    {
      key: 'replies' as const,
      title: 'Replies',
      items: grouped.replies,
      unread: unreadCounts.replies,
      colors: {
        bg: 'bg-blue-50 dark:bg-blue-900/20',
        border: 'border-l-blue-400',
        text: 'text-blue-700 dark:text-blue-300',
        icon: 'text-blue-500',
        hover: 'hover:bg-blue-100 dark:hover:bg-blue-900/30',
        badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
      },
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
        </svg>
      ),
    },
  ];

  const totalNotifications = grouped.likes.length + grouped.reposts.length + grouped.quotes.length + grouped.replies.length;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <span className="font-semibold text-gray-900 dark:text-gray-100">Notifications</span>
          {unreadCounts.total > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-bold bg-amber-500 text-white rounded-full">
              {unreadCounts.total > 99 ? '99+' : unreadCounts.total}
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-gray-200 dark:border-gray-800">
          {error && (
            <div className="p-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full" />
            </div>
          ) : totalNotifications === 0 ? (
            <div className="p-4 text-center">
              <svg className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <p className="text-xs text-gray-400">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {categories.map((cat) => (
                <CategorySection
                  key={cat.key}
                  title={cat.title}
                  icon={cat.icon}
                  notifications={cat.items}
                  unreadCount={cat.unread}
                  isExpanded={expandedCategories.has(cat.key)}
                  onToggle={() => handleCategoryToggle(cat.key)}
                  onLoadMore={() => fetchData(true)}
                  hasMore={!!cursor}
                  loading={loadingMore}
                  colors={cat.colors}
                  onOpenPost={onOpenPost}
                  onOpenProfile={onOpenProfile}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
