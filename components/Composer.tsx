'use client';

import { useState } from 'react';
import { createPost } from '@/lib/bluesky';
import { useSettings } from '@/lib/settings';

interface ComposerProps {
  onPost?: () => void;
}

type ReplyRestriction = 'open' | 'following' | 'researchers';

const REPLY_OPTIONS: { value: ReplyRestriction; label: string; icon: string }[] = [
  { value: 'open', label: 'Anyone', icon: '🌐' },
  { value: 'following', label: 'Following', icon: '👥' },
  { value: 'researchers', label: 'Researchers', icon: '🔬' },
];

export default function Composer({ onPost }: ComposerProps) {
  const { settings, updateSettings } = useSettings();
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReplyMenu, setShowReplyMenu] = useState(false);

  // Get current restriction - if autoThreadgate is off, treat as 'open'
  const currentRestriction: ReplyRestriction = settings.autoThreadgate
    ? (settings.threadgateType as ReplyRestriction)
    : 'open';

  const handleRestrictionChange = (value: ReplyRestriction) => {
    if (value === 'open') {
      updateSettings({ autoThreadgate: false, threadgateType: 'following' });
    } else {
      updateSettings({ autoThreadgate: true, threadgateType: value });
    }
    setShowReplyMenu(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || posting) return;

    try {
      setPosting(true);
      setError(null);
      await createPost(text, currentRestriction);
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

  const currentOption = REPLY_OPTIONS.find(o => o.value === currentRestriction) || REPLY_OPTIONS[0];

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
          {/* Reply restriction selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowReplyMenu(!showReplyMenu)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border transition-colors ${
                currentRestriction === 'open'
                  ? 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  : 'border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30'
              }`}
            >
              <span>{currentOption.icon}</span>
              <span>{currentOption.label} can reply</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showReplyMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowReplyMenu(false)}
                />
                <div className="absolute left-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-20 min-w-[180px]">
                  {REPLY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleRestrictionChange(option.value)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 ${
                        currentRestriction === option.value
                          ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                          : 'text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <span>{option.icon}</span>
                      <span>{option.label}</span>
                      {currentRestriction === option.value && (
                        <svg className="w-4 h-4 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
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
    </form>
  );
}
