'use client';

import { useState } from 'react';
import { followUser, unfollowUser, isVerifiedResearcher, Label, getSession, buildProfileUrl } from '@/lib/bluesky';
import { useFollowing } from '@/lib/following-context';
import { useSettings } from '@/lib/settings';
import ProfileHoverCard from './ProfileHoverCard';

interface UserListItemProps {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  labels?: Label[];
  viewer?: {
    following?: string;
    followedBy?: string;
  };
  onOpenProfile?: (did: string) => void;
}

export default function UserListItem({
  did,
  handle,
  displayName,
  avatar,
  labels,
  viewer,
  onOpenProfile,
}: UserListItemProps) {
  const [isFollowing, setIsFollowing] = useState(!!viewer?.following);
  const [followUri, setFollowUri] = useState<string | undefined>(viewer?.following);
  const [followLoading, setFollowLoading] = useState(false);
  const { refresh: refreshFollowing } = useFollowing();

  const session = getSession();
  const isOwnProfile = session?.did === did;
  const isVerified = isVerifiedResearcher(labels);
  const { settings } = useSettings();
  const isMutual = isFollowing && !!viewer?.followedBy;

  // Get avatar ring class based on relationship and settings
  const getAvatarRingClass = () => {
    if (isOwnProfile) return '';
    if (isMutual && settings.showMutualRing) {
      return 'ring-[3px] ring-purple-400 dark:ring-purple-400/60 shadow-[0_0_8px_rgba(192,132,252,0.5)] dark:shadow-[0_0_8px_rgba(167,139,250,0.4)]';
    }
    if (isFollowing && settings.showFollowingRing) {
      return 'ring-[3px] ring-blue-300 dark:ring-blue-400/60 shadow-[0_0_8px_rgba(147,197,253,0.5)] dark:shadow-[0_0_8px_rgba(96,165,250,0.4)]';
    }
    if (viewer?.followedBy && settings.showFollowerRing) {
      return 'ring-[3px] ring-yellow-400 dark:ring-yellow-400/60 shadow-[0_0_8px_rgba(250,204,21,0.5)] dark:shadow-[0_0_8px_rgba(250,204,21,0.4)]';
    }
    return '';
  };

  const handleFollow = async (e: React.MouseEvent) => {
    e.stopPropagation();
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

  const handleUnfollow = async (e: React.MouseEvent) => {
    e.stopPropagation();
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

  const handleProfileClick = () => {
    // Navigate to profile page
    window.location.href = buildProfileUrl(handle, did);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      {/* Avatar with hover card */}
      <ProfileHoverCard did={did} handle={handle} onOpenProfile={handleProfileClick}>
        <button onClick={handleProfileClick} className="flex-shrink-0">
          {avatar ? (
            <img
              src={avatar}
              alt=""
              className={`w-8 h-8 rounded-full hover:opacity-80 transition-opacity ${getAvatarRingClass()}`}
            />
          ) : (
            <div className={`w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold ${getAvatarRingClass()}`}>
              {(displayName || handle)[0].toUpperCase()}
            </div>
          )}
        </button>
      </ProfileHoverCard>

      {/* Name and handle */}
      <div className="flex-1 min-w-0">
        <ProfileHoverCard did={did} handle={handle} onOpenProfile={handleProfileClick}>
          <button onClick={handleProfileClick} className="text-left">
            <div className="flex items-center gap-1">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 hover:underline truncate">
                {displayName || handle}
              </span>
              {isVerified && (
                <span
                  className="inline-flex items-center justify-center w-3.5 h-3.5 bg-emerald-500 rounded-full flex-shrink-0"
                  title="Verified Researcher"
                >
                  <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 truncate">@{handle}</p>
          </button>
        </ProfileHoverCard>
      </div>

      {/* Follow button (not shown for own profile) */}
      {!isOwnProfile && (
        <button
          onClick={isFollowing ? handleUnfollow : handleFollow}
          disabled={followLoading}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex-shrink-0 ${
            isFollowing
              ? isMutual
                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400'
                : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400'
              : 'bg-blue-500 text-white hover:bg-blue-600'
          } disabled:opacity-50`}
        >
          {followLoading ? (
            <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : isMutual ? (
            'Mutuals'
          ) : isFollowing ? (
            'Following'
          ) : (
            'Follow'
          )}
        </button>
      )}

      {/* Follows you badge - only show if they follow you but you don't follow back */}
      {viewer?.followedBy && !isFollowing && (
        <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 text-xs font-medium rounded-full flex-shrink-0">
          Follows you
        </span>
      )}
    </div>
  );
}
