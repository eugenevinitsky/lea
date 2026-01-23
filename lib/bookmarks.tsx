'use client';

import { useState, useEffect, createContext, useContext, ReactNode, useCallback, useRef } from 'react';

export interface BookmarkedPost {
  uri: string;
  cid: string;
  authorDid: string;
  authorHandle: string;
  authorDisplayName?: string;
  authorAvatar?: string;
  text: string;
  createdAt: string;
  bookmarkedAt: string;
  // Paper-related fields
  paperUrl?: string;
  paperDoi?: string;
  paperTitle?: string;
  // Collection membership
  collectionIds?: string[];
  // Pin status - pinned bookmarks always show in side panel
  pinned?: boolean;
}

export interface BookmarkCollection {
  id: string;
  name: string;
  color: string;
}

// Color palette for collections
export const COLLECTION_COLORS = [
  { bg: 'bg-rose-50 dark:bg-rose-900/20', border: 'border-l-rose-400', text: 'text-rose-700 dark:text-rose-300', icon: 'text-rose-500' },
  { bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-l-emerald-400', text: 'text-emerald-700 dark:text-emerald-300', icon: 'text-emerald-500' },
  { bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-l-purple-400', text: 'text-purple-700 dark:text-purple-300', icon: 'text-purple-500' },
  { bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-l-blue-400', text: 'text-blue-700 dark:text-blue-300', icon: 'text-blue-500' },
  { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-l-amber-400', text: 'text-amber-700 dark:text-amber-300', icon: 'text-amber-500' },
  { bg: 'bg-cyan-50 dark:bg-cyan-900/20', border: 'border-l-cyan-400', text: 'text-cyan-700 dark:text-cyan-300', icon: 'text-cyan-500' },
];

interface BookmarksContextType {
  bookmarks: BookmarkedPost[];
  collections: BookmarkCollection[];
  loading: boolean;
  addBookmark: (post: BookmarkedPost, collectionIds?: string[]) => void;
  removeBookmark: (uri: string) => void;
  isBookmarked: (uri: string) => boolean;
  getBookmarkCollections: (uri: string) => string[];
  addBookmarkToCollection: (uri: string, collectionId: string) => void;
  removeBookmarkFromCollection: (uri: string, collectionId: string) => void;
  addCollection: (name: string) => string;
  renameCollection: (id: string, name: string) => void;
  deleteCollection: (id: string) => void;
  reorderCollections: (fromIndex: number, toIndex: number) => void;
  setUserDid: (did: string | null) => void;
  // Pin functions
  pinBookmark: (uri: string) => void;
  unpinBookmark: (uri: string) => void;
  isBookmarkPinned: (uri: string) => boolean;
}

const BookmarksContext = createContext<BookmarksContextType | null>(null);

export function BookmarksProvider({ children }: { children: ReactNode }) {
  const [bookmarks, setBookmarks] = useState<BookmarkedPost[]>([]);
  const [collections, setCollections] = useState<BookmarkCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [userDid, setUserDid] = useState<string | null>(null);
  const pendingIdRef = useRef<string | null>(null); // For optimistic collection ID

  // Fetch bookmarks from API when userDid changes
  useEffect(() => {
    async function fetchBookmarks() {
      if (!userDid) {
        setBookmarks([]);
        setCollections([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(`/api/bookmarks?did=${encodeURIComponent(userDid)}`);
        if (res.ok) {
          const data = await res.json();
          setBookmarks(data.bookmarks || []);
          setCollections(data.collections || []);
        }
      } catch (error) {
        console.error('Failed to fetch bookmarks:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchBookmarks();
  }, [userDid]);

  // API helper - returns response data
  const apiCall = useCallback(async (action: string, data: Record<string, unknown>): Promise<Record<string, unknown> | null> => {
    if (!userDid) return null;
    try {
      const res = await fetch('/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ did: userDid, action, ...data }),
      });
      if (res.ok) {
        return await res.json();
      }
      return null;
    } catch (error) {
      console.error(`Failed to ${action}:`, error);
      return null;
    }
  }, [userDid]);

  const addBookmark = useCallback((post: BookmarkedPost, collectionIds?: string[]) => {
    // Optimistic update
    setBookmarks(prev => {
      if (prev.some(b => b.uri === post.uri)) return prev;
      return [{ ...post, collectionIds: collectionIds || [] }, ...prev];
    });
    // API call
    apiCall('addBookmark', { bookmark: post, collectionIds });
  }, [apiCall]);

  const removeBookmark = useCallback((uri: string) => {
    // Optimistic update
    setBookmarks(prev => prev.filter(b => b.uri !== uri));
    // API call
    apiCall('removeBookmark', { uri });
  }, [apiCall]);

  const isBookmarked = useCallback((uri: string) => {
    return bookmarks.some(b => b.uri === uri);
  }, [bookmarks]);

  const getBookmarkCollections = useCallback((uri: string): string[] => {
    const bookmark = bookmarks.find(b => b.uri === uri);
    return bookmark?.collectionIds || [];
  }, [bookmarks]);

  const addBookmarkToCollection = useCallback((uri: string, collectionId: string) => {
    // Get current collection IDs first
    const bookmark = bookmarks.find(b => b.uri === uri);
    if (!bookmark) return;
    const currentIds = bookmark.collectionIds || [];
    if (currentIds.includes(collectionId)) return;
    const newIds = [...currentIds, collectionId];
    
    // Optimistic update
    setBookmarks(prev => prev.map(b => 
      b.uri === uri ? { ...b, collectionIds: newIds } : b
    ));
    // API call
    apiCall('updateBookmarkCollections', { uri, collectionIds: newIds });
  }, [apiCall, bookmarks]);

  const removeBookmarkFromCollection = useCallback((uri: string, collectionId: string) => {
    // Get current collection IDs first
    const bookmark = bookmarks.find(b => b.uri === uri);
    if (!bookmark) return;
    const currentIds = bookmark.collectionIds || [];
    const newIds = currentIds.filter(id => id !== collectionId);
    
    // Optimistic update
    setBookmarks(prev => prev.map(b => 
      b.uri === uri ? { ...b, collectionIds: newIds } : b
    ));
    // API call
    apiCall('updateBookmarkCollections', { uri, collectionIds: newIds });
  }, [apiCall, bookmarks]);

  const addCollection = useCallback((name: string): string => {
    // Generate optimistic ID
    const tempId = `col_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    pendingIdRef.current = tempId;
    // Pick color based on number of existing collections
    const colorIndex = collections.length % COLLECTION_COLORS.length;
    const color = COLLECTION_COLORS[colorIndex].icon.split('-')[1];
    const newCollection: BookmarkCollection = { id: tempId, name, color };
    
    // Optimistic update
    setCollections(prev => [...prev, newCollection]);
    
    // API call - get the real ID back and update
    apiCall('addCollection', { name, color }).then(result => {
      if (result?.id && result.id !== tempId) {
        // Update the collection with the real ID from the server
        setCollections(prev => prev.map(c => 
          c.id === tempId ? { ...c, id: result.id as string } : c
        ));
        // Also update any bookmarks that might have used the temp ID
        setBookmarks(prev => prev.map(b => {
          if (!b.collectionIds?.includes(tempId)) return b;
          return {
            ...b,
            collectionIds: b.collectionIds.map(cid => cid === tempId ? result.id as string : cid)
          };
        }));
      }
    });
    
    return tempId;
  }, [collections.length, apiCall]);

  const renameCollection = useCallback((id: string, name: string) => {
    // Optimistic update
    setCollections(prev => prev.map(c => c.id === id ? { ...c, name } : c));
    // API call
    apiCall('renameCollection', { id, name });
  }, [apiCall]);

  const deleteCollection = useCallback((id: string) => {
    // Optimistic update - remove collection from all bookmarks
    setBookmarks(prev => prev.map(b => ({
      ...b,
      collectionIds: (b.collectionIds || []).filter(cid => cid !== id)
    })));
    // Remove the collection
    setCollections(prev => prev.filter(c => c.id !== id));
    // API call
    apiCall('deleteCollection', { id });
  }, [apiCall]);

  const reorderCollections = useCallback((fromIndex: number, toIndex: number) => {
    // Optimistic update
    setCollections(prev => {
      const newCollections = [...prev];
      const [removed] = newCollections.splice(fromIndex, 1);
      newCollections.splice(toIndex, 0, removed);
      return newCollections;
    });
    // API call
    apiCall('reorderCollections', { fromIndex, toIndex });
  }, [apiCall]);

  const pinBookmark = useCallback((uri: string) => {
    // Optimistic update
    setBookmarks(prev => prev.map(b => 
      b.uri === uri ? { ...b, pinned: true } : b
    ));
    // API call
    apiCall('pinBookmark', { uri, pinned: true });
  }, [apiCall]);

  const unpinBookmark = useCallback((uri: string) => {
    // Optimistic update
    setBookmarks(prev => prev.map(b => 
      b.uri === uri ? { ...b, pinned: false } : b
    ));
    // API call
    apiCall('pinBookmark', { uri, pinned: false });
  }, [apiCall]);

  const isBookmarkPinned = useCallback((uri: string): boolean => {
    const bookmark = bookmarks.find(b => b.uri === uri);
    return bookmark?.pinned || false;
  }, [bookmarks]);

  const value = {
    bookmarks,
    collections,
    loading,
    addBookmark,
    removeBookmark,
    isBookmarked,
    getBookmarkCollections,
    addBookmarkToCollection,
    removeBookmarkFromCollection,
    addCollection,
    renameCollection,
    deleteCollection,
    reorderCollections,
    setUserDid,
    pinBookmark,
    unpinBookmark,
    isBookmarkPinned,
  };

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
// Only exports bookmarks that contain papers
export function exportToRIS(bookmarks: BookmarkedPost[]): string {
  // Filter to only bookmarks with paper URLs
  const paperBookmarks = bookmarks.filter(b => b.paperUrl || b.paperDoi);

  if (paperBookmarks.length === 0) {
    return '';
  }

  return paperBookmarks.map(bookmark => {
    const date = new Date(bookmark.createdAt);
    const dateStr = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;

    const lines = [
      'TY  - JOUR',
      `TI  - ${bookmark.paperTitle || 'Paper'}`,
      `UR  - ${bookmark.paperUrl || ''}`,
      `DA  - ${dateStr}`,
      ...(bookmark.paperDoi ? [`DO  - ${bookmark.paperDoi.replace(/^arXiv:/i, '')}`] : []),
      `N1  - Shared by @${bookmark.authorHandle} on Bluesky`,
      'ER  - ',
    ];

    return lines.join('\n');
  }).join('\n\n');
}

// Fetch paper metadata from DOI using CrossRef API
async function fetchDoiMetadata(doi: string): Promise<{
  title?: string;
  authors?: string[];
  year?: number;
  journal?: string;
  volume?: string;
  pages?: string;
  doi?: string;
} | null> {
  try {
    const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
    if (!response.ok) return null;

    const data = await response.json();
    const work = data.message;

    return {
      title: work.title?.[0],
      authors: work.author?.map((a: { given?: string; family?: string }) =>
        a.given && a.family ? `${a.family}, ${a.given}` : a.family || a.given || ''
      ),
      year: work.published?.['date-parts']?.[0]?.[0] || work['published-print']?.['date-parts']?.[0]?.[0],
      journal: work['container-title']?.[0],
      volume: work.volume,
      pages: work.page,
      doi: work.DOI,
    };
  } catch (error) {
    console.error('Failed to fetch DOI metadata:', error);
    return null;
  }
}

// Fetch paper metadata from arXiv API
async function fetchArxivMetadata(arxivId: string): Promise<{
  title?: string;
  authors?: string[];
  year?: number;
  arxivId?: string;
} | null> {
  try {
    // Remove 'arXiv:' prefix if present
    const id = arxivId.replace(/^arXiv:/i, '');
    const response = await fetch(`https://export.arxiv.org/api/query?id_list=${id}`);
    if (!response.ok) return null;

    const text = await response.text();

    // Parse XML response
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/xml');

    const entry = doc.querySelector('entry');
    if (!entry) return null;

    const title = entry.querySelector('title')?.textContent?.replace(/\s+/g, ' ').trim();
    const authors = Array.from(entry.querySelectorAll('author name')).map(
      (el) => el.textContent?.trim() || ''
    );
    const published = entry.querySelector('published')?.textContent;
    const year = published ? new Date(published).getFullYear() : undefined;

    return {
      title,
      authors,
      year,
      arxivId: id,
    };
  } catch (error) {
    console.error('Failed to fetch arXiv metadata:', error);
    return null;
  }
}

// Export bookmarks to BibTeX format (async to fetch paper metadata)
// Only exports bookmarks that contain papers
export async function exportToBibTeX(bookmarks: BookmarkedPost[]): Promise<string> {
  // Filter to only bookmarks with paper URLs
  const paperBookmarks = bookmarks.filter(b => b.paperUrl || b.paperDoi);

  if (paperBookmarks.length === 0) {
    return '% No paper bookmarks found';
  }

  const entries = await Promise.all(
    paperBookmarks.map(async (bookmark, index) => {
      const escapeTeX = (str: string) =>
        str.replace(/[&%$#_{}~^\\]/g, '\\$&').replace(/\n/g, ' ');

      // If bookmark has a DOI or arXiv ID, fetch paper metadata
      if (bookmark.paperDoi) {
        let metadata = null;

        if (bookmark.paperDoi.startsWith('arXiv:')) {
          metadata = await fetchArxivMetadata(bookmark.paperDoi);
          if (metadata) {
            const key = `arxiv${metadata.year || ''}${metadata.arxivId?.replace(/[^a-zA-Z0-9]/g, '')}`;
            const authors = metadata.authors?.join(' and ') || 'Unknown';

            return `@article{${key},
  author = {${escapeTeX(authors)}},
  title = {${escapeTeX(metadata.title || bookmark.paperTitle || 'Unknown')}},
  year = {${metadata.year || ''}},
  eprint = {${metadata.arxivId}},
  archivePrefix = {arXiv},
  primaryClass = {cs.CL},
  url = {${bookmark.paperUrl || ''}}
}`;
          }
        } else {
          metadata = await fetchDoiMetadata(bookmark.paperDoi);
          if (metadata) {
            const firstAuthor = metadata.authors?.[0]?.split(',')[0] || 'unknown';
            const key = `${firstAuthor.toLowerCase().replace(/[^a-z]/g, '')}${metadata.year || ''}`;
            const authors = metadata.authors?.join(' and ') || 'Unknown';

            return `@article{${key},
  author = {${escapeTeX(authors)}},
  title = {${escapeTeX(metadata.title || bookmark.paperTitle || 'Unknown')}},
  journal = {${escapeTeX(metadata.journal || '')}},
  year = {${metadata.year || ''}},
  volume = {${metadata.volume || ''}},
  pages = {${metadata.pages || ''}},
  doi = {${metadata.doi || bookmark.paperDoi}},
  url = {${bookmark.paperUrl || ''}}
}`;
          }
        }
      }

      // Fallback: If no paper metadata could be fetched, use paper title/URL
      const date = new Date(bookmark.createdAt);
      const key = `paper${date.getFullYear()}${index}`;

      return `@misc{${key},
  title = {${escapeTeX(bookmark.paperTitle || 'Paper')}},
  howpublished = {\\url{${bookmark.paperUrl || ''}}},
  year = {${date.getFullYear()}},
  note = {Shared by @${bookmark.authorHandle} on Bluesky}
}`;
    })
  );

  return entries.join('\n\n');
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
