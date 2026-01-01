'use client';

import { ReactNode } from 'react';
import { ModerationProvider } from '@/lib/moderation';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ModerationProvider>
      {children}
    </ModerationProvider>
  );
}
