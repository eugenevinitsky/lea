'use client';

import { useState, useEffect, useRef } from 'react';
import { searchActors, isVerifiedResearcher, ActorSearchResult, Label, getBlueskyProfile } from '@/lib/bluesky';

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

interface ResearcherSearchProps {
  onSelectResearcher: (did: string) => void;
}

export default function ResearcherSearch({ onSelectResearcher }: ResearcherSearchProps) {
  const [query, setQuery] = useState('');
  const [researchers, setResearchers] = useState<Researcher[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
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
        // Fetch avatars for verified researchers in parallel with Bluesky search
        const [bskyResults, ...avatarResults] = await Promise.all([
          searchActors(query, 8),
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
        setIsOpen(combined.length > 0);
      } catch (err) {
        console.error('Failed to search Bluesky actors:', err);
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults[selectedIndex]) {
        handleSelect(searchResults[selectedIndex]);
      }
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
          placeholder="Search users..."
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
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-50 min-w-64">
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
          {searching && searchResults.length === 0 && (
            <div className="px-4 py-3 text-sm text-gray-500 text-center">
              Searching...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
