'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getSession } from '@/lib/bluesky';
import CommunityNoteRating from './CommunityNoteRating';
import CommunityNoteDispute from './CommunityNoteDispute';
import { OCN_PROPOSAL_REASON_LABELS } from '@/lib/constants';

interface CommunityNoteData {
  id: string;
  postUri: string;
  summary: string;
  classification: string;
  reasons: string[];
  aid: string | null;
  labelStatus: string;
  targetType: string;
  createdAt: string;
  ratingCount: number;
  status: string;
  isAuthor: boolean;
  userRating: number | null;
}

interface CommunityNoteDisplayProps {
  postUri: string;
}

export default function CommunityNoteDisplay({ postUri }: CommunityNoteDisplayProps) {
  const [notes, setNotes] = useState<CommunityNoteData[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [disputingNoteId, setDisputingNoteId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const session = getSession();

  // Lazy-load via IntersectionObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fetchNotes = useCallback(async () => {
    try {
      const params = new URLSearchParams({ postUri });
      const response = await fetch(`/api/community-notes/?${params}`);
      if (!response.ok) return;

      const data = await response.json();
      setNotes(data.notes || []);
    } catch {
      // Silently fail — no placeholder rendered
    } finally {
      setLoaded(true);
    }
  }, [postUri]);

  useEffect(() => {
    if (isVisible) {
      fetchNotes();
    }
  }, [isVisible, fetchNotes]);

  const handleRate = async (noteId: string, helpfulness: number, reasons?: string[]) => {
    if (!session?.did) return;

    // Optimistic update
    setNotes((prev) =>
      prev.map((n) => {
        if (n.id !== noteId) return n;
        const isNewRating = n.userRating === null;
        return {
          ...n,
          userRating: helpfulness,
          ratingCount: isNewRating ? n.ratingCount + 1 : n.ratingCount,
        };
      })
    );

    try {
      const response = await fetch('/api/community-notes/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'rate',
          noteId,
          helpfulness,
          ...(reasons && reasons.length > 0 ? { reasons } : {}),
        }),
      });

      if (!response.ok) {
        // Revert on failure
        fetchNotes();
      }
    } catch {
      fetchNotes();
    }
  };

  const handleDelete = async (noteId: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));

    try {
      const response = await fetch('/api/community-notes/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', noteId }),
      });

      if (!response.ok) {
        fetchNotes();
      }
    } catch {
      fetchNotes();
    }
  };

  // Sentinel div for IntersectionObserver — always rendered
  if (!loaded || notes.length === 0) {
    return <div ref={containerRef} />;
  }

  const statusLabel = (status: string) => {
    switch (status) {
      case 'CRH':
        return 'Currently Rated Helpful';
      case 'CRNH':
        return 'Not Rated Helpful';
      case 'NMR':
        return 'Needs More Ratings';
      default:
        return status;
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'CRH':
        return 'text-green-600 dark:text-green-400';
      case 'CRNH':
        return 'text-red-500 dark:text-red-400';
      default:
        return 'text-gray-500 dark:text-gray-400';
    }
  };

  const labelStatusBadge = (labelStatus: string) => {
    switch (labelStatus) {
      case 'annotation':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            Published
          </span>
        );
      case 'proposed-annotation':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
            Proposed
          </span>
        );
      case 'negated':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
            Negated
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div ref={containerRef} className="mt-3 space-y-2">
      {notes.map((note) => (
        <div
          key={note.id}
          className="p-3 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-200 dark:border-amber-800/50"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                {note.targetType === 'note' ? 'Dispute' : 'Community Note'}
              </span>
              {labelStatusBadge(note.labelStatus)}
            </div>
            {note.isAuthor && (
              <button
                onClick={() => handleDelete(note.id)}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                title="Delete your note"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>

          {/* Note content */}
          <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
            {note.summary}
          </p>

          {/* Reason tags */}
          {note.reasons && note.reasons.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {note.reasons.map((reason) => (
                <span
                  key={reason}
                  className="inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                >
                  {OCN_PROPOSAL_REASON_LABELS[reason as keyof typeof OCN_PROPOSAL_REASON_LABELS] ?? reason}
                </span>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500 dark:text-gray-400">
                {note.ratingCount} rating{note.ratingCount !== 1 ? 's' : ''}
              </span>
              <span className={statusColor(note.status)}>
                {statusLabel(note.status)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Dispute button — only show for non-author logged-in users on regular notes */}
              {session?.did && !note.isAuthor && note.targetType === 'post' && (
                <button
                  onClick={() => setDisputingNoteId(disputingNoteId === note.id ? null : note.id)}
                  className="px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                >
                  Dispute
                </button>
              )}

              {/* Rating buttons — only show if logged in and not the author */}
              {session?.did && !note.isAuthor && (
                <CommunityNoteRating
                  noteId={note.id}
                  userRating={note.userRating}
                  onRate={handleRate}
                />
              )}
            </div>
          </div>

          {/* Inline dispute form */}
          {disputingNoteId === note.id && (
            <CommunityNoteDispute
              targetNoteId={note.id}
              targetNoteSummary={note.summary}
              onClose={() => setDisputingNoteId(null)}
              onSubmitted={() => {
                setDisputingNoteId(null);
                fetchNotes();
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
