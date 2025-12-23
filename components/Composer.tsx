'use client';

import { useState } from 'react';
import { createPost } from '@/lib/bluesky';

interface ComposerProps {
  onPost?: () => void;
}

export default function Composer({ onPost }: ComposerProps) {
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoThreadgate, setAutoThreadgate] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || posting) return;

    try {
      setPosting(true);
      setError(null);
      await createPost(text, autoThreadgate);
      setText('');
      onPost?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post');
    } finally {
      setPosting(false);
    }
  };

  const charCount = text.length;
  const maxChars = 300;
  const isOverLimit = charCount > maxChars;

  return (
    <form onSubmit={handleSubmit} className="border-b border-gray-200 dark:border-gray-800 p-4">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What's happening?"
        className="w-full min-h-[100px] p-3 bg-transparent border border-gray-200 dark:border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
        disabled={posting}
      />

      {error && (
        <p className="mt-2 text-sm text-red-500">{error}</p>
      )}

      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-3">
          {/* Auto-threadgate toggle */}
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoThreadgate}
              onChange={(e) => setAutoThreadgate(e.target.checked)}
              className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
            />
            <span>Limit replies (following only)</span>
          </label>
        </div>

        <div className="flex items-center gap-3">
          {/* Character count */}
          <span className={`text-sm ${isOverLimit ? 'text-red-500' : 'text-gray-500'}`}>
            {charCount}/{maxChars}
          </span>

          {/* Post button */}
          <button
            type="submit"
            disabled={!text.trim() || posting || isOverLimit}
            className="px-4 py-2 bg-blue-500 text-white font-semibold rounded-full hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {posting ? 'Posting...' : 'Post'}
          </button>
        </div>
      </div>

      {autoThreadgate && (
        <p className="mt-2 text-xs text-gray-500">
          Threadgate enabled: Only accounts you follow can reply
        </p>
      )}
    </form>
  );
}
