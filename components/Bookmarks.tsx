'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useBookmarks, BookmarkedPost, BookmarkCollection, COLLECTION_COLORS, exportToRIS, exportToBibTeX, exportToJSON, downloadFile } from '@/lib/bookmarks';

interface BookmarksProps {
  onOpenPost?: (uri: string) => void;
  onOpenProfile?: (did: string) => void;
  embedded?: boolean;
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

// Get color classes for a collection based on its stored color
function getCollectionColors(color: string) {
  const colorMap: Record<string, typeof COLLECTION_COLORS[0]> = {
    'rose': COLLECTION_COLORS[0],
    'emerald': COLLECTION_COLORS[1],
    'purple': COLLECTION_COLORS[2],
    'blue': COLLECTION_COLORS[3],
    'amber': COLLECTION_COLORS[4],
    'cyan': COLLECTION_COLORS[5],
  };
  return colorMap[color] || COLLECTION_COLORS[0];
}

function BookmarkItem({ bookmark, onRemove, onOpen, onOpenProfile }: {
  bookmark: BookmarkedPost;
  onRemove: () => void;
  onOpen?: () => void;
  onOpenProfile?: () => void;
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
            className="w-8 h-8 rounded-full flex-shrink-0 hover:ring-2 hover:ring-blue-400 transition-all"
            onClick={(e) => {
              e.stopPropagation();
              onOpenProfile?.();
            }}
            title="View profile"
          />
        ) : (
          <div
            className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 hover:ring-2 hover:ring-blue-400 transition-all"
            onClick={(e) => {
              e.stopPropagation();
              onOpenProfile?.();
            }}
            title="View profile"
          >
            {(bookmark.authorDisplayName || bookmark.authorHandle)[0].toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-xs">
            <span
              className="font-medium text-gray-900 dark:text-gray-100 truncate hover:text-blue-500 hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                onOpenProfile?.();
              }}
              title="View profile"
            >
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

export default function Bookmarks({ onOpenPost, onOpenProfile, embedded = false }: BookmarksProps) {
  const {
    bookmarks,
    collections,
    removeBookmark,
    addCollection,
    renameCollection,
    deleteCollection,
    reorderCollections,
    removeBookmarkFromCollection,
  } = useBookmarks();
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(!embedded);
  const [collapsedCollections, setCollapsedCollections] = useState<Set<string>>(new Set());
  const [showNewCollectionInput, setShowNewCollectionInput] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
  const [editingCollectionName, setEditingCollectionName] = useState('');
  const [draggedCollectionIndex, setDraggedCollectionIndex] = useState<number | null>(null);
  const [dragOverCollectionIndex, setDragOverCollectionIndex] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [exporting, setExporting] = useState(false);
  const [exportingCollectionId, setExportingCollectionId] = useState<string | null>(null);
  const [showCollectionExportMenu, setShowCollectionExportMenu] = useState<{ id: string; name: string } | null>(null);

  // Group bookmarks by collection
  const bookmarksByCollection = useMemo(() => {
    const grouped: Record<string, BookmarkedPost[]> = {};
    // Initialize with empty arrays for each collection
    collections.forEach(c => { grouped[c.id] = []; });
    grouped['uncategorized'] = [];
    
    bookmarks.forEach(bookmark => {
      const collectionIds = bookmark.collectionIds || [];
      if (collectionIds.length === 0) {
        grouped['uncategorized'].push(bookmark);
      } else {
        collectionIds.forEach(colId => {
          if (grouped[colId]) {
            grouped[colId].push(bookmark);
          }
        });
      }
    });
    return grouped;
  }, [bookmarks, collections]);

  const toggleCollectionCollapse = (collectionId: string) => {
    setCollapsedCollections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(collectionId)) {
        newSet.delete(collectionId);
      } else {
        newSet.add(collectionId);
      }
      return newSet;
    });
  };

  const handleCreateCollection = () => {
    if (newCollectionName.trim()) {
      addCollection(newCollectionName.trim());
      setNewCollectionName('');
      setShowNewCollectionInput(false);
    }
  };

  const handleRenameCollection = (id: string) => {
    if (editingCollectionName.trim()) {
      renameCollection(id, editingCollectionName.trim());
      setEditingCollectionId(null);
      setEditingCollectionName('');
    }
  };

  const handleDeleteCollection = (id: string, name: string) => {
    if (window.confirm(`Delete collection "${name}"? Bookmarks will be moved to Uncategorized.`)) {
      deleteCollection(id);
    }
  };

  const handleExport = async (format: 'ris' | 'bibtex' | 'json') => {
    const date = new Date().toISOString().split('T')[0];
    setExporting(true);

    try {
      switch (format) {
        case 'ris':
          downloadFile(exportToRIS(bookmarks), `bookmarks-${date}.ris`, 'application/x-research-info-systems');
          break;
        case 'bibtex':
          // BibTeX export is async because it fetches paper metadata
          const bibtex = await exportToBibTeX(bookmarks);
          downloadFile(bibtex, `bookmarks-${date}.bib`, 'application/x-bibtex');
          break;
        case 'json':
          downloadFile(exportToJSON(bookmarks), `bookmarks-${date}.json`, 'application/json');
          break;
      }
    } finally {
      setExporting(false);
      setShowExportMenu(false);
    }
  };

  const handleExportCollection = (collectionId: string, collectionName: string) => {
    setShowCollectionExportMenu({ id: collectionId, name: collectionName });
  };

  const handleCollectionExport = async (format: 'ris' | 'bibtex' | 'json') => {
    if (!showCollectionExportMenu) return;
    const collectionBookmarksToExport = bookmarksByCollection[showCollectionExportMenu.id] || [];
    if (collectionBookmarksToExport.length === 0) return;

    const date = new Date().toISOString().split('T')[0];
    const safeName = showCollectionExportMenu.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    setExportingCollectionId(showCollectionExportMenu.id);

    try {
      switch (format) {
        case 'ris':
          downloadFile(exportToRIS(collectionBookmarksToExport), `${safeName}-${date}.ris`, 'application/x-research-info-systems');
          break;
        case 'bibtex':
          const bibtex = await exportToBibTeX(collectionBookmarksToExport);
          downloadFile(bibtex, `${safeName}-${date}.bib`, 'application/x-bibtex');
          break;
        case 'json':
          downloadFile(exportToJSON(collectionBookmarksToExport), `${safeName}-${date}.json`, 'application/json');
          break;
      }
    } finally {
      setExportingCollectionId(null);
      setShowCollectionExportMenu(null);
    }
  };

  return (
    <div className={`bg-white dark:bg-gray-900 overflow-hidden ${embedded ? '' : 'rounded-xl border border-gray-200 dark:border-gray-800'}`}>
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full p-3 border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
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
          <div className="flex items-center gap-1">
            {/* Export button */}
            {bookmarks.length > 0 && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setShowExportMenu(!showExportMenu);
                }}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Export bookmarks"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </span>
            )}
            {/* Collapse chevron */}
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
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
                        disabled={exporting}
                        className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-3 disabled:opacity-50"
                      >
                        <span className="text-orange-500 font-mono text-xs font-bold bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 rounded">RIS</span>
                        <span>Zotero / Mendeley</span>
                      </button>
                      <button
                        onClick={() => handleExport('bibtex')}
                        disabled={exporting}
                        className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-3 disabled:opacity-50"
                      >
                        <span className="text-green-500 font-mono text-xs font-bold bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded">BIB</span>
                        <span>{exporting ? 'Fetching paper metadata...' : 'BibTeX / LaTeX'}</span>
                      </button>
                      <button
                        onClick={() => handleExport('json')}
                        disabled={exporting}
                        className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-3 disabled:opacity-50"
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

              {/* Collection-specific export menu */}
              {showCollectionExportMenu && mounted && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center">
                  <div
                    className="absolute inset-0 bg-black/50"
                    onClick={() => setShowCollectionExportMenu(null)}
                  />
                  <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4 min-w-[260px]">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Export "{showCollectionExportMenu.name}"</h4>
                    <div className="space-y-2">
                      <button
                        onClick={() => handleCollectionExport('ris')}
                        disabled={!!exportingCollectionId}
                        className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-3 disabled:opacity-50"
                      >
                        <span className="text-orange-500 font-mono text-xs font-bold bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 rounded">RIS</span>
                        <span>Zotero / Mendeley</span>
                      </button>
                      <button
                        onClick={() => handleCollectionExport('bibtex')}
                        disabled={!!exportingCollectionId}
                        className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-3 disabled:opacity-50"
                      >
                        <span className="text-green-500 font-mono text-xs font-bold bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded">BIB</span>
                        <span>{exportingCollectionId ? 'Fetching paper metadata...' : 'BibTeX / LaTeX'}</span>
                      </button>
                      <button
                        onClick={() => handleCollectionExport('json')}
                        disabled={!!exportingCollectionId}
                        className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-3 disabled:opacity-50"
                      >
                        <span className="text-blue-500 font-mono text-xs font-bold bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded">JSON</span>
                        <span>Raw data</span>
                      </button>
                    </div>
                    <button
                      onClick={() => setShowCollectionExportMenu(null)}
                      className="mt-3 w-full py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>,
                document.body
              )}

      {!isCollapsed && (
        <div className="max-h-[400px] overflow-y-auto">
        {bookmarks.length === 0 && collections.length === 0 ? (
          <div className="p-4 text-center">
            <svg className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <p className="text-xs text-gray-400">No bookmarks yet</p>
            <p className="text-xs text-gray-400 mt-1">Click the bookmark icon on posts to save them</p>
          </div>
        ) : collections.length === 0 ? (
          // No collections - show flat list
          bookmarks.map((bookmark) => (
            <BookmarkItem
              key={bookmark.uri}
              bookmark={bookmark}
              onRemove={() => removeBookmark(bookmark.uri)}
              onOpen={() => onOpenPost?.(bookmark.uri)}
              onOpenProfile={() => onOpenProfile?.(bookmark.authorDid)}
            />
          ))
        ) : (
          // Has collections - show grouped view
          <>
            {collections.map((collection, index) => {
              const colors = getCollectionColors(collection.color);
              const collectionBookmarks = bookmarksByCollection[collection.id] || [];
              const isCollectionCollapsed = collapsedCollections.has(collection.id);
              const isDragging = draggedCollectionIndex === index;
              const isDragOver = dragOverCollectionIndex === index && draggedCollectionIndex !== index;

              return (
                <div
                  key={collection.id}
                  className={`border-l-4 ${colors.border} ${isDragging ? 'opacity-50' : ''} ${isDragOver ? 'ring-2 ring-blue-400 ring-inset' : ''}`}
                  draggable
                  onDragStart={() => setDraggedCollectionIndex(index)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverCollectionIndex(index);
                  }}
                  onDragLeave={() => setDragOverCollectionIndex(null)}
                  onDrop={() => {
                    if (draggedCollectionIndex !== null && draggedCollectionIndex !== index) {
                      reorderCollections(draggedCollectionIndex, index);
                    }
                    setDraggedCollectionIndex(null);
                    setDragOverCollectionIndex(null);
                  }}
                  onDragEnd={() => {
                    setDraggedCollectionIndex(null);
                    setDragOverCollectionIndex(null);
                  }}
                >
                  <button
                    onClick={() => toggleCollectionCollapse(collection.id)}
                    className={`w-full px-3 py-2 ${colors.bg} flex items-center justify-between hover:opacity-80 transition-opacity cursor-grab active:cursor-grabbing`}
                  >
                    <div className="flex items-center gap-2">
                      {editingCollectionId === collection.id ? (
                        <input
                          type="text"
                          value={editingCollectionName}
                          onChange={(e) => setEditingCollectionName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameCollection(collection.id);
                            if (e.key === 'Escape') {
                              setEditingCollectionId(null);
                              setEditingCollectionName('');
                            }
                          }}
                          onBlur={() => handleRenameCollection(collection.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="px-1 py-0.5 text-xs font-medium bg-white dark:bg-gray-800 border rounded w-24"
                          autoFocus
                        />
                      ) : (
                        <span className={`text-xs font-medium ${colors.text}`}>
                          {collection.name}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">({collectionBookmarks.length})</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {/* Export button */}
                      {collectionBookmarks.length > 0 && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExportCollection(collection.id, collection.name);
                          }}
                          className="p-1 hover:bg-white/50 dark:hover:bg-gray-700/50 rounded"
                          title="Export collection"
                        >
                          <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                        </span>
                      )}
                      {/* Edit button */}
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingCollectionId(collection.id);
                          setEditingCollectionName(collection.name);
                        }}
                        className="p-1 hover:bg-white/50 dark:hover:bg-gray-700/50 rounded"
                        title="Rename collection"
                      >
                        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </span>
                      {/* Delete button */}
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCollection(collection.id, collection.name);
                        }}
                        className="p-1 hover:bg-white/50 dark:hover:bg-gray-700/50 rounded"
                        title="Delete collection"
                      >
                        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </span>
                      {/* Chevron */}
                      <svg
                        className={`w-4 h-4 text-gray-400 transition-transform ${isCollectionCollapsed ? '' : 'rotate-180'}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>
                  {!isCollectionCollapsed && collectionBookmarks.length > 0 && (
                    <div>
                      {collectionBookmarks.map((bookmark) => (
                        <BookmarkItem
                          key={`${collection.id}-${bookmark.uri}`}
                          bookmark={bookmark}
                          onRemove={() => removeBookmarkFromCollection(bookmark.uri, collection.id)}
                          onOpen={() => onOpenPost?.(bookmark.uri)}
                          onOpenProfile={() => onOpenProfile?.(bookmark.authorDid)}
                        />
                      ))}
                    </div>
                  )}
                  {!isCollectionCollapsed && collectionBookmarks.length === 0 && (
                    <div className="px-3 py-2 text-xs text-gray-400 italic">
                      No bookmarks in this collection
                    </div>
                  )}
                </div>
              );
            })}

            {/* Uncategorized section */}
            {bookmarksByCollection['uncategorized']?.length > 0 && (
              <div className="border-l-4 border-l-gray-300 dark:border-l-gray-600">
                <button
                  onClick={() => toggleCollectionCollapse('uncategorized')}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between hover:opacity-80 transition-opacity"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                      Uncategorized
                    </span>
                    <span className="text-xs text-gray-400">({bookmarksByCollection['uncategorized'].length})</span>
                  </div>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${collapsedCollections.has('uncategorized') ? '' : 'rotate-180'}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {!collapsedCollections.has('uncategorized') && (
                  <div>
                    {bookmarksByCollection['uncategorized'].map((bookmark) => (
                      <BookmarkItem
                        key={`uncategorized-${bookmark.uri}`}
                        bookmark={bookmark}
                        onRemove={() => removeBookmark(bookmark.uri)}
                        onOpen={() => onOpenPost?.(bookmark.uri)}
                        onOpenProfile={() => onOpenProfile?.(bookmark.authorDid)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Add collection button */}
        <div className="p-2 border-t border-gray-100 dark:border-gray-800">
          {showNewCollectionInput ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateCollection();
                  if (e.key === 'Escape') {
                    setShowNewCollectionInput(false);
                    setNewCollectionName('');
                  }
                }}
                placeholder="Collection name..."
                className="flex-1 px-2 py-1 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
              <button
                onClick={handleCreateCollection}
                className="p-1 text-blue-500 hover:text-blue-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </button>
              <button
                onClick={() => {
                  setShowNewCollectionInput(false);
                  setNewCollectionName('');
                }}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowNewCollectionInput(true)}
              className="w-full flex items-center justify-center gap-1 py-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New collection
            </button>
          )}
        </div>
        </div>
      )}
    </div>
  );
}
