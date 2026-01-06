'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { restoreSession, getSession, getBlueskyProfile } from '@/lib/bluesky';
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

// Active Posts component - shows which posts are getting the most engagement
function ActivePosts({
  notifications,
  onOpenPost,
}: {
  notifications: NotificationItem[];
  onOpenPost: (uri: string) => void;
}) {
  const posts = useMemo(() => {
    const postMap: Record<string, {
      uri: string;
      text: string;
      counts: { likes: number; reposts: number; quotes: number; replies: number; mentions: number };
      total: number;
      latestActivity: string;
    }> = {};
    
    for (const n of notifications) {
      // Get the post URI - for likes/reposts it's reasonSubject, for replies/quotes it's the post itself
      const postUri = n.reasonSubject || n.uri;
      const postText = n.subjectText || n.record?.text || '';
      
      if (!postUri || n.reason === 'follow') continue;
      
      if (!postMap[postUri]) {
        postMap[postUri] = {
          uri: postUri,
          text: postText,
          counts: { likes: 0, reposts: 0, quotes: 0, replies: 0, mentions: 0 },
          total: 0,
          latestActivity: n.indexedAt,
        };
      }
      
      if (n.reason in postMap[postUri].counts) {
        postMap[postUri].counts[n.reason as keyof typeof postMap[string]['counts']]++;
        postMap[postUri].total++;
      }
      
      // Update latest activity
      if (new Date(n.indexedAt) > new Date(postMap[postUri].latestActivity)) {
        postMap[postUri].latestActivity = n.indexedAt;
      }
      
      // Update text if we have it
      if (postText && !postMap[postUri].text) {
        postMap[postUri].text = postText;
      }
    }
    
    return Object.values(postMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [notifications]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
        <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        Most Active Posts
      </h3>
      
      {posts.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">No post activity yet</p>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <div
              key={post.uri}
              className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              onClick={() => onOpenPost(post.uri)}
            >
              <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 mb-2">
                {post.text || <span className="italic text-gray-400">Post content unavailable</span>}
              </p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {post.counts.likes > 0 && (
                    <span className="flex items-center gap-1 text-xs text-rose-500">
                      {CATEGORY_ICONS.likes}
                      {post.counts.likes}
                    </span>
                  )}
                  {post.counts.reposts > 0 && (
                    <span className="flex items-center gap-1 text-xs text-emerald-500">
                      {CATEGORY_ICONS.reposts}
                      {post.counts.reposts}
                    </span>
                  )}
                  {post.counts.quotes > 0 && (
                    <span className="flex items-center gap-1 text-xs text-purple-500">
                      {CATEGORY_ICONS.quotes}
                      {post.counts.quotes}
                    </span>
                  )}
                  {post.counts.replies > 0 && (
                    <span className="flex items-center gap-1 text-xs text-blue-500">
                      {CATEGORY_ICONS.replies}
                      {post.counts.replies}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-400">{formatTime(post.latestActivity)}</span>
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

// Timeline activity chart
function ActivityTimeline({ notifications }: { notifications: NotificationItem[] }) {
  const hourlyData = useMemo(() => {
    const now = new Date();
    const hours: { hour: number; count: number; label: string }[] = [];
    
    // Last 24 hours
    for (let i = 23; i >= 0; i--) {
      const hourDate = new Date(now.getTime() - i * 60 * 60 * 1000);
      hours.push({
        hour: hourDate.getHours(),
        count: 0,
        label: hourDate.getHours().toString().padStart(2, '0') + ':00',
      });
    }
    
    // Count notifications per hour
    for (const n of notifications) {
      const nDate = new Date(n.indexedAt);
      const hoursDiff = Math.floor((now.getTime() - nDate.getTime()) / (60 * 60 * 1000));
      if (hoursDiff >= 0 && hoursDiff < 24) {
        const index = 23 - hoursDiff;
        if (hours[index]) {
          hours[index].count++;
        }
      }
    }
    
    return hours;
  }, [notifications]);

  const maxCount = Math.max(...hourlyData.map(h => h.count), 1);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
        <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Activity (Last 24 Hours)
      </h3>
      
      <div className="flex items-end gap-1 h-20">
        {hourlyData.map((hour, i) => (
          <div
            key={i}
            className="flex-1 flex flex-col items-center group"
          >
            <div className="relative w-full flex justify-center">
              <div
                className="w-full max-w-[12px] bg-emerald-400 dark:bg-emerald-500 rounded-t transition-all hover:bg-emerald-500 dark:hover:bg-emerald-400"
                style={{ height: `${Math.max((hour.count / maxCount) * 64, hour.count > 0 ? 4 : 0)}px` }}
              />
              {/* Tooltip */}
              <div className="absolute bottom-full mb-1 hidden group-hover:block z-10">
                <div className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs px-2 py-1 rounded whitespace-nowrap">
                  {hour.label}: {hour.count} notifications
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2">
        <span className="text-xs text-gray-400">24h ago</span>
        <span className="text-xs text-gray-400">Now</span>
      </div>
    </div>
  );
}

// Recent activity feed
function RecentActivity({
  notifications,
  onOpenPost,
  onOpenProfile,
}: {
  notifications: NotificationItem[];
  onOpenPost: (uri: string) => void;
  onOpenProfile: (did: string) => void;
}) {
  const recent = notifications.slice(0, 20);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          Recent Activity
        </h3>
      </div>
      
      <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-[500px] overflow-y-auto">
        {recent.map((n) => {
          const colors = CATEGORY_COLORS[n.reason as keyof typeof CATEGORY_COLORS] || CATEGORY_COLORS.likes;
          
          return (
            <div
              key={n.uri}
              className={`p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer border-l-4 ${colors.border}`}
              onClick={() => {
                if (n.reason === 'follow') {
                  onOpenProfile(n.author.did);
                } else if (n.reasonSubject) {
                  onOpenPost(n.reasonSubject);
                } else {
                  onOpenPost(n.uri);
                }
              }}
            >
              <div className="flex items-start gap-3">
                <span className={colors.icon}>
                  {CATEGORY_ICONS[n.reason as keyof typeof CATEGORY_ICONS]}
                </span>
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
                  <p className="text-sm">
                    <span
                      className="font-medium text-gray-900 dark:text-gray-100 hover:text-blue-500 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenProfile(n.author.did);
                      }}
                    >
                      {n.author.displayName || n.author.handle}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">
                      {n.reason === 'like' && ' liked your post'}
                      {n.reason === 'repost' && ' reposted your post'}
                      {n.reason === 'quote' && ' quoted your post'}
                      {n.reason === 'reply' && ' replied to your post'}
                      {n.reason === 'follow' && ' followed you'}
                      {n.reason === 'mention' && ' mentioned you'}
                    </span>
                  </p>
                  {(n.record?.text || n.subjectText) && (
                    <p className="text-xs text-gray-500 dark:text-gray-500 line-clamp-1 mt-0.5">
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
        })}
      </div>
    </div>
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
  const [cursor, setCursor] = useState<string | undefined>();

  // Restore session on mount
  useEffect(() => {
    restoreSession().then((restored) => {
      if (restored) {
        setIsLoggedIn(true);
        const session = getSession();
        if (session?.did) {
          setUserDid(session.did);
          fetch(`/api/researchers?did=${session.did}`)
            .then(res => res.json())
            .then(data => {
              if (data.researchers?.some((r: { did: string }) => r.did === session.did)) {
                setIsVerified(true);
              }
            })
            .catch(() => {});
        }
      }
      setIsLoading(false);
    });
  }, [setUserDid]);

  // Fetch notifications
  const fetchData = useCallback(async (loadMore = false) => {
    setLoading(true);
    try {
      const result = await fetchNotifications(loadMore ? cursor : undefined);
      const newGrouped = groupNotifications(result.notifications);

      if (loadMore) {
        setAllNotifications(prev => [...prev, ...result.notifications]);
        setGrouped((prev) => ({
          likes: [...prev.likes, ...newGrouped.likes],
          reposts: [...prev.reposts, ...newGrouped.reposts],
          quotes: [...prev.quotes, ...newGrouped.quotes],
          replies: [...prev.replies, ...newGrouped.replies],
          follows: [...prev.follows, ...newGrouped.follows],
          mentions: [...prev.mentions, ...newGrouped.mentions],
        }));
      } else {
        setAllNotifications(result.notifications);
        setGrouped(newGrouped);
      }

      setCursor(result.cursor);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [cursor]);

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
        window.location.href = `/u/${profile.handle}`;
      } else {
        window.location.href = `/u/${did}`;
      }
    } catch {
      window.location.href = `/u/${did}`;
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
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Notification Explorer</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {totalNotifications} notifications loaded
                {cursor && (
                  <button
                    onClick={() => fetchData(true)}
                    disabled={loading}
                    className="ml-2 text-blue-500 hover:text-blue-600 disabled:opacity-50"
                  >
                    {loading ? 'Loading...' : 'Load more'}
                  </button>
                )}
              </p>
            </div>
          </div>
        </div>

        {loading && allNotifications.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left column - Activity feed */}
            <div className="lg:col-span-2 space-y-6">
              <ActivityTimeline notifications={allNotifications} />
              <RecentActivity
                notifications={allNotifications}
                onOpenPost={openThread}
                onOpenProfile={handleOpenProfile}
              />
            </div>

            {/* Right column - Stats and insights */}
            <div className="space-y-6">
              <CategoryBreakdown grouped={grouped} />
              <TopInteractors
                notifications={allNotifications}
                onOpenProfile={handleOpenProfile}
              />
              <ActivePosts
                notifications={allNotifications}
                onOpenPost={openThread}
              />
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
