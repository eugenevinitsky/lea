'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPost, searchActors, ReplyRef } from '@/lib/bluesky';
import { useSettings } from '@/lib/settings';
import EmojiPicker from './EmojiPicker';

interface ComposerProps {
  onPost?: () => void;
}

interface MentionSuggestion {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

type ReplyRestriction = 'open' | 'following' | 'researchers';

const REPLY_OPTIONS: { value: ReplyRestriction; label: string; icon: string }[] = [
  { value: 'open', label: 'Anyone', icon: '🌐' },
  { value: 'following', label: 'Following', icon: '👥' },
  { value: 'researchers', label: 'Researchers', icon: '🔬' },
];

export default function Composer({ onPost }: ComposerProps) {
  const { settings, updateSettings } = useSettings();
  // Thread posts - array of post texts
  const [threadPosts, setThreadPosts] = useState<string[]>(['']);
  const [posting, setPosting] = useState(false);
  const [postingProgress, setPostingProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [showReplyMenu, setShowReplyMenu] = useState(false);
  const [disableQuotes, setDisableQuotes] = useState(false);

  // Track which textarea is focused for mention autocomplete
  const [focusedIndex, setFocusedIndex] = useState<number>(0);

  // Mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number>(0);
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const textareaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Thread management functions
  const addThreadPost = () => {
    setThreadPosts([...threadPosts, '']);
    // Focus the new textarea after render
    setTimeout(() => {
      const newIndex = threadPosts.length;
      textareaRefs.current[newIndex]?.focus();
    }, 0);
  };

  const removeThreadPost = (index: number) => {
    if (index === 0 || threadPosts.length <= 1) return;
    setThreadPosts(threadPosts.filter((_, i) => i !== index));
  };

  const updateThreadPost = (index: number, text: string) => {
    const newPosts = [...threadPosts];
    newPosts[index] = text;
    setThreadPosts(newPosts);
  };

  // Search for mentions when query changes
  useEffect(() => {
    if (!mentionQuery || mentionQuery.length < 1) {
      setSuggestions([]);
      return;
    }

    const searchMentions = async () => {
      setLoadingSuggestions(true);
      try {
        const results = await searchActors(mentionQuery, 6);
        setSuggestions(results);
        setSelectedIndex(0);
      } catch (err) {
        console.error('Failed to search mentions:', err);
      } finally {
        setLoadingSuggestions(false);
      }
    };

    const debounce = setTimeout(searchMentions, 150);
    return () => clearTimeout(debounce);
  }, [mentionQuery]);

  // Detect @ mentions while typing
  const handleTextChange = (index: number, e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    const cursorPos = e.target.selectionStart;
    updateThreadPost(index, newText);

    // Find @ mention at cursor
    const textBeforeCursor = newText.slice(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);

    if (mentionMatch) {
      setMentionQuery(mentionMatch[1]);
      setMentionStart(cursorPos - mentionMatch[0].length);
    } else {
      setMentionQuery(null);
      setSuggestions([]);
    }
  };

  // Insert selected mention
  const insertMention = useCallback((handle: string) => {
    const currentText = threadPosts[focusedIndex] || '';
    const beforeMention = currentText.slice(0, mentionStart);
    const afterMention = currentText.slice(mentionStart + (mentionQuery?.length || 0) + 1);
    const newText = `${beforeMention}@${handle} ${afterMention}`;
    updateThreadPost(focusedIndex, newText);
    setMentionQuery(null);
    setSuggestions([]);

    // Focus back on textarea
    setTimeout(() => {
      const textarea = textareaRefs.current[focusedIndex];
      if (textarea) {
        const newCursorPos = mentionStart + handle.length + 2;
        textarea.focus();
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  }, [threadPosts, focusedIndex, mentionStart, mentionQuery]);

  // Insert emoji at cursor position
  const insertEmoji = useCallback((emoji: string) => {
    const textarea = textareaRefs.current[focusedIndex];
    if (!textarea) return;

    const currentText = threadPosts[focusedIndex] || '';
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newText = currentText.slice(0, start) + emoji + currentText.slice(end);
    updateThreadPost(focusedIndex, newText);

    // Set cursor position after emoji
    setTimeout(() => {
      textarea.focus();
      const newPos = start + emoji.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  }, [threadPosts, focusedIndex]);

  // Handle keyboard navigation in suggestions
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' && suggestions.length > 0) {
      e.preventDefault();
      insertMention(suggestions[selectedIndex].handle);
    } else if (e.key === 'Escape') {
      setMentionQuery(null);
      setSuggestions([]);
    }
  };

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
    const validPosts = threadPosts.filter(p => p.trim());
    if (validPosts.length === 0 || posting) return;

    try {
      setPosting(true);
      setPostingProgress(0);
      setError(null);

      // Post first item
      const firstResult = await createPost(
        validPosts[0],
        currentRestriction,
        undefined,
        undefined,
        disableQuotes
      );
      setPostingProgress(1);

      let previousPost = firstResult;
      const rootPost = firstResult;

      // Post remaining items as replies in thread
      for (let i = 1; i < validPosts.length; i++) {
        const replyRef: ReplyRef = {
          root: { uri: rootPost.uri, cid: rootPost.cid },
          parent: { uri: previousPost.uri, cid: previousPost.cid },
        };

        previousPost = await createPost(
          validPosts[i],
          currentRestriction,
          replyRef,
          undefined,
          false // Only disable quotes on first post
        );
        setPostingProgress(i + 1);
      }

      setThreadPosts(['']);
      setDisableQuotes(false);
      setPostingProgress(0);
      onPost?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post thread');
    } finally {
      setPosting(false);
    }
  };

  const maxChars = 300;
  // Check if any post is over limit
  const isAnyOverLimit = threadPosts.some(post => post.length > maxChars);
  // Check if all posts are empty
  const hasContent = threadPosts.some(post => post.trim().length > 0);
  const isThread = threadPosts.length > 1;

  const currentOption = REPLY_OPTIONS.find(o => o.value === currentRestriction) || REPLY_OPTIONS[0];

  return (
    <form onSubmit={handleSubmit} className="border-b border-gray-200 dark:border-gray-800 p-4">
      {/* Thread posts */}
      {threadPosts.map((postText, index) => (
        <div key={index} className="relative">
          {/* Connector line for thread posts after the first */}
          {index > 0 && (
            <div className="absolute left-6 -top-2 w-0.5 h-4 bg-gray-300 dark:bg-gray-600" />
          )}

          <div className="relative flex gap-2">
            {/* Thread indicator dot */}
            {isThread && (
              <div className="flex flex-col items-center pt-4">
                <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white dark:border-gray-900" />
                {index < threadPosts.length - 1 && (
                  <div className="flex-1 w-0.5 bg-gray-300 dark:bg-gray-600 mt-1" />
                )}
              </div>
            )}

            <div className="flex-1 relative">
              <textarea
                ref={(el) => { textareaRefs.current[index] = el; }}
                value={postText}
                onChange={(e) => handleTextChange(index, e)}
                onKeyDown={handleKeyDown}
                onFocus={() => setFocusedIndex(index)}
                placeholder={index === 0 ? "What's happening?" : "Continue thread..."}
                className="w-full min-h-[80px] p-3 bg-transparent border border-gray-200 dark:border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                disabled={posting}
              />

              {/* Character count and delete button for this post */}
              <div className="absolute bottom-2 right-2 flex items-center gap-2">
                <span className={`text-xs ${postText.length > maxChars ? 'text-red-500' : 'text-gray-400'}`}>
                  {postText.length}/{maxChars}
                </span>
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => removeThreadPost(index)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                    disabled={posting}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Mention suggestions dropdown - only show for focused textarea */}
              {suggestions.length > 0 && focusedIndex === index && (
                <div
                  ref={suggestionsRef}
                  className="absolute left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 max-h-[240px] overflow-y-auto"
                >
                  {suggestions.map((user, suggestionIndex) => (
                    <button
                      key={user.did}
                      type="button"
                      onClick={() => insertMention(user.handle)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 ${
                        suggestionIndex === selectedIndex ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                      }`}
                    >
                      {user.avatar ? (
                        <img src={user.avatar} alt="" className="w-8 h-8 rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold">
                          {(user.displayName || user.handle)[0].toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {user.displayName || user.handle}
                        </div>
                        <div className="text-xs text-gray-500 truncate">@{user.handle}</div>
                      </div>
                    </button>
                  ))}
                  {loadingSuggestions && (
                    <div className="px-3 py-2 text-xs text-gray-400 text-center">Searching...</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {index < threadPosts.length - 1 && <div className="h-2" />}
        </div>
      ))}

      {/* Add to thread button */}
      <button
        type="button"
        onClick={addThreadPost}
        disabled={posting}
        className="mt-2 flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-600 disabled:opacity-50"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add to thread
      </button>

      {error && (
        <p className="mt-2 text-sm text-red-500">{error}</p>
      )}

      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-3">
          {/* Emoji picker */}
          <EmojiPicker onSelect={insertEmoji} />

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

          {/* Disable quotes checkbox */}
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={disableQuotes}
              onChange={(e) => setDisableQuotes(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">No quotes</span>
          </label>
        </div>

        <div className="flex items-center gap-3">
          {/* Post button */}
          <button
            type="submit"
            disabled={!hasContent || posting || isAnyOverLimit}
            className="px-4 py-2 bg-blue-500 text-white font-semibold rounded-full hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {posting
              ? isThread
                ? `Posting ${postingProgress}/${threadPosts.filter(p => p.trim()).length}...`
                : 'Posting...'
              : isThread
                ? `Post thread (${threadPosts.filter(p => p.trim()).length})`
                : 'Post'}
          </button>
        </div>
      </div>
    </form>
  );
}
