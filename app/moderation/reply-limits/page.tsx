'use client';

import { useState, useEffect } from 'react';
import { getUserPostsForThreadgate, updateThreadgate, ThreadgateType } from '@/lib/bluesky';
import { useSettings } from '@/lib/settings';

export default function ReplyLimitsPage() {
  const { settings, updateSettings } = useSettings();

  // Reply limits state
  const [replyLimit, setReplyLimit] = useState<ThreadgateType>('following');
  const [applyingTo, setApplyingTo] = useState<'future' | 'past' | 'both' | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState<string | null>(null);

  // Load saved preference on mount
  useEffect(() => {
    const saved = localStorage.getItem('lea-default-threadgate');
    if (saved && ['following', 'verified', 'researchers', 'open'].includes(saved)) {
      setReplyLimit(saved as ThreadgateType);
    }
  }, []);

  const handleReplyLimitChange = (newLimit: ThreadgateType) => {
    setReplyLimit(newLimit);
    setApplyError(null);
    setApplySuccess(null);
  };

  const applyToFuture = async () => {
    setApplyingTo('future');
    setApplyError(null);
    setApplySuccess(null);
    try {
      localStorage.setItem('lea-default-threadgate', replyLimit);
      setApplySuccess('Default saved for future posts');
    } catch {
      setApplyError('Failed to save preference');
    } finally {
      setApplyingTo(null);
    }
  };

  const applyToPast = async () => {
    setApplyingTo('past');
    setApplyError(null);
    setApplySuccess(null);
    setProgress({ current: 0, total: 0 });
    
    try {
      const result = await getUserPostsForThreadgate();
      const posts = result.posts;
      setProgress({ current: 0, total: posts.length });
      
      let completed = 0;
      for (const post of posts) {
        await updateThreadgate(post.uri, replyLimit);
        completed++;
        setProgress({ current: completed, total: posts.length });
      }
      
      setApplySuccess(`Updated ${posts.length} posts`);
    } catch (err) {
      console.error('Failed to apply threadgate:', err);
      setApplyError('Failed to update some posts');
    } finally {
      setApplyingTo(null);
      setProgress(null);
    }
  };

  const applyToBoth = async () => {
    setApplyingTo('both');
    setApplyError(null);
    setApplySuccess(null);
    
    try {
      localStorage.setItem('lea-default-threadgate', replyLimit);
      
      setProgress({ current: 0, total: 0 });
      const result = await getUserPostsForThreadgate();
      const posts = result.posts;
      setProgress({ current: 0, total: posts.length });
      
      let completed = 0;
      for (const post of posts) {
        await updateThreadgate(post.uri, replyLimit);
        completed++;
        setProgress({ current: completed, total: posts.length });
      }
      
      setApplySuccess(`Saved default and updated ${posts.length} posts`);
    } catch (err) {
      console.error('Failed to apply threadgate:', err);
      setApplyError('Failed to update some posts');
    } finally {
      setApplyingTo(null);
      setProgress(null);
    }
  };

  return (
    <>
      {/* Header with back button */}
      <div className="sticky top-14 z-10 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 p-4">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => window.history.back()}
            className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
            title="Back"
          >
            <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Reply Limits</h2>
          </div>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Control who can reply to your posts. You can set a default for future posts and apply limits to your existing posts.
        </p>
      </div>

      {/* Content */}
      <div className="p-4 space-y-6">
        {/* Auto-apply toggle */}
        <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <label className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-100">Auto-apply to new posts</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Automatically apply your chosen limit when you post</p>
            </div>
            <input
              type="checkbox"
              checked={settings.autoThreadgate}
              onChange={(e) => updateSettings({ autoThreadgate: e.target.checked })}
              className="w-5 h-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
            />
          </label>
        </div>

        {/* Reply limit options */}
        <div className="space-y-3">
          <h3 className="font-medium text-gray-900 dark:text-gray-100">Who can reply?</h3>
          
          <div className="space-y-2">
            {[
              { value: 'following', label: 'People I follow', description: 'Only accounts you follow can reply' },
              { value: 'researchers', label: 'Verified researchers only', description: 'Only verified researchers can reply' },
              { value: 'open', label: 'Everyone', description: 'Anyone can reply to your posts' },
            ].map((option) => (
              <label
                key={option.value}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  replyLimit === option.value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <input
                  type="radio"
                  name="replyLimit"
                  value={option.value}
                  checked={replyLimit === option.value}
                  onChange={(e) => handleReplyLimitChange(e.target.value as ThreadgateType)}
                  className="mt-1 w-4 h-4 text-blue-500 focus:ring-blue-500"
                />
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{option.label}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{option.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="space-y-3">
          <h3 className="font-medium text-gray-900 dark:text-gray-100">Apply settings</h3>
          
          <button
            onClick={applyToFuture}
            disabled={applyingTo !== null}
            className="w-full px-4 py-2.5 text-sm font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            Set as default for future posts
          </button>
          
          <button
            onClick={applyToPast}
            disabled={applyingTo !== null}
            className="w-full px-4 py-2.5 text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {applyingTo === 'past' ? 'Applying...' : 'Apply to all past posts'}
          </button>
          
          <button
            onClick={applyToBoth}
            disabled={applyingTo !== null}
            className="w-full px-4 py-2.5 text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            Apply to all (future + past)
          </button>
        </div>

        {/* Progress indicator */}
        {progress && (
          <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
              <span>Updating posts...</span>
              <span>{progress.current} / {progress.total}</span>
            </div>
            <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Success/Error messages */}
        {applySuccess && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
            <p className="text-sm text-emerald-700 dark:text-emerald-300">{applySuccess}</p>
          </div>
        )}
        {applyError && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-300">{applyError}</p>
          </div>
        )}
      </div>
    </>
  );
}
