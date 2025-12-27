'use client';

import { useState, useEffect, useMemo } from 'react';
import { AppBskyFeedDefs, AppBskyFeedPost, AppBskyEmbedExternal } from '@atproto/api';
import type { ProfileLink, ProfilePaper } from '@/lib/db/schema';
import { getAuthorFeed, getBlueskyProfile } from '@/lib/bluesky';
import { detectPaperLink } from '@/lib/papers';
import Post from './Post';

interface ResearcherInfo {
  did: string;
  handle: string;
  name: string | null;
  orcid: string;
  institution: string | null;
  researchTopics: string[];
  verifiedAt: string;
}

interface ProfileData {
  shortBio: string | null;
  affiliation: string | null;
  disciplines: string[];
  links: ProfileLink[];
  publicationVenues: string[];
  favoriteOwnPapers: ProfilePaper[];
  favoriteReadPapers: ProfilePaper[];
  updatedAt: string;
}

interface CoAuthor {
  openAlexId: string;
  name: string;
  count: number;
  verified?: {
    did: string;
    handle: string | null;
  };
}

interface ProfileViewProps {
  did: string;
  // Bluesky profile data (avatar, displayName) passed from parent
  avatar?: string;
  displayName?: string;
  handle?: string;
  onClose: () => void;
  onOpenProfile?: (did: string) => void;
  // If true, renders inline (not as modal) for main content area
  inline?: boolean;
}

export default function ProfileView({ did, avatar: avatarProp, displayName, handle, onClose, onOpenProfile, inline = false }: ProfileViewProps) {
  const [researcher, setResearcher] = useState<ResearcherInfo | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [coAuthors, setCoAuthors] = useState<CoAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Bluesky profile data (avatar, etc.)
  const [bskyProfile, setBskyProfile] = useState<{ avatar?: string; displayName?: string; handle: string } | null>(null);
  
  // Posts state
  const [activeTab, setActiveTab] = useState<'profile' | 'posts' | 'papers'>('profile');
  const [posts, setPosts] = useState<AppBskyFeedDefs.FeedViewPost[]>([]);
  const [pinnedPost, setPinnedPost] = useState<AppBskyFeedDefs.PostView | null>(null);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsCursor, setPostsCursor] = useState<string | undefined>();
  const [postsError, setPostsError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProfile() {
      try {
        // Fetch Bluesky profile for avatar if not passed as prop
        if (!avatarProp) {
          const bskyData = await getBlueskyProfile(did);
          if (bskyData) {
            setBskyProfile(bskyData);
          }
        }
        
        const res = await fetch(`/api/profile?did=${encodeURIComponent(did)}`);
        if (res.status === 404) {
          setError('not_verified');
          setLoading(false);
          return;
        }
        if (!res.ok) throw new Error('Failed to fetch profile');
        const data = await res.json();
        setResearcher(data.researcher);
        setProfile(data.profile);
        
        // Fetch co-authors if we have an ORCID
        if (data.researcher?.orcid) {
          fetchCoAuthors(data.researcher.orcid);
        }
      } catch (err) {
        console.error('Failed to fetch profile:', err);
        setError('error');
      } finally {
        setLoading(false);
      }
    }
    
    async function fetchCoAuthors(orcid: string) {
      try {
        // First get OpenAlex author ID from ORCID
        const authorRes = await fetch(`/api/openalex/author?orcid=${encodeURIComponent(orcid)}`);
        if (!authorRes.ok) return;
        const authorData = await authorRes.json();
        const openAlexId = authorData.results?.[0]?.id;
        if (!openAlexId) return;
        
        // Then fetch co-authors
        const coAuthorsRes = await fetch(`/api/openalex/coauthors?authorId=${encodeURIComponent(openAlexId)}`);
        if (!coAuthorsRes.ok) return;
        const coAuthorsData = await coAuthorsRes.json();
        setCoAuthors(coAuthorsData.coAuthors || []);
      } catch (err) {
        console.error('Failed to fetch co-authors:', err);
      }
    }
    
    fetchProfile();
  }, [did, avatarProp]);
  
  // Fetch posts when switching to posts or papers tab
  useEffect(() => {
    async function fetchPosts() {
      if ((activeTab !== 'posts' && activeTab !== 'papers') || posts.length > 0) return;
      
      setPostsLoading(true);
      setPostsError(null);
      try {
        // Initial fetch
        const result = await getAuthorFeed(did);
        setPosts(result.feed);
        setPostsCursor(result.cursor);
        if (result.pinnedPost) {
          setPinnedPost(result.pinnedPost);
        }
        
        // For Papers tab, auto-load more batches to find paper posts
        if (activeTab === 'papers' && result.cursor) {
          let currentCursor: string | undefined = result.cursor;
          let allPosts = result.feed;
          const MIN_PAGES = 5; // Load up to 5 pages (~150 posts) to find papers
          
          for (let i = 1; i < MIN_PAGES && currentCursor; i++) {
            await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between requests
            const moreResult = await getAuthorFeed(did, currentCursor);
            allPosts = [...allPosts, ...moreResult.feed];
            currentCursor = moreResult.cursor;
          }
          
          setPosts(allPosts);
          setPostsCursor(currentCursor);
        }
      } catch (err) {
        console.error('Failed to fetch posts:', err);
        setPostsError('Failed to load posts');
      } finally {
        setPostsLoading(false);
      }
    }
    
    fetchPosts();
  }, [activeTab, did, posts.length]);
  
  const loadMorePosts = async () => {
    if (!postsCursor || postsLoading) return;
    
    setPostsLoading(true);
    try {
      const result = await getAuthorFeed(did, postsCursor);
      setPosts(prev => [...prev, ...result.feed]);
      setPostsCursor(result.cursor);
    } catch (err) {
      console.error('Failed to load more posts:', err);
    } finally {
      setPostsLoading(false);
    }
  };
  
  // Filter posts to those containing paper links
  const paperPosts = useMemo(() => {
    return posts.filter(item => {
      const record = item.post.record as AppBskyFeedPost.Record;
      const embed = item.post.embed;
      
      // Get embed URL if it's an external link
      let embedUri: string | undefined;
      if (embed && 'external' in embed) {
        const external = embed as AppBskyEmbedExternal.View;
        embedUri = external.external?.uri;
      }
      
      const { hasPaper } = detectPaperLink(record.text, embedUri);
      return hasPaper;
    });
  }, [posts]);

  // Use prop values first, then fetched Bluesky profile, then researcher data
  const avatar = avatarProp || bskyProfile?.avatar;
  const finalDisplayName = researcher?.name || displayName || bskyProfile?.displayName || handle || bskyProfile?.handle || 'Unknown';
  const finalHandle = researcher?.handle || handle || bskyProfile?.handle;

  // Shared content rendering
  const renderTabs = () => (
    <div className="flex border-b border-gray-200 dark:border-gray-800">
      <button
        onClick={() => setActiveTab('profile')}
        className={`flex-1 py-3 text-sm font-medium transition-colors ${
          activeTab === 'profile'
            ? 'text-blue-500 border-b-2 border-blue-500'
            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
        }`}
      >
        Profile
      </button>
      <button
        onClick={() => setActiveTab('posts')}
        className={`flex-1 py-3 text-sm font-medium transition-colors ${
          activeTab === 'posts'
            ? 'text-blue-500 border-b-2 border-blue-500'
            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
        }`}
      >
        Posts
      </button>
      <button
        onClick={() => setActiveTab('papers')}
        className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-1 ${
          activeTab === 'papers'
            ? 'text-purple-500 border-b-2 border-purple-500'
            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Papers
      </button>
    </div>
  );

  // Inline mode - renders in main content area
  if (inline) {
    return (
      <div className="bg-gray-50 dark:bg-gray-950 min-h-screen">
        {/* Colorful gradient banner */}
        <div className="h-24 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 dark:from-blue-600 dark:via-purple-600 dark:to-pink-600" />
        
        {/* Header with back button - overlaps banner */}
        <div className="sticky top-0 z-10 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800 p-4 flex items-center gap-3 -mt-12">
          <button
            onClick={onClose}
            className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full bg-white/80 dark:bg-gray-800/80"
            title="Back to feed"
          >
            <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Profile</h2>
        </div>

        {/* Tabs */}
        {!loading && !error && renderTabs()}

        {/* Content - same structure as modal but without wrapper div differences */}
        <div>
          {loading ? (
            <div className="flex items-center justify-center py-12 px-4">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : error === 'not_verified' ? (
            <div className="text-center py-8 px-4">
              <div className="flex items-center justify-center mb-4">
                {avatar ? (
                  <img src={avatar} alt="" className="w-16 h-16 rounded-full" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700" />
                )}
              </div>
              <p className="text-lg font-medium text-gray-900 dark:text-gray-100">{finalDisplayName}</p>
              {finalHandle && (
                <p className="text-sm text-gray-500">@{finalHandle}</p>
              )}
              <p className="mt-4 text-sm text-gray-500">
                This user is not a verified researcher.
              </p>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500 px-4">
              Failed to load profile
            </div>
          ) : (
            <>
              {/* Profile Header Card */}
              <div className="mx-4 mt-4 mb-4 bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-4">
                <div className="flex items-start gap-4">
                  {avatar ? (
                    <img src={avatar} alt="" className="w-20 h-20 rounded-2xl flex-shrink-0 ring-4 ring-white dark:ring-gray-900 shadow-md" />
                  ) : (
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-400 to-purple-500 flex-shrink-0 ring-4 ring-white dark:ring-gray-900 shadow-md flex items-center justify-center text-white text-2xl font-bold">
                      {(finalDisplayName)[0].toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">
                        {finalDisplayName}
                      </h3>
                      <span
                        className="inline-flex items-center justify-center w-6 h-6 bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full flex-shrink-0 shadow-sm"
                        title="Verified Researcher"
                      >
                        <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </span>
                    </div>
                    {finalHandle && (
                      <p className="text-sm text-gray-500">@{finalHandle}</p>
                    )}
                    {(profile?.affiliation || researcher?.institution) && (
                      <p className="text-sm text-purple-600 dark:text-purple-400 mt-1 font-medium">
                        {profile?.affiliation || researcher?.institution}
                      </p>
                    )}
                    {researcher?.orcid && (
                      <a
                        href={`https://orcid.org/${researcher.orcid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 mt-2 px-2 py-1 bg-emerald-50 dark:bg-emerald-900/30 rounded-full"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 256 256" fill="currentColor">
                          <path d="M128 0C57.3 0 0 57.3 0 128s57.3 128 128 128 128-57.3 128-128S198.7 0 128 0zM70.7 193.5H50.9V79.9h19.8v113.6zm-9.9-128.1c-6.7 0-12.1-5.4-12.1-12.1s5.4-12.1 12.1-12.1 12.1 5.4 12.1 12.1-5.4 12.1-12.1 12.1zm134.7 128.1h-19.8v-55.4c0-13.9-.3-31.8-19.4-31.8-19.4 0-22.4 15.2-22.4 30.8v56.4H114V79.9h19v15.5h.3c2.6-5 9.2-10.2 18.9-10.2 20.2 0 23.9 13.3 23.9 30.6v77.7z" />
                        </svg>
                        ORCID
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Profile Tab Content */}
              {activeTab === 'profile' && (
                <div className="px-4 pb-4 space-y-4">
                  {/* Bio Card */}
                  {profile?.shortBio && (
                    <div className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm">
                      <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{profile.shortBio}</p>
                    </div>
                  )}
                  
                  {/* Research Topics */}
                  {(() => {
                    const topics = (profile?.disciplines && profile.disciplines.length > 0)
                      ? profile.disciplines 
                      : researcher?.researchTopics;
                    if (!topics || topics.length === 0) return null;
                    return (
                      <div className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm">
                        <h4 className="text-sm font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                          Research Topics
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {topics.slice(0, 8).map((topic, i) => (
                            <span key={i} className="px-3 py-1.5 bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/40 dark:to-pink-900/40 text-purple-700 dark:text-purple-300 rounded-full text-sm font-medium">{topic}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  
                  {/* Links */}
                  {profile?.links && profile.links.length > 0 && (
                    <div className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm">
                      <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                        Links
                      </h4>
                      <div className="space-y-2">
                        {profile.links.map((link, i) => (
                          <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                            {link.title}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Publication Venues */}
                  {profile?.publicationVenues && profile.publicationVenues.length > 0 && (
                    <div className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm">
                      <h4 className="text-sm font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>
                        Publication Venues
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {profile.publicationVenues.map((venue, i) => (
                          <span key={i} className="px-3 py-1.5 bg-gradient-to-r from-orange-100 to-amber-100 dark:from-orange-900/40 dark:to-amber-900/40 text-orange-700 dark:text-orange-300 rounded-full text-sm font-medium">{venue}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Favorite Papers Written */}
                  {profile?.favoriteOwnPapers && profile.favoriteOwnPapers.length > 0 && (
                    <div className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm">
                      <h4 className="text-sm font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                        Papers I&apos;ve Written
                      </h4>
                      <div className="space-y-3">{profile.favoriteOwnPapers.map((paper, i) => (<PaperCard key={i} paper={paper} color="rose" />))}</div>
                    </div>
                  )}
                  
                  {/* Papers I Recommend */}
                  {profile?.favoriteReadPapers && profile.favoriteReadPapers.length > 0 && (
                    <div className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm">
                      <h4 className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                        Papers I Recommend
                      </h4>
                      <div className="space-y-3">{profile.favoriteReadPapers.map((paper, i) => (<PaperCard key={i} paper={paper} color="indigo" />))}</div>
                    </div>
                  )}
                  
                  {/* Co-Authors */}
                  {coAuthors.length > 0 && (
                    <div className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm">
                      <h4 className="text-sm font-semibold text-teal-600 dark:text-teal-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                        Frequent Co-Authors
                      </h4>
                      <div className="space-y-2">
                        {coAuthors.slice(0, 5).map((coAuthor) => (
                          <div key={coAuthor.openAlexId} className="flex items-center justify-between py-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-700 dark:text-gray-300">{coAuthor.name}</span>
                              {coAuthor.verified && (
                                <span className="inline-flex items-center justify-center w-4 h-4 bg-emerald-500 rounded-full flex-shrink-0" title="Verified Researcher on Lea">
                                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">{coAuthor.count} paper{coAuthor.count !== 1 ? 's' : ''}</span>
                              {coAuthor.verified?.handle && (
                                <button onClick={(e) => { e.stopPropagation(); if (onOpenProfile) { onOpenProfile(coAuthor.verified!.did); }}} className="text-xs text-blue-500 hover:text-blue-600">@{coAuthor.verified.handle}</button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Empty State */}
                  {!profile?.shortBio && (!profile?.disciplines || profile.disciplines.length === 0) && (!researcher?.researchTopics || researcher.researchTopics.length === 0) && (!profile?.links || profile.links.length === 0) && (!profile?.publicationVenues || profile.publicationVenues.length === 0) && (!profile?.favoriteOwnPapers || profile.favoriteOwnPapers.length === 0) && (!profile?.favoriteReadPapers || profile.favoriteReadPapers.length === 0) && (
                    <div className="bg-white dark:bg-gray-900 rounded-xl p-8 shadow-sm text-center">
                      <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 rounded-full flex items-center justify-center">
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      </div>
                      <p className="text-gray-500">This researcher hasn&apos;t filled out their profile yet.</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          
          {/* Posts Tab */}
          {activeTab === 'posts' && !loading && !error && (
            <div>
              {postsLoading && posts.length === 0 ? (
                <div className="flex items-center justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>
              ) : postsError ? (
                <div className="text-center py-8 text-red-500">{postsError}</div>
              ) : (
                <>
                  {pinnedPost && (
                    <div className="border-b-2 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10">
                      <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
                        <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clipRule="evenodd" /></svg>
                        <span className="text-sm font-medium text-blue-600 dark:text-blue-400">Pinned Post</span>
                      </div>
                      <Post post={pinnedPost} />
                    </div>
                  )}
                  {posts.length === 0 && !pinnedPost ? (
                    <div className="text-center py-8 text-gray-500">No posts yet</div>
                  ) : (
                    <>
                      {posts.filter(item => item.post.uri !== pinnedPost?.uri).map((item) => (
                        <div key={item.post.uri} className="border-b border-gray-200 dark:border-gray-800 last:border-b-0"><Post post={item.post} /></div>
                      ))}
                      {postsCursor && (
                        <div className="p-4 text-center">
                          <button onClick={loadMorePosts} disabled={postsLoading} className="px-4 py-2 text-sm text-blue-500 hover:text-blue-600 disabled:opacity-50">{postsLoading ? 'Loading...' : 'Load more'}</button>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}
          
          {/* Papers Tab */}
          {activeTab === 'papers' && !loading && !error && (
            <div>
              {postsLoading && posts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" />
                  <p className="text-sm text-gray-500">Scanning posts for papers...</p>
                </div>
              ) : postsError ? (
                <div className="text-center py-8 text-red-500">{postsError}</div>
              ) : paperPosts.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="w-16 h-16 mx-auto mb-4 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p className="text-gray-500 mb-2">No paper posts found</p>
                  <p className="text-sm text-gray-400 mb-1">Scanned {posts.length} post{posts.length !== 1 ? 's' : ''}</p>
                  <p className="text-xs text-gray-400">Posts with links to arXiv, DOI, bioRxiv, etc. will appear here</p>
                  {postsCursor && (
                    <button onClick={loadMorePosts} disabled={postsLoading} className="mt-4 px-4 py-2 text-sm bg-purple-500 text-white rounded-full hover:bg-purple-600 disabled:opacity-50">
                      {postsLoading ? 'Scanning...' : 'Load more posts'}
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="px-4 py-2 bg-purple-50 dark:bg-purple-900/20 border-b border-purple-100 dark:border-purple-800">
                    <p className="text-xs text-purple-600 dark:text-purple-400">
                      {paperPosts.length} paper{paperPosts.length !== 1 ? 's' : ''} found in {posts.length} posts
                    </p>
                  </div>
                  {paperPosts.map((item) => (
                    <div key={item.post.uri} className="border-b border-gray-200 dark:border-gray-800 last:border-b-0"><Post post={item.post} /></div>
                  ))}
                  {postsCursor && (
                    <div className="p-4 text-center">
                      <button onClick={loadMorePosts} disabled={postsLoading} className="px-4 py-2 text-sm text-purple-500 hover:text-purple-600 disabled:opacity-50">{postsLoading ? 'Scanning...' : 'Load more'}</button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Modal mode (default)
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-900 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 p-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Researcher Profile</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs - only show when profile is loaded and user is verified */}
        {!loading && !error && renderTabs()}

        <div>
          {loading ? (
            <div className="flex items-center justify-center py-12 px-4">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : error === 'not_verified' ? (
            <div className="text-center py-8 px-4">
              <div className="flex items-center justify-center mb-4">
                {avatar ? (
                  <img src={avatar} alt="" className="w-16 h-16 rounded-full" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700" />
                )}
              </div>
              <p className="text-lg font-medium text-gray-900 dark:text-gray-100">{finalDisplayName}</p>
              {finalHandle && (
                <p className="text-sm text-gray-500">@{finalHandle}</p>
              )}
              <p className="mt-4 text-sm text-gray-500">
                This user is not a verified researcher.
              </p>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500 px-4">
              Failed to load profile
            </div>
          ) : (
            <>
              {/* Profile Header - always visible */}
              <div className="flex items-start gap-4 mb-4 p-4 pb-0">
                {avatar ? (
                  <img src={avatar} alt="" className="w-20 h-20 rounded-full flex-shrink-0" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">
                      {finalDisplayName}
                    </h3>
                    <span
                      className="inline-flex items-center justify-center w-5 h-5 bg-emerald-500 rounded-full flex-shrink-0"
                      title="Verified Researcher"
                    >
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </span>
                  </div>
                  {finalHandle && (
                    <p className="text-sm text-gray-500">@{finalHandle}</p>
                  )}
                  {(profile?.affiliation || researcher?.institution) && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {profile?.affiliation || researcher?.institution}
                    </p>
                  )}
                  {researcher?.orcid && (
                    <a
                      href={`https://orcid.org/${researcher.orcid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-700 mt-1"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 256 256" fill="currentColor">
                        <path d="M128 0C57.3 0 0 57.3 0 128s57.3 128 128 128 128-57.3 128-128S198.7 0 128 0zM70.7 193.5H50.9V79.9h19.8v113.6zm-9.9-128.1c-6.7 0-12.1-5.4-12.1-12.1s5.4-12.1 12.1-12.1 12.1 5.4 12.1 12.1-5.4 12.1-12.1 12.1zm134.7 128.1h-19.8v-55.4c0-13.9-.3-31.8-19.4-31.8-19.4 0-22.4 15.2-22.4 30.8v56.4H114V79.9h19v15.5h.3c2.6-5 9.2-10.2 18.9-10.2 20.2 0 23.9 13.3 23.9 30.6v77.7z" />
                      </svg>
                      ORCID
                    </a>
                  )}
                </div>
              </div>

              {/* Profile Tab Content */}
              {activeTab === 'profile' && (
                <div className="px-4 pb-4">
                  {/* Bio */}
                  {profile?.shortBio && (
                    <div className="mb-6">
                      <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{profile.shortBio}</p>
                    </div>
                  )}

                  {/* Research Topics - show profile disciplines if set, otherwise auto-populated topics */}
                  {(() => {
                    const topics = (profile?.disciplines && profile.disciplines.length > 0)
                      ? profile.disciplines 
                      : researcher?.researchTopics;
                    if (!topics || topics.length === 0) return null;
                    return (
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                          Research Topics
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {topics.slice(0, 8).map((topic, i) => (
                            <span
                              key={i}
                              className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-sm"
                            >
                              {topic}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Links */}
                  {profile?.links && profile.links.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                        Links
                      </h4>
                      <div className="space-y-2">
                        {profile.links.map((link, i) => (
                          <a
                            key={i}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            {link.title}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Publication Venues */}
                  {profile?.publicationVenues && profile.publicationVenues.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                        Primary Publication Venues
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {profile.publicationVenues.map((venue, i) => (
                          <span
                            key={i}
                            className="px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm"
                          >
                            {venue}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Favorite Own Papers */}
                  {profile?.favoriteOwnPapers && profile.favoriteOwnPapers.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                        Favorite Papers I&apos;ve Written
                      </h4>
                      <div className="space-y-3">
                        {profile.favoriteOwnPapers.map((paper, i) => (
                          <PaperCard key={i} paper={paper} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Favorite Read Papers */}
                  {profile?.favoriteReadPapers && profile.favoriteReadPapers.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                        Papers I Recommend
                      </h4>
                      <div className="space-y-3">
                        {profile.favoriteReadPapers.map((paper, i) => (
                          <PaperCard key={i} paper={paper} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Frequent Co-Authors */}
                  {coAuthors.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                        Frequent Co-Authors
                      </h4>
                      <div className="space-y-2">
                        {coAuthors.slice(0, 5).map((coAuthor) => (
                          <div
                            key={coAuthor.openAlexId}
                            className="flex items-center justify-between py-1"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-700 dark:text-gray-300">
                                {coAuthor.name}
                              </span>
                              {coAuthor.verified && (
                                <span
                                  className="inline-flex items-center justify-center w-4 h-4 bg-emerald-500 rounded-full flex-shrink-0"
                                  title="Verified Researcher on Lea"
                                >
                                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">
                                {coAuthor.count} paper{coAuthor.count !== 1 ? 's' : ''}
                              </span>
                              {coAuthor.verified?.handle && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (onOpenProfile) {
                                      onClose();
                                      onOpenProfile(coAuthor.verified!.did);
                                    }
                                  }}
                                  className="text-xs text-blue-500 hover:text-blue-600"
                                >
                                  @{coAuthor.verified.handle}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Empty profile message */}
                  {!profile?.shortBio && 
                   (!profile?.disciplines || profile.disciplines.length === 0) &&
                   (!researcher?.researchTopics || researcher.researchTopics.length === 0) &&
                   (!profile?.links || profile.links.length === 0) &&
                   (!profile?.publicationVenues || profile.publicationVenues.length === 0) &&
                   (!profile?.favoriteOwnPapers || profile.favoriteOwnPapers.length === 0) &&
                   (!profile?.favoriteReadPapers || profile.favoriteReadPapers.length === 0) && (
                    <div className="text-center py-4 text-gray-500">
                      <p>This researcher hasn&apos;t filled out their profile yet.</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          
          {/* Posts Tab */}
          {activeTab === 'posts' && !loading && !error && (
            <div className="-mx-4">
              {postsLoading && posts.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
                </div>
              ) : postsError ? (
                <div className="text-center py-8 text-red-500">{postsError}</div>
              ) : (
                <>
                  {/* Pinned Post */}
                  {pinnedPost && (
                    <div className="border-b-2 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10">
                      <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
                        <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm font-medium text-blue-600 dark:text-blue-400">Pinned Post</span>
                      </div>
                      <Post post={pinnedPost} />
                    </div>
                  )}
                  
                  {/* Posts list */}
                  {posts.length === 0 && !pinnedPost ? (
                    <div className="text-center py-8 text-gray-500">
                      No posts yet
                    </div>
                  ) : (
                    <>
                      {posts
                        .filter(item => item.post.uri !== pinnedPost?.uri) // Exclude pinned from list
                        .map((item) => (
                          <div key={item.post.uri} className="border-b border-gray-200 dark:border-gray-800 last:border-b-0">
                            <Post post={item.post} />
                          </div>
                        ))}
                      
                      {/* Load more button */}
                      {postsCursor && (
                        <div className="p-4 text-center">
                          <button
                            onClick={loadMorePosts}
                            disabled={postsLoading}
                            className="px-4 py-2 text-sm text-blue-500 hover:text-blue-600 disabled:opacity-50"
                          >
                            {postsLoading ? 'Loading...' : 'Load more'}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PaperCard({ paper, color = 'gray' }: { paper: ProfilePaper; color?: 'gray' | 'rose' | 'indigo' }) {
  const colorClasses = {
    gray: {
      bg: 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700',
      hover: 'group-hover:text-gray-600 dark:group-hover:text-gray-400',
      icon: 'group-hover:text-gray-500'
    },
    rose: {
      bg: 'bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/30',
      hover: 'group-hover:text-rose-600 dark:group-hover:text-rose-400',
      icon: 'group-hover:text-rose-500'
    },
    indigo: {
      bg: 'bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/30',
      hover: 'group-hover:text-indigo-600 dark:group-hover:text-indigo-400',
      icon: 'group-hover:text-indigo-500'
    }
  };
  
  const c = colorClasses[color];
  
  return (
    <a
      href={paper.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block p-3 rounded-lg transition-colors group ${c.bg}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`font-medium text-gray-900 dark:text-gray-100 text-sm ${c.hover}`}>
          {paper.title}
        </p>
        <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 ${c.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </div>
      {paper.authors && (
        <p className="text-xs text-gray-500 mt-1 line-clamp-1">{paper.authors}</p>
      )}
      <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
        {paper.venue && <span>{paper.venue}</span>}
        {paper.venue && paper.year && <span>·</span>}
        {paper.year && <span>{paper.year}</span>}
      </div>
    </a>
  );
}
