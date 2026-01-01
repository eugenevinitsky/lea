'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { AppBskyFeedDefs } from '@atproto/api';
import { getModerationOpts, moderatePost, ModerationOpts, ModerationDecision } from './bluesky';

// Context for moderation state
interface ModerationContextType {
  moderationOpts: ModerationOpts | null;
  isLoading: boolean;
  error: string | null;
  refreshModerationOpts: () => Promise<void>;
  getPostModeration: (post: AppBskyFeedDefs.PostView) => ModerationDecision | null;
}

const ModerationContext = createContext<ModerationContextType>({
  moderationOpts: null,
  isLoading: false,
  error: null,
  refreshModerationOpts: async () => {},
  getPostModeration: () => null,
});

export function ModerationProvider({ children }: { children: ReactNode }) {
  const [moderationOpts, setModerationOpts] = useState<ModerationOpts | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load moderation options
  const loadModerationOpts = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const opts = await getModerationOpts(forceRefresh);
      setModerationOpts(opts);
    } catch (err) {
      console.error('Failed to load moderation opts:', err);
      setError(err instanceof Error ? err.message : 'Failed to load moderation settings');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadModerationOpts();
  }, [loadModerationOpts]);

  // Refresh function exposed to consumers
  const refreshModerationOpts = useCallback(async () => {
    await loadModerationOpts(true);
  }, [loadModerationOpts]);

  // Get moderation decision for a post
  const getPostModeration = useCallback((post: AppBskyFeedDefs.PostView): ModerationDecision | null => {
    if (!moderationOpts) return null;
    try {
      return moderatePost(post, moderationOpts);
    } catch (err) {
      console.error('Failed to moderate post:', err);
      return null;
    }
  }, [moderationOpts]);

  return (
    <ModerationContext.Provider value={{
      moderationOpts,
      isLoading,
      error,
      refreshModerationOpts,
      getPostModeration,
    }}>
      {children}
    </ModerationContext.Provider>
  );
}

// Hook to access moderation context
export function useModeration() {
  return useContext(ModerationContext);
}

// Hook to get moderation decision for a specific post
export function usePostModeration(post: AppBskyFeedDefs.PostView): ModerationDecision | null {
  const { getPostModeration } = useModeration();
  return getPostModeration(post);
}

// Helper type for UI context
export type ModerationUIContext = 'contentList' | 'contentView' | 'contentMedia' | 'avatar' | 'profileList' | 'profileView';

// Helper to extract moderation UI info
export interface ModerationUIInfo {
  filter: boolean;
  blur: boolean;
  alert: boolean;
  inform: boolean;
  noOverride: boolean;
  blurTitle?: string;
  blurMessage?: string;
  alerts: Array<{ type: string; labeledBy?: string; label?: string }>;
  informs: Array<{ type: string; labeledBy?: string; label?: string }>;
}

export function getModerationUI(decision: ModerationDecision | null, context: ModerationUIContext): ModerationUIInfo {
  if (!decision) {
    return {
      filter: false,
      blur: false,
      alert: false,
      inform: false,
      noOverride: false,
      alerts: [],
      informs: [],
    };
  }

  const ui = decision.ui(context);
  
  // Extract blur reason for display
  let blurTitle: string | undefined;
  let blurMessage: string | undefined;
  if (ui.blur && ui.blurs.length > 0) {
    const cause = ui.blurs[0];
    if (cause.type === 'label') {
      // Label-based blur
      const labelCause = cause as { type: 'label'; label: { val: string }; labelDef?: { locales: Array<{ name: string; description?: string }> } };
      const labelDef = labelCause.labelDef;
      if (labelDef?.locales?.[0]) {
        blurTitle = labelDef.locales[0].name;
        blurMessage = labelDef.locales[0].description;
      } else {
        blurTitle = `Content Warning: ${labelCause.label.val}`;
      }
    } else if (cause.type === 'muted') {
      blurTitle = 'Muted';
      blurMessage = 'This content matches your mute settings';
    } else if (cause.type === 'blocking') {
      blurTitle = 'Blocked User';
      blurMessage = 'You have blocked this user';
    } else if (cause.type === 'blocked-by') {
      blurTitle = 'Blocked';
      blurMessage = 'This user has blocked you';
    }
  }

  // Extract alerts and informs
  const extractCauseInfo = (cause: { type: string; labeledBy?: string; label?: { val: string } }) => ({
    type: cause.type,
    labeledBy: cause.labeledBy,
    label: cause.label?.val,
  });

  return {
    filter: ui.filter,
    blur: ui.blur,
    alert: ui.alert,
    inform: ui.inform,
    noOverride: ui.noOverride,
    blurTitle,
    blurMessage,
    alerts: ui.alerts.map(extractCauseInfo),
    informs: ui.informs.map(extractCauseInfo),
  };
}
