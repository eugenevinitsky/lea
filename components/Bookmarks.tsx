'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useBookmarks, BookmarkedPost, exportToRIS, exportToBibTeX, exportToJSON, downloadFile } from '@/lib/bookmarks';

interface BookmarksProps {
  onOpenPost?: (uri: string) => void;
}

function formatDate(dateString: string) {
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

function BookmarkItem({ bookmark, onRemove, onOpen }: {
  bookmark: BookmarkedPost;
  onRemove: () => void;
  onOpen?: () => void;
}) {
  return (
    <div
      className="p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 cursor-pointer group"
      onClick={onOpen}
    >
      <div className="flex items-start gap-2">
        {bookmark.authorAvatar ? (
          <img
            src={bookmark.authorAvatar}
            alt={bookmark.authorHandle}
            className="w-8 h-8 rounded-full flex-shrink-0"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {(bookmark.authorDisplayName || bookmark.authorHandle)[0].toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-xs">
            <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
              {bookmark.authorDisplayName || bookmark.authorHandle}
            </span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-400">{formatDate(bookmark.createdAt)}</span>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mt-0.5">
            {bookmark.text}
          </p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-opacity"
          title="Remove bookmark"
        >
          <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function Bookmarks({ onOpenPost }: BookmarksProps) {
  const { bookmarks, removeBookmark } = useBookmarks();
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleExport = (format: 'ris' | 'bibtex' | 'json') => {
    const date = new Date().toISOString().split('T')[0];
    switch (format) {
      case 'ris':
        downloadFile(exportToRIS(bookmarks), `bookmarks-${date}.ris`, 'application/x-research-info-systems');
        break;
      case 'bibtex':
        downloadFile(exportToBibTeX(bookmarks), `bookmarks-${date}.bib`, 'application/x-bibtex');
        break;
      case 'json':
        downloadFile(exportToJSON(bookmarks), `bookmarks-${date}.json`, 'application/json');
        break;
    }
    setShowExportMenu(false);
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="p-3 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            Bookmarks
            {bookmarks.length > 0 && (
              <span className="text-xs font-normal text-gray-400">({bookmarks.length})</span>
            )}
          </h3>

          {/* Export button */}
          {bookmarks.length > 0 && (
            <>
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                title="Export bookmarks"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </button>

              {showExportMenu && mounted && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center">
                  <div
                    className="absolute inset-0 bg-black/50"
                    onClick={() => setShowExportMenu(false)}
                  />
                  <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4 min-w-[260px]">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Export Bookmarks</h4>
                    <div className="space-y-2">
                      <button
                        onClick={() => handleExport('ris')}
                        className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-3"
                      >
                        <span className="text-orange-500 font-mono text-xs font-bold bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 rounded">RIS</span>
                        <span>Zotero / Mendeley</span>
                      </button>
                      <button
                        onClick={() => handleExport('bibtex')}
                        className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-3"
                      >
                        <span className="text-green-500 font-mono text-xs font-bold bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded">BIB</span>
                        <span>BibTeX / LaTeX</span>
                      </button>
                      <button
                        onClick={() => handleExport('json')}
                        className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-3"
                      >
                        <span className="text-blue-500 font-mono text-xs font-bold bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded">JSON</span>
                        <span>Raw data</span>
                      </button>
                    </div>
                    <button
                      onClick={() => setShowExportMenu(false)}
                      className="mt-3 w-full py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>,
                document.body
              )}
            </>
          )}
        </div>
      </div>

      <div className="max-h-[400px] overflow-y-auto">
        {bookmarks.length === 0 ? (
          <div className="p-4 text-center">
            <svg className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <p className="text-xs text-gray-400">No bookmarks yet</p>
            <p className="text-xs text-gray-400 mt-1">Click the bookmark icon on posts to save them</p>
          </div>
        ) : (
          bookmarks.map((bookmark) => (
            <BookmarkItem
              key={bookmark.uri}
              bookmark={bookmark}
              onRemove={() => removeBookmark(bookmark.uri)}
              onOpen={() => onOpenPost?.(bookmark.uri)}
            />
          ))
        )}
      </div>
    </div>
  );
}
