'use client';

import { useState } from 'react';
import { OCN_PROPOSAL_REASONS, OCN_PROPOSAL_REASON_LABELS, MAX_COMMUNITY_NOTE_LENGTH } from '@/lib/constants';

interface CommunityNoteFormProps {
  postUri: string;
  onClose: () => void;
  onSubmitted: () => void;
}

export default function CommunityNoteForm({
  postUri,
  onClose,
  onSubmitted,
}: CommunityNoteFormProps) {
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
          action: 'create',
          postUri,
          summary: summary.trim(),
          reasons: selectedReasons,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create note');
      }

      onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create note');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
      <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Write a Community Note
      </div>

      {/* Reasons (multi-select) */}
      <div className="flex flex-wrap gap-2 mb-3">
        {OCN_PROPOSAL_REASONS.map((reason) => (
          <button
            key={reason}
            onClick={() => toggleReason(reason)}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              selectedReasons.includes(reason)
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 ring-1 ring-blue-300 dark:ring-blue-700'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {OCN_PROPOSAL_REASON_LABELS[reason]}
          </button>
        ))}
      </div>

      {/* Summary textarea */}
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value.slice(0, MAX_COMMUNITY_NOTE_LENGTH))}
        placeholder="Add context or corrections..."
        className="w-full p-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
        rows={3}
        disabled={submitting}
      />

      {/* Footer */}
      <div className="flex justify-between items-center mt-2">
        <span className={`text-xs ${summary.length >= MAX_COMMUNITY_NOTE_LENGTH ? 'text-red-500' : 'text-gray-400'}`}>
          {summary.length}/{MAX_COMMUNITY_NOTE_LENGTH}
        </span>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!summary.trim() || selectedReasons.length === 0 || submitting}
            className="px-3 py-1 text-sm bg-blue-500 text-white rounded-full hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting...' : 'Submit Note'}
          </button>
        </div>
      </div>

      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
