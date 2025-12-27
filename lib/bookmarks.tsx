'use client';

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';

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
