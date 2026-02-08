'use client';

import { useState, useEffect } from 'react';
import { OCN_VOTE_HELPFUL_REASONS, OCN_VOTE_NOT_HELPFUL_REASONS, OCN_VOTE_REASON_LABELS } from '@/lib/constants';

interface CommunityNoteRatingProps {
  noteId: string;
  userRating: number | null;
  onRate: (noteId: string, helpfulness: number, reasons?: string[]) => void;
  disabled?: boolean;
}

const RATING_OPTIONS = [
  { value: 1.0, label: 'Helpful', color: 'green' },
  { value: 0.5, label: 'Somewhat', color: 'yellow' },
  { value: 0.0, label: 'Not Helpful', color: 'red' },
] as const;

export default function CommunityNoteRating({
  noteId,
  userRating,
  onRate,
  disabled,
}: CommunityNoteRatingProps) {
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);

  // Reset reasons when switching between Helpful/Not Helpful
  useEffect(() => {
    setSelectedReasons([]);
  }, [userRating]);

  const reasonsToShow =
    userRating === 1.0
      ? OCN_VOTE_HELPFUL_REASONS
      : userRating === 0.0
        ? OCN_VOTE_NOT_HELPFUL_REASONS
        : null;

  const toggleReason = (reason: string) => {
    setSelectedReasons((prev) => {
      const updated = prev.includes(reason)
        ? prev.filter((r) => r !== reason)
        : [...prev, reason];
      // Call onRate with updated reasons
      onRate(noteId, userRating!, updated.length > 0 ? updated : undefined);
      return updated;
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5">
        {RATING_OPTIONS.map((option) => {
          const isSelected = userRating === option.value;
          const baseClasses = 'px-2.5 py-1 text-xs font-medium rounded-full transition-colors';

          let colorClasses: string;
          if (isSelected) {
            switch (option.color) {
              case 'green':
                colorClasses = 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 ring-1 ring-green-300 dark:ring-green-700';
                break;
              case 'yellow':
                colorClasses = 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 ring-1 ring-yellow-300 dark:ring-yellow-700';
                break;
              case 'red':
                colorClasses = 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 ring-1 ring-red-300 dark:ring-red-700';
                break;
            }
          } else {
            colorClasses = 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600';
          }

          return (
            <button
              key={option.value}
              onClick={(e) => {
                e.stopPropagation();
                onRate(noteId, option.value);
              }}
              disabled={disabled}
              className={`${baseClasses} ${colorClasses} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {reasonsToShow && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            Why? (optional)
          </span>
          <div className="flex flex-wrap gap-1">
            {reasonsToShow.map((reason) => {
              const isSelected = selectedReasons.includes(reason);
              const label = OCN_VOTE_REASON_LABELS[reason] ?? reason;

              let chipClasses: string;
              if (isSelected) {
                chipClasses =
                  userRating === 1.0
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 ring-1 ring-green-300 dark:ring-green-700'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 ring-1 ring-red-300 dark:ring-red-700';
              } else {
                chipClasses =
                  'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600';
              }

              return (
                <button
                  key={reason}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleReason(reason);
                  }}
                  disabled={disabled}
                  className={`px-2 py-0.5 text-[10px] font-medium rounded-full transition-colors ${chipClasses} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
