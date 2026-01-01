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
  const { getProfileModeration, moderationOpts } = useModeration();
  
  // Get profile moderation to extract labels with display names
  // Only show labels that the moderation system decides to show (based on user settings)
  const profileLabels = useMemo(() => {
    console.log('[ProfileLabels] Checking:', { 
      hasProfile: !!profile, 
      hasModOpts: !!moderationOpts,
      profileDid: profile?.did,
      profileLabels: profile?.labels 
    });
    
    if (!profile || !moderationOpts) return [];
    
    const decision = getProfileModeration(profile as Parameters<typeof getProfileModeration>[0]);
    console.log('[ProfileLabels] Decision:', decision);
    
    if (!decision) return [];
    
    const ui = getModerationUI(decision, 'profileView');
    console.log('[ProfileLabels] UI:', { alerts: ui.alerts, informs: ui.informs });
    
    // Combine alerts and informs, filtering out hidden labels
    const allLabels = [...ui.alerts, ...ui.informs].filter(
      l => l.label && !HIDDEN_LABELS.has(l.label)
    );
    console.log('[ProfileLabels] Final labels:', allLabels);
    return allLabels;
  }, [profile, getProfileModeration, moderationOpts]);

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
