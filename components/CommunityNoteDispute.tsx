'use client';

import { useState } from 'react';
import {
  OCN_PROPOSAL_REASONS,
  OCN_PROPOSAL_REASON_LABELS,
  MAX_COMMUNITY_NOTE_LENGTH,
  type OcnProposalReason,
} from '@/lib/constants';

interface CommunityNoteDisputeProps {
  targetNoteId: string;
  targetNoteSummary: string;
  onClose: () => void;
  onSubmitted: () => void;
}

export default function CommunityNoteDispute({
  targetNoteId,
  targetNoteSummary,
  onClose,
  onSubmitted,
}: CommunityNoteDisputeProps) {
  const [summary, setSummary] = useState('');
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleReason = (reason: string) => {
    setSelectedReasons((prev) =>
      prev.includes(reason)
        ? prev.filter((r) => r !== reason)
        : [...prev, reason]
    );
  };

  const handleSubmit = async () => {
    if (!summary.trim() || selectedReasons.length === 0 || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/community-notes/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'dispute',
          targetNoteId,
          summary: summary.trim(),
          reasons: selectedReasons,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to submit dispute');
      }

      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit dispute');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-800/50">
      <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
        Dispute this note
      </div>

      {/* Original note reference */}
      <div className="mb-2 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
        <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Original note
        </span>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-3">
          {targetNoteSummary}
        </p>
      </div>

      {/* Reason checkboxes */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {OCN_PROPOSAL_REASONS.map((reason) => (
          <button
            key={reason}
            onClick={() => toggleReason(reason)}
            className={`px-2 py-0.5 text-[10px] rounded-full transition-colors ${
              selectedReasons.includes(reason)
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 ring-1 ring-blue-300 dark:ring-blue-700'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {OCN_PROPOSAL_REASON_LABELS[reason as OcnProposalReason]}
          </button>
        ))}
      </div>

      {/* Summary textarea */}
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value.slice(0, MAX_COMMUNITY_NOTE_LENGTH))}
        placeholder="Explain why this note is incorrect or misleading..."
        className="w-full p-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
        rows={3}
        disabled={submitting}
      />

      {/* Footer */}
      <div className="flex justify-between items-center mt-1.5">
        <span className={`text-xs ${summary.length >= MAX_COMMUNITY_NOTE_LENGTH ? 'text-red-500' : 'text-gray-400'}`}>
          {summary.length}/{MAX_COMMUNITY_NOTE_LENGTH}
        </span>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!summary.trim() || selectedReasons.length === 0 || submitting}
            className="px-3 py-1 text-xs bg-amber-500 text-white rounded-full hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting...' : 'Submit Dispute'}
          </button>
        </div>
      </div>

      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
