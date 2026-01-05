'use client';

import { useState, useEffect, useRef } from 'react';
import { searchActors, isVerifiedResearcher, Label, getBlueskyProfile, searchPosts } from '@/lib/bluesky';
import { AppBskyFeedDefs, AppBskyFeedPost } from '@atproto/api';

interface Researcher {
  did: string;
  handle: string;
  name: string | null;
  institution: string | null;
}

interface SearchResult {
  did: string;
  handle: string;
  displayName: string | null;
  subtitle: string | null;
  avatar?: string;
  isVerified: boolean;
}

interface PostResult {
  uri: string;
  authorHandle: string;
  authorDisplayName?: string;
  authorAvatar?: string;
  text: string;
  createdAt: string;
}

interface ResearcherSearchProps {
  onSelectResearcher: (did: string) => void;
  onOpenThread?: (uri: string) => void;
  onSearch?: (query: string) => void;
}

export default function ResearcherSearch({ onSelectResearcher, onOpenThread, onSearch }: ResearcherSearchProps) {
  const [query, setQuery] = useState('');
  const [researchers, setResearchers] = useState<Researcher[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [postResults, setPostResults] = useState<PostResult[]>([]);
  const [activeTab, setActiveTab] = useState<'users' | 'posts'>('users');
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch all verified researchers on mount
  useEffect(() => {
    async function fetchResearchers() {
      setLoading(true);
      try {
        const res = await fetch('/api/researchers');
        if (res.ok) {
          const data = await res.json();
          setResearchers(data.researchers || []);
        }
      } catch (err) {
        console.error('Failed to fetch researchers:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchResearchers();
  }, []);

  // Search when query changes - combine local verified researchers with Bluesky search
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      setIsOpen(false);
      return;
    }

    const lowerQuery = query.toLowerCase();
    
    // Search local verified researchers
    const matchedResearchers = researchers
      .filter(r => 
        r.name?.toLowerCase().includes(lowerQuery) ||
        r.handle?.toLowerCase().includes(lowerQuery) ||
        r.institution?.toLowerCase().includes(lowerQuery)
      )
      .slice(0, 5);
    
    const verifiedResults: SearchResult[] = matchedResearchers.map(r => ({
      did: r.did,
      handle: r.handle,
      displayName: r.name,
      subtitle: r.institution,
      isVerified: true,
    }));

    // Show local results immediately
    setSearchResults(verifiedResults);
    setIsOpen(verifiedResults.length > 0);
    setSelectedIndex(0);

    // Debounce the Bluesky API search and avatar fetching
    const timeoutId = setTimeout(async () => {
      setSearching(true);
      try {
        // Fetch avatars for verified researchers in parallel with Bluesky search and post search
        const [bskyResults, postsResponse, ...avatarResults] = await Promise.all([
          searchActors(query, 8),
          searchPosts(query, undefined, 'top'),
          ...matchedResearchers.map(r => getBlueskyProfile(r.did)),
        ]);
        
        // Update verified results with avatars
        const verifiedWithAvatars: SearchResult[] = matchedResearchers.map((r, i) => ({
          did: r.did,
          handle: r.handle,
          displayName: r.name,
          subtitle: r.institution,
          avatar: avatarResults[i]?.avatar,
          isVerified: true,
        }));
        
        // Combine results: verified first, then other Bluesky users
        const verifiedDids = new Set(verifiedWithAvatars.map(r => r.did));
        
        const otherResults: SearchResult[] = bskyResults
          .filter(actor => !verifiedDids.has(actor.did))
          .map(actor => ({
            did: actor.did,
            handle: actor.handle,
            displayName: actor.displayName || null,
            subtitle: actor.description?.slice(0, 60) || null,
            avatar: actor.avatar,
            isVerified: isVerifiedResearcher(actor.labels as Label[] | undefined),
          }));

        const combined = [...verifiedWithAvatars, ...otherResults].slice(0, 10);
        setSearchResults(combined);
        
        // Process post results
        const posts: PostResult[] = postsResponse.posts.slice(0, 5).map(post => {
          const record = post.record as AppBskyFeedPost.Record;
          return {
            uri: post.uri,
            authorHandle: post.author.handle,
            authorDisplayName: post.author.displayName,
            authorAvatar: post.author.avatar,
            text: record.text.slice(0, 100) + (record.text.length > 100 ? '...' : ''),
            createdAt: record.createdAt,
          };
        });
        setPostResults(posts);
        
        setIsOpen(combined.length > 0 || posts.length > 0);
      } catch (err) {
        console.error('Failed to search:', err);
      } finally {
        setSearching(false);
      }
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [query, researchers]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (result: SearchResult) => {
    onSelectResearcher(result.did);
    setQuery('');
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleSelectPost = (post: PostResult) => {
    if (onOpenThread) {
      onOpenThread(post.uri);
    }
    setQuery('');
    setIsOpen(false);
    inputRef.current?.blur();
  };

  // Get current items based on active tab
  const currentItems = activeTab === 'users' ? searchResults : postResults;
  const totalItems = currentItems.length;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, totalItems - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Enter always goes to full search results page
      if (query.trim() && onSearch) {
        onSearch(query.trim());
        setQuery('');
        setIsOpen(false);
        inputRef.current?.blur();
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      setActiveTab(prev => prev === 'users' ? 'posts' : 'users');
      setSelectedIndex(0);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim() && searchResults.length > 0 && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search"
          className="w-48 pl-9 pr-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 border border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-gray-900 rounded-full outline-none transition-all focus:w-64 text-gray-900 dark:text-gray-100 placeholder-gray-500"
        />
        {(loading || searching) && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-50 min-w-72">
          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => { setActiveTab('users'); setSelectedIndex(0); }}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'users'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500 -mb-px'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Users {searchResults.length > 0 && `(${searchResults.length})`}
            </button>
            <button
              onClick={() => { setActiveTab('posts'); setSelectedIndex(0); }}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'posts'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500 -mb-px'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Posts {postResults.length > 0 && `(${postResults.length})`}
            </button>
          </div>

          {/* Users tab content */}
          {activeTab === 'users' && (
            <div className="max-h-80 overflow-y-auto">
              {searchResults.map((result, index) => (
                <button
                  key={result.did}
                  onClick={() => handleSelect(result)}
                  className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                    index === selectedIndex
                      ? 'bg-blue-50 dark:bg-blue-900/30'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {/* Avatar with verified badge overlay */}
                  <div className="relative flex-shrink-0">
                    {result.avatar ? (
                      <img
                        src={result.avatar}
                        alt=""
                        className="w-10 h-10 rounded-full"
                      />
                    ) : (
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        result.isVerified 
                          ? 'bg-emerald-100 dark:bg-emerald-900/30' 
                          : 'bg-gray-200 dark:bg-gray-700'
                      }`}>
                        <span className={`font-medium ${
                          result.isVerified
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {(result.displayName || result.handle)[0].toUpperCase()}
                        </span>
                      </div>
                    )}
                    {result.isVerified && (
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center ring-2 ring-white dark:ring-gray-900">
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {result.displayName || result.handle}
                      </p>
                    </div>
                    <p className="text-sm text-gray-500 truncate">
                      @{result.handle}
                      {result.subtitle && ` · ${result.subtitle}`}
                    </p>
                  </div>
                </button>
              ))}
              {searchResults.length === 0 && query.trim() && !searching && (
                <div className="px-4 py-3 text-sm text-gray-500 text-center">
                  No users found
                </div>
              )}
            </div>
          )}

          {/* Posts tab content */}
          {activeTab === 'posts' && (
            <div className="max-h-80 overflow-y-auto">
              {postResults.map((post, index) => (
                <button
                  key={post.uri}
                  onClick={() => handleSelectPost(post)}
                  className={`w-full px-4 py-3 text-left transition-colors ${
                    index === selectedIndex
                      ? 'bg-blue-50 dark:bg-blue-900/30'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {post.authorAvatar ? (
                      <img src={post.authorAvatar} alt="" className="w-5 h-5 rounded-full" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-gray-300 dark:bg-gray-600" />
                    )}
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {post.authorDisplayName || post.authorHandle}
                    </span>
                    <span className="text-xs text-gray-500">@{post.authorHandle}</span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                    {post.text}
                  </p>
                </button>
              ))}
              {postResults.length === 0 && query.trim() && !searching && (
                <div className="px-4 py-3 text-sm text-gray-500 text-center">
                  No posts found
                </div>
              )}
            </div>
          )}

          {searching && totalItems === 0 && (
            <div className="px-4 py-3 text-sm text-gray-500 text-center">
              Searching...
            </div>
          )}

          {/* View all results link */}
          {onSearch && query.trim() && (searchResults.length > 0 || postResults.length > 0) && (
            <button
              onClick={() => {
                onSearch(query.trim());
                setQuery('');
                setIsOpen(false);
                inputRef.current?.blur();
              }}
              className="w-full px-4 py-3 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-t border-gray-200 dark:border-gray-700 flex items-center justify-center gap-2"
            >
              View all results for &ldquo;{query}&rdquo;
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          )}

          {/* Advanced search link */}
          <a
            href={query.trim() ? `/search/advanced?q=${encodeURIComponent(query.trim())}` : '/search/advanced'}
            onClick={() => {
              setQuery('');
              setIsOpen(false);
            }}
            className="w-full px-4 py-2 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex items-center justify-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            Advanced search
          </a>
        </div>
      )}
    </div>
  );
}
