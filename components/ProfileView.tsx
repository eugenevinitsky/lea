'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { AppBskyFeedDefs, AppBskyFeedPost, AppBskyEmbedExternal } from '@atproto/api';
import type { ProfileLink, ProfilePaper } from '@/lib/db/schema';
import { getAuthorFeed, getBlueskyProfile, getKnownFollowers, BlueskyProfile, KnownFollowersResult, followUser, unfollowUser, blockUser, unblockUser, getSession, searchPosts, Label } from '@/lib/bluesky';
import { detectPaperLink, getPaperIdFromUrl } from '@/lib/papers';
import { useFollowing } from '@/lib/following-context';
import Post from './Post';
import ProfileLabels from './ProfileLabels';

// Helper to convert URLs in text to clickable links
function linkifyText(text: string): React.ReactNode {
  // Pattern matches URLs with http(s)://, www., or common TLDs
  const urlPattern = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9][a-zA-Z0-9-]*\.(com|edu|org|net|io|co|gov|me|info|biz|dev|ai|app)[^\s]*)/gi;
  
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let keyIndex = 0;
  
  while ((match = urlPattern.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    
    let url = match[0];
    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    // Remove trailing punctuation that's likely not part of the URL
    const displayUrl = match[0].replace(/[.,;:!?)]+$/, '');
    const cleanUrl = url.replace(/[.,;:!?)]+$/, '');
    
    parts.push(
      <a
        key={keyIndex++}
        href={cleanUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-500 hover:text-blue-600 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {displayUrl}
      </a>
    );
    
    // Account for any trailing punctuation we removed
    const trailingPunct = match[0].slice(displayUrl.length);
    if (trailingPunct) {
      parts.push(trailingPunct);
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  
  return parts.length > 0 ? parts : text;
}

interface ResearcherInfo {
  did: string;
  handle: string;
  name: string | null;
  orcid: string;
  openAlexId: string | null;
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
  // Called when user wants to edit their own profile
  onEdit?: () => void;
}

export default function ProfileView({ did, avatar: avatarProp, displayName, handle, onClose, onOpenProfile, inline = false, onEdit }: ProfileViewProps) {
  const [researcher, setResearcher] = useState<ResearcherInfo | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [coAuthors, setCoAuthors] = useState<CoAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Bluesky profile data (avatar, bio, follower counts, etc.)
  const [bskyProfile, setBskyProfile] = useState<BlueskyProfile | null>(null);
  
  // Known followers (people you follow who also follow this account)
  const [knownFollowers, setKnownFollowers] = useState<KnownFollowersResult>({ followers: [] });

  // Follow state
  const [isFollowing, setIsFollowing] = useState(false);
  const [followUri, setFollowUri] = useState<string | undefined>();
  const [followLoading, setFollowLoading] = useState(false);
  const { refresh: refreshFollowing } = useFollowing();

  // Block state
  const [isBlocking, setIsBlocking] = useState(false);
  const [blockUri, setBlockUri] = useState<string | undefined>();
  const [blockLoading, setBlockLoading] = useState(false);

  // Posts state - read initial tab from URL
  const getTabFromUrl = (): 'profile' | 'posts' | 'replies' | 'papers' | 'interactions' => {
    if (typeof window === 'undefined') return 'posts';
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'posts' || tab === 'replies' || tab === 'papers' || tab === 'interactions' || tab === 'profile') return tab;
    return 'posts';
  };

  const [activeTab, setActiveTabInternal] = useState<'profile' | 'posts' | 'replies' | 'papers' | 'interactions'>('posts');

  // Initialize tab from URL on mount, or set default based on profile ownership
  useEffect(() => {
    if (inline) {
      const urlTab = getTabFromUrl();
      // If there's a tab in the URL, use it
      const params = new URLSearchParams(window.location.search);
      if (params.get('tab')) {
        setActiveTabInternal(urlTab);
      } else {
        // No tab in URL - use 'profile' for others, 'posts' for self
        const session = getSession();
        const isOwn = session?.did === did;
        setActiveTabInternal(isOwn ? 'posts' : 'profile');
      }
    }
  }, [inline, did]);

  // Update URL when tab changes
  const setActiveTab = (tab: 'profile' | 'posts' | 'replies' | 'papers' | 'interactions') => {
    setActiveTabInternal(tab);
    if (inline && typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (tab === 'posts') {
        url.searchParams.delete('tab');
      } else {
        url.searchParams.set('tab', tab);
      }
      window.history.replaceState({}, '', url.toString());
    }
  };
  const [posts, setPosts] = useState<AppBskyFeedDefs.FeedViewPost[]>([]);
  const [pinnedPost, setPinnedPost] = useState<AppBskyFeedDefs.PostView | null>(null);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsCursor, setPostsCursor] = useState<string | undefined>();
  const [postsError, setPostsError] = useState<string | null>(null);

  // Replies state
  const [replies, setReplies] = useState<AppBskyFeedDefs.FeedViewPost[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [repliesCursor, setRepliesCursor] = useState<string | undefined>();
  const [repliesLoaded, setRepliesLoaded] = useState(false);
  // Navigate to shareable post URL instead of opening modal
  const navigateToPost = useCallback(async (uri: string) => {
    // Parse the AT URI: at://did:plc:xxx/app.bsky.feed.post/rkey
    const match = uri.match(/^at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/);
    if (match) {
      const [, postDid, rkey] = match;
      try {
        const profile = await getBlueskyProfile(postDid);
        if (profile?.handle) {
          window.location.href = `/post/${profile.handle}/${rkey}`;
          return;
        }
      } catch {
        // Fall through to use DID
      }
      window.location.href = `/post/${postDid}/${rkey}`;
    }
  }, []);

  // Interactions state
  const [interactions, setInteractions] = useState<{
    theirRepliesToMe: AppBskyFeedDefs.PostView[];
    myRepliesToThem: AppBskyFeedDefs.PostView[];
    theirMentionsOfMe: AppBskyFeedDefs.PostView[];
    myMentionsOfThem: AppBskyFeedDefs.PostView[];
  }>({ theirRepliesToMe: [], myRepliesToThem: [], theirMentionsOfMe: [], myMentionsOfThem: [] });
  const [interactionsLoading, setInteractionsLoading] = useState(false);
  const [interactionsError, setInteractionsError] = useState<string | null>(null);
  const [interactionsLoaded, setInteractionsLoaded] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchProfile() {
      try {
        // Always fetch full Bluesky profile for bio, follower counts, etc.
        const bskyData = await getBlueskyProfile(did);
        if (bskyData) {
          setBskyProfile(bskyData);
          // Set following state from viewer info
          if (bskyData.viewer?.following) {
            setIsFollowing(true);
            setFollowUri(bskyData.viewer.following);
          } else {
            setIsFollowing(false);
            setFollowUri(undefined);
          }
          // Set blocking state from viewer info
          if (bskyData.viewer?.blocking) {
            setIsBlocking(true);
            setBlockUri(bskyData.viewer.blocking);
          } else {
            setIsBlocking(false);
            setBlockUri(undefined);
          }
        }
        
        // Fetch known followers (people you follow who follow this account)
        const known = await getKnownFollowers(did, 50);
        setKnownFollowers(known);
        
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
  
  // Switch to posts tab when viewing non-verified user
  useEffect(() => {
    if (error === 'not_verified' && activeTab === 'profile') {
      setActiveTab('posts');
    }
  }, [error, activeTab]);

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
          const MIN_PAGES = 15; // Load up to 15 pages (~450 posts) to find papers
          
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

  // Fetch replies when switching to replies tab
  useEffect(() => {
    async function fetchReplies() {
      if (activeTab !== 'replies' || repliesLoaded) return;

      setRepliesLoading(true);
      try {
        // Fetch with posts_and_author_threads to get replies
        const result = await getAuthorFeed(did, undefined, 'posts_and_author_threads');
        // Filter to only replies (posts that have a reply property)
        const replyPosts = result.feed.filter(item => {
          const post = item.post as AppBskyFeedDefs.PostView & { record?: { reply?: unknown } };
          return post.record?.reply;
        });
        setReplies(replyPosts);
        setRepliesCursor(result.cursor);
        setRepliesLoaded(true);
      } catch (err) {
        console.error('Failed to fetch replies:', err);
      } finally {
        setRepliesLoading(false);
      }
    }

    fetchReplies();
  }, [activeTab, did, repliesLoaded]);

  const loadMoreReplies = async () => {
    if (!repliesCursor || repliesLoading) return;

    setRepliesLoading(true);
    try {
      const result = await getAuthorFeed(did, repliesCursor, 'posts_and_author_threads');
      const replyPosts = result.feed.filter(item => {
        const post = item.post as AppBskyFeedDefs.PostView & { record?: { reply?: unknown } };
        return post.record?.reply;
      });
      setReplies(prev => [...prev, ...replyPosts]);
      setRepliesCursor(result.cursor);
    } catch (err) {
      console.error('Failed to load more replies:', err);
    } finally {
      setRepliesLoading(false);
    }
  };

  // Fetch interactions when switching to interactions tab
  useEffect(() => {
    async function fetchInteractions() {
      if (activeTab !== 'interactions' || interactionsLoaded) return;
      
      const session = getSession();
      if (!session?.handle || !bskyProfile?.handle) {
        setInteractionsError('Unable to load interactions');
        return;
      }
      
      // Don't show interactions for your own profile
      if (session.did === did) {
        setInteractionsError('This is your own profile');
        return;
      }
      
      setInteractionsLoading(true);
      setInteractionsError(null);
      
      const myHandle = session.handle;
      const theirHandle = bskyProfile.handle;
      
      try {
        // Fetch all interaction types in parallel
        const [theirRepliesToMeResult, myRepliesToThemResult, theirMentionsResult, myMentionsResult] = await Promise.all([
          // Their replies to me: posts from them that are replies, then filter to my posts
          searchPosts(`from:${theirHandle}`, undefined, 'latest'),
          // My replies to them: posts from me that are replies, then filter to their posts
          searchPosts(`from:${myHandle}`, undefined, 'latest'),
          // Their mentions of me
          searchPosts(`from:${theirHandle} mentions:${myHandle}`, undefined, 'latest'),
          // My mentions of them
          searchPosts(`from:${myHandle} mentions:${theirHandle}`, undefined, 'latest'),
        ]);
        
        // Filter replies - their replies to my posts
        const theirRepliesToMe = theirRepliesToMeResult.posts.filter(post => {
          const record = post.record as AppBskyFeedPost.Record;
          if (!record.reply) return false;
          // Check if reply parent is from me
          const parentUri = record.reply.parent?.uri || '';
          return parentUri.includes(session.did);
        });
        
        // Filter replies - my replies to their posts  
        const myRepliesToThem = myRepliesToThemResult.posts.filter(post => {
          const record = post.record as AppBskyFeedPost.Record;
          if (!record.reply) return false;
          // Check if reply parent is from them
          const parentUri = record.reply.parent?.uri || '';
          return parentUri.includes(did);
        });
        
        setInteractions({
          theirRepliesToMe,
          myRepliesToThem,
          theirMentionsOfMe: theirMentionsResult.posts,
          myMentionsOfThem: myMentionsResult.posts,
        });
        setInteractionsLoaded(true);
      } catch (err) {
        console.error('Failed to fetch interactions:', err);
        setInteractionsError('Failed to load interactions');
      } finally {
        setInteractionsLoading(false);
      }
    }
    
    fetchInteractions();
  }, [activeTab, interactionsLoaded, did, bskyProfile?.handle]);

  // Follow/unfollow handlers
  const handleFollow = async () => {
    if (followLoading) return;
    setFollowLoading(true);
    try {
      const result = await followUser(did);
      setIsFollowing(true);
      setFollowUri(result.uri);
      // Refresh the global following list so Discover updates
      refreshFollowing();
    } catch (err) {
      console.error('Failed to follow user:', err);
    } finally {
      setFollowLoading(false);
    }
  };

  const handleUnfollow = async () => {
    if (followLoading || !followUri) return;
    setFollowLoading(true);
    try {
      await unfollowUser(followUri);
      setIsFollowing(false);
      setFollowUri(undefined);
      // Refresh the global following list so Discover updates
      refreshFollowing();
    } catch (err) {
      console.error('Failed to unfollow user:', err);
    } finally {
      setFollowLoading(false);
    }
  };

  // Block/unblock handlers
  const handleBlock = async () => {
    if (blockLoading) return;
    setBlockLoading(true);
    try {
      const result = await blockUser(did);
      setIsBlocking(true);
      setBlockUri(result.uri);
    } catch (err) {
      console.error('Failed to block user:', err);
    } finally {
      setBlockLoading(false);
    }
  };

  const handleUnblock = async () => {
    if (blockLoading || !blockUri) return;
    setBlockLoading(true);
    try {
      await unblockUser(blockUri);
      setIsBlocking(false);
      setBlockUri(undefined);
    } catch (err) {
      console.error('Failed to unblock user:', err);
    } finally {
      setBlockLoading(false);
    }
  };

  // Filter posts to those containing paper links AND authored by this profile owner
  const paperPosts = useMemo(() => {
    return posts.filter(item => {
      // Only include posts actually authored by this user (not reposts of others)
      if (item.post.author.did !== did) return false;
      
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
  }, [posts, did]);

  // Use prop values first, then fetched Bluesky profile, then researcher data
  const avatar = avatarProp || bskyProfile?.avatar;
  const finalDisplayName = researcher?.name || displayName || bskyProfile?.displayName || handle || bskyProfile?.handle || 'Unknown';
  const finalHandle = researcher?.handle || handle || bskyProfile?.handle;
  
  // Check if this is the current user's own profile
  const session = getSession();
  const isOwnProfile = session?.did === did;

  // Render follow/unfollow button (smaller style to match "Follows you" badge)
  const renderFollowButton = () => {
    return (
      <button
        onClick={isFollowing ? handleUnfollow : handleFollow}
        disabled={followLoading}
        className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
          isFollowing
            ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400'
            : 'bg-blue-500 text-white hover:bg-blue-600'
        } disabled:opacity-50`}
      >
        {followLoading ? (
          <span className="flex items-center gap-1">
            <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </span>
        ) : isFollowing ? (
          'Following'
        ) : (
          'Follow'
        )}
      </button>
    );
  };

  // Render DM button - opens DM sidebar and starts chat with this user
  const renderDMButton = () => {
    if (isOwnProfile) return null;

    const handleDMClick = () => {
      // Dispatch custom event to open DM sidebar with this user
      window.dispatchEvent(new CustomEvent('openDMWithUser', { detail: { did } }));
    };

    return (
      <button
        onClick={handleDMClick}
        className="px-2 py-0.5 rounded text-xs font-medium transition-colors bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center gap-1"
        title="Send direct message"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        DM
      </button>
    );
  };

  // Render block/unblock button
  const renderBlockButton = () => {
    if (isOwnProfile) return null;

    return (
      <button
        onClick={isBlocking ? handleUnblock : handleBlock}
        disabled={blockLoading}
        className={`px-2 py-0.5 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
          isBlocking
            ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50'
            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400'
        } disabled:opacity-50`}
        title={isBlocking ? 'Unblock this user' : 'Block this user'}
      >
        {blockLoading ? (
          <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        )}
        {isBlocking ? 'Blocked' : 'Block'}
      </button>
    );
  };

  // Shared content rendering
  const renderTabs = (includeProfile = true) => (
    <div className="flex border-b border-gray-200 dark:border-gray-800">
      {/* Profile - first for others, last for self */}
      {includeProfile && !isOwnProfile && (
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
      )}
      {/* Posts */}
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
      {/* Replies */}
      <button
        onClick={() => setActiveTab('replies')}
        className={`flex-1 py-3 text-sm font-medium transition-colors ${
          activeTab === 'replies'
            ? 'text-blue-500 border-b-2 border-blue-500'
            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
        }`}
      >
        Replies
      </button>
      {/* Papers */}
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
      {/* Only show Interactions tab for other users, not own profile */}
      {!isOwnProfile && (
        <button
          onClick={() => setActiveTab('interactions')}
          className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-1 ${
            activeTab === 'interactions'
              ? 'text-green-500 border-b-2 border-green-500'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          Us
        </button>
      )}
      {/* Profile - last for self only */}
      {includeProfile && isOwnProfile && (
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
      )}
    </div>
  );
  
  // Render interactions tab content
  const renderInteractionsTab = () => {
    const totalInteractions = 
      interactions.theirRepliesToMe.length + 
      interactions.myRepliesToThem.length + 
      interactions.theirMentionsOfMe.length + 
      interactions.myMentionsOfThem.length;
    
    const toggleSection = (section: string) => {
      setCollapsedSections(prev => {
        const newSet = new Set(prev);
        if (newSet.has(section)) {
          newSet.delete(section);
        } else {
          newSet.add(section);
        }
        return newSet;
      });
    };
    
    const isCollapsed = (section: string) => collapsedSections.has(section);
    
    // Section configs with colors
    const sections = [
      {
        key: 'theirRepliesToMe',
        title: 'Their replies to you',
        posts: interactions.theirRepliesToMe,
        colors: {
          bg: 'bg-blue-50 dark:bg-blue-900/20',
          border: 'border-l-blue-400',
          text: 'text-blue-700 dark:text-blue-300',
          icon: 'text-blue-500',
          hover: 'hover:bg-blue-100 dark:hover:bg-blue-900/30',
        },
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        ),
      },
      {
        key: 'myRepliesToThem',
        title: 'Your replies to them',
        posts: interactions.myRepliesToThem,
        colors: {
          bg: 'bg-emerald-50 dark:bg-emerald-900/20',
          border: 'border-l-emerald-400',
          text: 'text-emerald-700 dark:text-emerald-300',
          icon: 'text-emerald-500',
          hover: 'hover:bg-emerald-100 dark:hover:bg-emerald-900/30',
        },
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        ),
      },
      {
        key: 'theirMentionsOfMe',
        title: 'They mentioned you',
        posts: interactions.theirMentionsOfMe,
        colors: {
          bg: 'bg-amber-50 dark:bg-amber-900/20',
          border: 'border-l-amber-400',
          text: 'text-amber-700 dark:text-amber-300',
          icon: 'text-amber-500',
          hover: 'hover:bg-amber-100 dark:hover:bg-amber-900/30',
        },
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
          </svg>
        ),
      },
      {
        key: 'myMentionsOfThem',
        title: 'You mentioned them',
        posts: interactions.myMentionsOfThem,
        colors: {
          bg: 'bg-purple-50 dark:bg-purple-900/20',
          border: 'border-l-purple-400',
          text: 'text-purple-700 dark:text-purple-300',
          icon: 'text-purple-500',
          hover: 'hover:bg-purple-100 dark:hover:bg-purple-900/30',
        },
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
        ),
      },
    ];
    
    return (
      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        {interactionsLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full" />
            <p className="text-sm text-gray-500">Loading interactions...</p>
          </div>
        ) : interactionsError ? (
          <div className="text-center py-12 px-4">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-gray-500">{interactionsError}</p>
          </div>
        ) : totalInteractions === 0 ? (
          <div className="text-center py-12 px-4">
            <div className="w-16 h-16 mx-auto mb-4 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-gray-500 mb-2">No interactions yet</p>
            <p className="text-sm text-gray-400">Replies and mentions between you will appear here</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="px-4 py-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20">
              <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                {totalInteractions} interaction{totalInteractions !== 1 ? 's' : ''} found
              </p>
            </div>
            
            {/* Render each section */}
            {sections.map((section) => {
              if (section.posts.length === 0) return null;
              const collapsed = isCollapsed(section.key);
              
              return (
                <div key={section.key} className={`border-l-4 ${section.colors.border}`}>
                  {/* Collapsible header */}
                  <button
                    onClick={() => toggleSection(section.key)}
                    className={`w-full px-4 py-3 flex items-center justify-between ${section.colors.bg} ${section.colors.hover} transition-colors`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={section.colors.icon}>{section.icon}</span>
                      <h4 className={`text-sm font-medium ${section.colors.text}`}>
                        {section.title}
                      </h4>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${section.colors.bg} ${section.colors.text} font-medium`}>
                        {section.posts.length}
                      </span>
                    </div>
                    <svg 
                      className={`w-4 h-4 ${section.colors.icon} transition-transform ${collapsed ? '' : 'rotate-180'}`} 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  
                  {/* Posts (collapsible) */}
                  {!collapsed && (
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {section.posts.map((post) => (
                        <div key={post.uri}>
                          <Post post={post} onOpenThread={navigateToPost} onOpenProfile={onOpenProfile} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    );
  };

  // Inline mode - renders in main content area
  if (inline) {
    return (
    <>
      <div className="bg-white dark:bg-gray-950 min-h-screen">
        {/* Header with back button */}
        <div className="sticky top-14 z-10 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 p-4 flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
            title="Back to feed"
          >
            <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Profile</h2>
        </div>

        {/* Content */}
        <div>
          {loading ? (
            <div className="flex items-center justify-center py-12 px-4">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : isBlocking || bskyProfile?.viewer?.blockedBy ? (
            /* Blocked profile view - minimal display */
            <div className="mx-4 mt-4 mb-4 bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-6">
              <div className="flex flex-col items-center text-center">
                {/* Block icon */}
                <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                </div>
                {/* Name and handle */}
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {finalDisplayName}
                </h3>
                {finalHandle && (
                  <p className="text-sm text-gray-500 mt-1">@{finalHandle}</p>
                )}
                {/* Blocked message */}
                <p className="text-gray-500 mt-4 mb-4">
                  {isBlocking ? 'You have blocked this account' : 'You have been blocked by this account'}
                </p>
                {/* Unblock button - only show if you blocked them */}
                {isBlocking && (
                  <button
                    onClick={handleUnblock}
                    disabled={blockLoading}
                    className="px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full font-medium hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {blockLoading ? (
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    )}
                    Unblock
                  </button>
                )}
              </div>
            </div>
          ) : error === 'not_verified' ? (
            <>
              {/* Non-verified profile header (inline mode) */}
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
                    <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">
                      {finalDisplayName}
                    </h3>
                    {finalHandle && (
                      <p className="text-sm text-gray-500">@{finalHandle}</p>
                    )}
                    {/* Follower/Following counts + Follow button row */}
                    {bskyProfile && (
                      <div className="flex items-center gap-4 mt-2 text-sm">
                        <span className="text-gray-600 dark:text-gray-400">
                          <span className="font-semibold text-gray-900 dark:text-gray-100">{bskyProfile.followersCount?.toLocaleString() || 0}</span> followers
                        </span>
                        <span className="text-gray-600 dark:text-gray-400">
                          <span className="font-semibold text-gray-900 dark:text-gray-100">{bskyProfile.followsCount?.toLocaleString() || 0}</span> following
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      {renderFollowButton()}
                      {renderDMButton()}
                      {renderBlockButton()}
                      {bskyProfile?.viewer?.followedBy && (
                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs rounded">
                          Follows you
                        </span>
                      )}
                    </div>
                    {bskyProfile?.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">{linkifyText(bskyProfile.description)}</p>
                    )}
                    {/* Labels from moderation services */}
                    <ProfileLabels profile={bskyProfile} />
                  </div>
                </div>
              </div>

              {/* Posts/Papers tabs for non-verified users */}
              {renderTabs(false)}

              {/* Posts Tab */}
              {activeTab === 'posts' && (
                <div>
                  {postsLoading && posts.length === 0 ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
                    </div>
                  ) : postsError ? (
                    <div className="text-center py-8 text-red-500">{postsError}</div>
                  ) : posts.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No posts yet</div>
                  ) : (
                    <>
                      {posts.map((item) => (
                        <div key={item.post.uri} className="border-b border-gray-200 dark:border-gray-800 last:border-b-0">
                          <Post post={item.post} reason={item.reason} onOpenThread={navigateToPost} />
                        </div>
                      ))}
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
                </div>
              )}

              {/* Replies Tab */}
              {activeTab === 'replies' && (
                <div>
                  {repliesLoading && replies.length === 0 ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
                    </div>
                  ) : replies.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No replies yet</div>
                  ) : (
                    <>
                      {replies.map((item) => (
                        <div key={item.post.uri} className="border-b border-gray-200 dark:border-gray-800 last:border-b-0">
                          <Post post={item.post} reason={item.reason} onOpenThread={navigateToPost} />
                        </div>
                      ))}
                      {repliesCursor && (
                        <div className="p-4 text-center">
                          <button
                            onClick={loadMoreReplies}
                            disabled={repliesLoading}
                            className="px-4 py-2 text-sm text-blue-500 hover:text-blue-600 disabled:opacity-50"
                          >
                            {repliesLoading ? 'Loading...' : 'Load more'}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Papers Tab */}
              {activeTab === 'papers' && (
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
                        <div key={item.post.uri} className="border-b border-gray-200 dark:border-gray-800 last:border-b-0">
                          <Post post={item.post} reason={item.reason} onOpenThread={navigateToPost} />
                        </div>
                      ))}
                      {postsCursor && (
                        <div className="p-4 text-center">
                          <button onClick={loadMorePosts} disabled={postsLoading} className="px-4 py-2 text-sm text-purple-500 hover:text-purple-600 disabled:opacity-50">
                            {postsLoading ? 'Scanning...' : 'Load more'}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Interactions Tab */}
              {activeTab === 'interactions' && renderInteractionsTab()}
            </>
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
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.location.href = `/affiliation/${encodeURIComponent(profile?.affiliation || researcher?.institution || '')}`;
                        }}
                        className="text-sm text-purple-600 dark:text-purple-400 mt-1 font-medium hover:underline block text-left"
                      >
                        {profile?.affiliation || researcher?.institution}
                      </button>
                    )}
                    
                    {/* Follower/Following counts */}
                    {bskyProfile && (
                      <div className="flex items-center gap-4 mt-2 text-sm">
                        <span className="text-gray-600 dark:text-gray-400">
                          <span className="font-semibold text-gray-900 dark:text-gray-100">{bskyProfile.followersCount?.toLocaleString() || 0}</span> followers
                        </span>
                        <span className="text-gray-600 dark:text-gray-400">
                          <span className="font-semibold text-gray-900 dark:text-gray-100">{bskyProfile.followsCount?.toLocaleString() || 0}</span> following
                        </span>
                      </div>
                    )}
                    {/* Follow button + DM button + Follows you badge */}
                    <div className="flex items-center gap-2 mt-2">
                      {isOwnProfile && onEdit ? (
                        <button
                          onClick={onEdit}
                          className="px-3 py-0.5 rounded-full text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                        >
                          Edit Profile
                        </button>
                      ) : (
                        <>
                          {renderFollowButton()}
                          {renderDMButton()}
                          {renderBlockButton()}
                        </>
                      )}
                      {bskyProfile?.viewer?.followedBy && (
                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs rounded">
                          Follows you
                        </span>
                      )}
                    </div>
                    {/* Labels from moderation services */}
                    <ProfileLabels profile={bskyProfile} />
                    {/* Researcher IDs */}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {researcher?.orcid && (
                        <a
                          href={`https://orcid.org/${researcher.orcid}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 px-2 py-1 bg-emerald-50 dark:bg-emerald-900/30 rounded-full"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 256 256" fill="currentColor">
                            <path d="M128 0C57.3 0 0 57.3 0 128s57.3 128 128 128 128-57.3 128-128S198.7 0 128 0zM70.7 193.5H50.9V79.9h19.8v113.6zm-9.9-128.1c-6.7 0-12.1-5.4-12.1-12.1s5.4-12.1 12.1-12.1 12.1 5.4 12.1 12.1-5.4 12.1-12.1 12.1zm134.7 128.1h-19.8v-55.4c0-13.9-.3-31.8-19.4-31.8-19.4 0-22.4 15.2-22.4 30.8v56.4H114V79.9h19v15.5h.3c2.6-5 9.2-10.2 18.9-10.2 20.2 0 23.9 13.3 23.9 30.6v77.7z" />
                          </svg>
                          ORCID
                        </a>
                      )}
                      {researcher?.openAlexId && (
                        <a
                          href={`https://openalex.org/authors/${researcher.openAlexId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-orange-600 hover:text-orange-700 px-2 py-1 bg-orange-50 dark:bg-orange-900/30 rounded-full"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                          </svg>
                          OpenAlex
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Profile/Posts/Papers Tabs */}
              {renderTabs()}

              {/* Profile Tab Content */}
              {activeTab === 'profile' && (
                <div className="px-4 pb-4 space-y-4">
                  {/* Bio Card - show Lea profile bio, or fallback to Bluesky bio */}
                  {(profile?.shortBio || bskyProfile?.description) && (
                    <div className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm">
                      <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                        {linkifyText(profile?.shortBio || bskyProfile?.description || '')}
                      </p>
                    </div>
                  )}
                  
                  {/* Known Followers - people you follow who follow this account */}
                  {knownFollowers.followers.length > 0 && (
                    <div className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm">
                      <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" /></svg>
                        Followed by people you know
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {knownFollowers.followers.slice(0, 8).map((follower) => (
                          <button
                            key={follower.did}
                            onClick={() => onOpenProfile?.(follower.did)}
                            className="flex items-center gap-2 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                          >
                            {follower.avatar ? (
                              <img src={follower.avatar} alt="" className="w-5 h-5 rounded-full" />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-gray-300 dark:bg-gray-600" />
                            )}
                            <span className="text-xs text-blue-600 dark:text-blue-400 font-medium truncate max-w-[100px]">
                              {follower.displayName || follower.handle}
                            </span>
                          </button>
                        ))}
                        {knownFollowers.followers.length > 8 && (
                          <span className="text-xs text-gray-500 px-2 py-1">+more</span>
                        )}
                      </div>
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
                            <button 
                              key={i} 
                              onClick={(e) => {
                                e.stopPropagation();
                                window.location.href = `/topic/${encodeURIComponent(topic)}`;
                              }}
                              className="px-3 py-1.5 bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/40 dark:to-pink-900/40 text-purple-700 dark:text-purple-300 rounded-full text-sm font-medium hover:from-purple-200 hover:to-pink-200 dark:hover:from-purple-800/50 dark:hover:to-pink-800/50 transition-colors"
                            >
                              {topic}
                            </button>
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
                          <button 
                            key={i} 
                            onClick={(e) => {
                              e.stopPropagation();
                              window.location.href = `/venue/${encodeURIComponent(venue)}`;
                            }}
                            className="px-3 py-1.5 bg-gradient-to-r from-orange-100 to-amber-100 dark:from-orange-900/40 dark:to-amber-900/40 text-orange-700 dark:text-orange-300 rounded-full text-sm font-medium hover:from-orange-200 hover:to-amber-200 dark:hover:from-orange-800/50 dark:hover:to-amber-800/50 transition-colors"
                          >
                            {venue}
                          </button>
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
                      <Post post={pinnedPost} onOpenThread={navigateToPost} />
                    </div>
                  )}
                  {posts.length === 0 && !pinnedPost ? (
                    <div className="text-center py-8 text-gray-500">No posts yet</div>
                  ) : (
                    <>
                      {posts.filter(item => item.post.uri !== pinnedPost?.uri).map((item) => (
                        <div key={item.post.uri} className="border-b border-gray-200 dark:border-gray-800 last:border-b-0"><Post post={item.post} reason={item.reason} onOpenThread={navigateToPost} /></div>
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

          {/* Replies Tab */}
          {activeTab === 'replies' && !loading && !error && (
            <div>
              {repliesLoading && replies.length === 0 ? (
                <div className="flex items-center justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>
              ) : replies.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No replies yet</div>
              ) : (
                <>
                  {replies.map((item) => (
                    <div key={item.post.uri} className="border-b border-gray-200 dark:border-gray-800 last:border-b-0"><Post post={item.post} reason={item.reason} onOpenThread={navigateToPost} /></div>
                  ))}
                  {repliesCursor && (
                    <div className="p-4 text-center">
                      <button onClick={loadMoreReplies} disabled={repliesLoading} className="px-4 py-2 text-sm text-blue-500 hover:text-blue-600 disabled:opacity-50">{repliesLoading ? 'Loading...' : 'Load more'}</button>
                    </div>
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
                    <div key={item.post.uri} className="border-b border-gray-200 dark:border-gray-800 last:border-b-0"><Post post={item.post} reason={item.reason} onOpenThread={navigateToPost} /></div>
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
          
          {/* Interactions Tab */}
          {activeTab === 'interactions' && !loading && !error && renderInteractionsTab()}
        </div>
      </div>

    </>
    );
  }

  // Modal mode (default)
  return (
  <>
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

        {/* Tabs - only show when profile is loaded, user is verified, and not blocked */}
        {!loading && !error && !isBlocking && renderTabs()}

        <div>
          {loading ? (
            <div className="flex items-center justify-center py-12 px-4">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : isBlocking || bskyProfile?.viewer?.blockedBy ? (
            /* Blocked profile view - minimal display */
            <div className="p-6">
              <div className="flex flex-col items-center text-center">
                {/* Block icon */}
                <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                </div>
                {/* Name and handle */}
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {finalDisplayName}
                </h3>
                {finalHandle && (
                  <p className="text-sm text-gray-500 mt-1">@{finalHandle}</p>
                )}
                {/* Blocked message */}
                <p className="text-gray-500 mt-4 mb-4">
                  {isBlocking ? 'You have blocked this account' : 'You have been blocked by this account'}
                </p>
                {/* Unblock button - only show if you blocked them */}
                {isBlocking && (
                  <button
                    onClick={handleUnblock}
                    disabled={blockLoading}
                    className="px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full font-medium hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {blockLoading ? (
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    )}
                    Unblock
                  </button>
                )}
              </div>
            </div>
          ) : error === 'not_verified' ? (
            <>
              {/* Non-verified profile header */}
              <div className="flex items-start gap-4 mb-4 p-4 pb-0">
                {avatar ? (
                  <img src={avatar} alt="" className="w-20 h-20 rounded-full flex-shrink-0" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">
                    {finalDisplayName}
                  </h3>
                  {finalHandle && (
                    <p className="text-sm text-gray-500">@{finalHandle}</p>
                  )}
                  {/* Follower/Following counts */}
                  {bskyProfile && (
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      <span className="text-gray-600 dark:text-gray-400">
                        <span className="font-semibold text-gray-900 dark:text-gray-100">{bskyProfile.followersCount?.toLocaleString() || 0}</span> followers
                      </span>
                      <span className="text-gray-600 dark:text-gray-400">
                        <span className="font-semibold text-gray-900 dark:text-gray-100">{bskyProfile.followsCount?.toLocaleString() || 0}</span> following
                      </span>
                    </div>
                  )}
                  {bskyProfile?.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">{linkifyText(bskyProfile.description)}</p>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    {renderFollowButton()}
                    {renderDMButton()}
                    {renderBlockButton()}
                  </div>
                </div>
              </div>

              {/* Posts/Papers tabs for non-verified users */}
              {renderTabs(false)}

              {/* Posts Tab */}
              {activeTab === 'posts' && (
                <div className="-mx-4">
                  {postsLoading && posts.length === 0 ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
                    </div>
                  ) : postsError ? (
                    <div className="text-center py-8 text-red-500">{postsError}</div>
                  ) : posts.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No posts yet</div>
                  ) : (
                    <>
                      {posts.map((item) => (
                        <div key={item.post.uri} className="border-b border-gray-200 dark:border-gray-800 last:border-b-0">
                          <Post post={item.post} reason={item.reason} onOpenThread={navigateToPost} />
                        </div>
                      ))}
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
                </div>
              )}

              {/* Replies Tab */}
              {activeTab === 'replies' && (
                <div className="-mx-4">
                  {repliesLoading && replies.length === 0 ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
                    </div>
                  ) : replies.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No replies yet</div>
                  ) : (
                    <>
                      {replies.map((item) => (
                        <div key={item.post.uri} className="border-b border-gray-200 dark:border-gray-800 last:border-b-0">
                          <Post post={item.post} reason={item.reason} onOpenThread={navigateToPost} />
                        </div>
                      ))}
                      {repliesCursor && (
                        <div className="p-4 text-center">
                          <button
                            onClick={loadMoreReplies}
                            disabled={repliesLoading}
                            className="px-4 py-2 text-sm text-blue-500 hover:text-blue-600 disabled:opacity-50"
                          >
                            {repliesLoading ? 'Loading...' : 'Load more'}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Papers Tab */}
              {activeTab === 'papers' && (
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
                        <div key={item.post.uri} className="border-b border-gray-200 dark:border-gray-800 last:border-b-0">
                          <Post post={item.post} reason={item.reason} onOpenThread={navigateToPost} />
                        </div>
                      ))}
                      {postsCursor && (
                        <div className="p-4 text-center">
                          <button onClick={loadMorePosts} disabled={postsLoading} className="px-4 py-2 text-sm text-purple-500 hover:text-purple-600 disabled:opacity-50">
                            {postsLoading ? 'Scanning...' : 'Load more'}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Interactions Tab */}
              {activeTab === 'interactions' && renderInteractionsTab()}
            </>
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
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.location.href = `/affiliation/${encodeURIComponent(profile?.affiliation || researcher?.institution || '')}`;
                      }}
                      className="text-sm text-purple-600 dark:text-purple-400 mt-1 font-medium hover:underline block text-left"
                    >
                      {profile?.affiliation || researcher?.institution}
                    </button>
                  )}
                  {/* Researcher IDs */}
                  <div className="flex flex-wrap gap-2 mt-1">
                    {researcher?.orcid && (
                      <a
                        href={`https://orcid.org/${researcher.orcid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-700"
                      >
                        <svg className="w-3 h-3" viewBox="0 0 256 256" fill="currentColor">
                          <path d="M128 0C57.3 0 0 57.3 0 128s57.3 128 128 128 128-57.3 128-128S198.7 0 128 0zM70.7 193.5H50.9V79.9h19.8v113.6zm-9.9-128.1c-6.7 0-12.1-5.4-12.1-12.1s5.4-12.1 12.1-12.1 12.1 5.4 12.1 12.1-5.4 12.1-12.1 12.1zm134.7 128.1h-19.8v-55.4c0-13.9-.3-31.8-19.4-31.8-19.4 0-22.4 15.2-22.4 30.8v56.4H114V79.9h19v15.5h.3c2.6-5 9.2-10.2 18.9-10.2 20.2 0 23.9 13.3 23.9 30.6v77.7z" />
                        </svg>
                        ORCID
                      </a>
                    )}
                    {researcher?.openAlexId && (
                      <a
                        href={`https://openalex.org/authors/${researcher.openAlexId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700"
                      >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                        </svg>
                        OpenAlex
                      </a>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    {isOwnProfile && onEdit ? (
                      <button
                        onClick={onEdit}
                        className="px-4 py-1.5 rounded-full text-sm font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                      >
                        Edit Profile
                      </button>
                    ) : (
                      <>
                        {renderFollowButton()}
                        {renderDMButton()}
                        {renderBlockButton()}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Profile Tab Content */}
              {activeTab === 'profile' && (
                <div className="px-4 pb-4">
                  {/* Bio */}
                  {profile?.shortBio && (
                    <div className="mb-6">
                      <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{linkifyText(profile.shortBio)}</p>
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
                            <button
                              key={i}
                              onClick={(e) => {
                                e.stopPropagation();
                                window.location.href = `/topic/${encodeURIComponent(topic)}`;
                              }}
                              className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-sm hover:bg-purple-200 dark:hover:bg-purple-800/40 transition-colors"
                            >
                              {topic}
                            </button>
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
                          <button
                            key={i}
                            onClick={(e) => {
                              e.stopPropagation();
                              window.location.href = `/venue/${encodeURIComponent(venue)}`;
                            }}
                            className="px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                          >
                            {venue}
                          </button>
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
                      <Post post={pinnedPost} onOpenThread={navigateToPost} />
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
                            <Post post={item.post} reason={item.reason} onOpenThread={navigateToPost} />
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

          {/* Replies Tab */}
          {activeTab === 'replies' && !loading && !error && (
            <div className="-mx-4">
              {repliesLoading && replies.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
                </div>
              ) : replies.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No replies yet</div>
              ) : (
                <>
                  {replies.map((item) => (
                    <div key={item.post.uri} className="border-b border-gray-200 dark:border-gray-800 last:border-b-0">
                      <Post post={item.post} reason={item.reason} onOpenThread={navigateToPost} />
                    </div>
                  ))}
                  {repliesCursor && (
                    <div className="p-4 text-center">
                      <button
                        onClick={loadMoreReplies}
                        disabled={repliesLoading}
                        className="px-4 py-2 text-sm text-blue-500 hover:text-blue-600 disabled:opacity-50"
                      >
                        {repliesLoading ? 'Loading...' : 'Load more'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Interactions Tab */}
          {activeTab === 'interactions' && !loading && !error && renderInteractionsTab()}
        </div>
      </div>
    </div>

  </>
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
  const paperId = paper.url ? getPaperIdFromUrl(paper.url) : null;
  
  return (
    <div className={`p-3 rounded-lg transition-colors group ${c.bg}`}>
      <div className="flex items-start justify-between gap-2">
        <a
          href={paper.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`font-medium text-gray-900 dark:text-gray-100 text-sm hover:underline ${c.hover}`}
        >
          {paper.title}
        </a>
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
        {paperId && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              window.location.href = `/paper/${encodeURIComponent(paperId)}?url=${encodeURIComponent(paper.url)}`;
            }}
            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full hover:bg-purple-200 dark:hover:bg-purple-800/40 transition-colors"
          >
            Discussion
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
