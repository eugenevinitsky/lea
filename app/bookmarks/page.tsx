'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { restoreSession, getSession, getBlueskyProfile, buildProfileUrl, checkVerificationStatus } from '@/lib/bluesky';
import { SettingsProvider } from '@/lib/settings';
import { BookmarksProvider, useBookmarks, BookmarkedPost, BookmarkCollection, COLLECTION_COLORS, exportToRIS, exportToBibTeX, exportToJSON, downloadFile } from '@/lib/bookmarks';
import { FeedsProvider } from '@/lib/feeds';
import { FollowingProvider } from '@/lib/following-context';
import Login from '@/components/Login';

// Sort options
type SortOption = 'recent' | 'oldest' | 'author' | 'collection';

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

// Border color classes for collections
const COLLECTION_BORDER_COLORS: Record<string, string> = {
  'rose': 'border-rose-300 dark:border-rose-700',
  'emerald': 'border-emerald-300 dark:border-emerald-700',
  'purple': 'border-purple-300 dark:border-purple-700',
  'blue': 'border-blue-300 dark:border-blue-700',
  'amber': 'border-amber-300 dark:border-amber-700',
  'cyan': 'border-cyan-300 dark:border-cyan-700',
};

// Bookmark Tile component
function BookmarkTile({
  bookmark,
  onOpen,
  onOpenProfile,
  onRemove,
  collectionColor,
}: {
  bookmark: BookmarkedPost;
  onOpen: () => void;
  onOpenProfile: () => void;
  onRemove: () => void;
  collectionColor?: string;
}) {
  const borderClass = collectionColor 
    ? COLLECTION_BORDER_COLORS[collectionColor] || 'border-gray-200 dark:border-gray-700'
    : 'border-gray-200 dark:border-gray-700';

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg border-2 ${borderClass} p-3 hover:shadow-md transition-shadow cursor-pointer group`}
      onClick={onOpen}
    >
      <div className="flex items-start gap-2">
        {bookmark.authorAvatar ? (
          <img
            src={bookmark.authorAvatar}
            alt=""
            className="w-8 h-8 rounded-full flex-shrink-0 hover:ring-2 hover:ring-blue-400 transition-all"
            onClick={(e) => {
              e.stopPropagation();
              onOpenProfile();
            }}
          />
        ) : (
          <div
            className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 hover:ring-2 hover:ring-blue-400 transition-all"
            onClick={(e) => {
              e.stopPropagation();
              onOpenProfile();
            }}
          >
            {(bookmark.authorDisplayName || bookmark.authorHandle)[0].toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-xs">
            <span
              className="font-medium text-gray-900 dark:text-gray-100 truncate hover:text-blue-500 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onOpenProfile();
              }}
            >
              {bookmark.authorDisplayName || bookmark.authorHandle}
            </span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-400 flex-shrink-0">{formatTime(bookmark.bookmarkedAt)}</span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3 mt-1">
            {bookmark.text}
          </p>
          {bookmark.paperTitle && (
            <div className="mt-2 flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="truncate">{bookmark.paperTitle}</span>
            </div>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-opacity flex-shrink-0"
          title="Remove bookmark"
        >
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// Collection Pane component
function CollectionPane({
  collection,
  bookmarks,
  onOpenPost,
  onOpenProfile,
  onRemoveFromCollection,
}: {
  collection: BookmarkCollection | null; // null = uncategorized
  bookmarks: BookmarkedPost[];
  onOpenPost: (uri: string) => void;
  onOpenProfile: (did: string) => void;
  onRemoveFromCollection: (uri: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const colors = collection ? getCollectionColors(collection.color) : {
    bg: 'bg-gray-50 dark:bg-gray-800/50',
    border: 'border-l-gray-400',
    text: 'text-gray-700 dark:text-gray-300',
    icon: 'text-gray-500',
  };

  return (
    <div className={`rounded-xl border-l-4 ${colors.border} overflow-hidden`}>
      {/* Collection Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full px-4 py-3 ${colors.bg} flex items-center justify-between hover:opacity-90 transition-opacity`}
      >
        <div className="flex items-center gap-2">
          <svg className={`w-5 h-5 ${colors.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span className={`font-semibold ${colors.text}`}>
            {collection?.name || 'Uncategorized'}
          </span>
          <span className="text-sm text-gray-400">({bookmarks.length})</span>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Bookmarks Grid */}
      {isExpanded && (
        <div className={`p-4 ${colors.bg} bg-opacity-50`}>
          {bookmarks.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No bookmarks in this collection</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {bookmarks.map((bookmark) => (
                <BookmarkTile
                  key={bookmark.uri}
                  bookmark={bookmark}
                  onOpen={() => onOpenPost(bookmark.uri)}
                  onOpenProfile={() => onOpenProfile(bookmark.authorDid)}
                  onRemove={() => onRemoveFromCollection(bookmark.uri)}
                  collectionColor={collection?.color}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Main Dashboard Content
function BookmarksDashboardContent() {
  const {
    bookmarks,
    collections,
    loading,
    removeBookmark,
    removeBookmarkFromCollection,
    setUserDid,
  } = useBookmarks();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [filterCollection, setFilterCollection] = useState<string>('all');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  // Set user DID on mount
  useEffect(() => {
    const session = getSession();
    if (session?.did) {
      setUserDid(session.did);
      checkVerificationStatus(session.did).then(setIsVerified);
    }
  }, [setUserDid]);

  const session = getSession();

  // Navigate to post
  const handleOpenPost = useCallback((uri: string) => {
    const match = uri.match(/^at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/);
    if (match) {
      const [, did, rkey] = match;
      // Try to get handle from bookmark data
      const bookmark = bookmarks.find(b => b.uri === uri);
      if (bookmark?.authorHandle) {
        window.location.href = `/post/${bookmark.authorHandle}/${rkey}`;
      } else {
        window.location.href = `/post/${did}/${rkey}`;
      }
    }
  }, [bookmarks]);

  // Navigate to profile
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

  // Filter and sort bookmarks
  const filteredBookmarks = useMemo(() => {
    let result = [...bookmarks];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(b =>
        b.text.toLowerCase().includes(query) ||
        b.authorHandle.toLowerCase().includes(query) ||
        (b.authorDisplayName?.toLowerCase().includes(query)) ||
        (b.paperTitle?.toLowerCase().includes(query))
      );
    }

    // Apply collection filter
    if (filterCollection !== 'all') {
      if (filterCollection === 'uncategorized') {
        result = result.filter(b => !b.collectionIds || b.collectionIds.length === 0);
      } else {
        result = result.filter(b => b.collectionIds?.includes(filterCollection));
      }
    }

    // Apply sorting
    switch (sortBy) {
      case 'recent':
        result.sort((a, b) => new Date(b.bookmarkedAt).getTime() - new Date(a.bookmarkedAt).getTime());
        break;
      case 'oldest':
        result.sort((a, b) => new Date(a.bookmarkedAt).getTime() - new Date(b.bookmarkedAt).getTime());
        break;
      case 'author':
        result.sort((a, b) => (a.authorDisplayName || a.authorHandle).localeCompare(b.authorDisplayName || b.authorHandle));
        break;
      case 'collection':
        // Already grouped by collection in the view
        break;
    }

    return result;
  }, [bookmarks, searchQuery, filterCollection, sortBy]);

  // Group bookmarks by collection
  const bookmarksByCollection = useMemo(() => {
    const grouped: Record<string, BookmarkedPost[]> = {};
    collections.forEach(c => { grouped[c.id] = []; });
    grouped['uncategorized'] = [];

    filteredBookmarks.forEach(bookmark => {
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
  }, [filteredBookmarks, collections]);

  // Export handlers
  const handleExport = async (format: 'ris' | 'bibtex' | 'json') => {
    const date = new Date().toISOString().split('T')[0];
    setExporting(true);

    try {
      const toExport = filterCollection === 'all' ? bookmarks : filteredBookmarks;
      switch (format) {
        case 'ris':
          downloadFile(exportToRIS(toExport), `bookmarks-${date}.ris`, 'application/x-research-info-systems');
          break;
        case 'bibtex':
          const bibtex = await exportToBibTeX(toExport);
          downloadFile(bibtex, `bookmarks-${date}.bib`, 'application/x-bibtex');
          break;
        case 'json':
          downloadFile(exportToJSON(toExport), `bookmarks-${date}.json`, 'application/json');
          break;
      }
    } finally {
      setExporting(false);
      setShowExportMenu(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/80 dark:bg-black/80 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center gap-4">
            {/* Back button and title */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => window.location.href = '/'}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                title="Back to home"
              >
                <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <svg className="w-6 h-6 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                Bookmarks
              </h1>
            </div>

            {/* Search bar */}
            <div className="flex-1 max-w-xl">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search bookmarks by text, author, or paper..."
                  className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border-0 rounded-full text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Filters and actions */}
            <div className="flex items-center gap-2">
              {/* Collection filter */}
              <select
                value={filterCollection}
                onChange={(e) => setFilterCollection(e.target.value)}
                className="text-sm bg-gray-100 dark:bg-gray-800 border-0 rounded-lg px-3 py-2 text-gray-600 dark:text-gray-300 focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Collections</option>
                {collections.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
                <option value="uncategorized">Uncategorized</option>
              </select>

              {/* Sort dropdown */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="text-sm bg-gray-100 dark:bg-gray-800 border-0 rounded-lg px-3 py-2 text-gray-600 dark:text-gray-300 focus:ring-2 focus:ring-blue-500"
              >
                <option value="recent">Most Recent</option>
                <option value="oldest">Oldest First</option>
                <option value="author">By Author</option>
                <option value="collection">By Collection</option>
              </select>

              {/* Export button */}
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                  title="Export bookmarks"
                >
                  <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                </button>

                {showExportMenu && (
                  <div className="absolute right-0 top-full mt-2 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-2 min-w-[200px] z-50">
                    <button
                      onClick={() => handleExport('ris')}
                      disabled={exporting}
                      className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-2 disabled:opacity-50"
                    >
                      <span className="text-orange-500 font-mono text-xs font-bold bg-orange-100 dark:bg-orange-900/30 px-1.5 py-0.5 rounded">RIS</span>
                      Zotero / Mendeley
                    </button>
                    <button
                      onClick={() => handleExport('bibtex')}
                      disabled={exporting}
                      className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-2 disabled:opacity-50"
                    >
                      <span className="text-green-500 font-mono text-xs font-bold bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded">BIB</span>
                      {exporting ? 'Fetching...' : 'BibTeX / LaTeX'}
                    </button>
                    <button
                      onClick={() => handleExport('json')}
                      disabled={exporting}
                      className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-2 disabled:opacity-50"
                    >
                      <span className="text-blue-500 font-mono text-xs font-bold bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">JSON</span>
                      Raw data
                    </button>
                  </div>
                )}
              </div>

              {/* Profile link */}
              <button
                onClick={() => window.location.href = `/u/${session?.handle}`}
                className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors flex items-center gap-1.5 ${
                  isVerified
                    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                    : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50'
                }`}
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
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : bookmarks.length === 0 ? (
          <div className="text-center py-20">
            <svg className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <h2 className="text-xl font-semibold text-gray-600 dark:text-gray-400 mb-2">No bookmarks yet</h2>
            <p className="text-gray-500">Bookmark posts by clicking the bookmark icon on any post</p>
            <button
              onClick={() => window.location.href = '/'}
              className="mt-4 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-full text-sm font-medium transition-colors"
            >
              Go to feed
            </button>
          </div>
        ) : sortBy === 'collection' ? (
          // Collection view - show panes
          <div className="space-y-6">
            {/* Stats bar */}
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>{filteredBookmarks.length} bookmark{filteredBookmarks.length !== 1 ? 's' : ''}</span>
              <span>{collections.length} collection{collections.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Collection panes */}
            {collections.map((collection) => {
              const collectionBookmarks = bookmarksByCollection[collection.id] || [];
              if (filterCollection !== 'all' && filterCollection !== collection.id) return null;
              return (
                <CollectionPane
                  key={collection.id}
                  collection={collection}
                  bookmarks={collectionBookmarks}
                  onOpenPost={handleOpenPost}
                  onOpenProfile={handleOpenProfile}
                  onRemoveFromCollection={(uri) => removeBookmarkFromCollection(uri, collection.id)}
                />
              );
            })}

            {/* Uncategorized pane */}
            {(filterCollection === 'all' || filterCollection === 'uncategorized') && bookmarksByCollection['uncategorized']?.length > 0 && (
              <CollectionPane
                collection={null}
                bookmarks={bookmarksByCollection['uncategorized']}
                onOpenPost={handleOpenPost}
                onOpenProfile={handleOpenProfile}
                onRemoveFromCollection={removeBookmark}
              />
            )}
          </div>
        ) : (
          // List view - show all bookmarks
          <div className="space-y-4">
            {/* Stats bar */}
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>{filteredBookmarks.length} bookmark{filteredBookmarks.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Bookmarks grid */}
            {filteredBookmarks.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className="text-gray-500">No bookmarks match your search</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredBookmarks.map((bookmark) => {
                  // Find the first collection this bookmark belongs to for border color
                  const firstCollectionId = bookmark.collectionIds?.[0];
                  const bookmarkCollection = firstCollectionId 
                    ? collections.find(c => c.id === firstCollectionId)
                    : undefined;
                  return (
                    <BookmarkTile
                      key={bookmark.uri}
                      bookmark={bookmark}
                      onOpen={() => handleOpenPost(bookmark.uri)}
                      onOpenProfile={() => handleOpenProfile(bookmark.authorDid)}
                      onRemove={() => removeBookmark(bookmark.uri)}
                      collectionColor={bookmarkCollection?.color}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Click outside to close export menu */}
      {showExportMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowExportMenu(false)}
        />
      )}
    </div>
  );
}

// Main page component with auth and providers
export default function BookmarksDashboard() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    restoreSession().then((restored) => {
      setIsLoggedIn(restored);
      setIsLoading(false);
    });
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Login onLogin={() => setIsLoggedIn(true)} />;
  }

  return (
    <SettingsProvider>
      <BookmarksProvider>
        <FeedsProvider>
          <FollowingProvider>
            <BookmarksDashboardContent />
          </FollowingProvider>
        </FeedsProvider>
      </BookmarksProvider>
    </SettingsProvider>
  );
}
