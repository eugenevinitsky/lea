'use client';

import { useState, ReactNode } from 'react';
import { ModerationUIInfo } from '@/lib/moderation';

interface ModerationWrapperProps {
  children: ReactNode;
  contentModeration: ModerationUIInfo;
  mediaModeration?: ModerationUIInfo;
  // If true, applies to just the media portion of a post
  isMediaOnly?: boolean;
  // Compact mode for lists
  compact?: boolean;
}

export default function ModerationWrapper({
  children,
  contentModeration,
  mediaModeration,
  isMediaOnly = false,
  compact = false,
}: ModerationWrapperProps) {
  const [contentRevealed, setContentRevealed] = useState(false);
  const [mediaRevealed, setMediaRevealed] = useState(false);

  // Determine what to blur
  const shouldBlurContent = contentModeration.blur && !contentRevealed;
  const shouldBlurMedia = (mediaModeration?.blur || false) && !mediaRevealed;
  const canRevealContent = contentModeration.blur && !contentModeration.noOverride;
  const canRevealMedia = mediaModeration?.blur && !mediaModeration.noOverride;

  // If filtering, return nothing (caller should handle this)
  // We don't filter here because the parent Feed component handles filtering
  
  // If no moderation needed, just render children
  if (!contentModeration.blur && !contentModeration.alert && !contentModeration.inform) {
    return <>{children}</>;
  }

  // Render content blur overlay
  if (shouldBlurContent && !isMediaOnly) {
    return (
      <div className="relative">
        {/* Blurred content */}
        <div className="filter blur-lg opacity-50 pointer-events-none select-none" aria-hidden="true">
          {children}
        </div>
        
        {/* Overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100/80 dark:bg-gray-900/80 rounded-lg">
          <div className="text-center p-4 max-w-sm">
            {/* Warning icon */}
            <div className="w-12 h-12 mx-auto mb-3 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
              {contentModeration.blurTitle || 'Content Warning'}
            </h3>
            
            {contentModeration.blurMessage && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {contentModeration.blurMessage}
              </p>
            )}
            
            {canRevealContent ? (
              <button
                onClick={() => setContentRevealed(true)}
                className="px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded-lg transition-colors"
              >
                Show content
              </button>
            ) : (
              <p className="text-xs text-gray-500">This content cannot be revealed</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Render with alerts (no blur, but show alert badges)
  // Note: "inform" badges are now handled by LabelBadges inline with the post
  return (
    <div>
      {/* Alert badges - only for serious warnings that should appear prominently */}
      {contentModeration.alerts.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {contentModeration.alerts.map((alert, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {alert.displayName || alert.label || alert.type}
            </span>
          ))}
        </div>
      )}
      
      {children}
    </div>
  );
}

// Separate component for media-only blur (images, videos)
export function MediaBlurOverlay({
  children,
  mediaModeration,
}: {
  children: ReactNode;
  mediaModeration: ModerationUIInfo;
}) {
  const [revealed, setRevealed] = useState(false);

  if (!mediaModeration.blur || revealed) {
    return <>{children}</>;
  }

  const canReveal = !mediaModeration.noOverride;

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Blurred media */}
      <div className="filter blur-xl opacity-30" aria-hidden="true">
        {children}
      </div>
      
      {/* Overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-gray-200/90 dark:bg-gray-800/90">
        <div className="text-center p-4">
          <div className="w-10 h-10 mx-auto mb-2 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {mediaModeration.blurTitle || 'Sensitive Media'}
          </p>
          {canReveal ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setRevealed(true);
              }}
              className="px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded-lg transition-colors"
            >
              Show media
            </button>
          ) : (
            <p className="text-xs text-gray-500">This media cannot be shown</p>
          )}
        </div>
      </div>
    </div>
  );
}
