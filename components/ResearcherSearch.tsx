'use client';

import { useState, useEffect, useRef } from 'react';

interface Researcher {
  did: string;
  handle: string;
  name: string | null;
  institution: string | null;
}

interface ResearcherSearchProps {
  onSelectResearcher: (did: string) => void;
}

export default function ResearcherSearch({ onSelectResearcher }: ResearcherSearchProps) {
  const [query, setQuery] = useState('');
  const [researchers, setResearchers] = useState<Researcher[]>([]);
  const [filteredResults, setFilteredResults] = useState<Researcher[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
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

  // Filter results when query changes
  useEffect(() => {
    if (!query.trim()) {
      setFilteredResults([]);
      setIsOpen(false);
      return;
    }

    const lowerQuery = query.toLowerCase();
    const filtered = researchers.filter(r => 
      r.name?.toLowerCase().includes(lowerQuery) ||
      r.handle?.toLowerCase().includes(lowerQuery) ||
      r.institution?.toLowerCase().includes(lowerQuery)
    ).slice(0, 8); // Limit to 8 results

    setFilteredResults(filtered);
    setIsOpen(filtered.length > 0);
    setSelectedIndex(0);
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

  const handleSelect = (researcher: Researcher) => {
    onSelectResearcher(researcher.did);
    setQuery('');
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filteredResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredResults[selectedIndex]) {
        handleSelect(filteredResults[selectedIndex]);
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
          onFocus={() => query.trim() && filteredResults.length > 0 && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search researchers..."
          className="w-48 pl-9 pr-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 border border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-gray-900 rounded-full outline-none transition-all focus:w-64 text-gray-900 dark:text-gray-100 placeholder-gray-500"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-50">
          {filteredResults.map((researcher, index) => (
            <button
              key={researcher.did}
              onClick={() => handleSelect(researcher)}
              className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                index === selectedIndex
                  ? 'bg-blue-50 dark:bg-blue-900/30'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                  {researcher.name || researcher.handle}
                </p>
                <p className="text-sm text-gray-500 truncate">
                  @{researcher.handle}
                  {researcher.institution && ` · ${researcher.institution}`}
                </p>
              </div>
            </button>
          ))}
          {filteredResults.length === 0 && query.trim() && (
            <div className="px-4 py-3 text-sm text-gray-500 text-center">
              No verified researchers found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
