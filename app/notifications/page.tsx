'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getSession, getBlueskyProfile, checkSafetyAlerts, dismissSafetyAlert, SafetyAlert, AlertThresholds, followUser, unfollowUser, isVerifiedResearcher, Label, buildProfileUrl, buildPostUrl, checkVerificationStatus, blockUser, getKnownFollowers, BlueskyProfile, setCachedHandle } from '@/lib/bluesky';
import { initOAuth } from '@/lib/oauth';
import { refreshAgent } from '@/lib/bluesky';
import { useFollowing } from '@/lib/following-context';
import { SettingsProvider, useSettings, LeaSettings } from '@/lib/settings';
import { BookmarksProvider, useBookmarks } from '@/lib/bookmarks';
import { FeedsProvider } from '@/lib/feeds';
import { FollowingProvider } from '@/lib/following-context';
import {
  fetchNotifications,
  groupNotifications,
  NotificationItem,
  GroupedNotifications,
  NotificationTypePrefs,
  getNotificationTypePrefs,
  setNotificationTypePrefs,
  getNotificationsPageLastSeen,
  setNotificationsPageLastSeen,
} from '@/lib/notifications';
import Login from '@/components/Login';
import DMSidebar from '@/components/DMSidebar';
import ResearcherSearch from '@/components/ResearcherSearch';
import ProfileHoverCard from '@/components/ProfileHoverCard';
import ProfileLabels from '@/components/ProfileLabels';

// Notification type preferences pane — controls which types show the sidebar dot
const NOTIF_TOGGLE_ITEMS: { key: keyof NotificationTypePrefs; label: string; color: string }[] = [
  { key: 'replies', label: 'Replies', color: 'bg-blue-500' },
  { key: 'quotes', label: 'Quotes', color: 'bg-purple-500' },
  { key: 'mentions', label: 'Mentions', color: 'bg-amber-500' },
  { key: 'likes', label: 'Likes', color: 'bg-pink-500' },
  { key: 'reposts', label: 'Reposts', color: 'bg-emerald-500' },
  { key: 'follows', label: 'Follows', color: 'bg-blue-400' },
];

function NotificationPrefsPane() {
  const [prefs, setPrefs] = useState<NotificationTypePrefs>(() => getNotificationTypePrefs());

  const toggle = (key: keyof NotificationTypePrefs) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    setNotificationTypePrefs(updated);
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        Notify me about
      </h3>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
        Controls the notification dot on the sidebar
      </p>
      <div className="space-y-2">
        {NOTIF_TOGGLE_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => toggle(item.key)}
            className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <div className={`w-8 h-4 rounded-full relative transition-colors ${
              prefs[item.key] ? item.color : 'bg-gray-300 dark:bg-gray-600'
            }`}>
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${
                prefs[item.key] ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </div>
            <span className={`text-xs font-medium ${
              prefs[item.key] ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'
            }`}>
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Storage key for pane order
const PANE_ORDER_KEY = 'lea-dashboard-pane-order';

// Default pane order
const DEFAULT_LEFT_PANES = ['needs-response', 'new-followers', 'my-posts', 'mentions'];
const DEFAULT_RIGHT_PANES = ['messages', 'alerts', 'breakdown', 'top-interactors', 'notif-prefs'];

// Load pane order from localStorage
function loadPaneOrder(): { left: string[]; right: string[] } {
  if (typeof window === 'undefined') {
    return { left: DEFAULT_LEFT_PANES, right: DEFAULT_RIGHT_PANES };
  }
  try {
    const saved = localStorage.getItem(PANE_ORDER_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Migrate: add 'needs-response' if missing from left panes
      if (Array.isArray(parsed.left) && !parsed.left.includes('needs-response')) {
        parsed.left = ['needs-response', ...parsed.left];
      }
      // Migrate: add 'notif-prefs' if missing from right panes
      if (Array.isArray(parsed.right) && !parsed.right.includes('notif-prefs')) {
        parsed.right = [...parsed.right, 'notif-prefs'];
      }
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
        className="absolute top-3 right-3 z-10 p-1.5 rounded-md bg-gray-100/90 dark:bg-gray-800/90 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-grab active:cursor-grabbing"
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
    bg: 'bg-pink-50 dark:bg-pink-900/20',
    border: 'border-pink-300',
    text: 'text-pink-600 dark:text-pink-300',
    icon: 'text-pink-400',
    fill: 'fill-pink-400',
    bar: 'bg-pink-400',
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
  const { settings } = useSettings();
  
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
          {interactors.map((item, index) => {
            const avatarRingClass = getAvatarRingClass(item.author.viewer, settings);
            return (
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
                      className={`w-8 h-8 rounded-full cursor-pointer transition-all ${avatarRingClass || 'hover:ring-2 hover:ring-blue-400'}`}
                      onClick={() => onOpenProfile(item.author.did)}
                    />
                  ) : (
                    <div
                      className={`w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold cursor-pointer transition-all ${avatarRingClass || 'hover:ring-2 hover:ring-blue-400'}`}
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
            );
          })}
        </div>
      )}
    </div>
  );
}

// Category breakdown chart — interactive, click to filter
function CategoryBreakdown({
  grouped,
  activeFilter,
  onFilterChange,
}: {
  grouped: GroupedNotifications;
  activeFilter: string | null;
  onFilterChange: (filter: string | null) => void;
}) {
  const categories = [
    { key: 'replies', label: 'Replies', count: grouped.replies.length },
    { key: 'quotes', label: 'Quotes', count: grouped.quotes.length },
    { key: 'mentions', label: 'Mentions', count: grouped.mentions.length },
    { key: 'likes', label: 'Likes', count: grouped.likes.length },
    { key: 'reposts', label: 'Reposts', count: grouped.reposts.length },
    { key: 'follows', label: 'Follows', count: grouped.follows.length },
  ];

  const total = categories.reduce((sum, c) => sum + c.count, 0);
  const maxCount = Math.max(...categories.map(c => c.count), 1);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Filter
          <span className="text-xs font-normal text-gray-400">{total} total</span>
        </h3>
        {activeFilter && (
          <button
            onClick={() => onFilterChange(null)}
            className="text-xs text-blue-500 hover:text-blue-600"
          >
            Clear filter
          </button>
        )}
      </div>

      <div className="space-y-2">
        {categories.map((cat) => {
          const colors = CATEGORY_COLORS[cat.key as keyof typeof CATEGORY_COLORS];
          const percentage = total > 0 ? Math.round((cat.count / total) * 100) : 0;
          const isActive = activeFilter === cat.key;
          const isDimmed = activeFilter !== null && !isActive;

          return (
            <button
              key={cat.key}
              onClick={() => onFilterChange(isActive ? null : cat.key)}
              className={`w-full flex items-center gap-3 p-1.5 rounded-lg transition-all cursor-pointer ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-300 dark:ring-blue-700'
                  : isDimmed
                    ? 'opacity-40 hover:opacity-70'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
              }`}
            >
              <span className={`${colors.icon} w-5`}>
                {CATEGORY_ICONS[cat.key as keyof typeof CATEGORY_ICONS]}
              </span>
              <span className="text-xs text-gray-600 dark:text-gray-400 w-16 text-left">{cat.label}</span>
              <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full ${colors.bar} rounded-full transition-all duration-500`}
                  style={{ width: `${(cat.count / maxCount) * 100}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 w-8 text-right">
                {cat.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}


// Helper to compute avatar ring class based on relationship
function getAvatarRingClass(
  viewer: { following?: string; followedBy?: string } | undefined,
  settings: LeaSettings
): string {
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
// Follower categories for the New Followers pane
type FollowerCategory = 'people_you_may_know' | 'everyone_else' | 'potential_spam';

interface EnhancedFollowerProfile extends BlueskyProfile {
  indexedAt: string; // When they followed
  mutualFollowers?: { did: string; handle: string; displayName?: string; avatar?: string }[];
  category?: FollowerCategory;
}

// Categorize a follower into one of three sections
function categorizeFollower(profile: EnhancedFollowerProfile): FollowerCategory {
  const isVerified = profile.labels ? isVerifiedResearcher(profile.labels) : false;
  const hasMutuals = profile.mutualFollowers && profile.mutualFollowers.length > 0;
  
  // People You May Know: verified researchers OR has mutual followers
  if (isVerified || hasMutuals) {
    return 'people_you_may_know';
  }
  
  // Potential Spam indicators
  const hasNoAvatar = !profile.avatar;
  const hasNoBio = !profile.description || profile.description.trim().length < 10;
  const followsCount = profile.followsCount || 0;
  const followsManyAccounts = followsCount > 5000;
  
  // Potential Spam: has spam indicators AND NOT in People You May Know
  if (hasNoAvatar || hasNoBio || followsManyAccounts) {
    return 'potential_spam';
  }
  
  // Everyone Else
  return 'everyone_else';
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
      window.open(buildProfileUrl(profile.handle, profile.did), '_blank');
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
      className="p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 last:border-b-0"
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
              className={`w-10 h-10 rounded-full ${getAvatarRingClass()}`}
            />
          ) : (
            <div className={`w-10 h-10 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-700 flex items-center justify-center text-white text-sm font-bold ${getAvatarRingClass()}`}>
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
              className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate cursor-pointer hover:underline"
              onClick={handleProfileClick}
              onAuxClick={handleProfileClick}
            >
              {profile.displayName || profile.handle}
            </span>
            <span className="text-[11px] text-gray-400">{formatTime(profile.indexedAt)}</span>
          </div>
          <p
            className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:underline"
            onClick={handleProfileClick}
            onAuxClick={handleProfileClick}
          >
            @{profile.handle}
          </p>

          {/* Bio */}
          {profile.description ? (
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300 line-clamp-2">
              {profile.description}
            </p>
          ) : null}

          {/* Labels */}
          <ProfileLabels profile={profile} compact />

          {/* Stats row */}
          <div className="mt-1.5 flex items-center gap-3 flex-wrap text-[11px]">
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
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              {hasNoAvatar && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  No avatar
                </span>
              )}
              {hasNoBio && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                  </svg>
                  No bio
                </span>
              )}
              {followsManyAccounts && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded">
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
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              isFollowing
                ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                : 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/60'
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
            className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors disabled:opacity-50"
          >
            {blockLoading ? (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              'Block'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Collapsible section for follower categories
function FollowerSection({
  title,
  count,
  icon,
  iconColor,
  bgColor,
  textColor,
  children,
  defaultExpanded = true,
}: {
  title: string;
  count: number;
  icon: React.ReactNode;
  iconColor: string;
  bgColor: string;
  textColor: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  if (count === 0) return null;
  
  return (
    <div>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full px-3 py-2 flex items-center justify-between ${bgColor} border-y border-gray-100 dark:border-gray-800 hover:opacity-90 transition-opacity`}
      >
        <div className="flex items-center gap-2">
          <span className={iconColor}>{icon}</span>
          <span className={`text-xs font-semibold ${textColor}`}>{title}</span>
          <span className={`px-1.5 py-0.5 text-xs font-medium rounded-full ${bgColor} ${textColor}`}>
            {count}
          </span>
        </div>
        <svg
          className={`w-4 h-4 ${textColor} transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isExpanded && children}
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

          const enhancedProfile: EnhancedFollowerProfile = {
            ...profile,
            indexedAt: f.indexedAt,
            mutualFollowers,
          };
          
          // Categorize the follower
          enhancedProfile.category = categorizeFollower(enhancedProfile);
          
          return enhancedProfile;
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

  // Sort profiles within each category
  const sortProfiles = useCallback((profileList: EnhancedFollowerProfile[]) => {
    return [...profileList].sort((a, b) => {
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
  }, [sortBy]);

  // Categorize and sort profiles
  const categorizedProfiles = useMemo(() => {
    const filtered = profiles.filter((p) => !blockedDids.has(p.did));
    
    const peopleYouMayKnow = sortProfiles(filtered.filter(p => p.category === 'people_you_may_know'));
    const everyoneElse = sortProfiles(filtered.filter(p => p.category === 'everyone_else'));
    const potentialSpam = sortProfiles(filtered.filter(p => p.category === 'potential_spam'));
    
    return { peopleYouMayKnow, everyoneElse, potentialSpam };
  }, [profiles, blockedDids, sortProfiles]);

  const allProfiles = useMemo(() => [
    ...categorizedProfiles.peopleYouMayKnow,
    ...categorizedProfiles.everyoneElse,
    ...categorizedProfiles.potentialSpam,
  ], [categorizedProfiles]);

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
      setSelectedDids(new Set(allProfiles.map((p) => p.did)));
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

  const visibleCount = allProfiles.length;
  const allSelected = visibleCount > 0 && selectedDids.size === visibleCount;
  const someSelected = selectedDids.size > 0 && selectedDids.size < visibleCount;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            New Followers
            <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">
              {visibleCount}
            </span>
          </h3>

          {/* Sort dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as FollowerSortOption)}
            className="text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 mr-10 text-gray-600 dark:text-gray-300"
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
            <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : allProfiles.length === 0 ? (
          <div className="p-8 text-center">
            <svg className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-sm text-gray-500 dark:text-gray-400">No new followers in the last 48 hours</p>
          </div>
        ) : (
          <>
            {/* People You May Know section */}
            <FollowerSection
              title="People You May Know"
              count={categorizedProfiles.peopleYouMayKnow.length}
              icon={
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
              iconColor="text-emerald-600 dark:text-emerald-400"
              bgColor="bg-emerald-50 dark:bg-emerald-900/20"
              textColor="text-emerald-700 dark:text-emerald-300"
              defaultExpanded={true}
            >
              {categorizedProfiles.peopleYouMayKnow.map((profile) => (
                <EnhancedFollowerRow
                  key={profile.did}
                  profile={profile}
                  isSelected={selectedDids.has(profile.did)}
                  onSelect={handleSelect}
                  onOpenProfile={onOpenProfile}
                  onBlocked={handleBlocked}
                />
              ))}
            </FollowerSection>

            {/* Everyone Else section */}
            <FollowerSection
              title="Everyone Else"
              count={categorizedProfiles.everyoneElse.length}
              icon={
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              }
              iconColor="text-blue-600 dark:text-blue-400"
              bgColor="bg-blue-50 dark:bg-blue-900/20"
              textColor="text-blue-700 dark:text-blue-300"
              defaultExpanded={true}
            >
              {categorizedProfiles.everyoneElse.map((profile) => (
                <EnhancedFollowerRow
                  key={profile.did}
                  profile={profile}
                  isSelected={selectedDids.has(profile.did)}
                  onSelect={handleSelect}
                  onOpenProfile={onOpenProfile}
                  onBlocked={handleBlocked}
                />
              ))}
            </FollowerSection>

            {/* Potential Spam section - collapsed by default */}
            <FollowerSection
              title="Potential Spam"
              count={categorizedProfiles.potentialSpam.length}
              icon={
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              }
              iconColor="text-gray-500 dark:text-gray-400"
              bgColor="bg-gray-50 dark:bg-gray-800/50"
              textColor="text-gray-600 dark:text-gray-400"
              defaultExpanded={false}
            >
              {categorizedProfiles.potentialSpam.map((profile) => (
                <EnhancedFollowerRow
                  key={profile.did}
                  profile={profile}
                  isSelected={selectedDids.has(profile.did)}
                  onSelect={handleSelect}
                  onOpenProfile={onOpenProfile}
                  onBlocked={handleBlocked}
                />
              ))}
            </FollowerSection>
          </>
        )}
      </div>
    </div>
  );
}


// --- Bluesky-style Notification Stream ---

// A processed stream item (either a single notification or a clustered group)
interface StreamItem {
  kind: 'like-cluster' | 'repost-cluster' | 'reply' | 'quote' | 'mention';
  // For clusters
  authors: NotificationItem['author'][];
  // For single items
  author: NotificationItem['author'];
  // Post text: for likes/reposts this is the subject post text; for replies/quotes/mentions this is the author's text
  text?: string;
  // The subject post text (your post) for replies/quotes
  subjectText?: string;
  // URI to open (post or profile)
  postUri?: string;
  // Time of the most recent notification in this item
  time: string;
  // Whether any notification in this item is unread
  isUnread: boolean;
  // Action label for display
  actionLabel: string;
}

// Build stream items from raw notifications, applying optional category filter.
// Uses a local "last seen" timestamp instead of Bluesky's isRead flag, which
// gets reset when the user views notifications in the Bluesky app/website.
function buildStreamItems(notifications: NotificationItem[], activeFilter: string | null, lastSeenTimestamp: string | null): StreamItem[] {
  // Apply filter
  let filtered = notifications;
  if (activeFilter) {
    const reasonMap: Record<string, string[]> = {
      likes: ['like'],
      reposts: ['repost'],
      replies: ['reply'],
      quotes: ['quote'],
      mentions: ['mention'],
      follows: ['follow'],
    };
    const allowedReasons = reasonMap[activeFilter] || [];
    filtered = notifications.filter(n => allowedReasons.includes(n.reason));
  }

  const items: StreamItem[] = [];

  // Cluster likes by post URI
  const likesByPost = new Map<string, NotificationItem[]>();
  // Cluster reposts by post URI
  const repostsByPost = new Map<string, NotificationItem[]>();

  for (const n of filtered) {
    if (n.reason === 'like' && n.reasonSubject) {
      if (!likesByPost.has(n.reasonSubject)) likesByPost.set(n.reasonSubject, []);
      likesByPost.get(n.reasonSubject)!.push(n);
    } else if (n.reason === 'repost' && n.reasonSubject) {
      if (!repostsByPost.has(n.reasonSubject)) repostsByPost.set(n.reasonSubject, []);
      repostsByPost.get(n.reasonSubject)!.push(n);
    } else if (n.reason === 'reply') {
      items.push({
        kind: 'reply',
        authors: [n.author],
        author: n.author,
        text: n.record?.text,
        subjectText: n.subjectText,
        postUri: n.uri,
        time: n.indexedAt,
        isUnread: !lastSeenTimestamp || new Date(n.indexedAt) > new Date(lastSeenTimestamp),
        actionLabel: 'replied to your post',
      });
    } else if (n.reason === 'quote') {
      items.push({
        kind: 'quote',
        authors: [n.author],
        author: n.author,
        text: n.record?.text,
        subjectText: n.subjectText,
        postUri: n.uri,
        time: n.indexedAt,
        isUnread: !lastSeenTimestamp || new Date(n.indexedAt) > new Date(lastSeenTimestamp),
        actionLabel: 'quoted your post',
      });
    } else if (n.reason === 'mention') {
      items.push({
        kind: 'mention',
        authors: [n.author],
        author: n.author,
        text: n.record?.text,
        postUri: n.uri,
        time: n.indexedAt,
        isUnread: !lastSeenTimestamp || new Date(n.indexedAt) > new Date(lastSeenTimestamp),
        actionLabel: 'mentioned you',
      });
    }
    // Follows are excluded — they appear in the NewFollowersPane instead
  }

  // Build like clusters
  for (const [postUri, likes] of likesByPost.entries()) {
    const sorted = likes.sort((a, b) => new Date(b.indexedAt).getTime() - new Date(a.indexedAt).getTime());
    const authors = sorted.map(l => l.author);
    // Dedupe authors by did
    const seen = new Set<string>();
    const uniqueAuthors = authors.filter(a => {
      if (seen.has(a.did)) return false;
      seen.add(a.did);
      return true;
    });
    items.push({
      kind: 'like-cluster',
      authors: uniqueAuthors,
      author: uniqueAuthors[0],
      subjectText: sorted[0].subjectText,
      postUri,
      time: sorted[0].indexedAt,
      isUnread: !lastSeenTimestamp || sorted.some(l => new Date(l.indexedAt) > new Date(lastSeenTimestamp)),
      actionLabel: uniqueAuthors.length === 1 ? 'liked your post' : 'liked your post',
    });
  }

  // Build repost clusters
  for (const [postUri, reposts] of repostsByPost.entries()) {
    const sorted = reposts.sort((a, b) => new Date(b.indexedAt).getTime() - new Date(a.indexedAt).getTime());
    const authors = sorted.map(r => r.author);
    const seen = new Set<string>();
    const uniqueAuthors = authors.filter(a => {
      if (seen.has(a.did)) return false;
      seen.add(a.did);
      return true;
    });
    items.push({
      kind: 'repost-cluster',
      authors: uniqueAuthors,
      author: uniqueAuthors[0],
      subjectText: sorted[0].subjectText,
      postUri,
      time: sorted[0].indexedAt,
      isUnread: !lastSeenTimestamp || sorted.some(r => new Date(r.indexedAt) > new Date(lastSeenTimestamp)),
      actionLabel: 'reposted your post',
    });
  }

  // Sort all items by time, newest first
  items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  return items;
}

// Action icons for stream rows
const STREAM_ICONS: Record<StreamItem['kind'], { icon: React.ReactNode; color: string }> = {
  'like-cluster': {
    color: 'text-pink-500',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
    ),
  },
  'repost-cluster': {
    color: 'text-emerald-500',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
  },
  reply: {
    color: 'text-blue-500',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
      </svg>
    ),
  },
  quote: {
    color: 'text-purple-500',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
      </svg>
    ),
  },
  mention: {
    color: 'text-amber-500',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
      </svg>
    ),
  },
};

// A single row in the notification stream
function NotificationStreamRow({
  item,
  onOpenProfile,
  onOpenPost,
}: {
  item: StreamItem;
  onOpenProfile: (did: string) => void;
  onOpenPost: (uri: string, e?: React.MouseEvent) => void;
}) {
  const { settings } = useSettings();
  const style = STREAM_ICONS[item.kind];
  const isCluster = item.kind === 'like-cluster' || item.kind === 'repost-cluster';
  const displayAuthors = item.authors.slice(0, 5);
  const firstName = item.author.displayName || item.author.handle;
  const othersCount = item.authors.length - 1;

  const handleClick = (e: React.MouseEvent) => {
    if (item.postUri) {
      onOpenPost(item.postUri, e);
    } else {
      onOpenProfile(item.author.did);
    }
  };

  // Format author names for clusters
  const formatAuthors = () => {
    if (othersCount <= 0) return null;
    return (
      <span className="text-gray-500 dark:text-gray-400">
        {' '}and <span className="font-medium text-gray-700 dark:text-gray-300">{othersCount} other{othersCount !== 1 ? 's' : ''}</span>
      </span>
    );
  };

  // Determine what text to show below the action line
  const previewText = (item.kind === 'reply' || item.kind === 'quote' || item.kind === 'mention')
    ? item.text  // Show the other person's text
    : item.subjectText;  // Show your post text for likes/reposts

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
        item.isUnread ? 'bg-blue-50/60 dark:bg-blue-900/15' : ''
      }`}
      onClick={handleClick}
      onAuxClick={handleClick}
    >
      {/* Avatar(s) */}
      <div className="flex-shrink-0 mt-0.5">
        {isCluster && displayAuthors.length > 1 ? (
          <div className="flex -space-x-2">
            {displayAuthors.map((author, i) => {
              const ringClass = getAvatarRingClass(author.viewer, settings);
              return author.avatar ? (
                <img
                  key={author.did}
                  src={author.avatar}
                  alt=""
                  className={`w-8 h-8 rounded-full border-2 border-white dark:border-gray-900 ${ringClass}`}
                  style={{ zIndex: displayAuthors.length - i }}
                  onClick={(e) => { e.stopPropagation(); onOpenProfile(author.did); }}
                />
              ) : (
                <div
                  key={author.did}
                  className={`w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs font-bold border-2 border-white dark:border-gray-900 ${ringClass}`}
                  style={{ zIndex: displayAuthors.length - i }}
                  onClick={(e) => { e.stopPropagation(); onOpenProfile(author.did); }}
                >
                  {(author.displayName || author.handle)[0].toUpperCase()}
                </div>
              );
            })}
          </div>
        ) : (
          <ProfileHoverCard
            did={item.author.did}
            handle={item.author.handle}
            onOpenProfile={() => onOpenProfile(item.author.did)}
          >
            {item.author.avatar ? (
              <img
                src={item.author.avatar}
                alt=""
                className={`w-9 h-9 rounded-full cursor-pointer ${getAvatarRingClass(item.author.viewer, settings)}`}
                onClick={(e) => { e.stopPropagation(); onOpenProfile(item.author.did); }}
              />
            ) : (
              <div
                className={`w-9 h-9 rounded-full bg-gray-400 flex items-center justify-center text-white text-sm font-bold cursor-pointer ${getAvatarRingClass(item.author.viewer, settings)}`}
                onClick={(e) => { e.stopPropagation(); onOpenProfile(item.author.did); }}
              >
                {(item.author.displayName || item.author.handle)[0].toUpperCase()}
              </div>
            )}
          </ProfileHoverCard>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Action line */}
        <div className="flex items-center gap-1.5">
          <span className={`flex-shrink-0 ${style.color}`}>{style.icon}</span>
          <p className="text-sm flex-1 min-w-0">
            <span
              className="font-semibold text-gray-900 dark:text-gray-100 hover:text-blue-500 cursor-pointer"
              onClick={(e) => { e.stopPropagation(); onOpenProfile(item.author.did); }}
            >
              {firstName}
            </span>
            {formatAuthors()}
            <span className="text-gray-500 dark:text-gray-400"> {item.actionLabel}</span>
          </p>
          <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 whitespace-nowrap">
            {formatTime(item.time)}
          </span>
        </div>

        {/* Preview text */}
        {previewText && (
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
            {previewText}
          </p>
        )}
      </div>
    </div>
  );
}

// The main notification stream component
function NotificationStream({
  notifications,
  activeFilter,
  onOpenProfile,
  onOpenPost,
}: {
  notifications: NotificationItem[];
  activeFilter: string | null;
  onOpenProfile: (did: string) => void;
  onOpenPost: (uri: string) => void;
}) {
  // Read the last-seen timestamp once on mount so highlights are stable
  const [lastSeen] = useState(() => getNotificationsPageLastSeen());

  // After notifications load, update the last-seen timestamp with a short delay
  // so the user can see the blue highlights before they disappear on next visit
  useEffect(() => {
    if (notifications.length > 0) {
      const timer = setTimeout(() => {
        setNotificationsPageLastSeen(new Date().toISOString());
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [notifications]);

  const streamItems = useMemo(
    () => buildStreamItems(notifications, activeFilter, lastSeen),
    [notifications, activeFilter, lastSeen]
  );

  if (notifications.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-8 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">No notifications yet</p>
      </div>
    );
  }

  if (streamItems.length === 0 && activeFilter) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-8 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">No {activeFilter} notifications</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="max-h-[800px] overflow-y-auto">
        {streamItems.map((item, i) => (
          <NotificationStreamRow
            key={`${item.kind}-${item.time}-${item.author.did}-${i}`}
            item={item}
            onOpenProfile={onOpenProfile}
            onOpenPost={onOpenPost}
          />
        ))}
      </div>
    </div>
  );
}

function NotificationsExplorerContent() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerified, setIsVerified] = useState(false);
  const { setUserDid } = useBookmarks();
  const { settings, updateSettings } = useSettings();
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

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
    initOAuth().then(async (result) => { refreshAgent(); const restored = !!result?.session;
      if (restored) {
        setIsLoggedIn(true);
        const session = getSession();
        if (session?.did) {
          setUserDid(session.did);
          checkVerificationStatus(session.did).then(setIsVerified);
          
          // Fetch and cache the user's handle if not already cached
          if (session.handle === session.did) {
            try {
              const profile = await getBlueskyProfile(session.did);
              if (profile?.handle) {
                setCachedHandle(profile.handle);
              }
            } catch {
              // Ignore errors
            }
          }
        }
      }
      setIsLoading(false);
    });
  }, [setUserDid]);

  // Fetch all notifications from the last 48 hours
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const cutoffTime = new Date(Date.now() - 48 * 60 * 60 * 1000);
      let allNotifs: NotificationItem[] = [];
      let nextCursor: string | undefined = undefined;
      let pageCount = 0;
      const MAX_PAGES = 50; // Safety limit to prevent infinite loops

      // Keep fetching until we have all notifications from the last 48 hours
      while (pageCount < MAX_PAGES) {
        pageCount++;
        const result = await fetchNotifications(nextCursor);
        
        if (result.notifications.length === 0) {
          // No more notifications
          break;
        }
        
        // Filter to only include notifications from last 48 hours
        const recentNotifs = result.notifications.filter(
          n => new Date(n.indexedAt) >= cutoffTime
        );
        
        allNotifs = [...allNotifs, ...recentNotifs];
        
        // Check the oldest notification in this batch
        const oldestInBatch = result.notifications[result.notifications.length - 1];
        const oldestDate = oldestInBatch ? new Date(oldestInBatch.indexedAt) : null;
        
        // Stop if:
        // 1. No cursor (end of data)
        // 2. The oldest notification in this batch is older than 48 hours
        if (!result.cursor || (oldestDate && oldestDate < cutoffTime)) {
          break;
        }
        
        nextCursor = result.cursor;
      }

      console.log(`Fetched ${allNotifs.length} notifications from ${pageCount} pages`);
      setAllNotifications(allNotifs);
      setGrouped(groupNotifications(allNotifs));
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch and periodic refresh
  useEffect(() => {
    if (isLoggedIn) {
      fetchData();
      
      // Refresh every 60 seconds
      const interval = setInterval(() => {
        if (!loading) fetchData();
      }, 60000);
      
      return () => clearInterval(interval);
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

  const openThread = useCallback(async (uri: string | null, e?: React.MouseEvent) => {
    if (!uri) return;
    const newTab = e && (e.metaKey || e.ctrlKey || e.button === 1);
    const match = uri.match(/^at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/);
    if (match) {
      const [, did, rkey] = match;
      let url: string;
      try {
        const profile = await getBlueskyProfile(did);
        url = profile?.handle
          ? buildPostUrl(profile.handle, rkey, profile.did)
          : buildPostUrl(did, rkey);
      } catch {
        url = buildPostUrl(did, rkey);
      }
      if (newTab) {
        window.open(url, '_blank');
      } else {
        window.location.href = url;
      }
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
              onClick={() => window.location.href = buildProfileUrl(session?.handle || '', session?.did)}
              className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors flex items-center gap-1.5 ${
                isVerified
                  ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                  : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50'
              }`}
              title={isVerified ? 'Verified researcher' : undefined}
            >
              @{session?.handle}
              {isVerified && (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Page header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
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
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Notifications</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {loading ? 'Loading notifications...' : `${totalNotifications} notifications in the last 48 hours`}
                </p>
              </div>
            </div>
            <button
              onClick={() => fetchData()}
              disabled={loading}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors disabled:opacity-50"
              title="Refresh notifications"
            >
              <svg className={`w-5 h-5 text-gray-600 dark:text-gray-300 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {loading && allNotifications.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" onDragEnd={handleDragEnd}>
            {/* Left column - Notification stream + Followers */}
            <div className="lg:col-span-2 space-y-6">
              <NotificationStream
                notifications={allNotifications}
                activeFilter={activeFilter}
                onOpenProfile={handleOpenProfile}
                onOpenPost={openThread}
              />
              <NewFollowersPane
                follows={grouped.follows}
                onOpenProfile={handleOpenProfile}
              />
            </div>

            {/* Right column - Stats and insights */}
            <div className="space-y-6">
              {paneOrder.right.map((paneId) => {
                const paneContent = {
                  'messages': <DMSidebar embedded defaultExpanded />,
                  'alerts': (
                    <AlertsSection
                      onOpenPost={openThread}
                      onOpenProfile={handleOpenProfile}
                    />
                  ),
                  'breakdown': (
                    <CategoryBreakdown
                      grouped={grouped}
                      activeFilter={activeFilter}
                      onFilterChange={setActiveFilter}
                    />
                  ),
                  'top-interactors': (
                    <TopInteractors
                      notifications={allNotifications}
                      onOpenProfile={handleOpenProfile}
                    />
                  ),
                  'notif-prefs': <NotificationPrefsPane />,
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
