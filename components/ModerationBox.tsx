'use client';

import { useState, useEffect } from 'react';
import ProfileHoverCard from './ProfileHoverCard';
import { getActiveResearchers } from '@/lib/feed-tracking';
import { getSession } from '@/lib/bluesky';
import { useFollowing } from '@/lib/following-context';

interface RecentResearcher {
  did: string;
  handle: string | null;
  name: string | null;
  verifiedAt: string | null;
}

interface TrendingPaper {
  id: number;
  url: string;
  normalizedId: string;
  source: string;
  title: string | null;
  authors: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  mentionCount: number;
  postCount?: number;
  recentMentions?: number;
}

interface ActiveResearcher {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  totalCount: number;
  feeds: Array<{ feedUri: string; feedName: string; count: number }>;
  lastSeen: number;
}

interface ModerationBoxProps {
  onOpenProfile?: (did: string) => void;
}

type Tab = 'verified' | 'active' | 'papers';

function formatTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function ModerationBox({ onOpenProfile }: ModerationBoxProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('verified');
  const [recentResearchers, setRecentResearchers] = useState<RecentResearcher[]>([]);
  const [activeResearchers, setActiveResearchers] = useState<ActiveResearcher[]>([]);
  const [trendingPapers, setTrendingPapers] = useState<TrendingPaper[]>([]);
  const [loading, setLoading] = useState(false);
  const [papersLoading, setPapersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { followingDids } = useFollowing();

  // Fetch recently verified when tab is selected or expanded
  useEffect(() => {
    if (isExpanded && activeTab === 'verified' && recentResearchers.length === 0) {
      fetchRecent();
    }
  }, [isExpanded, activeTab]);

  // Load active researchers when tab is selected
  useEffect(() => {
    if (isExpanded && activeTab === 'active') {
      const active = getActiveResearchers();
      setActiveResearchers(active);
    }
  }, [isExpanded, activeTab]);

  // Fetch trending papers when tab is selected
  useEffect(() => {
    if (isExpanded && activeTab === 'papers' && trendingPapers.length === 0) {
      fetchTrendingPapers();
    }
  }, [isExpanded, activeTab]);

  const fetchRecent = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/researchers/recent');
      const data = await response.json();
      if (data.researchers) {
        setRecentResearchers(data.researchers);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const fetchTrendingPapers = async () => {
    setPapersLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/papers/trending?hours=24&limit=20');
      const data = await response.json();
      if (data.papers) {
        setTrendingPapers(data.papers);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load papers');
    } finally {
      setPapersLoading(false);
    }
  };

  // Filter out people the user already follows and the user themselves
  const session = getSession();
  const myDid = session?.did;

  const filteredRecentResearchers = recentResearchers.filter(r => {
    if (myDid && r.did === myDid) return false;
    if (followingDids && followingDids.has(r.did)) return false;
    return true;
  });

  const filteredActiveResearchers = activeResearchers.filter(r => {
    if (myDid && r.did === myDid) return false;
    if (followingDids && followingDids.has(r.did)) return false;
    return true;
  });

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <span className="font-semibold text-gray-900 dark:text-gray-100">Discover</span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-gray-200 dark:border-gray-800">
          {error && (
            <div className="p-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs">
              {error}
            </div>
          )}

          {/* Tabs */}
          <div className="flex border-b border-gray-100 dark:border-gray-800">
            <button
              onClick={() => setActiveTab('verified')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === 'verified'
                  ? 'text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-500'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Newly Verified
            </button>
            <button
              onClick={() => setActiveTab('active')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === 'active'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setActiveTab('papers')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === 'papers'
                  ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-500'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Papers
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'verified' && (
            <div>
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <div className="animate-spin w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full" />
                </div>
              ) : filteredRecentResearchers.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-xs text-gray-400">No new researchers to discover</p>
                </div>
              ) : (
                <div className="max-h-[280px] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredRecentResearchers.map((researcher) => (
                    <button
                      key={researcher.did}
                      onClick={() => onOpenProfile?.(researcher.did)}
                      className="w-full p-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <ProfileHoverCard
                          did={researcher.did}
                          handle={researcher.handle || undefined}
                          onOpenProfile={() => onOpenProfile?.(researcher.did)}
                        >
                          <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 cursor-pointer">
                            {(researcher.name || researcher.handle || '?')[0].toUpperCase()}
                          </div>
                        </ProfileHoverCard>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                              {researcher.name || researcher.handle || 'Unknown'}
                            </span>
                            <span className="flex-shrink-0 w-3.5 h-3.5 bg-emerald-500 rounded-full flex items-center justify-center">
                              <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            {researcher.handle && (
                              <span className="truncate">@{researcher.handle}</span>
                            )}
                            {researcher.verifiedAt && (
                              <>
                                <span>·</span>
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  {formatTime(researcher.verifiedAt)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'active' && (
            <div>
              {filteredActiveResearchers.length === 0 ? (
                <div className="p-4 text-center">
                  <svg className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <p className="text-xs text-gray-400 mb-1">No new researchers to discover</p>
                  <p className="text-[10px] text-gray-400">Browse your feeds to discover active researchers</p>
                </div>
              ) : (
                <div className="max-h-[280px] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredActiveResearchers.slice(0, 20).map((researcher) => (
                    <button
                      key={researcher.did}
                      onClick={() => onOpenProfile?.(researcher.did)}
                      className="w-full p-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <ProfileHoverCard
                          did={researcher.did}
                          handle={researcher.handle}
                          onOpenProfile={() => onOpenProfile?.(researcher.did)}
                        >
                          {researcher.avatar ? (
                            <img
                              src={researcher.avatar}
                              alt=""
                              className="w-8 h-8 rounded-full flex-shrink-0 cursor-pointer"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 cursor-pointer">
                              {(researcher.displayName || researcher.handle)[0].toUpperCase()}
                            </div>
                          )}
                        </ProfileHoverCard>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                              {researcher.displayName || researcher.handle}
                            </span>
                            <span className="flex-shrink-0 w-3.5 h-3.5 bg-emerald-500 rounded-full flex items-center justify-center">
                              <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <span className="text-blue-600 dark:text-blue-400">
                              {researcher.totalCount} post{researcher.totalCount !== 1 ? 's' : ''}
                            </span>
                            <span>·</span>
                            <span className="truncate">
                              {researcher.feeds.map(f => f.feedName).slice(0, 2).join(', ')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'papers' && (
            <div>
              {papersLoading ? (
                <div className="flex items-center justify-center py-6">
                  <div className="animate-spin w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full" />
                </div>
              ) : trendingPapers.length === 0 ? (
                <div className="p-4 text-center">
                  <svg className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-xs text-gray-400">No papers trending yet</p>
                  <p className="text-[10px] text-gray-400 mt-1">Papers shared on Bluesky will appear here</p>
                </div>
              ) : (
                <div className="max-h-[280px] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
                  {trendingPapers.map((paper) => {
                    const sourceColors: Record<string, string> = {
                      arxiv: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                      biorxiv: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
                      medrxiv: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                      doi: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                      pubmed: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
                      nature: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
                    };
                    const colorClass = sourceColors[paper.source] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';

                    // Extract a readable ID from the normalized ID
                    const displayId = paper.normalizedId.split(':')[1] || paper.normalizedId;

                    // Link to paper discussion page
                    const discussionUrl = `/paper/${encodeURIComponent(paper.normalizedId)}?url=${encodeURIComponent(paper.url)}`;

                    return (
                      <a
                        key={paper.id}
                        href={discussionUrl}
                        className="block p-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                            <svg className="w-4 h-4 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${colorClass}`}>
                                {paper.source}
                              </span>
                              <span className="text-purple-600 dark:text-purple-400 text-[10px] font-medium">
                                {paper.recentMentions ?? paper.mentionCount} discussing now
                              </span>
                            </div>
                            <p className="text-xs text-gray-900 dark:text-gray-100 font-medium truncate">
                              {paper.title || displayId}
                            </p>
                            <p className="text-[10px] text-gray-500 truncate">
                              {displayId}
                            </p>
                          </div>
                          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
