'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { AppBskyFeedDefs } from '@atproto/api';

export interface QuotePostData {
  uri: string;
  cid: string;
  author: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  text: string;
  createdAt: string;
}

interface ComposerContextType {
  isOpen: boolean;
  quotePost: QuotePostData | null;
  openComposer: (quotePost?: QuotePostData) => void;
  closeComposer: () => void;
}

const ComposerContext = createContext<ComposerContextType | null>(null);

export function ComposerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [quotePost, setQuotePost] = useState<QuotePostData | null>(null);

  const openComposer = useCallback((quote?: QuotePostData) => {
    setQuotePost(quote || null);
    setIsOpen(true);
  }, []);

  const closeComposer = useCallback(() => {
    setIsOpen(false);
    setQuotePost(null);
  }, []);

  return (
    <ComposerContext.Provider value={{ isOpen, quotePost, openComposer, closeComposer }}>
      {children}
    </ComposerContext.Provider>
  );
}

export function useComposer() {
  const context = useContext(ComposerContext);
  if (!context) {
    throw new Error('useComposer must be used within a ComposerProvider');
  }
  return context;
}
