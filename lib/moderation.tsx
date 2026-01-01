'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { AppBskyFeedDefs, InterpretedLabelValueDefinition } from '@atproto/api';
import { getModerationOpts, moderatePost, ModerationOpts, ModerationDecision, getLabelDefinitions } from './bluesky';

// Label definition lookup type
export type LabelDefinitionsMap = Record<string, InterpretedLabelValueDefinition[]>;

// Context for moderation state
interface ModerationContextType {
  moderationOpts: ModerationOpts | null;
  labelDefinitions: LabelDefinitionsMap;
  isLoading: boolean;
  error: string | null;
  refreshModerationOpts: () => Promise<void>;
  getPostModeration: (post: AppBskyFeedDefs.PostView) => ModerationDecision | null;
  getLabelDisplayName: (labelValue: string, labelerDid: string) => string | null;
}

const ModerationContext = createContext<ModerationContextType>({
  moderationOpts: null,
  labelDefinitions: {},
  isLoading: false,
  error: null,
  refreshModerationOpts: async () => {},
  getPostModeration: () => null,
  getLabelDisplayName: () => null,
});

export function ModerationProvider({ children }: { children: ReactNode }) {
  const [moderationOpts, setModerationOpts] = useState<ModerationOpts | null>(null);
  const [labelDefinitions, setLabelDefinitions] = useState<LabelDefinitionsMap>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load moderation options and label definitions
  const loadModerationOpts = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const opts = await getModerationOpts(forceRefresh);
      setModerationOpts(opts);
      
      // Also load label definitions for display names
      const labelDefs = await getLabelDefinitions();
      setLabelDefinitions(labelDefs);
      console.log('[Moderation] Loaded label definitions:', labelDefs);
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

  // Get display name for a label from its definition
  const getLabelDisplayName = useCallback((labelValue: string, labelerDid: string): string | null => {
    const labelerDefs = labelDefinitions[labelerDid];
    if (!labelerDefs) return null;
    
    const labelDef = labelerDefs.find(def => def.identifier === labelValue);
    if (labelDef?.locales && labelDef.locales.length > 0) {
      return labelDef.locales[0].name;
    }
    return null;
  }, [labelDefinitions]);

  return (
    <ModerationContext.Provider value={{
      moderationOpts,
      labelDefinitions,
      isLoading,
      error,
      refreshModerationOpts,
      getPostModeration,
      getLabelDisplayName,
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
