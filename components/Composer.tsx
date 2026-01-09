'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPost, searchActors, ReplyRef, uploadImage, fetchLinkCard, extractUrlFromText, ExternalEmbed, ReplyRule, ReplyRestriction } from '@/lib/bluesky';
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

interface ImageAttachment {
  file: File;
  preview: string;
  alt: string;
}

const MAX_IMAGES = 4;
const MAX_IMAGE_SIZE = 1000000; // 1MB limit per image

interface ReplyOption {
  value: 'open' | 'nobody' | ReplyRule;
  label: string;
  exclusive?: boolean; // If true, selecting this deselects all others
}

const REPLY_OPTIONS: ReplyOption[] = [
  { value: 'open', label: 'Anyone', exclusive: true },
  { value: 'nobody', label: 'No one', exclusive: true },
  { value: 'followers', label: 'Followers' },
  { value: 'following', label: 'Following' },
  { value: 'researchers', label: 'Researchers' },
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Image attachments state - one array per thread post
  const [threadImages, setThreadImages] = useState<ImageAttachment[][]>([[]]);
  const [editingAltIndex, setEditingAltIndex] = useState<{ postIndex: number; imageIndex: number } | null>(null);

  // Link preview state - one per thread post
  const [threadLinkPreviews, setThreadLinkPreviews] = useState<(ExternalEmbed | null)[]>([null]);
  const [loadingLinkPreview, setLoadingLinkPreview] = useState<number | null>(null);
  const [lastCheckedUrls, setLastCheckedUrls] = useState<string[]>(['']);

  // Thread management functions
  const addThreadPost = () => {
    setThreadPosts([...threadPosts, '']);
    setThreadImages([...threadImages, []]);
    setThreadLinkPreviews([...threadLinkPreviews, null]);
    setLastCheckedUrls([...lastCheckedUrls, '']);
    // Focus the new textarea after render
    setTimeout(() => {
      const newIndex = threadPosts.length;
      textareaRefs.current[newIndex]?.focus();
    }, 0);
  };

  const removeThreadPost = (index: number) => {
    if (index === 0 || threadPosts.length <= 1) return;
    // Revoke object URLs for removed images
    threadImages[index]?.forEach(img => URL.revokeObjectURL(img.preview));
    setThreadPosts(threadPosts.filter((_, i) => i !== index));
    setThreadImages(threadImages.filter((_, i) => i !== index));
    setThreadLinkPreviews(threadLinkPreviews.filter((_, i) => i !== index));
    setLastCheckedUrls(lastCheckedUrls.filter((_, i) => i !== index));
  };

  const removeLinkPreview = (index: number) => {
    const updated = [...threadLinkPreviews];
    updated[index] = null;
    setThreadLinkPreviews(updated);
  };

  const updateThreadPost = (index: number, text: string) => {
    const newPosts = [...threadPosts];
    newPosts[index] = text;
    setThreadPosts(newPosts);
  };

  // Image management functions
  const addImages = useCallback((postIndex: number, files: File[]) => {
    const currentImages = threadImages[postIndex] || [];
    const availableSlots = MAX_IMAGES - currentImages.length;

    if (availableSlots <= 0) {
      setError(`Maximum ${MAX_IMAGES} images allowed per post`);
      return;
    }

    const filesToAdd = files.slice(0, availableSlots);
    const newImages: ImageAttachment[] = [];

    for (const file of filesToAdd) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Only image files are allowed');
        continue;
      }

      // Validate file size
      if (file.size > MAX_IMAGE_SIZE) {
        setError(`Image too large. Maximum size is ${MAX_IMAGE_SIZE / 1000000}MB`);
        continue;
      }

      newImages.push({
        file,
        preview: URL.createObjectURL(file),
        alt: '',
      });
    }

    if (newImages.length > 0) {
      const updated = [...threadImages];
      updated[postIndex] = [...currentImages, ...newImages];
      setThreadImages(updated);
      setError(null);
    }
  }, [threadImages]);

  const removeImage = useCallback((postIndex: number, imageIndex: number) => {
    const updated = [...threadImages];
    const removed = updated[postIndex][imageIndex];
    URL.revokeObjectURL(removed.preview);
    updated[postIndex] = updated[postIndex].filter((_, i) => i !== imageIndex);
    setThreadImages(updated);
    setEditingAltIndex(null);
  }, [threadImages]);

  const updateImageAlt = useCallback((postIndex: number, imageIndex: number, alt: string) => {
    const updated = [...threadImages];
    updated[postIndex] = updated[postIndex].map((img, i) =>
      i === imageIndex ? { ...img, alt } : img
    );
    setThreadImages(updated);
  }, [threadImages]);

  // Handle paste for images
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>, postIndex: number) => {
    const items = e.clipboardData.items;
    const imageFiles: File[] = [];

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          imageFiles.push(file);
        }
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      addImages(postIndex, imageFiles);
    }
  }, [addImages]);

  // Handle file input change
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      addImages(focusedIndex, files);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  }, [addImages, focusedIndex]);

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

  // Detect URLs and fetch link previews
  useEffect(() => {
    const checkForLinks = async () => {
      for (let i = 0; i < threadPosts.length; i++) {
        const text = threadPosts[i];
        const url = extractUrlFromText(text);
        const hasImages = (threadImages[i]?.length || 0) > 0;

        // Skip if there are images (images take precedence over link cards)
        if (hasImages) {
          if (threadLinkPreviews[i]) {
            const updated = [...threadLinkPreviews];
            updated[i] = null;
            setThreadLinkPreviews(updated);
          }
          continue;
        }

        // Skip if URL hasn't changed
        if (url === lastCheckedUrls[i]) continue;

        // Update last checked URL
        const updatedLastUrls = [...lastCheckedUrls];
        updatedLastUrls[i] = url || '';
        setLastCheckedUrls(updatedLastUrls);

        // If no URL, clear preview
        if (!url) {
          if (threadLinkPreviews[i]) {
            const updated = [...threadLinkPreviews];
            updated[i] = null;
            setThreadLinkPreviews(updated);
          }
          continue;
        }

        // Fetch link preview
        setLoadingLinkPreview(i);
        try {
          const preview = await fetchLinkCard(url);
          const updated = [...threadLinkPreviews];
          updated[i] = preview;
          setThreadLinkPreviews(updated);
        } catch (e) {
          console.error('Failed to fetch link preview:', e);
        } finally {
          setLoadingLinkPreview(null);
        }
      }
    };

    const debounce = setTimeout(checkForLinks, 500);
    return () => clearTimeout(debounce);
  }, [threadPosts, threadImages, lastCheckedUrls, threadLinkPreviews]);

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

  // Local state for reply restriction (supports multi-select)
  const [replyRestriction, setReplyRestriction] = useState<ReplyRestriction>(() => {
    // Initialize from settings
    if (!settings.autoThreadgate) return 'open';
    const type = settings.threadgateType;
    if (type === 'following') return ['following'];
    if (type === 'researchers') return ['researchers'];
    return 'open';
  });

  const handleRestrictionToggle = (value: 'open' | 'nobody' | ReplyRule) => {
    if (value === 'open' || value === 'nobody') {
      // Exclusive options - set directly
      setReplyRestriction(value);
    } else {
      // Combinable options - toggle in array
      if (replyRestriction === 'open' || replyRestriction === 'nobody') {
        // Switch from exclusive to multi-select
        setReplyRestriction([value]);
      } else {
        // Toggle in existing array
        const current = replyRestriction as ReplyRule[];
        if (current.includes(value)) {
          // Remove - if last one, switch to 'open'
          const newRules = current.filter(r => r !== value);
          setReplyRestriction(newRules.length === 0 ? 'open' : newRules);
        } else {
          // Add
          setReplyRestriction([...current, value]);
        }
      }
    }
  };

  // Check if an option is selected
  const isOptionSelected = (value: 'open' | 'nobody' | ReplyRule): boolean => {
    if (value === 'open') return replyRestriction === 'open';
    if (value === 'nobody') return replyRestriction === 'nobody';
    if (replyRestriction === 'open' || replyRestriction === 'nobody') return false;
    return (replyRestriction as ReplyRule[]).includes(value);
  };

  // Get display label for current restriction
  const getRestrictionLabel = (): string => {
    if (replyRestriction === 'open') return 'Anyone';
    if (replyRestriction === 'nobody') return 'No One';
    return 'Limited';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Check which posts have content (text, images, or link previews)
    const postsWithContent = threadPosts.map((text, i) => ({
      text,
      images: threadImages[i] || [],
      linkPreview: threadLinkPreviews[i],
      hasContent: text.trim().length > 0 || (threadImages[i]?.length || 0) > 0,
    })).filter(p => p.hasContent);

    if (postsWithContent.length === 0 || posting) return;

    try {
      setPosting(true);
      setPostingProgress(0);
      setError(null);

      // Upload images for first post
      const firstPostImages = postsWithContent[0].images;
      const firstUploadedImages = await Promise.all(
        firstPostImages.map(async (img) => {
          const uploaded = await uploadImage(img.file);
          return { blob: uploaded.blob, alt: img.alt };
        })
      );

      // Post first item (only pass link preview if no images, since images take precedence)
      const firstLinkPreview = firstUploadedImages.length === 0 ? postsWithContent[0].linkPreview : null;
      const firstResult = await createPost(
        postsWithContent[0].text,
        replyRestriction,
        undefined,
        undefined,
        disableQuotes,
        firstUploadedImages.length > 0 ? firstUploadedImages : undefined,
        firstLinkPreview || undefined
      );
      setPostingProgress(1);

      let previousPost = firstResult;
      const rootPost = firstResult;

      // Post remaining items as replies in thread
      for (let i = 1; i < postsWithContent.length; i++) {
        // Upload images for this post
        const postImages = postsWithContent[i].images;
        const uploadedImages = await Promise.all(
          postImages.map(async (img) => {
            const uploaded = await uploadImage(img.file);
            return { blob: uploaded.blob, alt: img.alt };
          })
        );

        const replyRef: ReplyRef = {
          root: { uri: rootPost.uri, cid: rootPost.cid },
          parent: { uri: previousPost.uri, cid: previousPost.cid },
        };

        // Only pass link preview if no images for this post
        const postLinkPreview = uploadedImages.length === 0 ? postsWithContent[i].linkPreview : null;
        previousPost = await createPost(
          postsWithContent[i].text,
          replyRestriction,
          replyRef,
          undefined,
          false, // Only disable quotes on first post
          uploadedImages.length > 0 ? uploadedImages : undefined,
          postLinkPreview || undefined
        );
        setPostingProgress(i + 1);
      }

      // Clean up image previews
      threadImages.forEach(imgs => imgs.forEach(img => URL.revokeObjectURL(img.preview)));

      setThreadPosts(['']);
      setThreadImages([[]]);
      setThreadLinkPreviews([null]);
      setLastCheckedUrls(['']);
      setDisableQuotes(false);
      setPostingProgress(0);
      onPost?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post thread');
    } finally {
      setPosting(false);
    }
  };

  const blueskyLimit = 300;
  const leaExtendedLimit = 10000; // Allow much longer posts on Lea
  // Check if any post is over the extended limit
  const isAnyOverLimit = threadPosts.some(post => post.length > leaExtendedLimit);
  // Check which posts will use extended mode
  const willUseExtended = threadPosts.map(post => post.length > blueskyLimit);
  // Check if all posts are empty (no text and no images)
  const hasContent = threadPosts.some((post, i) => post.trim().length > 0 || (threadImages[i]?.length || 0) > 0);
  const isThread = threadPosts.length > 1;

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
                onPaste={(e) => handlePaste(e, index)}
                placeholder={index === 0 ? "What's happening?" : "Continue thread..."}
                className="w-full min-h-[80px] p-3 bg-transparent border border-gray-200 dark:border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                disabled={posting}
              />

              {/* Character count and delete button for this post */}
              <div className="absolute bottom-2 right-2 flex items-center gap-2">
                {willUseExtended[index] && postText.length <= leaExtendedLimit && (
                  <span className="text-xs text-amber-500 font-medium" title="This post will use Lea extended format (only visible on Lea)">
                    Extended
                  </span>
                )}
                <span className={`text-xs ${
                  postText.length > leaExtendedLimit
                    ? 'text-red-500'
                    : willUseExtended[index]
                      ? 'text-amber-500'
                      : 'text-gray-400'
                }`}>
                  {postText.length}/{willUseExtended[index] ? leaExtendedLimit : blueskyLimit}
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

              {/* Image previews */}
              {threadImages[index]?.length > 0 && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {threadImages[index].map((img, imgIndex) => (
                    <div key={imgIndex} className="relative group">
                      <img
                        src={img.preview}
                        alt={img.alt || 'Attached image'}
                        className="w-full h-32 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                      />
                      {/* Remove button */}
                      <button
                        type="button"
                        onClick={() => removeImage(index, imgIndex)}
                        className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-black/80 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                      {/* Alt text button/indicator */}
                      <button
                        type="button"
                        onClick={() => setEditingAltIndex({ postIndex: index, imageIndex: imgIndex })}
                        className={`absolute bottom-1 left-1 px-2 py-0.5 text-xs rounded ${
                          img.alt
                            ? 'bg-blue-500 text-white'
                            : 'bg-black/60 text-white hover:bg-black/80'
                        }`}
                      >
                        {img.alt ? 'ALT' : '+ ALT'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Alt text editor modal */}
              {editingAltIndex?.postIndex === index && (
                <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Alt text (image description)
                    </label>
                    <button
                      type="button"
                      onClick={() => setEditingAltIndex(null)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <textarea
                    value={threadImages[index][editingAltIndex.imageIndex]?.alt || ''}
                    onChange={(e) => updateImageAlt(index, editingAltIndex.imageIndex, e.target.value)}
                    placeholder="Describe this image for people who use screen readers..."
                    className="w-full p-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                    rows={3}
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setEditingAltIndex(null)}
                      className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}

              {/* Link preview card */}
              {loadingLinkPreview === index && (
                <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Loading link preview...
                  </div>
                </div>
              )}
              {threadLinkPreviews[index] && !loadingLinkPreview && (
                <div className="mt-2 relative group">
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {threadLinkPreviews[index]?.title}
                    </div>
                    {threadLinkPreviews[index]?.description && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                        {threadLinkPreviews[index]?.description}
                      </div>
                    )}
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 truncate">
                      {threadLinkPreviews[index]?.uri}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLinkPreview(index)}
                    className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-black/80 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove link preview"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}

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

      {/* Hidden file input for image upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-3">
          {/* Image upload button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={posting || (threadImages[focusedIndex]?.length || 0) >= MAX_IMAGES}
            className="p-2 text-gray-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Add image"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>

          {/* Emoji picker */}
          <EmojiPicker onSelect={insertEmoji} />

          {/* Reply restriction selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowReplyMenu(!showReplyMenu)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border transition-colors ${
                replyRestriction === 'open'
                  ? 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  : 'border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30'
              }`}
            >
              <span>
                {replyRestriction === 'open' ? 'Anyone can reply' 
                  : replyRestriction === 'nobody' ? 'No one can reply' 
                  : 'Limited replies'}
              </span>
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
                <div className="absolute left-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-20 min-w-[200px]">
                  {REPLY_OPTIONS.map((option) => {
                    const isSelected = isOptionSelected(option.value);
                    const isExclusive = option.exclusive;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleRestrictionToggle(option.value)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 ${
                          isSelected
                            ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                            : 'text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {/* Checkbox or radio indicator */}
                        <span className={`flex-shrink-0 w-4 h-4 rounded ${
                          isExclusive ? 'rounded-full' : 'rounded'
                        } border-2 flex items-center justify-center ${
                          isSelected
                            ? 'border-blue-500 bg-blue-500'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}>
                          {isSelected && (
                            <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </span>
                        <span className="flex-1">{option.label}</span>
                      </button>
                    );
                  })}
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
