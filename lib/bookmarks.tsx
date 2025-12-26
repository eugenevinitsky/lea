'use client';

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';

export interface BookmarkedPost {
  uri: string;
  cid: string;
  authorHandle: string;
  authorDisplayName?: string;
  authorAvatar?: string;
  text: string;
  createdAt: string;
  bookmarkedAt: string;
}

interface BookmarksContextType {
  bookmarks: BookmarkedPost[];
  addBookmark: (post: BookmarkedPost) => void;
  removeBookmark: (uri: string) => void;
  isBookmarked: (uri: string) => boolean;
}

const BookmarksContext = createContext<BookmarksContextType | null>(null);

const STORAGE_KEY = 'lea-bookmarks';

export function BookmarksProvider({ children }: { children: ReactNode }) {
  const [bookmarks, setBookmarks] = useState<BookmarkedPost[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load bookmarks from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setBookmarks(parsed);
      } catch {
        // Invalid JSON, use empty array
      }
    }
    setLoaded(true);
  }, []);

  // Save bookmarks to localStorage on change
  useEffect(() => {
    if (loaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
    }
  }, [bookmarks, loaded]);

  const addBookmark = (post: BookmarkedPost) => {
    setBookmarks(prev => {
      // Don't add duplicates
      if (prev.some(b => b.uri === post.uri)) return prev;
      return [post, ...prev];
    });
  };

  const removeBookmark = (uri: string) => {
    setBookmarks(prev => prev.filter(b => b.uri !== uri));
  };

  const isBookmarked = (uri: string) => {
    return bookmarks.some(b => b.uri === uri);
  };

  const value = { bookmarks, addBookmark, removeBookmark, isBookmarked };

  return (
    <BookmarksContext.Provider value={value}>
      {children}
    </BookmarksContext.Provider>
  );
}

export function useBookmarks() {
  const context = useContext(BookmarksContext);
  if (!context) {
    throw new Error('useBookmarks must be used within a BookmarksProvider');
  }
  return context;
}

// Convert AT URI to Bluesky web URL
function atUriToWebUrl(uri: string, authorHandle: string): string {
  // AT URI format: at://did:plc:xxx/app.bsky.feed.post/yyy
  // Web URL format: https://bsky.app/profile/handle/post/yyy
  const match = uri.match(/at:\/\/([^/]+)\/app\.bsky\.feed\.post\/(.+)/);
  if (match) {
    const [, , postId] = match;
    return `https://bsky.app/profile/${authorHandle}/post/${postId}`;
  }
  return uri;
}

// Export bookmarks to RIS format (for Zotero, Mendeley, EndNote)
export function exportToRIS(bookmarks: BookmarkedPost[]): string {
  return bookmarks.map(bookmark => {
    const url = atUriToWebUrl(bookmark.uri, bookmark.authorHandle);
    const date = new Date(bookmark.createdAt);
    const dateStr = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;

    // Truncate text for title (first 100 chars or first line)
    const firstLine = bookmark.text.split('\n')[0];
    const title = firstLine.length > 100 ? firstLine.substring(0, 100) + '...' : firstLine;

    const lines = [
      'TY  - ELEC',
      `TI  - ${title}`,
      `AU  - ${bookmark.authorDisplayName || bookmark.authorHandle}`,
      `UR  - ${url}`,
      `DA  - ${dateStr}`,
      `AB  - ${bookmark.text.replace(/\n/g, ' ')}`,
      `DB  - Bluesky`,
      `AN  - @${bookmark.authorHandle}`,
      'ER  - ',
    ];

    return lines.join('\n');
  }).join('\n\n');
}

// Export bookmarks to BibTeX format
export function exportToBibTeX(bookmarks: BookmarkedPost[]): string {
  return bookmarks.map((bookmark, index) => {
    const url = atUriToWebUrl(bookmark.uri, bookmark.authorHandle);
    const date = new Date(bookmark.createdAt);
    const author = bookmark.authorDisplayName || bookmark.authorHandle;
    const key = `bsky${date.getFullYear()}${bookmark.authorHandle.replace(/[^a-zA-Z0-9]/g, '')}${index}`;

    // Escape special BibTeX characters
    const escapeTeX = (str: string) => str
      .replace(/[&%$#_{}~^\\]/g, '\\$&')
      .replace(/\n/g, ' ');

    const firstLine = bookmark.text.split('\n')[0];
    const title = firstLine.length > 100 ? firstLine.substring(0, 100) + '...' : firstLine;

    return `@misc{${key},
  author = {${escapeTeX(author)}},
  title = {${escapeTeX(title)}},
  howpublished = {Bluesky},
  year = {${date.getFullYear()}},
  month = {${date.getMonth() + 1}},
  url = {${url}},
  note = {Post by @${bookmark.authorHandle}}
}`;
  }).join('\n\n');
}

// Export bookmarks to JSON format
export function exportToJSON(bookmarks: BookmarkedPost[]): string {
  const exportData = bookmarks.map(bookmark => ({
    ...bookmark,
    webUrl: atUriToWebUrl(bookmark.uri, bookmark.authorHandle),
  }));
  return JSON.stringify(exportData, null, 2);
}

// Trigger file download
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
