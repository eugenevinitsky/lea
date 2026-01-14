'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { restoreSession, getSession, getBlueskyProfile, checkSafetyAlerts, dismissSafetyAlert, SafetyAlert, AlertThresholds, followUser, unfollowUser, isVerifiedResearcher, Label, buildProfileUrl, checkVerificationStatus, blockUser, getKnownFollowers, BlueskyProfile, getMyRecentPostsAndReplies } from '@/lib/bluesky';
import { AppBskyFeedDefs } from '@atproto/api';
import { useFollowing } from '@/lib/following-context';
import { SettingsProvider } from '@/lib/settings';
import { BookmarksProvider, useBookmarks } from '@/lib/bookmarks';
import { FeedsProvider } from '@/lib/feeds';
import { FollowingProvider } from '@/lib/following-context';
import {
  fetchNotifications,
  groupNotifications,
  NotificationItem,
  GroupedNotifications,
} from '@/lib/notifications';
import Login from '@/components/Login';
import Bookmarks from '@/components/Bookmarks';
import DMSidebar from '@/components/DMSidebar';
import Notifications from '@/components/Notifications';
import ModerationBox from '@/components/ModerationBox';
import SafetyPanel from '@/components/SafetyPanel';
import ResearcherSearch from '@/components/ResearcherSearch';
import ProfileHoverCard from '@/components/ProfileHoverCard';
import ProfileLabels from '@/components/ProfileLabels';

// Storage key for pane order
const PANE_ORDER_KEY = 'lea-dashboard-pane-order';

// Default pane order
const DEFAULT_LEFT_PANES = ['new-followers', 'my-posts'];
const DEFAULT_RIGHT_PANES = ['alerts', 'breakdown', 'top-interactors'];

// Load pane order from localStorage
function loadPaneOrder(): { left: string[]; right: string[] } {
  if (typeof window === 'undefined') {
    return { left: DEFAULT_LEFT_PANES, right: DEFAULT_RIGHT_PANES };
  }
  try {
    const saved = localStorage.getItem(PANE_ORDER_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Validate that all panes are present
      const allLeft = new Set(DEFAULT_LEFT_PANES);
      const allRight = new Set(DEFAULT_RIGHT_PANES);
      const hasAllLeft = parsed.left?.length === allLeft.size && parsed.left.every((p: string) => allLeft.has(p));
      const hasAllRight = parsed.right?.length === allRight.size && parsed.right.every((p: string) => allRight.has(p));
      if (hasAllLeft && hasAllRight) {
        return parsed;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return { left: DEFAULT_LEFT_PANES, right: DEFAULT_RIGHT_PANES };
}

// Save pane order to localStorage
function savePaneOrder(order: { left: string[]; right: string[] }) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PANE_ORDER_KEY, JSON.stringify(order));
}

// Draggable pane wrapper with drag handle
function DraggablePane({
  id,
  children,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
  isDropTarget,
}: {
  id: string;
  children: React.ReactNode;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDrop: (e: React.DragEvent, id: string) => void;
  isDragging: boolean;
  isDropTarget: boolean;
}) {
  return (
    <div
      className={`group relative transition-all duration-200 ${
        isDragging ? 'opacity-50 scale-[0.98]' : ''
      } ${
        isDropTarget ? 'ring-2 ring-blue-400 ring-offset-2 dark:ring-offset-gray-900' : ''
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(e, id);
      }}
      onDrop={(e) => onDrop(e, id)}
    >
      {/* Drag handle */}
      <div
        draggable
        onDragStart={(e) => onDragStart(e, id)}
        className="absolute top-3 right-3 z-10 p-1.5 rounded-md bg-gray-100/90 dark:bg-gray-800/90 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
        title="Drag to reorder"
      >
        <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
        </svg>
      </div>
      {children}
    </div>
  );
}

// Helper to format relative time
function formatTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// Alert icon helper
function getAlertIcon(type: SafetyAlert['type']) {
  switch (type) {
    case 'high_engagement':
      return (
        <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      );
    case 'big_account_repost':
      return (
        <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      );
    case 'big_account_quote':
      return (
        <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
      );
    case 'quote_going_viral':
      return (
        <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
        </svg>
      );
  }
}

// Alerts section component
function AlertsSection({
  onOpenPost,
  onOpenProfile,
}: {
  onOpenPost: (uri: string) => void;
  onOpenProfile: (did: string) => void;
}) {
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [thresholds] = useState<AlertThresholds>(() => {
    if (typeof window === 'undefined') return {};
    const saved = localStorage.getItem('lea-alert-thresholds');
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    loadAlerts();
  }, []);

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const newAlerts = await checkSafetyAlerts(thresholds);
      setAlerts(newAlerts);
    } catch (err) {
      console.error('Failed to load alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = (alertId: string) => {
    dismissSafetyAlert(alertId);
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-amber-50 dark:bg-amber-900/20 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          Safety Alerts
          {alerts.length > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full">
              {alerts.length}
            </span>
          )}
        </h3>
        <button
          onClick={loadAlerts}
          disabled={loading}
          className="p-1 text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 transition-colors disabled:opacity-50"
          title="Refresh alerts"
        >
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="p-6 text-center">
            <svg className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-gray-400">No alerts right now</p>
            <p className="text-xs text-gray-400 mt-1">We&apos;ll notify you when your posts get unusual attention</p>
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 group"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {getAlertIcon(alert.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {alert.message}
                  </p>
                  <p
                    className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 cursor-pointer hover:text-blue-500"
                    onClick={() => onOpenPost(alert.postUri)}
                  >
                    &ldquo;{alert.postText}&rdquo;
                  </p>
                  {alert.relatedAccount && (
                    <button
                      onClick={() => onOpenProfile(alert.relatedAccount!.did)}
                      className="mt-2 flex items-center gap-2 text-sm text-blue-500 hover:text-blue-600"
                    >
                      {alert.relatedAccount.avatar && (
                        <img
                          src={alert.relatedAccount.avatar}
                          alt=""
                          className="w-5 h-5 rounded-full"
                        />
                      )}
                      <span>View @{alert.relatedAccount.handle}</span>
                    </button>
                  )}
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      onClick={() => onOpenPost(alert.postUri)}
                      className="text-xs text-blue-500 hover:text-blue-600 hover:underline"
                    >
                      View post →
                    </button>
                    {alert.metrics && (
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        {alert.metrics.likes !== undefined && (
                          <span className="flex items-center gap-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                            </svg>
                            {alert.metrics.likes}
                          </span>
                        )}
                        {alert.metrics.reposts !== undefined && (
                          <span className="flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            {alert.metrics.reposts}
                          </span>
                        )}
                        {alert.metrics.replies !== undefined && (
                          <span className="flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                            </svg>
                            {alert.metrics.replies}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDismiss(alert.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-opacity"
                  title="Dismiss"
                >
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Category color configs
const CATEGORY_COLORS = {
  likes: {
    bg: 'bg-rose-50 dark:bg-rose-900/20',
    border: 'border-rose-400',
    text: 'text-rose-700 dark:text-rose-300',
    icon: 'text-rose-500',
    fill: 'fill-rose-500',
    bar: 'bg-rose-400',
  },
  reposts: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    border: 'border-emerald-400',
    text: 'text-emerald-700 dark:text-emerald-300',
    icon: 'text-emerald-500',
    fill: 'fill-emerald-500',
    bar: 'bg-emerald-400',
  },
  quotes: {
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    border: 'border-purple-400',
    text: 'text-purple-700 dark:text-purple-300',
    icon: 'text-purple-500',
    fill: 'fill-purple-500',
    bar: 'bg-purple-400',
  },
  replies: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-400',
    text: 'text-blue-700 dark:text-blue-300',
    icon: 'text-blue-500',
    fill: 'fill-blue-500',
    bar: 'bg-blue-400',
  },
  follows: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-400',
    text: 'text-amber-700 dark:text-amber-300',
    icon: 'text-amber-500',
    fill: 'fill-amber-500',
    bar: 'bg-amber-400',
  },
  mentions: {
    bg: 'bg-cyan-50 dark:bg-cyan-900/20',
    border: 'border-cyan-400',
    text: 'text-cyan-700 dark:text-cyan-300',
    icon: 'text-cyan-500',
    fill: 'fill-cyan-500',
    bar: 'bg-cyan-400',
  },
};

// Category icons
const CATEGORY_ICONS = {
  likes: (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  ),
  reposts: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  quotes: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
    </svg>
  ),
  replies: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
    </svg>
  ),
  follows: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
    </svg>
  ),
  mentions: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
    </svg>
  ),
};

// Top Interactors component
function TopInteractors({
  notifications,
  onOpenProfile,
}: {
  notifications: NotificationItem[];
  onOpenProfile: (did: string) => void;
}) {
  const interactors = useMemo(() => {
    const counts: Record<string, { author: NotificationItem['author']; count: number; types: Set<string> }> = {};
    
    for (const n of notifications) {
      if (!counts[n.author.did]) {
        counts[n.author.did] = { author: n.author, count: 0, types: new Set() };
      }
      counts[n.author.did].count++;
      counts[n.author.did].types.add(n.reason);
    }
    
    return Object.values(counts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [notifications]);

  const maxCount = interactors[0]?.count || 1;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
        <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        Top Interactors
      </h3>
      
      {interactors.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">No interactions yet</p>
      ) : (
        <div className="space-y-3">
          {interactors.map((item, index) => (
            <div key={item.author.did} className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-4">{index + 1}</span>
              <ProfileHoverCard
                did={item.author.did}
                handle={item.author.handle}
                onOpenProfile={() => onOpenProfile(item.author.did)}
              >
                {item.author.avatar ? (
                  <img
                    src={item.author.avatar}
                    alt=""
                    className="w-8 h-8 rounded-full cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all"
                    onClick={() => onOpenProfile(item.author.did)}
                  />
                ) : (
                  <div
                    className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all"
                    onClick={() => onOpenProfile(item.author.did)}
                  >
                    {(item.author.displayName || item.author.handle)[0].toUpperCase()}
                  </div>
                )}
              </ProfileHoverCard>
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate cursor-pointer hover:text-blue-500"
                  onClick={() => onOpenProfile(item.author.did)}
                >
                  {item.author.displayName || item.author.handle}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  {Array.from(item.types).map((type) => (
                    <span key={type} className={CATEGORY_COLORS[type as keyof typeof CATEGORY_COLORS]?.icon}>
                      {CATEGORY_ICONS[type as keyof typeof CATEGORY_ICONS]}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-20 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-400 rounded-full transition-all"
                    style={{ width: `${(item.count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-6 text-right">{item.count}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Category breakdown chart
function CategoryBreakdown({ grouped }: { grouped: GroupedNotifications }) {
  const categories = [
    { key: 'likes', label: 'Likes', count: grouped.likes.length },
    { key: 'reposts', label: 'Reposts', count: grouped.reposts.length },
    { key: 'quotes', label: 'Quotes', count: grouped.quotes.length },
    { key: 'replies', label: 'Replies', count: grouped.replies.length },
    { key: 'follows', label: 'Follows', count: grouped.follows.length },
    { key: 'mentions', label: 'Mentions', count: grouped.mentions.length },
  ];

  const total = categories.reduce((sum, c) => sum + c.count, 0);
  const maxCount = Math.max(...categories.map(c => c.count), 1);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
        <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        Activity Breakdown
        <span className="text-xs font-normal text-gray-400 ml-auto">{total} total</span>
      </h3>
      
      <div className="space-y-3">
        {categories.map((cat) => {
          const colors = CATEGORY_COLORS[cat.key as keyof typeof CATEGORY_COLORS];
          const percentage = total > 0 ? Math.round((cat.count / total) * 100) : 0;
          
          return (
            <div key={cat.key} className="flex items-center gap-3">
              <span className={`${colors.icon} w-5`}>
                {CATEGORY_ICONS[cat.key as keyof typeof CATEGORY_ICONS]}
              </span>
              <span className="text-xs text-gray-600 dark:text-gray-400 w-16">{cat.label}</span>
              <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full ${colors.bar} rounded-full transition-all duration-500`}
                  style={{ width: `${(cat.count / maxCount) * 100}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 w-12 text-right">
                {cat.count} <span className="text-gray-400">({percentage}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Activity item for a single interaction on a post
interface PostActivity {
  type: 'like' | 'repost' | 'reply' | 'quote' | 'mention';
  author: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  text?: string; // For replies/quotes
  uri?: string; // URI of the reply/quote post
  indexedAt: string;
}

// Aggregated post with its activity
interface PostWithActivity {
  post: AppBskyFeedDefs.PostView;
  activity: PostActivity[];
  latestActivityAt: string;
  totalEngagement: number;
}

// Activity type colors and icons
const ACTIVITY_STYLES = {
  like: {
    color: 'text-rose-500',
    bg: 'bg-rose-50 dark:bg-rose-900/20',
    icon: (
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
    ),
    label: 'liked',
  },
  repost: {
    color: 'text-emerald-500',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
    label: 'reposted',
  },
  reply: {
    color: 'text-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
      </svg>
    ),
    label: 'replied',
  },
  quote: {
    color: 'text-purple-500',
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
      </svg>
    ),
    label: 'quoted',
  },
  mention: {
    color: 'text-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
      </svg>
    ),
    label: 'mentioned you',
  },
};

// Single activity item row (for non-like activities)
function ActivityItem({
  activity,
  onOpenProfile,
  onOpenPost,
}: {
  activity: PostActivity;
  onOpenProfile: (did: string) => void;
  onOpenPost: (uri: string) => void;
}) {
  const style = ACTIVITY_STYLES[activity.type];
  
  return (
    <div
      className={`flex items-start gap-2 py-1.5 px-2 rounded-lg ${style.bg} cursor-pointer hover:opacity-80 transition-opacity`}
      onClick={() => {
        if (activity.uri && (activity.type === 'reply' || activity.type === 'quote' || activity.type === 'mention')) {
          onOpenPost(activity.uri);
        } else {
          onOpenProfile(activity.author.did);
        }
      }}
    >
      {/* Avatar */}
      {activity.author.avatar ? (
        <img
          src={activity.author.avatar}
          alt=""
          className="w-5 h-5 rounded-full flex-shrink-0"
        />
      ) : (
        <div className="w-5 h-5 rounded-full bg-gray-400 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
          {(activity.author.displayName || activity.author.handle)[0].toUpperCase()}
        </div>
      )}
      <span className={`flex-shrink-0 mt-0.5 ${style.color}`}>
        {style.icon}
      </span>
      <div className="flex-1 min-w-0">
        <span className="text-xs">
          <span
            className="font-medium text-gray-900 dark:text-gray-100 hover:text-blue-500 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onOpenProfile(activity.author.did);
            }}
          >
            {activity.author.displayName || `@${activity.author.handle}`}
          </span>
          <span className="text-gray-500 dark:text-gray-400"> {style.label}</span>
          {activity.text && (
            <span className="text-gray-600 dark:text-gray-300">: &ldquo;{activity.text.slice(0, 60)}{activity.text.length > 60 ? '...' : ''}&rdquo;</span>
          )}
        </span>
      </div>
      <span className="text-xs text-gray-400 flex-shrink-0">
        {formatTime(activity.indexedAt)}
      </span>
    </div>
  );
}

// Rolled-up likes row showing avatars and "X, Y, Z, and N others liked"
function LikesRollupRow({
  likes,
  onOpenProfile,
}: {
  likes: PostActivity[];
  onOpenProfile: (did: string) => void;
}) {
  if (likes.length === 0) return null;
  
  const style = ACTIVITY_STYLES.like;
  const MAX_NAMES = 3;
  const MAX_AVATARS = 5;
  
  // Get unique likers (in case of duplicates)
  const uniqueLikers = likes.reduce((acc, like) => {
    if (!acc.find(l => l.author.did === like.author.did)) {
      acc.push(like);
    }
    return acc;
  }, [] as PostActivity[]);
  
  const displayedLikers = uniqueLikers.slice(0, MAX_NAMES);
  const remainingCount = uniqueLikers.length - MAX_NAMES;
  const avatarsToShow = uniqueLikers.slice(0, MAX_AVATARS);
  
  // Build the names string
  const formatNames = () => {
    const names = displayedLikers.map(l => l.author.displayName || l.author.handle);
    if (remainingCount <= 0) {
      if (names.length === 1) return names[0];
      if (names.length === 2) return `${names[0]} and ${names[1]}`;
      return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
    }
    return `${names.join(', ')}, and ${remainingCount} other${remainingCount === 1 ? '' : 's'}`;
  };
  
  return (
    <div className={`flex items-center gap-2 py-1.5 px-2 rounded-lg ${style.bg}`}>
      {/* Stacked avatars */}
      <div className="flex -space-x-1.5 flex-shrink-0">
        {avatarsToShow.map((liker, i) => (
          liker.author.avatar ? (
            <img
              key={liker.author.did}
              src={liker.author.avatar}
              alt=""
              className="w-5 h-5 rounded-full border border-white dark:border-gray-900 cursor-pointer hover:z-10 hover:scale-110 transition-transform"
              style={{ zIndex: MAX_AVATARS - i }}
              onClick={(e) => {
                e.stopPropagation();
                onOpenProfile(liker.author.did);
              }}
            />
          ) : (
            <div
              key={liker.author.did}
              className="w-5 h-5 rounded-full bg-gray-400 flex items-center justify-center text-white text-[10px] font-bold border border-white dark:border-gray-900 cursor-pointer hover:z-10 hover:scale-110 transition-transform"
              style={{ zIndex: MAX_AVATARS - i }}
              onClick={(e) => {
                e.stopPropagation();
                onOpenProfile(liker.author.did);
              }}
            >
              {(liker.author.displayName || liker.author.handle)[0].toUpperCase()}
            </div>
          )
        ))}
      </div>
      
      {/* Heart icon */}
      <span className={`flex-shrink-0 ${style.color}`}>
        {style.icon}
      </span>
      
      {/* Names */}
      <div className="flex-1 min-w-0">
        <span className="text-xs">
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {formatNames()}
          </span>
          <span className="text-gray-500 dark:text-gray-400"> liked</span>
        </span>
      </div>
    </div>
  );
}

// Rolled-up reposts row showing avatars and "X, Y, Z, and N others reposted"
function RepostsRollupRow({
  reposts,
  onOpenProfile,
}: {
  reposts: PostActivity[];
  onOpenProfile: (did: string) => void;
}) {
  if (reposts.length === 0) return null;
  
  const style = ACTIVITY_STYLES.repost;
  const MAX_NAMES = 3;
  const MAX_AVATARS = 5;
  
  // Get unique reposters (in case of duplicates)
  const uniqueReposters = reposts.reduce((acc, repost) => {
    if (!acc.find(r => r.author.did === repost.author.did)) {
      acc.push(repost);
    }
    return acc;
  }, [] as PostActivity[]);
  
  const displayedReposters = uniqueReposters.slice(0, MAX_NAMES);
  const remainingCount = uniqueReposters.length - MAX_NAMES;
  const avatarsToShow = uniqueReposters.slice(0, MAX_AVATARS);
  
  // Build the names string
  const formatNames = () => {
    const names = displayedReposters.map(r => r.author.displayName || r.author.handle);
    if (remainingCount <= 0) {
      if (names.length === 1) return names[0];
      if (names.length === 2) return `${names[0]} and ${names[1]}`;
      return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
    }
    return `${names.join(', ')}, and ${remainingCount} other${remainingCount === 1 ? '' : 's'}`;
  };
  
  return (
    <div className={`flex items-center gap-2 py-1.5 px-2 rounded-lg ${style.bg}`}>
      {/* Stacked avatars */}
      <div className="flex -space-x-1.5 flex-shrink-0">
        {avatarsToShow.map((reposter, i) => (
          reposter.author.avatar ? (
            <img
              key={reposter.author.did}
              src={reposter.author.avatar}
              alt=""
              className="w-5 h-5 rounded-full border border-white dark:border-gray-900 cursor-pointer hover:z-10 hover:scale-110 transition-transform"
              style={{ zIndex: MAX_AVATARS - i }}
              onClick={(e) => {
                e.stopPropagation();
                onOpenProfile(reposter.author.did);
              }}
            />
          ) : (
            <div
              key={reposter.author.did}
              className="w-5 h-5 rounded-full bg-gray-400 flex items-center justify-center text-white text-[10px] font-bold border border-white dark:border-gray-900 cursor-pointer hover:z-10 hover:scale-110 transition-transform"
              style={{ zIndex: MAX_AVATARS - i }}
              onClick={(e) => {
                e.stopPropagation();
                onOpenProfile(reposter.author.did);
              }}
            >
              {(reposter.author.displayName || reposter.author.handle)[0].toUpperCase()}
            </div>
          )
        ))}
      </div>
      
      {/* Repost icon */}
      <span className={`flex-shrink-0 ${style.color}`}>
        {style.icon}
      </span>
      
      {/* Names */}
      <div className="flex-1 min-w-0">
        <span className="text-xs">
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {formatNames()}
          </span>
          <span className="text-gray-500 dark:text-gray-400"> reposted</span>
        </span>
      </div>
    </div>
  );
}

// Row for a single post with its activity
function PostActivityRow({
  postWithActivity,
  onOpenProfile,
  onOpenPost,
}: {
  postWithActivity: PostWithActivity;
  onOpenProfile: (did: string) => void;
  onOpenPost: (uri: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { post, activity, totalEngagement } = postWithActivity;
  const postText = (post.record as { text?: string })?.text || '';
  const isReply = !!(post.record as { reply?: unknown })?.reply;
  
  // Separate likes and reposts from other activity types (they get rolled up)
  const likesActivity = activity.filter(a => a.type === 'like');
  const repostsActivity = activity.filter(a => a.type === 'repost');
  const otherActivity = activity.filter(a => a.type !== 'like' && a.type !== 'repost');
  
  // Show first 3 other activities by default, rest on expand
  const DEFAULT_SHOW = 3;
  const visibleOtherActivity = expanded ? otherActivity : otherActivity.slice(0, DEFAULT_SHOW);
  const hiddenOtherCount = otherActivity.length - DEFAULT_SHOW;
  
  // Count by type
  const counts = useMemo(() => {
    const c = { like: 0, repost: 0, reply: 0, quote: 0, mention: 0 };
    for (const a of activity) {
      c[a.type]++;
    }
    return c;
  }, [activity]);
  
  // Is this post "hot"? (more than 10 interactions in the activity window)
  const isHot = activity.length >= 10;
  
  return (
    <div className="border-b border-gray-100 dark:border-gray-800 last:border-b-0">
      {/* Post header */}
      <div
        className="p-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer"
        onClick={() => onOpenPost(post.uri)}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {isReply && (
                <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded">
                  Reply
                </span>
              )}
              {isHot && (
                <span className="text-xs px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded flex items-center gap-1">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                  </svg>
                  Hot
                </span>
              )}
              <span className="text-xs text-gray-400">
                Posted {formatTime(post.indexedAt)}
              </span>
            </div>
            <p className="text-sm text-gray-900 dark:text-gray-100 line-clamp-2">
              {postText || <span className="italic text-gray-400">(no text)</span>}
            </p>
            
            {/* Engagement summary */}
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
              {counts.like > 0 && (
                <span className="flex items-center gap-1 text-rose-500">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                  {counts.like}
                </span>
              )}
              {counts.repost > 0 && (
                <span className="flex items-center gap-1 text-emerald-500">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {counts.repost}
                </span>
              )}
              {counts.reply > 0 && (
                <span className="flex items-center gap-1 text-blue-500">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                  {counts.reply}
                </span>
              )}
              {counts.quote > 0 && (
                <span className="flex items-center gap-1 text-purple-500">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                  </svg>
                  {counts.quote}
                </span>
              )}
              {counts.mention > 0 && (
                <span className="flex items-center gap-1 text-amber-500">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                  </svg>
                  {counts.mention}
                </span>
              )}
            </div>
          </div>
          
          {/* Total engagement badge */}
          {totalEngagement > 0 && (
            <div className="flex-shrink-0 text-right">
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {totalEngagement}
              </div>
              <div className="text-xs text-gray-400">this week</div>
            </div>
          )}
        </div>
      </div>
      
      {/* Activity feed */}
      {activity.length > 0 && (
        <div className="px-3 pb-3 space-y-1">
          {/* Show rolled-up likes first if there are any */}
          {likesActivity.length > 0 && (
            <LikesRollupRow
              likes={likesActivity}
              onOpenProfile={onOpenProfile}
            />
          )}
          
          {/* Show rolled-up reposts */}
          {repostsActivity.length > 0 && (
            <RepostsRollupRow
              reposts={repostsActivity}
              onOpenProfile={onOpenProfile}
            />
          )}
          
          {/* Show other activities (replies, quotes, mentions) */}
          {visibleOtherActivity.map((a, i) => (
            <ActivityItem
              key={`${a.type}-${a.author.did}-${i}`}
              activity={a}
              onOpenProfile={onOpenProfile}
              onOpenPost={onOpenPost}
            />
          ))}
          
          {hiddenOtherCount > 0 && !expanded && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(true);
              }}
              className="w-full py-1.5 text-xs text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
            >
              Show {hiddenOtherCount} more
            </button>
          )}
          
          {expanded && hiddenOtherCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(false);
              }}
              className="w-full py-1.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              Show less
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Sort options for posts
type PostSortOption = 'recent_activity' | 'most_engagement' | 'recent_post';

// Main My Posts Activity pane
function MyPostsActivityPane({
  notifications,
  onOpenProfile,
  onOpenPost,
}: {
  notifications: NotificationItem[];
  onOpenProfile: (did: string) => void;
  onOpenPost: (uri: string) => void;
}) {
  const [posts, setPosts] = useState<AppBskyFeedDefs.PostView[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<PostSortOption>('recent_activity');
  
  // Fetch user's posts on mount
  useEffect(() => {
    const loadPosts = async () => {
      setLoading(true);
      try {
        const myPosts = await getMyRecentPostsAndReplies(7, 50);
        setPosts(myPosts);
      } catch (err) {
        console.error('Failed to load posts:', err);
      } finally {
        setLoading(false);
      }
    };
    loadPosts();
  }, []);
  
  // Build posts with activity data
  const postsWithActivity = useMemo(() => {
    // Create a map of post URI -> activity
    const activityByPost = new Map<string, PostActivity[]>();
    
    for (const n of notifications) {
      // Determine which post this notification is about
      let targetUri: string | undefined;
      
      if (n.reason === 'like' || n.reason === 'repost') {
        targetUri = n.reasonSubject;
      } else if (n.reason === 'reply' || n.reason === 'quote' || n.reason === 'mention') {
        // For replies/quotes, the reasonSubject is the post being replied to/quoted
        targetUri = n.reasonSubject;
      }
      
      if (!targetUri) continue;
      
      const activity: PostActivity = {
        type: n.reason as PostActivity['type'],
        author: n.author,
        text: n.record?.text,
        uri: n.uri,
        indexedAt: n.indexedAt,
      };
      
      if (!activityByPost.has(targetUri)) {
        activityByPost.set(targetUri, []);
      }
      activityByPost.get(targetUri)!.push(activity);
    }
    
    // Sort activity within each post by recency
    for (const activities of activityByPost.values()) {
      activities.sort((a, b) => new Date(b.indexedAt).getTime() - new Date(a.indexedAt).getTime());
    }
    
    // Combine with posts
    const result: PostWithActivity[] = [];
    
    for (const post of posts) {
      const activity = activityByPost.get(post.uri) || [];
      const latestActivityAt = activity.length > 0 
        ? activity[0].indexedAt 
        : post.indexedAt;
      
      result.push({
        post,
        activity,
        latestActivityAt,
        totalEngagement: activity.length,
      });
    }
    
    // Sort based on selected option
    switch (sortBy) {
      case 'recent_activity':
        result.sort((a, b) => {
          // Posts with activity come first, sorted by latest activity
          if (a.activity.length === 0 && b.activity.length === 0) {
            return new Date(b.post.indexedAt).getTime() - new Date(a.post.indexedAt).getTime();
          }
          if (a.activity.length === 0) return 1;
          if (b.activity.length === 0) return -1;
          return new Date(b.latestActivityAt).getTime() - new Date(a.latestActivityAt).getTime();
        });
        break;
      case 'most_engagement':
        result.sort((a, b) => b.totalEngagement - a.totalEngagement);
        break;
      case 'recent_post':
        result.sort((a, b) => new Date(b.post.indexedAt).getTime() - new Date(a.post.indexedAt).getTime());
        break;
    }
    
    return result;
  }, [posts, notifications, sortBy]);
  
  // Only show posts with activity, unless sorting by recent post
  const displayPosts = sortBy === 'recent_post' 
    ? postsWithActivity.slice(0, 20)
    : postsWithActivity.filter(p => p.activity.length > 0).slice(0, 20);
  
  const totalActivityCount = postsWithActivity.reduce((sum, p) => sum + p.activity.length, 0);
  
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          My Posts
          {totalActivityCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">
              {totalActivityCount} interactions
            </span>
          )}
        </h3>
        
        {/* Sort dropdown */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as PostSortOption)}
          className="text-xs bg-gray-100 dark:bg-gray-800 border-0 rounded-lg px-2 py-1 text-gray-600 dark:text-gray-300 focus:ring-2 focus:ring-blue-500"
        >
          <option value="recent_activity">Recent activity</option>
          <option value="most_engagement">Most engagement</option>
          <option value="recent_post">Recent posts</option>
        </select>
      </div>
      
      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : displayPosts.length === 0 ? (
        <div className="p-8 text-center">
          <svg className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {sortBy === 'recent_post' ? 'No posts in the last week' : 'No recent activity on your posts'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Activity from the last 7 days will appear here
          </p>
        </div>
      ) : (
        <div className="max-h-[600px] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
          {displayPosts.map((p) => (
            <PostActivityRow
              key={p.post.uri}
              postWithActivity={p}
              onOpenProfile={onOpenProfile}
              onOpenPost={onOpenPost}
            />
          ))}
        </div>
      )}
      
      {/* Footer with note */}
      <div className="p-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
        <p className="text-xs text-gray-400 text-center">
          Showing activity from the last 7 days
        </p>
      </div>
    </div>
  );
}

// Notification item for grouped view
function NotificationRow({
  notification,
  onOpenPost,
  onOpenProfile,
}: {
  notification: NotificationItem;
  onOpenPost: (uri: string) => void;
  onOpenProfile: (did: string) => void;
}) {
  const n = notification;
  
  return (
    <div
      className="p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
      onClick={() => {
        if (n.reason === 'follow') {
          onOpenProfile(n.author.did);
        } else if (n.reason === 'reply' || n.reason === 'quote' || n.reason === 'mention') {
          // For replies/quotes/mentions, go to the reply/quote itself
          onOpenPost(n.uri);
        } else if (n.reasonSubject) {
          // For likes/reposts, go to the parent post
          onOpenPost(n.reasonSubject);
        } else {
          onOpenPost(n.uri);
        }
      }}
    >
      <div className="flex items-start gap-3">
        <ProfileHoverCard
          did={n.author.did}
          handle={n.author.handle}
          onOpenProfile={() => onOpenProfile(n.author.did)}
        >
          {n.author.avatar ? (
            <img
              src={n.author.avatar}
              alt=""
              className="w-8 h-8 rounded-full cursor-pointer hover:ring-2 hover:ring-blue-400"
              onClick={(e) => {
                e.stopPropagation();
                onOpenProfile(n.author.did);
              }}
            />
          ) : (
            <div
              className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold cursor-pointer hover:ring-2 hover:ring-blue-400"
              onClick={(e) => {
                e.stopPropagation();
                onOpenProfile(n.author.did);
              }}
            >
              {(n.author.displayName || n.author.handle)[0].toUpperCase()}
            </div>
          )}
        </ProfileHoverCard>
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-blue-500 cursor-pointer truncate"
            onClick={(e) => {
              e.stopPropagation();
              onOpenProfile(n.author.did);
            }}
          >
            {n.author.displayName || n.author.handle}
          </p>
          {(n.record?.text || n.subjectText) && (
            <p className="text-xs text-gray-500 dark:text-gray-500 line-clamp-2 mt-0.5">
              {n.record?.text || n.subjectText}
            </p>
          )}
        </div>
        <span className="text-xs text-gray-400 flex-shrink-0">
          {formatTime(n.indexedAt)}
        </span>
      </div>
    </div>
  );
}

// Rich follow notification row with profile info
interface FollowProfile {
  did: string;
  avatar?: string;
  displayName?: string;
  handle: string;
  description?: string;
  followersCount?: number;
  followsCount?: number;
  viewer?: {
    following?: string;
    followedBy?: string;
  };
  labels?: Label[];
}

function FollowRow({
  notification,
  onOpenProfile,
}: {
  notification: NotificationItem;
  onOpenProfile: (did: string) => void;
}) {
  const [profile, setProfile] = useState<FollowProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followUri, setFollowUri] = useState<string | undefined>();
  const [followLoading, setFollowLoading] = useState(false);
  const { refresh: refreshFollowing } = useFollowing();

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const data = await getBlueskyProfile(notification.author.did);
        if (data) {
          setProfile(data as FollowProfile);
          if (data.viewer?.following) {
            setIsFollowing(true);
            setFollowUri(data.viewer.following);
          }
        }
      } catch (err) {
        console.error('Failed to fetch profile:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [notification.author.did]);

  const handleFollow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (followLoading) return;
    setFollowLoading(true);
    try {
      const result = await followUser(notification.author.did);
      setIsFollowing(true);
      setFollowUri(result.uri);
      refreshFollowing();
    } catch (err) {
      console.error('Failed to follow:', err);
    } finally {
      setFollowLoading(false);
    }
  };

  const handleUnfollow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (followLoading || !followUri) return;
    setFollowLoading(true);
    try {
      await unfollowUser(followUri);
      setIsFollowing(false);
      setFollowUri(undefined);
      refreshFollowing();
    } catch (err) {
      console.error('Failed to unfollow:', err);
    } finally {
      setFollowLoading(false);
    }
  };

  const isVerified = profile?.labels ? isVerifiedResearcher(profile.labels) : false;

  return (
    <div
      className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
      onClick={() => onOpenProfile(notification.author.did)}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="flex-shrink-0">
          {(profile?.avatar || notification.author.avatar) ? (
            <img
              src={profile?.avatar || notification.author.avatar}
              alt=""
              className="w-12 h-12 rounded-full"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-lg font-bold">
              {(profile?.displayName || notification.author.displayName || notification.author.handle)[0].toUpperCase()}
            </div>
          )}
        </div>

        {/* Profile info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">
              {profile?.displayName || notification.author.displayName || notification.author.handle}
            </span>
            {isVerified && (
              <span
                className="inline-flex items-center justify-center w-4 h-4 bg-emerald-500 rounded-full flex-shrink-0"
                title="Verified Researcher"
              >
                <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </span>
            )}
            <span className="text-xs text-gray-400">{formatTime(notification.indexedAt)}</span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">@{profile?.handle || notification.author.handle}</p>
          
          {/* Bio */}
          {loading ? (
            <div className="mt-2 h-4 w-3/4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
          ) : profile?.description ? (
            <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
              {profile.description}
            </p>
          ) : null}
          
          {/* Stats row */}
          {!loading && profile && (
            <div className="mt-2 flex items-center gap-4 text-xs">
              <span>
                <span className="font-semibold text-gray-700 dark:text-gray-200">
                  {profile.followersCount?.toLocaleString() || 0}
                </span>
                <span className="text-gray-500"> followers</span>
              </span>
              <span>
                <span className="font-semibold text-gray-700 dark:text-gray-200">
                  {profile.followsCount?.toLocaleString() || 0}
                </span>
                <span className="text-gray-500"> following</span>
              </span>
              {profile.viewer?.followedBy && (
                <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded text-xs">
                  Follows you
                </span>
              )}
            </div>
          )}
        </div>

        {/* Follow button */}
        <button
          onClick={isFollowing ? handleUnfollow : handleFollow}
          disabled={followLoading || loading}
          className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            isFollowing
              ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400'
              : 'bg-blue-500 text-white hover:bg-blue-600'
          } disabled:opacity-50`}
        >
          {followLoading ? (
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : isFollowing ? (
            'Following'
          ) : (
            'Follow back'
          )}
        </button>
      </div>
    </div>
  );
}

// Enhanced follower row with spam indicators, labels, mutual connections, and block
interface EnhancedFollowerProfile extends BlueskyProfile {
  indexedAt: string; // When they followed
  mutualFollowers?: { did: string; handle: string; displayName?: string; avatar?: string }[];
}

function EnhancedFollowerRow({
  profile,
  isSelected,
  onSelect,
  onOpenProfile,
  onBlocked,
}: {
  profile: EnhancedFollowerProfile;
  isSelected: boolean;
  onSelect: (did: string, selected: boolean) => void;
  onOpenProfile: (did: string) => void;
  onBlocked: (did: string) => void;
}) {
  const [isFollowing, setIsFollowing] = useState(!!profile.viewer?.following);
  const [followUri, setFollowUri] = useState<string | undefined>(profile.viewer?.following);
  const [followLoading, setFollowLoading] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const { refresh: refreshFollowing } = useFollowing();

  const isVerified = profile.labels ? isVerifiedResearcher(profile.labels) : false;
  const isMutual = isFollowing && !!profile.viewer?.followedBy;

  // Spam indicators
  const hasNoAvatar = !profile.avatar;
  const hasNoBio = !profile.description || profile.description.trim().length < 10;
  const followersCount = profile.followersCount || 0;
  const followsCount = profile.followsCount || 0;
  const followsManyAccounts = followsCount > 5000;
  const hasSpamIndicators = hasNoAvatar || hasNoBio || followsManyAccounts;

  // Handle click with modifier keys to open in new tab
  const handleProfileClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.metaKey || e.ctrlKey || e.button === 1) {
      window.open(`/u/${profile.handle}`, '_blank');
    } else {
      onOpenProfile(profile.did);
    }
  };

  const handleFollow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (followLoading) return;
    setFollowLoading(true);
    try {
      const result = await followUser(profile.did);
      setIsFollowing(true);
      setFollowUri(result.uri);
      refreshFollowing();
    } catch (err) {
      console.error('Failed to follow:', err);
    } finally {
      setFollowLoading(false);
    }
  };

  const handleUnfollow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (followLoading || !followUri) return;
    setFollowLoading(true);
    try {
      await unfollowUser(followUri);
      setIsFollowing(false);
      setFollowUri(undefined);
      refreshFollowing();
    } catch (err) {
      console.error('Failed to unfollow:', err);
    } finally {
      setFollowLoading(false);
    }
  };

  const handleBlock = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (blockLoading) return;
    if (!window.confirm(`Block @${profile.handle}? They won't be able to see your posts or interact with you.`)) return;
    setBlockLoading(true);
    try {
      await blockUser(profile.did);
      onBlocked(profile.did);
    } catch (err) {
      console.error('Failed to block:', err);
    } finally {
      setBlockLoading(false);
    }
  };

  // Determine avatar ring color
  const getAvatarRingClass = () => {
    if (isMutual) {
      return 'ring-[3px] ring-purple-400 dark:ring-purple-400/60 shadow-[0_0_8px_rgba(192,132,252,0.5)]';
    }
    if (isFollowing) {
      return 'ring-[3px] ring-blue-300 dark:ring-blue-400/60 shadow-[0_0_8px_rgba(147,197,253,0.5)]';
    }
    return '';
  };

  return (
    <div
      className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 last:border-b-0 ${
        hasSpamIndicators ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <div className="flex-shrink-0 pt-1">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelect(profile.did, e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 cursor-pointer"
          />
        </div>

        {/* Avatar with ring */}
        <div
          className="flex-shrink-0 relative cursor-pointer"
          onClick={handleProfileClick}
          onAuxClick={handleProfileClick}
        >
          {profile.avatar ? (
            <img
              src={profile.avatar}
              alt=""
              className={`w-12 h-12 rounded-full ${getAvatarRingClass()}`}
            />
          ) : (
            <div className={`w-12 h-12 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-700 flex items-center justify-center text-white text-lg font-bold ${getAvatarRingClass()}`}>
              {(profile.displayName || profile.handle)[0].toUpperCase()}
            </div>
          )}
          {isVerified && (
            <span
              className="absolute -bottom-0.5 -right-0.5 inline-flex items-center justify-center w-5 h-5 bg-emerald-500 rounded-full border-2 border-white dark:border-gray-900"
              title="Verified Researcher"
            >
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </span>
          )}
        </div>

        {/* Profile info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="font-semibold text-gray-900 dark:text-gray-100 truncate cursor-pointer hover:underline"
              onClick={handleProfileClick}
              onAuxClick={handleProfileClick}
            >
              {profile.displayName || profile.handle}
            </span>
            <span className="text-xs text-gray-400">{formatTime(profile.indexedAt)}</span>
          </div>
          <p
            className="text-sm text-gray-500 dark:text-gray-400 cursor-pointer hover:underline"
            onClick={handleProfileClick}
            onAuxClick={handleProfileClick}
          >
            @{profile.handle}
          </p>

          {/* Bio */}
          {profile.description ? (
            <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
              {profile.description}
            </p>
          ) : null}

          {/* Labels */}
          <ProfileLabels profile={profile} compact />

          {/* Stats row */}
          <div className="mt-2 flex items-center gap-3 flex-wrap text-xs">
            <span>
              <span className="font-semibold text-gray-700 dark:text-gray-200">
                {followersCount.toLocaleString()}
              </span>
              <span className="text-gray-500"> followers</span>
            </span>
            <span>
              <span className="font-semibold text-gray-700 dark:text-gray-200">
                {followsCount.toLocaleString()}
              </span>
              <span className="text-gray-500"> following</span>
            </span>
            {/* Mutual followers */}
            {profile.mutualFollowers && profile.mutualFollowers.length > 0 && (
              <span className="flex items-center gap-1">
                <div className="flex -space-x-1">
                  {profile.mutualFollowers.slice(0, 3).map((m) => (
                    m.avatar ? (
                      <img key={m.did} src={m.avatar} className="w-4 h-4 rounded-full border border-white dark:border-gray-800" alt="" />
                    ) : (
                      <div key={m.did} className="w-4 h-4 rounded-full bg-blue-400 border border-white dark:border-gray-800" />
                    )
                  ))}
                </div>
                <span className="text-gray-500">
                  {profile.mutualFollowers.length} mutual{profile.mutualFollowers.length !== 1 ? 's' : ''}
                </span>
              </span>
            )}
          </div>

          {/* Spam indicators */}
          {hasSpamIndicators && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {hasNoAvatar && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  No avatar
                </span>
              )}
              {hasNoBio && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                  </svg>
                  No bio
                </span>
              )}
              {followsManyAccounts && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Follows 5k+
                </span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex items-center gap-2">
          {/* Follow/Following button */}
          <button
            onClick={isFollowing ? handleUnfollow : handleFollow}
            disabled={followLoading}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              isFollowing
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            } disabled:opacity-50`}
          >
            {followLoading ? (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : isFollowing ? (
              'Following'
            ) : (
              'Follow'
            )}
          </button>

          {/* Block button */}
          <button
            onClick={handleBlock}
            disabled={blockLoading}
            className="p-1.5 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
            title="Block"
          >
            {blockLoading ? (
              <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// New Followers Pane - dedicated section for managing new followers
type FollowerSortOption = 'recent' | 'followers' | 'following';

function NewFollowersPane({
  follows,
  onOpenProfile,
}: {
  follows: NotificationItem[];
  onOpenProfile: (did: string) => void;
}) {
  const [profiles, setProfiles] = useState<EnhancedFollowerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<FollowerSortOption>('recent');
  const [selectedDids, setSelectedDids] = useState<Set<string>>(new Set());
  const [blockedDids, setBlockedDids] = useState<Set<string>>(new Set());
  const [batchBlocking, setBatchBlocking] = useState(false);

  // Fetch full profile data for each follower
  useEffect(() => {
    const fetchProfiles = async () => {
      setLoading(true);
      try {
        const profilePromises = follows.map(async (f) => {
          const profile = await getBlueskyProfile(f.author.did);
          if (!profile) return null;

          // Fetch mutual followers
          let mutualFollowers: EnhancedFollowerProfile['mutualFollowers'] = [];
          try {
            const known = await getKnownFollowers(f.author.did, 5);
            mutualFollowers = known.followers;
          } catch {
            // Ignore errors
          }

          return {
            ...profile,
            indexedAt: f.indexedAt,
            mutualFollowers,
          } as EnhancedFollowerProfile;
        });

        const results = await Promise.all(profilePromises);
        setProfiles(results.filter((p): p is EnhancedFollowerProfile => p !== null));
      } catch (err) {
        console.error('Failed to fetch follower profiles:', err);
      } finally {
        setLoading(false);
      }
    };

    if (follows.length > 0) {
      fetchProfiles();
    } else {
      setLoading(false);
    }
  }, [follows]);

  // Sort profiles
  const sortedProfiles = useMemo(() => {
    const filtered = profiles.filter((p) => !blockedDids.has(p.did));
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'followers':
          return (b.followersCount || 0) - (a.followersCount || 0);
        case 'following':
          return (b.followsCount || 0) - (a.followsCount || 0);
        case 'recent':
        default:
          return new Date(b.indexedAt).getTime() - new Date(a.indexedAt).getTime();
      }
    });
  }, [profiles, sortBy, blockedDids]);

  const handleSelect = (did: string, selected: boolean) => {
    setSelectedDids((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(did);
      } else {
        next.delete(did);
      }
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedDids(new Set(sortedProfiles.map((p) => p.did)));
    } else {
      setSelectedDids(new Set());
    }
  };

  const handleBlocked = (did: string) => {
    setBlockedDids((prev) => new Set(prev).add(did));
    setSelectedDids((prev) => {
      const next = new Set(prev);
      next.delete(did);
      return next;
    });
  };

  const handleBatchBlock = async () => {
    if (selectedDids.size === 0) return;
    if (!window.confirm(`Block ${selectedDids.size} account${selectedDids.size !== 1 ? 's' : ''}? They won't be able to see your posts or interact with you.`)) return;

    setBatchBlocking(true);
    try {
      for (const did of selectedDids) {
        try {
          await blockUser(did);
          handleBlocked(did);
        } catch (err) {
          console.error(`Failed to block ${did}:`, err);
        }
      }
    } finally {
      setBatchBlocking(false);
    }
  };

  const visibleCount = sortedProfiles.length;
  const allSelected = visibleCount > 0 && selectedDids.size === visibleCount;
  const someSelected = selectedDids.size > 0 && selectedDids.size < visibleCount;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-amber-50 dark:bg-amber-900/20">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            New Followers
            <span className="px-1.5 py-0.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full">
              {visibleCount}
            </span>
          </h3>

          {/* Sort dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as FollowerSortOption)}
            className="text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-gray-600 dark:text-gray-300"
          >
            <option value="recent">Most recent</option>
            <option value="followers">Most followers</option>
            <option value="following">Most following</option>
          </select>
        </div>

        {/* Batch actions */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              onChange={(e) => handleSelectAll(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
            />
            Select all
          </label>

          {selectedDids.size > 0 && (
            <button
              onClick={handleBatchBlock}
              disabled={batchBlocking}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full transition-colors disabled:opacity-50"
            >
              {batchBlocking ? (
                <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              )}
              Block {selectedDids.size} selected
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-h-[600px] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full" />
          </div>
        ) : sortedProfiles.length === 0 ? (
          <div className="p-8 text-center">
            <svg className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-sm text-gray-500 dark:text-gray-400">No new followers in the last 24 hours</p>
          </div>
        ) : (
          sortedProfiles.map((profile) => (
            <EnhancedFollowerRow
              key={profile.did}
              profile={profile}
              isSelected={selectedDids.has(profile.did)}
              onSelect={handleSelect}
              onOpenProfile={onOpenProfile}
              onBlocked={handleBlocked}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Clustered like group - groups likes on the same post
interface LikeCluster {
  postUri: string;
  postText: string;
  likers: NotificationItem['author'][];
  latestTime: string;
}

function ClusteredLikeRow({
  cluster,
  onOpenPost,
  onOpenProfile,
}: {
  cluster: LikeCluster;
  onOpenPost: (uri: string) => void;
  onOpenProfile: (did: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const displayAvatars = cluster.likers.slice(0, 5);
  const firstName = cluster.likers[0]?.displayName || cluster.likers[0]?.handle || 'Someone';
  const othersCount = cluster.likers.length - 1;

  return (
    <div className="p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50">
      {/* Main cluster view */}
      <div
        className="cursor-pointer"
        onClick={() => onOpenPost(cluster.postUri)}
      >
        {/* Stacked avatars */}
        <div className="flex items-center mb-2">
          <div className="flex -space-x-2">
            {displayAvatars.map((author, i) => (
              <ProfileHoverCard
                key={author.did}
                did={author.did}
                handle={author.handle}
                onOpenProfile={() => onOpenProfile(author.did)}
              >
                {author.avatar ? (
                  <img
                    src={author.avatar}
                    alt=""
                    className="w-7 h-7 rounded-full border-2 border-white dark:border-gray-900 cursor-pointer hover:z-10 hover:scale-110 transition-transform"
                    style={{ zIndex: displayAvatars.length - i }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenProfile(author.did);
                    }}
                  />
                ) : (
                  <div
                    className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold border-2 border-white dark:border-gray-900 cursor-pointer hover:z-10 hover:scale-110 transition-transform"
                    style={{ zIndex: displayAvatars.length - i }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenProfile(author.did);
                    }}
                  >
                    {(author.displayName || author.handle)[0].toUpperCase()}
                  </div>
                )}
              </ProfileHoverCard>
            ))}
            {cluster.likers.length > 5 && (
              <div
                className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-300 border-2 border-white dark:border-gray-900"
                style={{ zIndex: 0 }}
              >
                +{cluster.likers.length - 5}
              </div>
            )}
          </div>
          <span className="ml-3 text-xs text-gray-400">{formatTime(cluster.latestTime)}</span>
        </div>

        {/* Summary text */}
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
          <span
            className="font-medium text-gray-900 dark:text-gray-100 hover:text-blue-500 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onOpenProfile(cluster.likers[0].did);
            }}
          >
            {firstName}
          </span>
          {othersCount > 0 && (
            <span className="text-gray-500 dark:text-gray-400">
              {' '}and {othersCount} other{othersCount !== 1 ? 's' : ''}
            </span>
          )}
          <span className="text-gray-500 dark:text-gray-400"> liked your post</span>
        </p>

        {/* Post text preview */}
        {cluster.postText && (
          <p className="text-xs text-gray-500 dark:text-gray-500 line-clamp-2 italic">
            &ldquo;{cluster.postText}&rdquo;
          </p>
        )}
      </div>

      {/* Expand/collapse button */}
      {cluster.likers.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className="mt-2 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <svg
            className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          {isExpanded ? 'Hide' : `Show all ${cluster.likers.length} people`}
        </button>
      )}

      {/* Expanded list */}
      {isExpanded && (
        <div className="mt-2 pl-2 border-l-2 border-gray-200 dark:border-gray-700 space-y-2">
          {cluster.likers.map((author) => (
            <div
              key={author.did}
              className="flex items-center gap-2 py-1 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 rounded px-1 -mx-1"
              onClick={(e) => {
                e.stopPropagation();
                onOpenProfile(author.did);
              }}
            >
              {author.avatar ? (
                <img src={author.avatar} alt="" className="w-6 h-6 rounded-full" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                  {(author.displayName || author.handle)[0].toUpperCase()}
                </div>
              )}
              <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                {author.displayName || author.handle}
              </span>
              <span className="text-xs text-gray-400 truncate">@{author.handle}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Group likes by post URI
function clusterLikesByPost(likes: NotificationItem[]): LikeCluster[] {
  const clusters: Record<string, LikeCluster> = {};
  
  for (const like of likes) {
    const postUri = like.reasonSubject || '';
    if (!postUri) continue;
    
    if (!clusters[postUri]) {
      clusters[postUri] = {
        postUri,
        postText: like.subjectText || '',
        likers: [],
        latestTime: like.indexedAt,
      };
    }
    
    clusters[postUri].likers.push(like.author);
    
    // Update latest time
    if (new Date(like.indexedAt) > new Date(clusters[postUri].latestTime)) {
      clusters[postUri].latestTime = like.indexedAt;
    }
    
    // Update post text if we have it
    if (like.subjectText && !clusters[postUri].postText) {
      clusters[postUri].postText = like.subjectText;
    }
  }
  
  // Sort by latest time
  return Object.values(clusters).sort(
    (a, b) => new Date(b.latestTime).getTime() - new Date(a.latestTime).getTime()
  );
}

// Repost cluster interface
interface RepostCluster {
  postUri: string;
  postText: string;
  reposters: NotificationItem['author'][];
  latestTime: string;
}

// Clustered repost row component
function ClusteredRepostRow({
  cluster,
  onOpenPost,
  onOpenProfile,
}: {
  cluster: RepostCluster;
  onOpenPost: (uri: string) => void;
  onOpenProfile: (did: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const displayAvatars = cluster.reposters.slice(0, 5);
  const firstName = cluster.reposters[0]?.displayName || cluster.reposters[0]?.handle || 'Someone';
  const othersCount = cluster.reposters.length - 1;

  return (
    <div className="p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50">
      {/* Main cluster view */}
      <div
        className="cursor-pointer"
        onClick={() => onOpenPost(cluster.postUri)}
      >
        {/* Stacked avatars */}
        <div className="flex items-center mb-2">
          <div className="flex -space-x-2">
            {displayAvatars.map((author, i) => (
              <ProfileHoverCard
                key={author.did}
                did={author.did}
                handle={author.handle}
                onOpenProfile={() => onOpenProfile(author.did)}
              >
                {author.avatar ? (
                  <img
                    src={author.avatar}
                    alt=""
                    className="w-7 h-7 rounded-full border-2 border-white dark:border-gray-900 cursor-pointer hover:z-10 hover:scale-110 transition-transform"
                    style={{ zIndex: displayAvatars.length - i }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenProfile(author.did);
                    }}
                  />
                ) : (
                  <div
                    className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xs font-bold border-2 border-white dark:border-gray-900 cursor-pointer hover:z-10 hover:scale-110 transition-transform"
                    style={{ zIndex: displayAvatars.length - i }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenProfile(author.did);
                    }}
                  >
                    {(author.displayName || author.handle)[0].toUpperCase()}
                  </div>
                )}
              </ProfileHoverCard>
            ))}
            {cluster.reposters.length > 5 && (
              <div
                className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-300 border-2 border-white dark:border-gray-900"
                style={{ zIndex: 0 }}
              >
                +{cluster.reposters.length - 5}
              </div>
            )}
          </div>
          <span className="ml-3 text-xs text-gray-400">{formatTime(cluster.latestTime)}</span>
        </div>

        {/* Summary text */}
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
          <span
            className="font-medium text-gray-900 dark:text-gray-100 hover:text-blue-500 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onOpenProfile(cluster.reposters[0].did);
            }}
          >
            {firstName}
          </span>
          {othersCount > 0 && (
            <span className="text-gray-500 dark:text-gray-400">
              {' '}and {othersCount} other{othersCount !== 1 ? 's' : ''}
            </span>
          )}
          <span className="text-gray-500 dark:text-gray-400"> reposted your post</span>
        </p>

        {/* Post text preview */}
        {cluster.postText && (
          <p className="text-xs text-gray-500 dark:text-gray-500 line-clamp-2 italic">
            &ldquo;{cluster.postText}&rdquo;
          </p>
        )}
      </div>

      {/* Expand/collapse button */}
      {cluster.reposters.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className="mt-2 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <svg
            className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          {isExpanded ? 'Hide' : `Show all ${cluster.reposters.length} people`}
        </button>
      )}

      {/* Expanded list */}
      {isExpanded && (
        <div className="mt-2 pl-2 border-l-2 border-emerald-200 dark:border-emerald-700 space-y-2">
          {cluster.reposters.map((author) => (
            <div
              key={author.did}
              className="flex items-center gap-2 py-1 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 rounded px-1 -mx-1"
              onClick={(e) => {
                e.stopPropagation();
                onOpenProfile(author.did);
              }}
            >
              {author.avatar ? (
                <img src={author.avatar} alt="" className="w-6 h-6 rounded-full" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xs font-bold">
                  {(author.displayName || author.handle)[0].toUpperCase()}
                </div>
              )}
              <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                {author.displayName || author.handle}
              </span>
              <span className="text-xs text-gray-400 truncate">@{author.handle}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Group reposts by post URI
function clusterRepostsByPost(reposts: NotificationItem[]): RepostCluster[] {
  const clusters: Record<string, RepostCluster> = {};
  
  for (const repost of reposts) {
    const postUri = repost.reasonSubject || '';
    if (!postUri) continue;
    
    if (!clusters[postUri]) {
      clusters[postUri] = {
        postUri,
        postText: repost.subjectText || '',
        reposters: [],
        latestTime: repost.indexedAt,
      };
    }
    
    clusters[postUri].reposters.push(repost.author);
    
    // Update latest time
    if (new Date(repost.indexedAt) > new Date(clusters[postUri].latestTime)) {
      clusters[postUri].latestTime = repost.indexedAt;
    }
    
    // Update post text if we have it
    if (repost.subjectText && !clusters[postUri].postText) {
      clusters[postUri].postText = repost.subjectText;
    }
  }
  
  // Sort by latest time
  return Object.values(clusters).sort(
    (a, b) => new Date(b.latestTime).getTime() - new Date(a.latestTime).getTime()
  );
}

function NotificationsExplorerContent() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerified, setIsVerified] = useState(false);
  const { setUserDid } = useBookmarks();

  // Notifications state
  const [allNotifications, setAllNotifications] = useState<NotificationItem[]>([]);
  const [grouped, setGrouped] = useState<GroupedNotifications>({
    likes: [],
    reposts: [],
    quotes: [],
    replies: [],
    follows: [],
    mentions: [],
  });
  const [loading, setLoading] = useState(false);
  
  // Pane ordering state
  const [paneOrder, setPaneOrder] = useState(() => loadPaneOrder());
  const [draggingPane, setDraggingPane] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dragColumn, setDragColumn] = useState<'left' | 'right' | null>(null);
  
  // Drag handlers
  const handleDragStart = (e: React.DragEvent, id: string, column: 'left' | 'right') => {
    setDraggingPane(id);
    setDragColumn(column);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };
  
  const handleDragOver = (e: React.DragEvent, id: string, column: 'left' | 'right') => {
    e.preventDefault();
    // Only allow dropping in the same column
    if (dragColumn === column && draggingPane !== id) {
      setDropTarget(id);
    }
  };
  
  const handleDrop = (e: React.DragEvent, targetId: string, column: 'left' | 'right') => {
    e.preventDefault();
    if (!draggingPane || dragColumn !== column) return;
    
    const columnKey = column === 'left' ? 'left' : 'right';
    const currentOrder = [...paneOrder[columnKey]];
    const dragIndex = currentOrder.indexOf(draggingPane);
    const dropIndex = currentOrder.indexOf(targetId);
    
    if (dragIndex !== -1 && dropIndex !== -1 && dragIndex !== dropIndex) {
      // Remove dragged item and insert at new position
      currentOrder.splice(dragIndex, 1);
      currentOrder.splice(dropIndex, 0, draggingPane);
      
      const newOrder = { ...paneOrder, [columnKey]: currentOrder };
      setPaneOrder(newOrder);
      savePaneOrder(newOrder);
    }
    
    setDraggingPane(null);
    setDropTarget(null);
    setDragColumn(null);
  };
  
  const handleDragEnd = () => {
    setDraggingPane(null);
    setDropTarget(null);
    setDragColumn(null);
  };

  // Restore session on mount
  useEffect(() => {
    restoreSession().then((restored) => {
      if (restored) {
        setIsLoggedIn(true);
        const session = getSession();
        if (session?.did) {
          setUserDid(session.did);
          checkVerificationStatus(session.did).then(setIsVerified);
        }
      }
      setIsLoading(false);
    });
  }, [setUserDid]);

  // Fetch all notifications from the last 24 hours
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      let allNotifs: NotificationItem[] = [];
      let nextCursor: string | undefined = undefined;
      let hasMore = true;

      // Keep fetching until we have all notifications from the last 24 hours
      while (hasMore) {
        const result = await fetchNotifications(nextCursor);
        
        // Filter to only include notifications from last 24 hours
        const recentNotifs = result.notifications.filter(
          n => new Date(n.indexedAt) >= twentyFourHoursAgo
        );
        
        allNotifs = [...allNotifs, ...recentNotifs];
        
        // Stop if we got fewer notifications than requested (end of data)
        // or if the oldest notification in this batch is older than 24 hours
        const oldestInBatch = result.notifications[result.notifications.length - 1];
        if (
          !result.cursor ||
          result.notifications.length < 50 ||
          (oldestInBatch && new Date(oldestInBatch.indexedAt) < twentyFourHoursAgo)
        ) {
          hasMore = false;
        } else {
          nextCursor = result.cursor;
        }
      }

      setAllNotifications(allNotifs);
      setGrouped(groupNotifications(allNotifs));
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (isLoggedIn) {
      fetchData();
    }
  }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = () => {
    setIsLoggedIn(true);
    const session = getSession();
    if (session?.did) {
      setUserDid(session.did);
    }
  };

  const handleOpenProfile = useCallback(async (did: string) => {
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
  }, []);

  const openThread = useCallback(async (uri: string | null) => {
    if (!uri) return;
    const match = uri.match(/^at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/);
    if (match) {
      const [, did, rkey] = match;
      try {
        const profile = await getBlueskyProfile(did);
        if (profile?.handle) {
          window.location.href = `/post/${profile.handle}/${rkey}`;
          return;
        }
      } catch {
        // Fall through
      }
      window.location.href = `/post/${did}/${rkey}`;
    }
  }, []);

  const session = getSession();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  const totalNotifications = allNotifications.length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/80 dark:bg-black/80 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1
            className="text-xl font-bold text-blue-500 cursor-pointer hover:text-blue-600 transition-colors"
            onClick={() => window.location.href = '/'}
          >Lea</h1>
          <div className="flex items-center gap-3">
            <ResearcherSearch 
              onSelectResearcher={handleOpenProfile} 
              onOpenThread={openThread}
              onSearch={(q) => window.location.href = `/search?q=${encodeURIComponent(q)}`}
            />
            <button
              onClick={() => window.location.href = `/u/${session?.handle}`}
              className="px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-full transition-colors"
            >
              @{session?.handle}
            </button>
            {isVerified && (
              <span
                className="flex items-center justify-center w-7 h-7 text-emerald-500"
                title="You are a verified researcher"
              >
                <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                </svg>
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Page header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => window.history.back()}
              className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
              title="Back"
            >
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Notifications Dashboard</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {loading ? 'Loading notifications from the last 24 hours...' : `${totalNotifications} notifications in the last 24 hours`}
              </p>
            </div>
          </div>
        </div>

        {loading && allNotifications.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" onDragEnd={handleDragEnd}>
            {/* Left column - Activity feed */}
            <div className="lg:col-span-2 space-y-6">
              {paneOrder.left.map((paneId) => {
                const paneContent = {
                  'new-followers': (
                    <NewFollowersPane
                      follows={grouped.follows}
                      onOpenProfile={handleOpenProfile}
                    />
                  ),
                  'my-posts': (
                    <MyPostsActivityPane
                      notifications={allNotifications}
                      onOpenProfile={handleOpenProfile}
                      onOpenPost={openThread}
                    />
                  ),
                }[paneId];
                
                if (!paneContent) return null;
                
                return (
                  <DraggablePane
                    key={paneId}
                    id={paneId}
                    onDragStart={(e) => handleDragStart(e, paneId, 'left')}
                    onDragOver={(e) => handleDragOver(e, paneId, 'left')}
                    onDrop={(e) => handleDrop(e, paneId, 'left')}
                    isDragging={draggingPane === paneId}
                    isDropTarget={dropTarget === paneId}
                  >
                    {paneContent}
                  </DraggablePane>
                );
              })}
            </div>

            {/* Right column - Stats and insights */}
            <div className="space-y-6">
              {paneOrder.right.map((paneId) => {
                const paneContent = {
                  'alerts': (
                    <AlertsSection
                      onOpenPost={openThread}
                      onOpenProfile={handleOpenProfile}
                    />
                  ),
                  'breakdown': <CategoryBreakdown grouped={grouped} />,
                  'top-interactors': (
                    <TopInteractors
                      notifications={allNotifications}
                      onOpenProfile={handleOpenProfile}
                    />
                  ),
                }[paneId];
                
                if (!paneContent) return null;
                
                return (
                  <DraggablePane
                    key={paneId}
                    id={paneId}
                    onDragStart={(e) => handleDragStart(e, paneId, 'right')}
                    onDragOver={(e) => handleDragOver(e, paneId, 'right')}
                    onDrop={(e) => handleDrop(e, paneId, 'right')}
                    isDragging={draggingPane === paneId}
                    isDropTarget={dropTarget === paneId}
                  >
                    {paneContent}
                  </DraggablePane>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function NotificationsExplorerPage() {
  return (
    <SettingsProvider>
      <BookmarksProvider>
        <FeedsProvider>
          <FollowingProvider>
            <NotificationsExplorerContent />
          </FollowingProvider>
        </FeedsProvider>
      </BookmarksProvider>
    </SettingsProvider>
  );
}
