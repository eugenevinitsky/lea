'use client';

import { AppBskyFeedDefs } from '@atproto/api';
import Post from './Post';

interface SelfThreadProps {
  posts: AppBskyFeedDefs.PostView[];
  onOpenThread?: (uri: string) => void;
  onOpenProfile?: (did: string) => void;
  feedContext?: string;
  reqId?: string;
  supportsInteractions?: boolean;
  feedUri?: string;
}

// Renders a self-thread (author replying to themselves) as a connected visual unit
export default function SelfThread({
  posts,
  onOpenThread,
  onOpenProfile,
  feedContext,
  reqId,
  supportsInteractions,
  feedUri,
}: SelfThreadProps) {
  if (posts.length === 0) return null;
  
  // Single post - just render normally
  if (posts.length === 1) {
    return (
      <Post
        post={posts[0]}
        onOpenThread={onOpenThread}
        onOpenProfile={onOpenProfile}
        feedContext={feedContext}
        reqId={reqId}
        supportsInteractions={supportsInteractions}
        feedUri={feedUri}
      />
    );
  }

  // Multiple posts - render as connected thread
  return (
    <div className="relative">
      {/* Thread indicator header */}
      <div className="px-4 pt-2 pb-1 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
        </svg>
        <span>Thread ({posts.length} posts)</span>
      </div>
      
      {posts.map((post, index) => {
        const isFirst = index === 0;
        const isLast = index === posts.length - 1;
        
        return (
          <div key={post.uri} className="relative">
            {/* Thread line connecting posts */}
            {!isLast && (
              <div 
                className="absolute left-[34px] top-[52px] bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700"
                style={{ height: 'calc(100% - 52px)' }}
              />
            )}
            
            {/* Continuation indicator for non-first posts */}
            {!isFirst && (
              <div className="absolute left-[34px] top-0 h-3 w-0.5 bg-gray-200 dark:bg-gray-700" />
            )}
            
            <Post
              post={post}
              onOpenThread={onOpenThread}
              onOpenProfile={onOpenProfile}
              feedContext={feedContext}
              reqId={reqId}
              supportsInteractions={supportsInteractions}
              feedUri={feedUri}
              // Compact mode for thread posts (less padding between)
              isInSelfThread={true}
              isFirstInThread={isFirst}
              isLastInThread={isLast}
            />
          </div>
        );
      })}
      
      {/* Bottom border to separate from next item */}
      <div className="border-b border-gray-200 dark:border-gray-800" />
    </div>
  );
}
