'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { getBlueskyProfile, buildPostUrl } from '@/lib/bluesky';
import { useFeedLayout } from '../../layout';
import ProfileView from '@/components/ProfileView';
import ProfileEditor from '@/components/ProfileEditor';
import ThreadView from '@/components/ThreadView';

export default function ProfilePage() {
  const params = useParams();
  const router = useRouter();
  // Next.js URL-encodes the params, so we need to decode them (e.g., colons in DIDs)
  const handle = decodeURIComponent(params.handle as string || '');
  const { navigateToProfile } = useFeedLayout();

  const [profileDid, setProfileDid] = useState<string | null>(null);
  const [resolvedProfile, setResolvedProfile] = useState<{ did: string; handle: string; displayName?: string; avatar?: string } | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [threadUri, setThreadUri] = useState<string | null>(null);

  // Resolve handle to DID on mount (layout guarantees we're authenticated)
  useEffect(() => {
    async function resolve() {
      if (!handle) return;

      try {
        const profile = await getBlueskyProfile(handle);
        if (profile) {
          setProfileDid(profile.did);
          setResolvedProfile(profile);
        } else {
          setResolveError('User not found');
        }
      } catch (err) {
        console.error('Failed to resolve handle:', err);
        setResolveError('Failed to load profile');
      }
    }

    resolve();
  }, [handle]);

  // Open thread using client-side navigation
  const openThread = useCallback(async (uri: string | null) => {
    if (!uri) {
      setThreadUri(null);
      return;
    }

    const match = uri.match(/^at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/);
    if (match) {
      const [, did, rkey] = match;
      try {
        const profile = await getBlueskyProfile(did);
        if (profile?.handle) {
          router.push(buildPostUrl(profile.handle, rkey, profile.did));
          return;
        }
      } catch {
        // Fall through to use DID
      }
      router.push(buildPostUrl(did, rkey));
    } else {
      setThreadUri(uri);
    }
  }, [router]);

  return (
    <main className="flex-1 w-full lg:max-w-xl bg-white dark:bg-gray-950 min-h-screen border-x border-gray-200 dark:border-gray-800">
      {resolveError ? (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="w-16 h-16 mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <p className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">@{handle}</p>
          <p className="text-gray-500">{resolveError}</p>
          <button
            onClick={() => router.push('/')}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600"
          >
            Back to feed
          </button>
        </div>
      ) : profileDid ? (
        <ProfileView
          did={profileDid}
          initialBskyProfile={resolvedProfile || undefined}
          onClose={() => router.push('/')}
          onOpenProfile={(did) => navigateToProfile(did)}
          onEdit={() => setShowProfileEditor(true)}
          inline
        />
      ) : (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      )}

      {/* Thread View Modal */}
      {threadUri && (
        <ThreadView uri={threadUri} onClose={() => openThread(null)} />
      )}

      {/* Profile Editor Modal */}
      {showProfileEditor && (
        <ProfileEditor onClose={() => setShowProfileEditor(false)} />
      )}
    </main>
  );
}
