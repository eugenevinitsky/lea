'use client';

import { useState, useEffect, useCallback } from 'react';
import { AppBskyFeedDefs, AppBskyActorDefs } from '@atproto/api';
import { getLikes, getRepostedBy, getQuotes, Label } from '@/lib/bluesky';
import UserListItem from './UserListItem';
import Post from './Post';

type TabType = 'likes' | 'reposts' | 'quotes';

interface EngagementTabsProps {
  uri: string;
  likeCount: number;
  repostCount: number;
  quoteCount: number;
  onOpenThread?: (uri: string) => void;
  onOpenProfile?: (did: string) => void;
}

interface LikeData {
  actor: AppBskyActorDefs.ProfileView;
  createdAt: string;
}

export default function EngagementTabs({
  uri,
  likeCount,
  repostCount,
  quoteCount,
  onOpenThread,
  onOpenProfile,
}: EngagementTabsProps) {
  const [activeTab, setActiveTab] = useState<TabType | null>(null);
  
  // Likes state
  const [likes, setLikes] = useState<LikeData[]>([]);
  const [likesLoading, setLikesLoading] = useState(false);
  const [likesCursor, setLikesCursor] = useState<string | undefined>();
  const [likesLoaded, setLikesLoaded] = useState(false);
  
  // Reposts state
  const [reposts, setReposts] = useState<AppBskyActorDefs.ProfileView[]>([]);
  const [repostsLoading, setRepostsLoading] = useState(false);
  const [repostsCursor, setRepostsCursor] = useState<string | undefined>();
  const [repostsLoaded, setRepostsLoaded] = useState(false);
  
  // Quotes state
  const [quotes, setQuotes] = useState<AppBskyFeedDefs.PostView[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [quotesCursor, setQuotesCursor] = useState<string | undefined>();
  const [quotesLoaded, setQuotesLoaded] = useState(false);

  const loadLikes = useCallback(async () => {
    setLikesLoading(true);
    try {
      const response = await getLikes(uri);
      setLikes(response.data.likes as LikeData[]);
      setLikesCursor(response.data.cursor);
      setLikesLoaded(true);
    } catch (err) {
      console.error('Failed to load likes:', err);
    } finally {
      setLikesLoading(false);
    }
  }, [uri]);

  const loadMoreLikes = async () => {
    if (!likesCursor || likesLoading) return;
    setLikesLoading(true);
    try {
      const response = await getLikes(uri, likesCursor);
      setLikes(prev => [...prev, ...(response.data.likes as LikeData[])]);
      setLikesCursor(response.data.cursor);
    } catch (err) {
      console.error('Failed to load more likes:', err);
    } finally {
      setLikesLoading(false);
    }
  };

  const loadReposts = useCallback(async () => {
    setRepostsLoading(true);
    try {
      const response = await getRepostedBy(uri);
      setReposts(response.data.repostedBy);
      setRepostsCursor(response.data.cursor);
      setRepostsLoaded(true);
    } catch (err) {
      console.error('Failed to load reposts:', err);
    } finally {
      setRepostsLoading(false);
    }
  }, [uri]);

  const loadMoreReposts = async () => {
    if (!repostsCursor || repostsLoading) return;
    setRepostsLoading(true);
    try {
      const response = await getRepostedBy(uri, repostsCursor);
      setReposts(prev => [...prev, ...response.data.repostedBy]);
      setRepostsCursor(response.data.cursor);
    } catch (err) {
      console.error('Failed to load more reposts:', err);
    } finally {
      setRepostsLoading(false);
    }
  };

  const loadQuotes = useCallback(async () => {
    setQuotesLoading(true);
    try {
      const response = await getQuotes(uri);
      setQuotes(response.data.posts);
      setQuotesCursor(response.data.cursor);
      setQuotesLoaded(true);
    } catch (err) {
      console.error('Failed to load quotes:', err);
    } finally {
      setQuotesLoading(false);
    }
  }, [uri]);

  const loadMoreQuotes = async () => {
    if (!quotesCursor || quotesLoading) return;
    setQuotesLoading(true);
    try {
      const response = await getQuotes(uri, quotesCursor);
      setQuotes(prev => [...prev, ...response.data.posts]);
      setQuotesCursor(response.data.cursor);
    } catch (err) {
      console.error('Failed to load more quotes:', err);
    } finally {
      setQuotesLoading(false);
    }
  };

  // Load likes when tab is selected
  useEffect(() => {
    if (activeTab === 'likes' && !likesLoaded && !likesLoading) {
      loadLikes();
    }
  }, [activeTab, likesLoaded, likesLoading, loadLikes]);

  // Load reposts when tab is selected
  useEffect(() => {
    if (activeTab === 'reposts' && !repostsLoaded && !repostsLoading) {
      loadReposts();
    }
  }, [activeTab, repostsLoaded, repostsLoading, loadReposts]);

  // Load quotes when tab is selected
  useEffect(() => {
    if (activeTab === 'quotes' && !quotesLoaded && !quotesLoading) {
      loadQuotes();
    }
  }, [activeTab, quotesLoaded, quotesLoading, loadQuotes]);

  const handleTabClick = (tab: TabType) => {
    // Toggle tab - clicking active tab closes it
    setActiveTab(activeTab === tab ? null : tab);
  };

  // Don't render if no engagement
  if (likeCount === 0 && repostCount === 0 && quoteCount === 0) {
    return null;
  }

  return (
    <div className="border-t border-b border-gray-200 dark:border-gray-800">
      {/* Tab bar */}
      <div className="flex">
        {likeCount > 0 && (
          <button
            onClick={() => handleTabClick('likes')}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors relative ${
              activeTab === 'likes'
                ? 'text-red-500'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'
            }`}
          >
            <span className="flex items-center justify-center gap-1">
              <svg
                className="w-3.5 h-3.5"
                fill={activeTab === 'likes' ? 'currentColor' : 'none'}
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                />
              </svg>
              {likeCount}
            </span>
            {activeTab === 'likes' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />
            )}
          </button>
        )}

        {repostCount > 0 && (
          <button
            onClick={() => handleTabClick('reposts')}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors relative ${
              activeTab === 'reposts'
                ? 'text-green-500'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'
            }`}
          >
            <span className="flex items-center justify-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {repostCount}
            </span>
            {activeTab === 'reposts' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-500" />
            )}
          </button>
        )}

        {quoteCount > 0 && (
          <button
            onClick={() => handleTabClick('quotes')}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors relative ${
              activeTab === 'quotes'
                ? 'text-blue-500'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'
            }`}
          >
            <span className="flex items-center justify-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
              </svg>
              {quoteCount}
            </span>
            {activeTab === 'quotes' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
            )}
          </button>
        )}
      </div>

      {/* Tab content */}
      {activeTab && (
        <div className="max-h-80 overflow-y-auto">
          {/* Likes content */}
          {activeTab === 'likes' && (
            <div>
              {likesLoading && likes.length === 0 ? (
                <div className="p-4 flex justify-center">
                  <div className="animate-spin w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full" />
                </div>
              ) : likes.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">No likes yet</div>
              ) : (
                <>
                  {likes.map((like) => (
                    <UserListItem
                      key={like.actor.did}
                      did={like.actor.did}
                      handle={like.actor.handle}
                      displayName={like.actor.displayName}
                      avatar={like.actor.avatar}
                      labels={like.actor.labels as Label[]}
                      viewer={like.actor.viewer}
                      onOpenProfile={onOpenProfile}
                    />
                  ))}
                  {likesCursor && (
                    <button
                      onClick={loadMoreLikes}
                      disabled={likesLoading}
                      className="w-full py-3 text-sm text-blue-500 hover:bg-gray-50 dark:hover:bg-gray-800/50 disabled:opacity-50"
                    >
                      {likesLoading ? 'Loading...' : 'Load more'}
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Reposts content */}
          {activeTab === 'reposts' && (
            <div>
              {repostsLoading && reposts.length === 0 ? (
                <div className="p-4 flex justify-center">
                  <div className="animate-spin w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full" />
                </div>
              ) : reposts.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">No reposts yet</div>
              ) : (
                <>
                  {reposts.map((profile) => (
                    <UserListItem
                      key={profile.did}
                      did={profile.did}
                      handle={profile.handle}
                      displayName={profile.displayName}
                      avatar={profile.avatar}
                      labels={profile.labels as Label[]}
                      viewer={profile.viewer}
                      onOpenProfile={onOpenProfile}
                    />
                  ))}
                  {repostsCursor && (
                    <button
                      onClick={loadMoreReposts}
                      disabled={repostsLoading}
                      className="w-full py-3 text-sm text-blue-500 hover:bg-gray-50 dark:hover:bg-gray-800/50 disabled:opacity-50"
                    >
                      {repostsLoading ? 'Loading...' : 'Load more'}
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Quotes content */}
          {activeTab === 'quotes' && (
            <div>
              {quotesLoading && quotes.length === 0 ? (
                <div className="p-4 flex justify-center">
                  <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
                </div>
              ) : quotes.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">No quotes yet</div>
              ) : (
                <>
                  {quotes.map((post) => (
                    <Post key={post.uri} post={post} onOpenThread={onOpenThread} />
                  ))}
                  {quotesCursor && (
                    <button
                      onClick={loadMoreQuotes}
                      disabled={quotesLoading}
                      className="w-full py-3 text-sm text-blue-500 hover:bg-gray-50 dark:hover:bg-gray-800/50 disabled:opacity-50"
                    >
                      {quotesLoading ? 'Loading...' : 'Load more'}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
