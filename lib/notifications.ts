import { getAgent } from './bluesky';

export type NotificationReason = 'like' | 'repost' | 'quote' | 'reply' | 'follow' | 'mention';

export interface NotificationItem {
  uri: string;
  cid: string;
  reason: NotificationReason;
  reasonSubject?: string; // URI of the post that was liked/reposted/etc
  isRead: boolean;
  indexedAt: string;
  author: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
    viewer?: {
      following?: string;
      followedBy?: string;
    };
  };
  // For replies/quotes/mentions, the post record
  record?: {
    text?: string;
    createdAt?: string;
  };
  // For likes/reposts, the text of the post that was interacted with
  subjectText?: string;
}

export interface GroupedNotifications {
  likes: NotificationItem[];
  reposts: NotificationItem[];
  quotes: NotificationItem[];
  replies: NotificationItem[];
  follows: NotificationItem[];
  mentions: NotificationItem[];
}

// Storage key for last viewed timestamps
const LAST_VIEWED_KEY = 'lea-notifications-last-viewed';

interface LastViewedTimestamps {
  likes: string | null;
  reposts: string | null;
  quotes: string | null;
  replies: string | null;
  follows: string | null;
  mentions: string | null;
}

// Get last viewed timestamps from localStorage
export function getLastViewedTimestamps(): LastViewedTimestamps {
  if (typeof window === 'undefined') {
    return { likes: null, reposts: null, quotes: null, replies: null, follows: null, mentions: null };
  }

  const stored = localStorage.getItem(LAST_VIEWED_KEY);
  if (!stored) {
    return { likes: null, reposts: null, quotes: null, replies: null, follows: null, mentions: null };
  }

  try {
    const parsed = JSON.parse(stored);
    // Ensure mentions key exists for backwards compatibility
    if (parsed.mentions === undefined) {
      parsed.mentions = null;
    }
    return parsed;
  } catch {
    return { likes: null, reposts: null, quotes: null, replies: null, follows: null, mentions: null };
  }
}

// Update last viewed timestamp for a category
export function markCategoryViewed(category: keyof LastViewedTimestamps): void {
  if (typeof window === 'undefined') return;
  
  const current = getLastViewedTimestamps();
  current[category] = new Date().toISOString();
  localStorage.setItem(LAST_VIEWED_KEY, JSON.stringify(current));
}

// Check if a notification is unread based on last viewed timestamp
export function isNotificationUnread(
  notification: NotificationItem,
  lastViewed: string | null
): boolean {
  if (!lastViewed) return true; // Never viewed = all unread
  return new Date(notification.indexedAt) > new Date(lastViewed);
}

// Fetch notifications from Bluesky API
export async function fetchNotifications(cursor?: string): Promise<{
  notifications: NotificationItem[];
  cursor?: string;
}> {
  const agent = getAgent();
  if (!agent) throw new Error('Not logged in');
  
  const response = await agent.listNotifications({
    limit: 50,
    cursor,
  });
  
  const notifications: NotificationItem[] = response.data.notifications.map((n) => ({
    uri: n.uri,
    cid: n.cid,
    reason: n.reason as NotificationReason,
    reasonSubject: n.reasonSubject,
    isRead: n.isRead,
    indexedAt: n.indexedAt,
    author: {
      did: n.author.did,
      handle: n.author.handle,
      displayName: n.author.displayName,
      avatar: n.author.avatar,
      viewer: n.author.viewer ? {
        following: n.author.viewer.following,
        followedBy: n.author.viewer.followedBy,
      } : undefined,
    },
    record: n.record as NotificationItem['record'],
  }));
  
  // Fetch subject posts for likes/reposts to get their text
  const subjectUris = notifications
    .filter(n => (n.reason === 'like' || n.reason === 'repost') && n.reasonSubject)
    .map(n => n.reasonSubject!)
    .filter((uri, index, arr) => arr.indexOf(uri) === index); // dedupe
  
  if (subjectUris.length > 0) {
    try {
      // Batch fetch posts (max 25 at a time)
      const batchSize = 25;
      const subjectTexts: Record<string, string> = {};
      
      for (let i = 0; i < subjectUris.length; i += batchSize) {
        const batch = subjectUris.slice(i, i + batchSize);
        const postsResponse = await agent.getPosts({ uris: batch });
        for (const post of postsResponse.data.posts) {
          const record = post.record as { text?: string };
          if (record?.text) {
            subjectTexts[post.uri] = record.text;
          }
        }
      }
      
      // Attach subject text to notifications
      for (const notification of notifications) {
        if (notification.reasonSubject && subjectTexts[notification.reasonSubject]) {
          notification.subjectText = subjectTexts[notification.reasonSubject];
        }
      }
    } catch (err) {
      console.error('Failed to fetch subject posts:', err);
    }
  }
  
  return {
    notifications,
    cursor: response.data.cursor,
  };
}

// Group notifications by type
export function groupNotifications(notifications: NotificationItem[]): GroupedNotifications {
  const grouped: GroupedNotifications = {
    likes: [],
    reposts: [],
    quotes: [],
    replies: [],
    follows: [],
    mentions: [],
  };

  for (const notification of notifications) {
    switch (notification.reason) {
      case 'like':
        grouped.likes.push(notification);
        break;
      case 'repost':
        grouped.reposts.push(notification);
        break;
      case 'quote':
        grouped.quotes.push(notification);
        break;
      case 'reply':
        grouped.replies.push(notification);
        break;
      case 'follow':
        grouped.follows.push(notification);
        break;
      case 'mention':
        grouped.mentions.push(notification);
        break;
    }
  }

  return grouped;
}

// Count unread notifications per category
export function countUnread(
  grouped: GroupedNotifications,
  lastViewed: LastViewedTimestamps
): { likes: number; reposts: number; quotes: number; replies: number; follows: number; mentions: number; total: number } {
  const counts = {
    likes: grouped.likes.filter(n => isNotificationUnread(n, lastViewed.likes)).length,
    reposts: grouped.reposts.filter(n => isNotificationUnread(n, lastViewed.reposts)).length,
    quotes: grouped.quotes.filter(n => isNotificationUnread(n, lastViewed.quotes)).length,
    replies: grouped.replies.filter(n => isNotificationUnread(n, lastViewed.replies)).length,
    follows: grouped.follows.filter(n => isNotificationUnread(n, lastViewed.follows)).length,
    mentions: grouped.mentions.filter(n => isNotificationUnread(n, lastViewed.mentions)).length,
    total: 0,
  };
  counts.total = counts.likes + counts.reposts + counts.quotes + counts.replies + counts.follows + counts.mentions;
  return counts;
}

// Get unread notification count from Bluesky API (lightweight, no full fetch)
export async function getUnreadNotificationCount(): Promise<number> {
  const agent = getAgent();
  if (!agent) return 0;

  try {
    const response = await agent.countUnreadNotifications();
    return response.data.count;
  } catch (err) {
    console.error('Failed to get unread notification count:', err);
    return 0;
  }
}

// Update notification seen state on server
export async function updateSeenNotifications(): Promise<void> {
  const agent = getAgent();
  if (!agent) return;
  
  try {
    await agent.updateSeenNotifications();
  } catch (err) {
    console.error('Failed to update seen notifications:', err);
  }
}

// --- Notification type preferences (controls which types show the unread dot) ---

const NOTIFICATION_PREFS_KEY = 'lea-notification-type-prefs';

export interface NotificationTypePrefs {
  likes: boolean;
  reposts: boolean;
  quotes: boolean;
  replies: boolean;
  follows: boolean;
  mentions: boolean;
}

const DEFAULT_PREFS: NotificationTypePrefs = {
  likes: true,
  reposts: true,
  quotes: true,
  replies: true,
  follows: true,
  mentions: true,
};

export function getNotificationTypePrefs(): NotificationTypePrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const saved = localStorage.getItem(NOTIFICATION_PREFS_KEY);
    if (saved) {
      return { ...DEFAULT_PREFS, ...JSON.parse(saved) };
    }
  } catch { /* ignore */ }
  return DEFAULT_PREFS;
}

export function setNotificationTypePrefs(prefs: NotificationTypePrefs): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(prefs));
}

// Map notification reasons to pref keys
const REASON_TO_PREF: Record<string, keyof NotificationTypePrefs> = {
  like: 'likes',
  repost: 'reposts',
  quote: 'quotes',
  reply: 'replies',
  follow: 'follows',
  mention: 'mentions',
};

// Get unread count filtered by user's notification type preferences.
// Fetches one page of notifications and counts unread ones for enabled types.
export async function getFilteredUnreadNotificationCount(): Promise<number> {
  const agent = getAgent();
  if (!agent) return 0;

  const prefs = getNotificationTypePrefs();
  // If all types enabled, use the lightweight API
  const allEnabled = Object.values(prefs).every(v => v);
  if (allEnabled) {
    return getUnreadNotificationCount();
  }

  try {
    const response = await agent.listNotifications({ limit: 50 });
    let count = 0;
    for (const n of response.data.notifications) {
      if (!n.isRead) {
        const prefKey = REASON_TO_PREF[n.reason];
        if (prefKey && prefs[prefKey]) {
          count++;
        }
      }
    }
    return count;
  } catch (err) {
    console.error('Failed to get filtered unread count:', err);
    return 0;
  }
}
