'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { searchActors, SearchPostsFilters } from '@/lib/bluesky';

interface Researcher {
  did: string;
  handle: string;
  name: string | null;
  institution: string | null;
  researchTopics?: string[] | null;
}

interface AdvancedSearchProps {
  initialQuery?: string;
  initialFilters?: SearchPostsFilters;
  onSearch: (query: string, filters: SearchPostsFilters, verifiedOnly: boolean) => void;
}

// Common research domains
const COMMON_DOMAINS = [
  { domain: '', label: 'Any domain' },
  { domain: 'arxiv.org', label: 'arXiv' },
  { domain: 'biorxiv.org', label: 'bioRxiv' },
  { domain: 'medrxiv.org', label: 'medRxiv' },
  { domain: 'github.com', label: 'GitHub' },
  { domain: 'doi.org', label: 'DOI links' },
  { domain: 'nature.com', label: 'Nature' },
  { domain: 'science.org', label: 'Science' },
  { domain: 'pnas.org', label: 'PNAS' },
  { domain: 'huggingface.co', label: 'Hugging Face' },
];

export default function AdvancedSearch({ initialQuery = '', initialFilters = {}, onSearch }: AdvancedSearchProps) {
  // Query state
  const [query, setQuery] = useState(initialQuery);
  const [sort, setSort] = useState<'top' | 'latest'>('top');
  
  // Filter states
  const [authorHandle, setAuthorHandle] = useState(initialFilters.author || '');
  const [authorSuggestions, setAuthorSuggestions] = useState<{ did: string; handle: string; displayName?: string }[]>([]);
  const [showAuthorSuggestions, setShowAuthorSuggestions] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState(initialFilters.domain || '');
  const [customDomain, setCustomDomain] = useState('');
  const [tags, setTags] = useState<string[]>(initialFilters.tag || []);
  const [tagInput, setTagInput] = useState('');
  
  // Researcher-specific filters
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [selectedInstitution, setSelectedInstitution] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [researchers, setResearchers] = useState<Researcher[]>([]);
  const [institutions, setInstitutions] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  
  // UI state
  const [showFilters, setShowFilters] = useState(true);
  const authorInputRef = useRef<HTMLInputElement>(null);
  const authorDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch researchers for institution/topic filters
  useEffect(() => {
    async function fetchResearchers() {
      try {
        const res = await fetch('/api/researchers');
        if (res.ok) {
          const data = await res.json();
          const researchers: Researcher[] = data.researchers || [];
          setResearchers(researchers);
          
          // Extract unique institutions
          const uniqueInstitutions = [...new Set(
            researchers
              .map(r => r.institution)
              .filter((i): i is string => !!i)
          )].sort();
          setInstitutions(uniqueInstitutions);
          
          // Extract unique topics
          const allTopics = researchers.flatMap(r => r.researchTopics || []);
          const uniqueTopics = [...new Set(allTopics)].sort();
          setTopics(uniqueTopics);
        }
      } catch (err) {
        console.error('Failed to fetch researchers:', err);
      }
    }
    fetchResearchers();
  }, []);

  // Author autocomplete
  useEffect(() => {
    if (!authorHandle || authorHandle.length < 2) {
      setAuthorSuggestions([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        const results = await searchActors(authorHandle, 5);
        setAuthorSuggestions(results.map(r => ({
          did: r.did,
          handle: r.handle,
          displayName: r.displayName,
        })));
        setShowAuthorSuggestions(true);
      } catch (err) {
        console.error('Failed to search actors:', err);
      }
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [authorHandle]);

  // Close author dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (authorDropdownRef.current && !authorDropdownRef.current.contains(event.target as Node)) {
        setShowAuthorSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddTag = () => {
    const tag = tagInput.trim().replace(/^#/, '');
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handleSearch = useCallback(() => {
    const filters: SearchPostsFilters = {};
    
    if (authorHandle) filters.author = authorHandle;
    if (selectedDomain) {
      filters.domain = selectedDomain;
    } else if (customDomain) {
      filters.domain = customDomain;
    }
    
    // Include hashtags directly in the query string for more reliable search
    // The Bluesky search supports #hashtag syntax in the query
    let searchQuery = query;
    if (tags.length > 0) {
      const hashtagPart = tags.map(t => `#${t}`).join(' ');
      searchQuery = searchQuery ? `${searchQuery} ${hashtagPart}` : hashtagPart;
    }
    
    onSearch(searchQuery, filters, verifiedOnly);
  }, [query, authorHandle, selectedDomain, customDomain, tags, verifiedOnly, onSearch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  const clearFilters = () => {
    setAuthorHandle('');
    setSelectedDomain('');
    setCustomDomain('');
    setTags([]);
    setVerifiedOnly(false);
    setSelectedInstitution('');
    setSelectedTopic('');
  };

  // Build query string for display
  const buildQueryString = () => {
    const parts: string[] = [];
    if (query) parts.push(query);
    if (authorHandle) parts.push(`from:${authorHandle}`);
    if (selectedDomain || customDomain) parts.push(`domain:${selectedDomain || customDomain}`);
    tags.forEach(tag => parts.push(`#${tag}`));
    return parts.join(' ');
  };

  const activeFilterCount = [
    authorHandle,
    selectedDomain || customDomain,
    tags.length > 0,
    verifiedOnly,
    selectedInstitution,
    selectedTopic,
  ].filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* Main search input */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
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
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search posts..."
            className="w-full pl-10 pr-4 py-3 text-base bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-gray-100"
          />
        </div>
        <button
          onClick={handleSearch}
          className="px-6 py-3 bg-blue-500 text-white font-medium rounded-xl hover:bg-blue-600 transition-colors"
        >
          Search
        </button>
      </div>

      {/* Sort and filter toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Sort:</span>
            <button
              onClick={() => setSort('top')}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                sort === 'top'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              Top
            </button>
            <button
              onClick={() => setSort('latest')}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                sort === 'latest'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              Latest
            </button>
          </div>
        </div>
        
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-blue-500 text-white rounded-full">
              {activeFilterCount}
            </span>
          )}
          <svg
            className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 space-y-4 border border-gray-200 dark:border-gray-800">
          {/* Row 1: Author and Domain */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Author filter */}
            <div className="relative" ref={authorDropdownRef}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                From user
              </label>
              <input
                ref={authorInputRef}
                type="text"
                value={authorHandle}
                onChange={(e) => setAuthorHandle(e.target.value)}
                onFocus={() => authorSuggestions.length > 0 && setShowAuthorSuggestions(true)}
                placeholder="@handle"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
              {showAuthorSuggestions && authorSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10 max-h-48 overflow-y-auto">
                  {authorSuggestions.map(suggestion => (
                    <button
                      key={suggestion.did}
                      onClick={() => {
                        setAuthorHandle(suggestion.handle);
                        setShowAuthorSuggestions(false);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
                    >
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {suggestion.displayName || suggestion.handle}
                      </span>
                      <span className="text-gray-500 ml-1">@{suggestion.handle}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Domain */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Contains links to
              </label>
              <div className="flex gap-2">
                <select
                  value={selectedDomain}
                  onChange={(e) => {
                    setSelectedDomain(e.target.value);
                    if (e.target.value) setCustomDomain('');
                  }}
                  className="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  {COMMON_DOMAINS.map(d => (
                    <option key={d.domain} value={d.domain}>{d.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={customDomain}
                  onChange={(e) => {
                    setCustomDomain(e.target.value);
                    if (e.target.value) setSelectedDomain('');
                  }}
                  placeholder="Or custom..."
                  className="w-32 px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
            </div>
          </div>

          {/* Row 3: Hashtags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Hashtags
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-1 text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full"
                >
                  #{tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-blue-900 dark:hover:text-blue-100"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="Add hashtag..."
                className="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
              <button
                onClick={handleAddTag}
                className="px-3 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Row 4: Researcher-specific filters */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
              </svg>
              Researcher Filters
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Verified only toggle */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setVerifiedOnly(!verifiedOnly)}
                  className={`relative w-10 h-6 rounded-full transition-colors ${
                    verifiedOnly ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      verifiedOnly ? 'translate-x-4' : ''
                    }`}
                  />
                </button>
                <span className="text-sm text-gray-700 dark:text-gray-300">Verified researchers only</span>
              </div>

              {/* Institution filter */}
              <div>
                <select
                  value={selectedInstitution}
                  onChange={(e) => setSelectedInstitution(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  <option value="">Any institution</option>
                  {institutions.map(inst => (
                    <option key={inst} value={inst}>{inst}</option>
                  ))}
                </select>
              </div>

              {/* Topic filter */}
              <div>
                <select
                  value={selectedTopic}
                  onChange={(e) => setSelectedTopic(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  <option value="">Any research topic</option>
                  {topics.map(topic => (
                    <option key={topic} value={topic}>{topic}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Clear filters and query preview */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={clearFilters}
              className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Clear all filters
            </button>
            
            {activeFilterCount > 0 && (
              <div className="text-xs text-gray-400 font-mono truncate max-w-md">
                {buildQueryString()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
