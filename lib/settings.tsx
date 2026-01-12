'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface LeaSettings {
  // Protective defaults
  autoThreadgate: boolean;
  threadgateType: 'following' | 'verified' | 'researchers' | 'open';
  highFollowerThreshold: number | null; // null = off, number = threshold

  // Display
  showPaperHighlights: boolean;
  dimNonVerified: boolean;
  dimReposts: boolean;
  expandSelfThreads: boolean;

  // Notifications
  notifyLikes: boolean;
  notifyReposts: boolean;
  notifyQuotes: boolean;
  notifyReplies: boolean;
  notifyFollows: boolean;
  notifyMentions: boolean;

  // UI state
  safetyPanelExpanded: boolean;
  settingsPanelExpanded: boolean;
}

const DEFAULT_SETTINGS: LeaSettings = {
  autoThreadgate: true,
  threadgateType: 'following',
  highFollowerThreshold: 10000,
  showPaperHighlights: true,
  dimNonVerified: false,
  dimReposts: false,
  expandSelfThreads: true,
  notifyLikes: true,
  notifyReposts: true,
  notifyQuotes: true,
  notifyReplies: true,
  notifyFollows: true,
  notifyMentions: true,
  safetyPanelExpanded: false,
  settingsPanelExpanded: false,
};

interface SettingsContextType {
  settings: LeaSettings;
  updateSettings: (updates: Partial<LeaSettings>) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

const STORAGE_KEY = 'lea-settings';

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<LeaSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          // Migrate old 'verified' threadgateType to 'researchers'
          if (parsed.threadgateType === 'verified') {
            parsed.threadgateType = 'researchers';
          }
          setSettings({ ...DEFAULT_SETTINGS, ...parsed });
        } catch {
          // Invalid JSON, use defaults
        }
      }
    } catch {
      // localStorage may fail in private browsing
    }
    setLoaded(true);
  }, []);

  // Save settings to localStorage on change
  useEffect(() => {
    if (loaded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch {
        // localStorage may fail in private browsing
      }
    }
  }, [settings, loaded]);

  const updateSettings = (updates: Partial<LeaSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
