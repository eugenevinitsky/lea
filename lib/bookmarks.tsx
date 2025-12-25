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
