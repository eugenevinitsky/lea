'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { getBlueskyProfile, resolveHandle, buildPostUrl } from '@/lib/bluesky';
import { useFeedLayout } from '../../../../layout';
import ThreadView from '@/components/ThreadView';

export default function PostPage() {
  const params = useParams();
  const router = useRouter();
  // Next.js URL-encodes route params, so colons in DIDs become %3A
  const handle = decodeURIComponent(params.handle as string);
  const rkey = decodeURIComponent(params.rkey as string);
  const { navigateToProfile } = useFeedLayout();

  const [postUri, setPostUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Resolve handle to DID and construct post URI (layout guarantees we're authenticated)
  useEffect(() => {
    async function resolvePost() {
      if (!handle || !rkey) return;

      try {
        // Handle could be a DID or handle - resolve it
        let did = handle;
        if (!handle.startsWith('did:')) {
          const resolved = await resolveHandle(handle);
          if (!resolved) {
            setError('User not found');
            return;
          }
          did = resolved;
        }

        // Construct AT URI
        const uri = `at://${did}/app.bsky.feed.post/${rkey}`;
        setPostUri(uri);
      } catch (err) {
        console.error('Failed to resolve post:', err);
        setError('Failed to load post');
      }
    }

    resolvePost();
  }, [handle, rkey]);

  // Navigate to a different thread using client-side routing
  const navigateToThread = useCallback(async (uri: string) => {
    const match = uri.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/);
    if (match) {
      const [, identifier, postRkey] = match;

      if (identifier.startsWith('did:')) {
        try {
          const profile = await getBlueskyProfile(identifier);
          if (profile?.handle) {
            router.push(buildPostUrl(profile.handle, postRkey, profile.did));
            return;
          }
        } catch {
          // Fall through to use DID
        }
        router.push(buildPostUrl(identifier, postRkey));
      } else {
        try {
          const resolved = await resolveHandle(identifier);
          if (resolved) {
            router.push(buildPostUrl(identifier, postRkey, resolved));
            return;
          }
        } catch {
          // Fall through to use handle directly
        }
        router.push(buildPostUrl(identifier, postRkey));
      }
    }
  }, [router]);

  return (
    <main className="flex-1 w-full lg:max-w-xl bg-white dark:bg-gray-950 min-h-screen border-x border-gray-200 dark:border-gray-800">
      {/* Thread header */}
      <div className="sticky top-14 z-10 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Thread</h2>
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="w-16 h-16 mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Post not found</p>
          <p className="text-gray-500">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600"
          >
            Back to feed
          </button>
        </div>
      ) : postUri ? (
        <ThreadView
          uri={postUri}
          onClose={() => router.push('/')}
          onOpenThread={navigateToThread}
          onOpenProfile={(did) => navigateToProfile(did)}
          inline
        />
      ) : (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      )}
    </main>
  );
}
