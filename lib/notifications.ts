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
}

// Storage key for last viewed timestamps
const LAST_VIEWED_KEY = 'lea-notifications-last-viewed';

interface LastViewedTimestamps {
  likes: string | null;
  reposts: string | null;
  quotes: string | null;
  replies: string | null;
}

// Get last viewed timestamps from localStorage
export function getLastViewedTimestamps(): LastViewedTimestamps {
  if (typeof window === 'undefined') {
    return { likes: null, reposts: null, quotes: null, replies: null };
  }
  
  const stored = localStorage.getItem(LAST_VIEWED_KEY);
  if (!stored) {
    return { likes: null, reposts: null, quotes: null, replies: null };
  }
  
  try {
    return JSON.parse(stored);
  } catch {
    return { likes: null, reposts: null, quotes: null, replies: null };
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
      // Ignore follow and mention for now
    }
  }
  
  return grouped;
}

// Count unread notifications per category
export function countUnread(
  grouped: GroupedNotifications,
  lastViewed: LastViewedTimestamps
): { likes: number; reposts: number; quotes: number; replies: number; total: number } {
  const counts = {
    likes: grouped.likes.filter(n => isNotificationUnread(n, lastViewed.likes)).length,
    reposts: grouped.reposts.filter(n => isNotificationUnread(n, lastViewed.reposts)).length,
    quotes: grouped.quotes.filter(n => isNotificationUnread(n, lastViewed.quotes)).length,
    replies: grouped.replies.filter(n => isNotificationUnread(n, lastViewed.replies)).length,
    total: 0,
  };
  counts.total = counts.likes + counts.reposts + counts.quotes + counts.replies;
  return counts;
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
