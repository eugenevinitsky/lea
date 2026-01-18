'use client';

import { useState, useEffect, useRef, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { getBlueskyProfile, followUser, unfollowUser, isVerifiedResearcher, Label, BlueskyProfile, blockUser, unblockUser } from '@/lib/bluesky';
import { useFollowing } from '@/lib/following-context';
import { useSettings } from '@/lib/settings';
import ProfileLabels from './ProfileLabels';
import UserActionsMenu from './UserActionsMenu';

interface ProfileHoverCardProps {
  did: string;
  handle?: string;
  children: ReactNode;
  onOpenProfile?: (e?: React.MouseEvent) => void;
}

interface ProfileData {
  did: string;
  avatar?: string;
  displayName?: string;
  handle: string;
  description?: string;
  followersCount?: number;
  followsCount?: number;
  viewer?: {
    following?: string;
    followedBy?: string;
    blocking?: string;
  };
  labels?: Label[];
}

export default function ProfileHoverCard({ did, handle, children, onOpenProfile }: ProfileHoverCardProps) {
  const [showCard, setShowCard] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followUri, setFollowUri] = useState<string | undefined>();
  const [followLoading, setFollowLoading] = useState(false);
  const [cardPosition, setCardPosition] = useState({ top: 0, left: 0 });
  const { refresh: refreshFollowing } = useFollowing();
  const { settings } = useSettings();

  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const fetchProfile = async () => {
    if (profile || loading) return;
    setLoading(true);
    try {
      const data = await getBlueskyProfile(did);
      if (data) {
        setProfile(data as ProfileData);
        if (data.viewer?.following) {
          setIsFollowing(true);
          setFollowUri(data.viewer.following);
        }
      }
    } catch (err) {
      console.error('Failed to fetch profile for hover card:', err);
    } finally {
      setLoading(false);
    }
  };

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const cardWidth = 288; // w-72 = 18rem = 288px
      const cardHeight = 280; // approximate height

      let left = rect.left;
      let top = rect.bottom + 8; // 8px gap below trigger

      // Adjust if card would go off right edge
      if (left + cardWidth > window.innerWidth - 16) {
        left = window.innerWidth - cardWidth - 16;
      }

      // Adjust if card would go off left edge
      if (left < 16) {
        left = 16;
      }

      // If card would go below viewport, show above trigger instead
      if (top + cardHeight > window.innerHeight - 16) {
        top = rect.top - cardHeight - 8;
      }

      setCardPosition({ top, left });
    }
  };

  const handleMouseEnter = () => {
    // Clear any pending hide timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    hoverTimeoutRef.current = setTimeout(() => {
      updatePosition();
      setShowCard(true);
      fetchProfile();
    }, 500);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    // Delay hiding to allow moving to the card
    hideTimeoutRef.current = setTimeout(() => {
      setShowCard(false);
    }, 150);
  };

  const handleCardMouseEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  const handleCardMouseLeave = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setShowCard(false);
    }, 150);
  };

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

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  const isVerified = profile?.labels ? isVerifiedResearcher(profile.labels) : false;

  // Compute avatar ring class based on relationship and settings
  const getAvatarRingClass = () => {
    if (!profile?.viewer) return '';
    const isMutual = profile.viewer.following && profile.viewer.followedBy;
    const following = !!profile.viewer.following;
    const followedBy = !!profile.viewer.followedBy;

    if (isMutual && settings.showMutualRing) {
      return 'ring-[3px] ring-purple-400 dark:ring-purple-400/60 shadow-[0_0_8px_rgba(192,132,252,0.5)] dark:shadow-[0_0_8px_rgba(167,139,250,0.4)]';
    }
    if (following && settings.showFollowingRing) {
      return 'ring-[3px] ring-blue-300 dark:ring-blue-400/60 shadow-[0_0_8px_rgba(147,197,253,0.5)] dark:shadow-[0_0_8px_rgba(96,165,250,0.4)]';
    }
    if (followedBy && settings.showFollowerRing) {
      return 'ring-[3px] ring-yellow-400 dark:ring-yellow-400/60 shadow-[0_0_8px_rgba(250,204,21,0.5)] dark:shadow-[0_0_8px_rgba(250,204,21,0.4)]';
    }
    return '';
  };

  const avatarRingClass = getAvatarRingClass();

  const cardContent = showCard && (
    <div
      ref={cardRef}
      onMouseEnter={handleCardMouseEnter}
      onMouseLeave={handleCardMouseLeave}
      className="fixed z-[9999] w-72 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
      style={{
        top: cardPosition.top,
        left: cardPosition.left,
      }}
    >
      {loading && !profile ? (
        <div className="p-4 flex items-center justify-center">
          <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : profile ? (
        <div>
          {/* Header with avatar */}
          <div className="p-4 pb-3">
            <div className="flex items-start gap-3">
              <button
                onClick={(e) => {
                  if ((e.shiftKey || e.metaKey || e.ctrlKey) && (handle || profile.handle)) {
                    window.open(`/u/${handle || profile.handle}`, '_blank');
                  } else {
                    onOpenProfile?.(e);
                  }
                }}
                className="flex-shrink-0"
              >
                {profile.avatar ? (
                  <img
                    src={profile.avatar}
                    alt=""
                    className={`w-14 h-14 rounded-full hover:opacity-80 transition-opacity ${avatarRingClass}`}
                  />
                ) : (
                  <div className={`w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xl font-bold ${avatarRingClass}`}>
                    {(profile.displayName || profile.handle)[0].toUpperCase()}
                  </div>
                )}
              </button>
              <div className="flex-1 min-w-0">
                <button
                  onClick={(e) => {
                    if ((e.shiftKey || e.metaKey || e.ctrlKey) && (handle || profile.handle)) {
                      window.open(`/u/${handle || profile.handle}`, '_blank');
                    } else {
                      onOpenProfile?.(e);
                    }
                  }}
                  className="text-left"
                >
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-gray-900 dark:text-gray-100 hover:underline truncate">
                      {profile.displayName || profile.handle}
                    </span>
                    {isVerified && (
                      <span
                        className="inline-flex items-center justify-center w-4 h-4 bg-emerald-500 rounded-full flex-shrink-0"
                        title="Verified Researcher"
                      >
                        <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 truncate">@{profile.handle}</p>
                </button>
              </div>
            </div>

            {/* Bio */}
            {profile.description && (
              <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
                {profile.description}
              </p>
            )}

            {/* Follower stats */}
            <div className="flex items-center gap-4 mt-3 text-sm">
              <span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {profile.followersCount?.toLocaleString() || 0}
                </span>
                <span className="text-gray-500"> followers</span>
              </span>
              <span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {profile.followsCount?.toLocaleString() || 0}
                </span>
                <span className="text-gray-500"> following</span>
              </span>
            </div>

            {/* Follows you indicator */}
            {profile.viewer?.followedBy && (
              <span className="inline-block mt-2 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs rounded">
                Follows you
              </span>
            )}

            {/* Labels from moderation services */}
            <ProfileLabels profile={profile as BlueskyProfile} compact />
          </div>

          {/* Follow button and actions */}
          <div className="px-4 pb-4 flex items-center gap-2">
            <button
              onClick={isFollowing ? handleUnfollow : handleFollow}
              disabled={followLoading}
              className={`flex-1 py-2 rounded-full text-sm font-medium transition-colors ${
                isFollowing
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              } disabled:opacity-50`}
            >
              {followLoading ? (
                <span className="flex items-center justify-center gap-1">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
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
            <UserActionsMenu
              userDid={profile.did}
              userHandle={profile.handle}
              userDisplayName={profile.displayName}
              isBlocking={!!profile.viewer?.blocking}
              blockUri={profile.viewer?.blocking}
              onBlock={async () => {
                await blockUser(profile.did);
                setShowCard(false);
              }}
              onUnblock={async () => {
                if (profile.viewer?.blocking) {
                  await unblockUser(profile.viewer.blocking);
                }
                setShowCard(false);
              }}
              compact
            />
          </div>
        </div>
      ) : (
        <div className="p-4 text-center text-gray-500 text-sm">
          Failed to load profile
        </div>
      )}
    </div>
  );

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="inline-block"
      >
        {children}
      </div>
      {typeof document !== 'undefined' && createPortal(cardContent, document.body)}
    </>
  );
}
