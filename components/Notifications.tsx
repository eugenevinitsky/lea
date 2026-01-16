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
import { useSettings, LeaSettings } from '@/lib/settings';
import ProfileHoverCard from './ProfileHoverCard';

interface NotificationsProps {
  onOpenPost?: (uri: string) => void;
  onOpenProfile?: (did: string) => void;
  embedded?: boolean;
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

// Helper to compute avatar ring class
function getAvatarRingClass(viewer: NotificationItem['author']['viewer'], settings: LeaSettings): string {
  if (!viewer) return '';
  const isMutual = viewer.following && viewer.followedBy;
  const following = !!viewer.following;
  const followedBy = !!viewer.followedBy;

  if (isMutual && settings.showMutualRing) {
    return 'ring-[3px] ring-purple-400 dark:ring-purple-400/60 shadow-[0_0_8px_rgba(192,132,252,0.5)] dark:shadow-[0_0_8px_rgba(167,139,250,0.4)]';
  }
  if (following && settings.showFollowingRing) {
    return 'ring-[3px] ring-blue-300 dark:ring-blue-400/60 shadow-[0_0_8px_rgba(147,197,253,0.5)] dark:shadow-[0_0_8px_rgba(96,165,250,0.4)]';
  }
  if (followedBy && settings.showFollowerRing) {
    return 'ring-[3px] ring-yellow-400 dark:ring-yellow-400/60 shadow-[0_0_8px_rgba(250,204,21,0.5)] dark:shadow-[0_0_8px_rgba(250,204,21,0.4)]';
  }
  return '';
}

// Notification item component
function NotificationItemView({
  notification,
  onOpenPost,
  onOpenProfile,
  settings,
}: {
  notification: NotificationItem;
  onOpenPost?: (uri: string) => void;
  onOpenProfile?: (did: string) => void;
  settings: LeaSettings;
}) {
  const handleClick = () => {
    // For follows, open the follower's profile
    if (notification.reason === 'follow') {
      onOpenProfile?.(notification.author.did);
      return;
    }
    // For replies/quotes/mentions, open the reply/quote itself (not the parent)
    if (notification.reason === 'reply' || notification.reason === 'quote' || notification.reason === 'mention') {
      onOpenPost?.(notification.uri);
      return;
    }
    // For likes/reposts, open the post that was liked/reposted
    if (notification.reasonSubject) {
      onOpenPost?.(notification.reasonSubject);
    } else {
      onOpenPost?.(notification.uri);
    }
  };

  const avatarRingClass = getAvatarRingClass(notification.author.viewer, settings);

  return (
    <div
      className="p-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer group"
      onClick={handleClick}
    >
      <div className="flex items-start gap-2">
        <ProfileHoverCard
          did={notification.author.did}
          handle={notification.author.handle}
          onOpenProfile={() => onOpenProfile?.(notification.author.did)}
        >
          {notification.author.avatar ? (
            <img
              src={notification.author.avatar}
              alt={notification.author.handle}
              className={`w-7 h-7 rounded-full flex-shrink-0 transition-all cursor-pointer ${avatarRingClass || 'hover:ring-2 hover:ring-blue-400'}`}
              onClick={(e) => {
                e.stopPropagation();
                onOpenProfile?.(notification.author.did);
              }}
            />
          ) : (
            <div
              className={`w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 transition-all cursor-pointer ${avatarRingClass || 'hover:ring-2 hover:ring-blue-400'}`}
              onClick={(e) => {
                e.stopPropagation();
                onOpenProfile?.(notification.author.did);
              }}
            >
              {(notification.author.displayName || notification.author.handle)[0].toUpperCase()}
            </div>
          )}
        </ProfileHoverCard>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-xs">
            <ProfileHoverCard
              did={notification.author.did}
              handle={notification.author.handle}
              onOpenProfile={() => onOpenProfile?.(notification.author.did)}
            >
              <span
                className="font-medium text-gray-900 dark:text-gray-100 truncate hover:text-blue-500 hover:underline cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenProfile?.(notification.author.did);
                }}
              >
                {notification.author.displayName || notification.author.handle}
              </span>
            </ProfileHoverCard>
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
  enabled,
  onToggleEnabled,
  settings,
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
  enabled: boolean;
  onToggleEnabled: () => void;
  settings: LeaSettings;
}) {
  const isEmpty = notifications.length === 0;

  return (
    <div className={`border-l-4 ${colors.border} ${isEmpty ? 'opacity-50' : ''}`}>
      {/* Collapsible header */}
      <div
        className={`w-full px-3 py-2 flex items-center justify-between ${colors.bg} ${isEmpty ? '' : colors.hover} transition-colors`}
      >
        <button
          onClick={isEmpty ? undefined : onToggle}
          className={`flex items-center gap-2 flex-1 ${isEmpty ? 'cursor-default' : 'cursor-pointer'}`}
          disabled={isEmpty}
        >
          <span className={colors.icon}>{icon}</span>
          <h4 className={`text-xs font-medium ${colors.text}`}>{title}</h4>
          {/* Show unread count badge regardless of enabled state (so user can see what they're missing) */}
          {unreadCount > 0 && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${colors.badge} ${!enabled ? 'opacity-50' : ''}`}>
              {unreadCount}
            </span>
          )}
          {/* Chevron - inside button so clicking it expands/collapses */}
          {!isEmpty && (
            <svg
              className={`w-3.5 h-3.5 ${colors.icon} transition-transform ml-auto ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </button>
        <div className="flex items-center gap-1">
          {/* Toggle button - controls whether unread notifications are shown */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleEnabled();
            }}
            className={`p-1 rounded transition-colors ${
              enabled
                ? 'text-gray-400 hover:text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700'
                : 'text-gray-300 hover:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
            title={enabled ? 'Disable notifications' : 'Enable notifications'}
          >
            {enabled ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Items (collapsible) */}
      {isExpanded && notifications.length > 0 && (
        <div className="max-h-[200px] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
          {notifications.map((n) => (
            <NotificationItemView
              key={n.uri}
              notification={n}
              onOpenPost={onOpenPost}
              onOpenProfile={onOpenProfile}
              settings={settings}
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

export default function Notifications({ onOpenPost, onOpenProfile, embedded = false }: NotificationsProps) {
  const { settings, updateSettings } = useSettings();
  const [isExpanded, setIsExpanded] = useState(embedded);
  const [grouped, setGrouped] = useState<GroupedNotifications>({
    likes: [],
    reposts: [],
    quotes: [],
    replies: [],
    follows: [],
    mentions: [],
  });
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [lastViewed, setLastViewed] = useState(getLastViewedTimestamps());
  const [unreadCounts, setUnreadCounts] = useState({ likes: 0, reposts: 0, quotes: 0, replies: 0, follows: 0, mentions: 0, total: 0 });

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
          follows: [...prev.follows, ...newGrouped.follows],
          mentions: [...prev.mentions, ...newGrouped.mentions],
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
            follows: [...grouped.follows, ...newGrouped.follows],
            mentions: [...grouped.mentions, ...newGrouped.mentions],
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
  const handleCategoryToggle = (category: 'likes' | 'reposts' | 'quotes' | 'replies' | 'follows' | 'mentions') => {
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
  // Order: Quotes, Mentions, Replies, Reposts, Likes, Follows
  const categories = [
    {
      key: 'quotes' as const,
      settingKey: 'notifyQuotes' as const,
      title: 'Quotes',
      items: grouped.quotes,
      unread: unreadCounts.quotes,
      enabled: settings.notifyQuotes,
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
      key: 'mentions' as const,
      settingKey: 'notifyMentions' as const,
      title: 'Mentions',
      items: grouped.mentions,
      unread: unreadCounts.mentions,
      enabled: settings.notifyMentions,
      colors: {
        bg: 'bg-cyan-50 dark:bg-cyan-900/20',
        border: 'border-l-cyan-400',
        text: 'text-cyan-700 dark:text-cyan-300',
        icon: 'text-cyan-500',
        hover: 'hover:bg-cyan-100 dark:hover:bg-cyan-900/30',
        badge: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400',
      },
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
        </svg>
      ),
    },
    {
      key: 'replies' as const,
      settingKey: 'notifyReplies' as const,
      title: 'Replies',
      items: grouped.replies,
      unread: unreadCounts.replies,
      enabled: settings.notifyReplies,
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
    {
      key: 'reposts' as const,
      settingKey: 'notifyReposts' as const,
      title: 'Reposts',
      items: grouped.reposts,
      unread: unreadCounts.reposts,
      enabled: settings.notifyReposts,
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
      key: 'likes' as const,
      settingKey: 'notifyLikes' as const,
      title: 'Likes',
      items: grouped.likes,
      unread: unreadCounts.likes,
      enabled: settings.notifyLikes,
      colors: {
        bg: 'bg-pink-50 dark:bg-pink-900/20',
        border: 'border-l-pink-300',
        text: 'text-pink-600 dark:text-pink-300',
        icon: 'text-pink-400',
        hover: 'hover:bg-pink-100 dark:hover:bg-pink-900/30',
        badge: 'bg-pink-100 dark:bg-pink-900/30 text-pink-500 dark:text-pink-400',
      },
      icon: (
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      ),
    },
    {
      key: 'follows' as const,
      settingKey: 'notifyFollows' as const,
      title: 'Follows',
      items: grouped.follows,
      unread: unreadCounts.follows,
      enabled: settings.notifyFollows,
      colors: {
        bg: 'bg-amber-50 dark:bg-amber-900/20',
        border: 'border-l-amber-400',
        text: 'text-amber-700 dark:text-amber-300',
        icon: 'text-amber-500',
        hover: 'hover:bg-amber-100 dark:hover:bg-amber-900/30',
        badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
      },
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
      ),
    },
  ];

  const totalNotifications = grouped.likes.length + grouped.reposts.length + grouped.quotes.length + grouped.replies.length + grouped.follows.length + grouped.mentions.length;

  // Only count unread for enabled categories
  const enabledUnreadTotal =
    (settings.notifyLikes ? unreadCounts.likes : 0) +
    (settings.notifyReposts ? unreadCounts.reposts : 0) +
    (settings.notifyQuotes ? unreadCounts.quotes : 0) +
    (settings.notifyReplies ? unreadCounts.replies : 0) +
    (settings.notifyFollows ? unreadCounts.follows : 0) +
    (settings.notifyMentions ? unreadCounts.mentions : 0);

  return (
    <div className={`bg-white dark:bg-gray-900 overflow-hidden ${embedded ? '' : 'rounded-xl border border-gray-200 dark:border-gray-800'}`}>
      {/* Header - always visible, hidden when embedded */}
      {!embedded && (
        <div className="p-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              Notifications
              {enabledUnreadTotal > 0 && (
                <span className="px-1.5 py-0.5 text-xs font-bold bg-amber-500 text-white rounded-full">
                  {enabledUnreadTotal > 99 ? '99+' : enabledUnreadTotal}
                </span>
              )}
            </h3>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? '' : 'rotate-180'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <a
            href="/notifications"
            className="p-1.5 text-gray-400 hover:text-amber-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
            title="Open notifications dashboard"
            onClick={(e) => e.stopPropagation()}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div>
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
            <>
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
                    enabled={cat.enabled}
                    onToggleEnabled={() => updateSettings({ [cat.settingKey]: !cat.enabled })}
                    settings={settings}
                  />
                ))}
              </div>
              {/* Explore link */}
              <a
                href="/notifications"
                className="flex items-center justify-center gap-2 p-2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border-t border-gray-200 dark:border-gray-800"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Explore Notifications
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
