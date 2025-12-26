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
}

const DEFAULT_SETTINGS: LeaSettings = {
  autoThreadgate: true,
  threadgateType: 'following',
  highFollowerThreshold: 10000,
  showPaperHighlights: true,
  dimNonVerified: false,
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
    setLoaded(true);
  }, []);

  // Save settings to localStorage on change
  useEffect(() => {
    if (loaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
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
