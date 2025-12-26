'use client';

import { useState, useEffect } from 'react';
import { AppBskyFeedDefs } from '@atproto/api';
import type { ProfileLink, ProfilePaper } from '@/lib/db/schema';
import { getAuthorFeed } from '@/lib/bluesky';
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
}

export default function ProfileView({ did, avatar, displayName, handle, onClose, onOpenProfile }: ProfileViewProps) {
  const [researcher, setResearcher] = useState<ResearcherInfo | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [coAuthors, setCoAuthors] = useState<CoAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Posts state
  const [activeTab, setActiveTab] = useState<'profile' | 'posts'>('profile');
  const [posts, setPosts] = useState<AppBskyFeedDefs.FeedViewPost[]>([]);
  const [pinnedPost, setPinnedPost] = useState<AppBskyFeedDefs.PostView | null>(null);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsCursor, setPostsCursor] = useState<string | undefined>();
  const [postsError, setPostsError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProfile() {
      try {
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
  }, [did]);
  
  // Fetch posts when switching to posts tab
  useEffect(() => {
    async function fetchPosts() {
      if (activeTab !== 'posts' || posts.length > 0) return;
      
      setPostsLoading(true);
      setPostsError(null);
      try {
        const result = await getAuthorFeed(did);
        setPosts(result.feed);
        setPostsCursor(result.cursor);
        if (result.pinnedPost) {
          setPinnedPost(result.pinnedPost);
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

  const finalDisplayName = researcher?.name || displayName || handle || 'Unknown';
  const finalHandle = researcher?.handle || handle;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-900 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 p-4 flex items-center justify-between">
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
        {!loading && !error && (
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
          </div>
        )}

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
                    <div className="border-b border-gray-200 dark:border-gray-800">
                      <div className="flex items-center gap-1 px-4 pt-2 text-xs text-gray-500">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.828 3.172a4 4 0 015.657 5.657l-.707.707a1 1 0 01-1.414-1.414l.707-.707a2 2 0 00-2.829-2.829l-3 3a2 2 0 002.829 2.829l.586-.586a1 1 0 111.414 1.414l-.586.586a4 4 0 01-5.657-5.657l3-3z" />
                          <path d="M10.172 16.828a4 4 0 01-5.657-5.657l.707-.707a1 1 0 011.414 1.414l-.707.707a2 2 0 002.829 2.829l3-3a2 2 0 00-2.829-2.829l-.586.586a1 1 0 11-1.414-1.414l.586-.586a4 4 0 015.657 5.657l-3 3z" />
                        </svg>
                        Pinned
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

function PaperCard({ paper }: { paper: ProfilePaper }) {
  return (
    <a
      href={paper.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-gray-900 dark:text-gray-100 text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400">
          {paper.title}
        </p>
        <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
