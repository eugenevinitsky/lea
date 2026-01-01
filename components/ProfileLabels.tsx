'use client';

import { useMemo } from 'react';
import { useModeration, getModerationUI } from '@/lib/moderation';
import type { BlueskyProfile } from '@/lib/bluesky';

interface ProfileLabelsProps {
  profile: BlueskyProfile | null;
  compact?: boolean;
}

// Labels we don't show (shown separately or internal)
const HIDDEN_LABELS = new Set([
  '!hide', '!warn', '!no-unauthenticated', '!no-promote',
  'verified-researcher', // Shown as a badge separately
]);

export default function ProfileLabels({ profile, compact = false }: ProfileLabelsProps) {
  const { getProfileModeration, moderationOpts, getLabelDisplayName } = useModeration();
  
  // Get profile moderation to extract labels with display names
  const profileLabels = useMemo(() => {
    if (!profile) return [];
    
    // If moderation opts are loaded, use the full moderation system
    if (moderationOpts) {
      const decision = getProfileModeration(profile as Parameters<typeof getProfileModeration>[0]);
      if (decision) {
        const ui = getModerationUI(decision, 'profileView');
        // Combine alerts and informs, filtering out hidden labels
        const allLabels = [...ui.alerts, ...ui.informs].filter(
          l => l.label && !HIDDEN_LABELS.has(l.label)
        );
        return allLabels;
      }
    }
    
    // Fallback: if moderation opts not loaded yet, use raw labels from profile
    // This ensures labels show up even before moderation context loads
    if (profile.labels && profile.labels.length > 0) {
      return profile.labels
        .filter(l => l.val && !HIDDEN_LABELS.has(l.val))
        .map(l => ({
          type: 'label',
          label: l.val,
          labeledBy: l.src,
          // Try to get display name from label definitions if available
          displayName: getLabelDisplayName(l.val, l.src) || undefined,
        }));
    }
    
    return [];
  }, [profile, getProfileModeration, moderationOpts, getLabelDisplayName]);

  if (profileLabels.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1 ${compact ? '' : 'mt-2'}`}>
      {profileLabels.map((label, i) => (
        <span
          key={`${label.label}-${i}`}
          className={`inline-flex items-center gap-1 font-medium rounded-full ${
            compact
              ? 'px-1.5 py-0 text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              : 'px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
          }`}
        >
          {label.displayName || label.label || label.type}
        </span>
      ))}
    </div>
  );
}
