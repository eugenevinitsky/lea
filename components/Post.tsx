'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AppBskyFeedDefs, AppBskyFeedPost, AppBskyEmbedExternal, AppBskyEmbedImages, AppBskyEmbedRecord, AppBskyEmbedRecordWithMedia, AppBskyEmbedVideo } from '@atproto/api';
import Hls from 'hls.js';
import Prism from 'prismjs';
// Import Prism languages
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-r';
import 'prismjs/components/prism-latex';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-yaml';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { isVerifiedResearcher, Label, createPost, ReplyRef, QuoteRef, likePost, unlikePost, repost, deleteRepost, deletePost, editPost, uploadImage, sendFeedInteraction, InteractionEvent, getSession, updateThreadgate, getThreadgateType, ThreadgateType, FEEDS, searchActors, detachQuote, buildProfileUrl, buildPostUrl } from '@/lib/bluesky';
import { useSettings } from '@/lib/settings';
import { useBookmarks, BookmarkedPost, COLLECTION_COLORS } from '@/lib/bookmarks';
import { useComposer } from '@/lib/composer-context';
import ProfileView from './ProfileView';
import ProfileEditor from './ProfileEditor';
import ProfileHoverCard from './ProfileHoverCard';
import QuotesView from './QuotesView';
import EmojiPicker from './EmojiPicker';
import LabelBadges from './LabelBadges';
import ProfileLabels from './ProfileLabels';
import PollDisplay from './PollDisplay';
import Link from 'next/link';
import type { BlueskyProfile } from '@/lib/bluesky';
import { extractPaperUrl, extractAnyUrl, getPaperIdFromUrl, PAPER_DOMAINS, LinkFacet } from '@/lib/papers';

// Reply context from feed (parent post info)
interface ReplyParent {
  author: {
    did: string;
    handle: string;
    displayName?: string;
  };
}

interface PostProps {
  post: AppBskyFeedDefs.PostView;
  feedContext?: string;
  reqId?: string;
  supportsInteractions?: boolean;
  feedUri?: string;
  // Repost reason - if present, shows "Reposted by X" header
  reason?: AppBskyFeedDefs.ReasonRepost | AppBskyFeedDefs.ReasonPin | { $type: string };
  // Reply context - if present, shows "Replying to @handle" header
  replyParent?: ReplyParent;
  // Self-thread styling props
  isInSelfThread?: boolean;
  isFirstInThread?: boolean;
  isLastInThread?: boolean;
  // Thread view styling - removes bottom border when in thread
  isInThread?: boolean;
  // Source feed attribution - shown in remix feed
  sourceFeed?: {
    uri: string;
    displayName: string;
  };
}

// Format large numbers with k/m suffix (e.g., 1071 -> "1.1k", 14838 -> "15k")
function formatCount(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) {
    // 1000-9999: show one decimal (1.1k, 9.9k)
    const k = count / 1000;
    return `${k.toFixed(1).replace(/\.0$/, '')}k`;
  }
  if (count < 1000000) {
    // 10000-999999: show no decimal (10k, 999k)
    return `${Math.round(count / 1000)}k`;
  }
  // 1000000+: show with m suffix
  const m = count / 1000000;
  return `${m.toFixed(1).replace(/\.0$/, '')}m`;
}

function containsPaperLink(text: string, embed?: AppBskyFeedDefs.PostView['embed']): { hasPaper: boolean; domain?: string } {
  // Check text for paper URLs
  for (const domain of PAPER_DOMAINS) {
    if (text.toLowerCase().includes(domain)) {
      return { hasPaper: true, domain };
    }
  }

  // Check embed for external links
  if (embed && 'external' in embed) {
    const external = embed as AppBskyEmbedExternal.View;
    const uri = external.external?.uri?.toLowerCase() || '';
    for (const domain of PAPER_DOMAINS) {
      if (uri.includes(domain)) {
        return { hasPaper: true, domain };
      }
    }
  }

  return { hasPaper: false };
}

// Extract paper URL and title from post
function extractPaperInfo(text: string, embed?: AppBskyFeedDefs.PostView['embed']): { url?: string; title?: string; doi?: string } {
  // Helper to check if a URL is a paper link
  const checkUrl = (uri: string, title?: string): { url?: string; title?: string; doi?: string } | null => {
    for (const domain of PAPER_DOMAINS) {
      if (uri.toLowerCase().includes(domain)) {
        const doi = extractDoi(uri);
        return { url: uri, title, doi };
      }
    }
    return null;
  };

  if (embed) {
    // Check direct external link embed
    if ('external' in embed) {
      const external = embed as AppBskyEmbedExternal.View;
      const uri = external.external?.uri || '';
      const result = checkUrl(uri, external.external?.title);
      if (result) return result;
    }

    // Check recordWithMedia embed (has both media and quoted record)
    if ('media' in embed) {
      const recordWithMedia = embed as AppBskyEmbedRecordWithMedia.View;
      const media = recordWithMedia.media;
      if (media && 'external' in media) {
        const external = media as AppBskyEmbedExternal.View;
        const uri = external.external?.uri || '';
        const result = checkUrl(uri, external.external?.title);
        if (result) return result;
      }
    }
  }

  // Fall back to extracting URL from text
  // First try URLs with protocol
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  const urls = text.match(urlRegex) || [];

  for (const url of urls) {
    const result = checkUrl(url);
    if (result) return result;
  }

  // Also try URLs without protocol (e.g., "arxiv.org/abs/...")
  for (const domain of PAPER_DOMAINS) {
    const domainRegex = new RegExp(`${domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\s<>"{}|\\\\^\`\\[\\]]*`, 'gi');
    const domainMatches = text.match(domainRegex) || [];
    for (const match of domainMatches) {
      const fullUrl = `https://${match}`;
      const result = checkUrl(fullUrl);
      if (result) return result;
    }
  }

  return {};
}

// Extract DOI from URL
function extractDoi(url: string): string | undefined {
  // DOI patterns:
  // https://doi.org/10.xxxx/yyyy
  // https://dx.doi.org/10.xxxx/yyyy
  // URLs containing /doi/10.xxxx/
  const doiMatch = url.match(/(?:doi\.org\/|\/doi\/)(10\.\d{4,}\/[^\s&?#]+)/i);
  if (doiMatch) {
    return doiMatch[1];
  }

  // arXiv ID (can be used to get DOI later)
  const arxivMatch = url.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,})/i);
  if (arxivMatch) {
    return `arXiv:${arxivMatch[1]}`;
  }

  return undefined;
}

function PaperIndicator({ domain }: { domain?: string }) {
  const label = domain?.includes('arxiv') ? 'arXiv' :
                domain?.includes('doi.org') ? 'DOI' :
                domain?.includes('semanticscholar') ? 'S2' :
                domain?.includes('biorxiv') ? 'bioRxiv' :
                domain?.includes('medrxiv') ? 'medRxiv' :
                'Paper';

  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full">
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      {label}
    </span>
  );
}

function VerifiedBadge() {
  return (
    <span
      className="inline-flex items-center justify-center w-4 h-4 bg-emerald-500 rounded-full flex-shrink-0"
      title="Verified Researcher"
    >
      <svg
        className="w-2.5 h-2.5 text-white"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
    </span>
  );
}

// Render LaTeX math (display $$ and inline $)
function renderLatex(text: string, keyPrefix: string = ''): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // First handle display math ($$...$$), then inline math ($...$)
  // Display math: $$...$$ (can span multiple lines)
  // Inline math: $...$ (single line, must contain non-space content that looks like math)
  // Avoid matching money like "$50" - require at least one letter, backslash, or math symbol
  const combinedRegex = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let lastIndex = 0;
  let match;
  let matchIndex = 0;

  while ((match = combinedRegex.exec(text)) !== null) {
    const displayMath = match[1]; // $$...$$ content
    const inlineMath = match[2];  // $...$ content
    const mathContent = displayMath || inlineMath;
    const isDisplay = !!displayMath;

    // For inline math, verify it looks like actual math (not just "$50")
    // Must contain: letters (variables), backslash (commands), ^, _, {, }, or common math symbols
    if (!isDisplay && mathContent) {
      const looksLikeMath = /[a-zA-Z\\^_{}=<>+\-*/]/.test(mathContent);
      if (!looksLikeMath) {
        // Not math - include the text before this match and the match itself as plain text
        if (match.index > lastIndex) {
          parts.push(text.slice(lastIndex, match.index));
        }
        parts.push(match[0]); // Include "$50" as plain text
        lastIndex = match.index + match[0].length;
        continue;
      }
    }

    // Add text before the math
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Render the math
    try {
      const html = katex.renderToString(mathContent, {
        throwOnError: false,
        displayMode: isDisplay,
      });
      parts.push(
        <span
          key={`${keyPrefix}math-${matchIndex}`}
          className={isDisplay ? 'block my-2 text-center overflow-x-auto' : 'inline-block align-middle'}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    } catch {
      // If KaTeX fails, show the original text
      parts.push(isDisplay ? `$$${mathContent}$$` : `$${mathContent}$`);
    }

    lastIndex = match.index + match[0].length;
    matchIndex++;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

// Render inline code (text wrapped in single backticks)
function renderInlineCode(text: string, keyPrefix: string = ''): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match single backtick-wrapped text, but not empty backticks
  // Note: Using simple regex without lookbehind for Safari 15 compatibility
  const codeRegex = /`([^`]+)`/g;
  let lastIndex = 0;
  let match;
  let matchIndex = 0;

  while ((match = codeRegex.exec(text)) !== null) {
    // Skip if this is part of triple backticks (check surrounding chars)
    const charBefore = match.index > 0 ? text[match.index - 1] : '';
    const charAfter = match.index + match[0].length < text.length ? text[match.index + match[0].length] : '';
    if (charBefore === '`' || charAfter === '`') {
      continue;
    }

    // Add text before the code (with LaTeX support)
    if (match.index > lastIndex) {
      const beforeText = text.slice(lastIndex, match.index);
      parts.push(...renderLatex(beforeText, `${keyPrefix}before-${matchIndex}-`));
    }
    // Add the code element (without the backticks) - NO LaTeX inside code
    parts.push(
      <code
        key={`${keyPrefix}code-${matchIndex}`}
        className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded text-[0.9em] font-mono"
      >
        {match[1]}
      </code>
    );
    lastIndex = match.index + match[0].length;
    matchIndex++;
  }

  // Add remaining text (with LaTeX support)
  if (lastIndex < text.length) {
    const afterText = text.slice(lastIndex);
    parts.push(...renderLatex(afterText, `${keyPrefix}after-`));
  }

  // If no inline code found, just process LaTeX
  if (parts.length === 0) {
    return renderLatex(text, keyPrefix);
  }

  return parts;
}

// Map common language aliases to Prism language names
const languageAliases: Record<string, string> = {
  'js': 'javascript',
  'ts': 'typescript',
  'py': 'python',
  'rb': 'ruby',
  'sh': 'bash',
  'shell': 'bash',
  'yml': 'yaml',
  'tex': 'latex',
};

// Get Prism grammar for a language
function getPrismGrammar(lang: string): Prism.Grammar | null {
  const normalizedLang = languageAliases[lang.toLowerCase()] || lang.toLowerCase();
  return Prism.languages[normalizedLang] || null;
}

// Render fenced code blocks and inline code
function renderCodeBlocks(text: string, keyPrefix: string = ''): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match fenced code blocks: ```language\ncode\n``` or ```code```
  const fencedRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;
  let blockIndex = 0;

  while ((match = fencedRegex.exec(text)) !== null) {
    // Add text before the code block (with inline code support)
    if (match.index > lastIndex) {
      const beforeText = text.slice(lastIndex, match.index);
      parts.push(...renderInlineCode(beforeText, `${keyPrefix}before-${blockIndex}-`));
    }

    const language = match[1] || '';
    const code = match[2].trim();
    const grammar = getPrismGrammar(language);
    const normalizedLang = languageAliases[language.toLowerCase()] || language.toLowerCase();

    // Highlight code if grammar is available
    let highlightedCode: string | null = null;
    if (grammar) {
      try {
        highlightedCode = Prism.highlight(code, grammar, normalizedLang);
      } catch {
        // Fall back to plain text
      }
    }

    // Render the fenced code block
    parts.push(
      <pre
        key={`${keyPrefix}block-${blockIndex}`}
        className="my-2 p-3 bg-gray-900 dark:bg-gray-950 rounded-lg overflow-x-auto"
      >
        {language && (
          <div className="text-xs text-gray-500 mb-2 font-mono">{language}</div>
        )}
        {highlightedCode ? (
          <code
            className="text-sm font-mono whitespace-pre prism-code"
            dangerouslySetInnerHTML={{ __html: highlightedCode }}
          />
        ) : (
          <code className="text-sm text-gray-100 font-mono whitespace-pre">
            {code}
          </code>
        )}
      </pre>
    );

    lastIndex = match.index + match[0].length;
    blockIndex++;
  }

  // Add remaining text (with inline code support)
  if (lastIndex < text.length) {
    const afterText = text.slice(lastIndex);
    parts.push(...renderInlineCode(afterText, `${keyPrefix}after-`));
  }

  // If no fenced blocks found, just process inline code
  if (parts.length === 0) {
    return renderInlineCode(text, keyPrefix);
  }

  return parts;
}

// Render post text with clickable links, mentions, and hashtags
function RichText({ text, facets }: { text: string; facets?: AppBskyFeedPost.Record['facets'] }) {
  if (!facets || facets.length === 0) {
    return <>{renderCodeBlocks(text)}</>;
  }

  // Sort facets by start index
  const sortedFacets = [...facets].sort((a, b) => a.index.byteStart - b.index.byteStart);

  // Convert byte indices to character indices (for non-ASCII text)
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const facet of sortedFacets) {
    const { byteStart, byteEnd } = facet.index;

    // Add text before this facet (with code block support)
    if (byteStart > lastIndex) {
      const beforeBytes = bytes.slice(lastIndex, byteStart);
      const beforeText = new TextDecoder().decode(beforeBytes);
      elements.push(...renderCodeBlocks(beforeText, `before-${byteStart}-`));
    }

    // Get the facet text
    const facetBytes = bytes.slice(byteStart, byteEnd);
    const facetText = new TextDecoder().decode(facetBytes);

    // Determine facet type and render accordingly
    const feature = facet.features[0];
    if (feature.$type === 'app.bsky.richtext.facet#link') {
      const uri = (feature as { uri: string }).uri;
      elements.push(
        <a
          key={byteStart}
          href={uri}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {facetText}
        </a>
      );
    } else if (feature.$type === 'app.bsky.richtext.facet#mention') {
      const did = (feature as { did: string }).did;
      // Extract handle from mention text (remove @ prefix)
      const mentionHandle = facetText.startsWith('@') ? facetText.slice(1) : facetText;
      elements.push(
        <ProfileHoverCard
          key={byteStart}
          did={did}
          handle={mentionHandle}
          onOpenProfile={() => {
            window.location.href = `/profile/${did}`;
          }}
        >
          <a
            href={`/profile/${did}`}
            className="text-blue-500 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {facetText}
          </a>
        </ProfileHoverCard>
      );
    } else if (feature.$type === 'app.bsky.richtext.facet#tag') {
      const tag = (feature as { tag: string }).tag;
      elements.push(
        <a
          key={byteStart}
          href={`/search?q=${encodeURIComponent('#' + tag)}`}
          className="text-blue-500 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {facetText}
        </a>
      );
    } else {
      elements.push(facetText);
    }

    lastIndex = byteEnd;
  }

  // Add remaining text after last facet (with code block support)
  if (lastIndex < bytes.length) {
    const afterBytes = bytes.slice(lastIndex);
    const afterText = new TextDecoder().decode(afterBytes);
    elements.push(...renderCodeBlocks(afterText, `after-${lastIndex}-`));
  }

  return <>{elements}</>;
}

// Render embedded images
function EmbedImages({ images }: { images: AppBskyEmbedImages.ViewImage[] }) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const expandedImage = expandedIndex !== null ? images[expandedIndex] : null;

  const closeLightbox = () => setExpandedIndex(null);

  // Single image: show full width, natural aspect ratio up to max height
  if (images.length === 1) {
    const image = images[0];
    return (
      <>
        <div
          className="relative cursor-pointer mt-2 rounded-xl overflow-hidden"
          onClick={(e) => {
            e.stopPropagation();
            setExpandedIndex(0);
          }}
        >
          <img
            src={image.thumb}
            alt={image.alt || 'Image'}
            className="w-full object-contain bg-gray-100 dark:bg-gray-800"
            style={{ maxHeight: '600px' }}
          />
          {image.alt && (
            <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/70 text-white text-xs rounded">
              ALT
            </div>
          )}
        </div>
        {expandedImage && typeof document !== 'undefined' && createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4"
            onClick={(e) => {
              e.stopPropagation();
              closeLightbox();
            }}
          >
            <button
              onClick={closeLightbox}
              className="absolute top-4 right-4 p-2 text-white hover:bg-white/20 rounded-full z-10"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <img
              src={expandedImage.fullsize || expandedImage.thumb}
              alt="Expanded image"
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
              onError={(e) => {
                // Fallback to thumb if fullsize fails to load
                const img = e.target as HTMLImageElement;
                if (img.src !== expandedImage.thumb) {
                  img.src = expandedImage.thumb;
                }
              }}
            />
          </div>,
          document.body
        )}
      </>
    );
  }

  // Multiple images: use grid with better heights
  const gridClass = images.length === 2 ? 'grid-cols-2' :
                    images.length === 3 ? 'grid-cols-2' :
                    'grid-cols-2';

  return (
    <>
      <div className={`grid ${gridClass} gap-1 mt-2 rounded-xl overflow-hidden`}>
        {images.map((image, index) => (
          <div
            key={index}
            className={`relative cursor-pointer ${images.length === 3 && index === 0 ? 'row-span-2' : ''}`}
            style={{ height: images.length === 3 && index === 0 ? '300px' : '150px' }}
            onClick={(e) => {
              e.stopPropagation();
              setExpandedIndex(index);
            }}
          >
            <img
              src={image.thumb}
              alt={image.alt || 'Image'}
              className="w-full h-full object-cover"
            />
            {image.alt && (
              <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/70 text-white text-xs rounded">
                ALT
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox for expanded image with navigation */}
      {expandedImage && expandedIndex !== null && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4"
          onClick={(e) => {
            e.stopPropagation();
            closeLightbox();
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' && expandedIndex > 0) {
              e.stopPropagation();
              setExpandedIndex(expandedIndex - 1);
            } else if (e.key === 'ArrowRight' && expandedIndex < images.length - 1) {
              e.stopPropagation();
              setExpandedIndex(expandedIndex + 1);
            } else if (e.key === 'Escape') {
              closeLightbox();
            }
          }}
          tabIndex={0}
          ref={(el) => el?.focus()}
        >
          {/* Close button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              closeLightbox();
            }}
            className="absolute top-4 right-4 p-2 text-white hover:bg-white/20 rounded-full z-10"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Image counter */}
          <div className="absolute top-4 left-4 px-3 py-1 bg-black/50 text-white text-sm rounded-full">
            {expandedIndex + 1} / {images.length}
          </div>

          {/* Previous button */}
          {expandedIndex > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpandedIndex(expandedIndex - 1);
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 text-white hover:bg-white/20 rounded-full z-10"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {/* Next button */}
          {expandedIndex < images.length - 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpandedIndex(expandedIndex + 1);
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 text-white hover:bg-white/20 rounded-full z-10"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          <img
            src={expandedImage.fullsize || expandedImage.thumb}
            alt={expandedImage.alt || "Expanded image"}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
            onError={(e) => {
              // Fallback to thumb if fullsize fails to load
              const img = e.target as HTMLImageElement;
              if (img.src !== expandedImage.thumb) {
                img.src = expandedImage.thumb;
              }
            }}
          />

          {/* Alt text display */}
          {expandedImage.alt && (
            <div className="absolute bottom-4 left-4 right-4 px-4 py-2 bg-black/70 text-white text-sm rounded-lg max-h-24 overflow-y-auto">
              {expandedImage.alt}
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

// Check if URL is a paper link
function isPaperUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return PAPER_DOMAINS.some(domain => lowerUrl.includes(domain));
}

// Get source label for paper URL
function getPaperSourceLabel(url: string): string {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('arxiv.org')) return 'arXiv';
  if (lowerUrl.includes('biorxiv.org')) return 'bioRxiv';
  if (lowerUrl.includes('medrxiv.org')) return 'medRxiv';
  if (lowerUrl.includes('nature.com')) return 'Nature';
  if (lowerUrl.includes('science.org') || lowerUrl.includes('sciencemag.org')) return 'Science';
  if (lowerUrl.includes('pnas.org')) return 'PNAS';
  if (lowerUrl.includes('cell.com')) return 'Cell';
  if (lowerUrl.includes('pubmed')) return 'PubMed';
  if (lowerUrl.includes('doi.org')) return 'DOI';
  if (lowerUrl.includes('openreview.net')) return 'OpenReview';
  if (lowerUrl.includes('acm.org')) return 'ACM';
  if (lowerUrl.includes('ieee')) return 'IEEE';
  if (lowerUrl.includes('springer.com')) return 'Springer';
  if (lowerUrl.includes('wiley.com')) return 'Wiley';
  if (lowerUrl.includes('plos.org')) return 'PLOS';
  if (lowerUrl.includes('semanticscholar.org')) return 'Semantic Scholar';
  if (lowerUrl.includes('aclanthology.org')) return 'ACL';
  return 'Paper';
}

// Enhanced paper embed with metadata fetching
function PaperEmbed({ external }: { external: AppBskyEmbedExternal.ViewExternal }) {
  const [metadata, setMetadata] = useState<{
    title?: string;
    authors?: string[];
    journal?: string;
    year?: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const sourceLabel = getPaperSourceLabel(external.uri);
  const hasGoodTitle = external.title &&
    !external.title.includes('http') &&
    external.title.length > 10 &&
    external.title !== external.uri;

  // Fetch metadata if the embed doesn't have good data
  useEffect(() => {
    if (fetched || hasGoodTitle) return;

    const fetchMetadata = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/papers/metadata?url=${encodeURIComponent(external.uri)}`);
        if (res.ok) {
          const data = await res.json();
          setMetadata(data);
        }
      } catch (e) {
        console.error('Failed to fetch paper metadata:', e);
      } finally {
        setLoading(false);
        setFetched(true);
      }
    };

    fetchMetadata();
  }, [external.uri, hasGoodTitle, fetched]);

  const displayTitle = metadata?.title || external.title || 'View Paper';
  const displayAuthors = metadata?.authors;
  const displayJournal = metadata?.journal;
  const displayYear = metadata?.year;

  return (
    <a
      href={external.uri}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 block w-full border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-3">
        {/* Source badge */}
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-medium rounded-full">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            {sourceLabel}
          </span>
          {displayYear && (
            <span className="text-xs text-gray-500">{displayYear}</span>
          )}
          {loading && (
            <span className="text-xs text-gray-400">Loading...</span>
          )}
        </div>

        {/* Title */}
        <p className="font-medium text-sm text-gray-900 dark:text-gray-100 line-clamp-3">
          {displayTitle}
        </p>

        {/* Authors */}
        {displayAuthors && displayAuthors.length > 0 && (
          <p className="text-xs text-gray-500 mt-1.5 line-clamp-1">
            {displayAuthors.length > 3
              ? `${displayAuthors.slice(0, 3).join(', ')} et al.`
              : displayAuthors.join(', ')}
          </p>
        )}

        {/* Journal/Description */}
        {(displayJournal || external.description) && (
          <p className="text-xs text-gray-400 mt-1 line-clamp-1">
            {displayJournal || external.description}
          </p>
        )}
      </div>
    </a>
  );
}

// Render external link card
function EmbedExternal({ external }: { external: AppBskyEmbedExternal.ViewExternal }) {
  // Use enhanced paper embed for paper links
  if (isPaperUrl(external.uri)) {
    return <PaperEmbed external={external} />;
  }

  // Regular external link embed
  return (
    <a
      href={external.uri}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 block w-full border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      {external.thumb && (
        <img
          src={external.thumb}
          alt=""
          className="w-full h-32 object-cover"
        />
      )}
      <div className="p-3">
        <p className="text-xs text-gray-500 truncate">{new URL(external.uri).hostname}</p>
        <p className="font-medium text-sm text-gray-900 dark:text-gray-100 line-clamp-2">{external.title || 'View link'}</p>
        {external.description && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{external.description}</p>
        )}
      </div>
    </a>
  );
}

// Quote post component that opens thread view
function QuotePost({
  author,
  postRecord,
  viewRecord,
  isVerified,
  formatDate,
  onOpenThread,
}: {
  author: AppBskyEmbedRecord.ViewRecord['author'];
  postRecord: AppBskyFeedPost.Record;
  viewRecord: AppBskyEmbedRecord.ViewRecord;
  isVerified: boolean;
  formatDate: (dateString: string) => string;
  onOpenThread?: (uri: string) => void;
}) {
  // Lightbox state for images in quoted posts
  const [expandedImage, setExpandedImage] = useState<{ fullsize: string; alt: string } | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [lightboxImages, setLightboxImages] = useState<{ fullsize: string; alt: string }[]>([]);

  const openLightbox = (images: { fullsize: string; alt: string }[], index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setLightboxImages(images);
    setExpandedImage(images[index]);
    setExpandedIndex(index);
  };

  const closeLightbox = () => {
    setExpandedImage(null);
    setExpandedIndex(null);
    setLightboxImages([]);
  };

  return (
    <div
      className={`mt-2 border border-gray-200 dark:border-gray-700 rounded-xl p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${onOpenThread ? 'cursor-pointer' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        if (onOpenThread) {
          onOpenThread(viewRecord.uri);
        }
      }}
    >
      {/* Quoted post header */}
      <div className="flex items-center gap-2">
        <div className="relative flex-shrink-0">
          {author.avatar ? (
            <img
              src={author.avatar}
              alt={author.displayName || author.handle}
              className="w-5 h-5 rounded-full"
            />
          ) : (
            <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
              {(author.displayName || author.handle)[0].toUpperCase()}
            </div>
          )}
          {isVerified && (
            <span className="absolute -bottom-0.5 -right-0.5 inline-flex items-center justify-center w-3 h-3 bg-emerald-500 rounded-full">
              <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </span>
          )}
        </div>
        <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
          {author.displayName || author.handle}
        </span>
        <span className="text-gray-500 text-sm truncate">@{author.handle}</span>
        <span className="text-gray-400 text-sm">·</span>
        <span className="text-gray-400 text-sm">{formatDate(postRecord.createdAt)}</span>
      </div>

      {/* Quoted post text - truncated preview */}
      {postRecord.text && (
        <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap line-clamp-4">
          {postRecord.text}
        </p>
      )}

      {/* Quoted post embeds (images, external links, videos) - thumbnail preview */}
      {viewRecord.embeds && viewRecord.embeds.length > 0 && (
        <div className="mt-2">
          {viewRecord.embeds.map((embed, i) => {
            if ('images' in embed && Array.isArray((embed as AppBskyEmbedImages.View).images)) {
              const images = (embed as AppBskyEmbedImages.View).images;
              const imageList = images.map(img => ({ fullsize: img.fullsize, alt: img.alt || '' }));
              // Single image in quote: show larger with aspect ratio preserved
              if (images.length === 1) {
                return (
                  <div
                    key={i}
                    className="rounded-lg overflow-hidden cursor-pointer"
                    onClick={(e) => openLightbox(imageList, 0, e)}
                  >
                    <img
                      src={images[0].thumb}
                      alt={images[0].alt || ''}
                      className="w-full object-contain bg-gray-100 dark:bg-gray-800"
                      style={{ maxHeight: '300px' }}
                    />
                  </div>
                );
              }
              // Multiple images: grid layout
              return (
                <div key={i} className="grid grid-cols-2 gap-1 rounded-lg overflow-hidden">
                  {images.slice(0, 4).map((img, j) => (
                    <img
                      key={j}
                      src={img.thumb}
                      alt={img.alt || ''}
                      className="object-cover w-full h-32 cursor-pointer"
                      onClick={(e) => openLightbox(imageList, j, e)}
                    />
                  ))}
                </div>
              );
            }
            if ('external' in embed && (embed as AppBskyEmbedExternal.View).external) {
              const external = (embed as AppBskyEmbedExternal.View).external;
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg"
                >
                  {external.thumb && (
                    <img src={external.thumb} alt="" className="w-12 h-12 object-cover rounded" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 truncate">{new URL(external.uri).hostname}</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{external.title}</p>
                  </div>
                </div>
              );
            }
            if ('playlist' in embed && (embed as AppBskyEmbedVideo.View).playlist) {
              const video = embed as AppBskyEmbedVideo.View;
              return (
                <div key={i} className="rounded-lg overflow-hidden bg-black relative" style={{ maxHeight: '300px' }}>
                  {video.thumbnail ? (
                    <img src={video.thumbnail} alt="" className="w-full object-contain" style={{ maxHeight: '300px' }} />
                  ) : (
                    <div className="w-full h-48 flex items-center justify-center">
                      <svg className="w-12 h-12 text-white/50" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center">
                      <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                </div>
              );
            }
            // Handle recordWithMedia (quote + images in quoted post) - check BEFORE record
            // because recordWithMedia has both 'record' and 'media' properties
            if ('media' in embed && (embed as AppBskyEmbedRecordWithMedia.View).media) {
              const rwm = embed as AppBskyEmbedRecordWithMedia.View;
              const media = rwm.media;
              const mediaImages = 'images' in media ? (media as AppBskyEmbedImages.View).images : [];
              const mediaImageList = mediaImages.map(img => ({ fullsize: img.fullsize, alt: img.alt || '' }));
              return (
                <div key={i}>
                  {mediaImages.length > 0 && (
                    mediaImages.length === 1 ? (
                      <div
                        className="rounded-lg overflow-hidden mb-2 cursor-pointer"
                        onClick={(e) => openLightbox(mediaImageList, 0, e)}
                      >
                        <img
                          src={mediaImages[0].thumb}
                          alt={mediaImages[0].alt || ''}
                          className="w-full object-contain bg-gray-100 dark:bg-gray-800"
                          style={{ maxHeight: '300px' }}
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-1 rounded-lg overflow-hidden mb-2">
                        {mediaImages.slice(0, 4).map((img, j) => (
                          <img
                            key={j}
                            src={img.thumb}
                            alt={img.alt || ''}
                            className="object-cover w-full h-32 cursor-pointer"
                            onClick={(e) => openLightbox(mediaImageList, j, e)}
                          />
                        ))}
                      </div>
                    )
                  )}
                  {rwm.record && <EmbedRecord record={rwm.record.record} onOpenThread={onOpenThread} />}
                </div>
              );
            }
            // Handle nested quote (record embed within quoted post) - check AFTER recordWithMedia
            if ('record' in embed && (embed as AppBskyEmbedRecord.View).record) {
              const recordEmbed = embed as AppBskyEmbedRecord.View;
              return <EmbedRecord key={i} record={recordEmbed.record} onOpenThread={onOpenThread} />;
            }
            return null;
          })}
        </div>
      )}

      {/* Lightbox for quoted post images */}
      {expandedImage && expandedIndex !== null && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4"
          onClick={(e) => {
            e.stopPropagation();
            closeLightbox();
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' && expandedIndex > 0) {
              e.stopPropagation();
              setExpandedIndex(expandedIndex - 1);
              setExpandedImage(lightboxImages[expandedIndex - 1]);
            } else if (e.key === 'ArrowRight' && expandedIndex < lightboxImages.length - 1) {
              e.stopPropagation();
              setExpandedIndex(expandedIndex + 1);
              setExpandedImage(lightboxImages[expandedIndex + 1]);
            } else if (e.key === 'Escape') {
              closeLightbox();
            }
          }}
          tabIndex={0}
          ref={(el) => el?.focus()}
        >
          {/* Image counter */}
          {lightboxImages.length > 1 && (
            <div className="absolute top-4 left-4 px-3 py-1 bg-black/50 text-white text-sm rounded-full">
              {expandedIndex + 1} / {lightboxImages.length}
            </div>
          )}

          {/* Close button */}
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2"
            onClick={(e) => {
              e.stopPropagation();
              closeLightbox();
            }}
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Previous button */}
          {expandedIndex > 0 && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-2 bg-black/30 rounded-full"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedIndex(expandedIndex - 1);
                setExpandedImage(lightboxImages[expandedIndex - 1]);
              }}
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {/* Next button */}
          {expandedIndex < lightboxImages.length - 1 && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-2 bg-black/30 rounded-full"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedIndex(expandedIndex + 1);
                setExpandedImage(lightboxImages[expandedIndex + 1]);
              }}
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          <img
            src={lightboxImages[expandedIndex]?.fullsize || expandedImage.fullsize}
            alt={lightboxImages[expandedIndex]?.alt || expandedImage.alt}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Alt text display */}
          {(lightboxImages[expandedIndex]?.alt || expandedImage.alt) && (
            <div className="absolute bottom-4 left-4 right-4 px-4 py-2 bg-black/70 text-white text-sm rounded-lg text-center">
              {lightboxImages[expandedIndex]?.alt || expandedImage.alt}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// Render embedded/quoted post
function EmbedRecord({ record, onOpenThread }: { 
  record: AppBskyEmbedRecord.View['record']; 
  onOpenThread?: (uri: string) => void;
}) {
  // Handle different record types
  if (!record || record.$type === 'app.bsky.embed.record#viewNotFound') {
    return (
      <div className="mt-2 p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/50">
        <p className="text-sm text-gray-500">Post not found</p>
      </div>
    );
  }

  if (record.$type === 'app.bsky.embed.record#viewBlocked') {
    return (
      <div className="mt-2 p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/50">
        <p className="text-sm text-gray-500">Blocked post</p>
      </div>
    );
  }

  if (record.$type === 'app.bsky.embed.record#viewDetached') {
    return (
      <div className="mt-2 p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/50">
        <p className="text-sm text-gray-500">Post unavailable</p>
      </div>
    );
  }

  // Handle viewRecord (the actual quoted post)
  if (record.$type === 'app.bsky.embed.record#viewRecord') {
    const viewRecord = record as AppBskyEmbedRecord.ViewRecord;
    const author = viewRecord.author;
    const postRecord = viewRecord.value as AppBskyFeedPost.Record;
    const isVerified = isVerifiedResearcher(author.labels as Label[] | undefined);

    // Format date for the quoted post
    const formatDate = (dateString: string) => {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'now';
      if (diffMins < 60) return `${diffMins}m`;
      if (diffHours < 24) return `${diffHours}h`;
      if (diffDays < 7) return `${diffDays}d`;
      return date.toLocaleDateString();
    };

    return <QuotePost
      author={author}
      postRecord={postRecord}
      viewRecord={viewRecord}
      isVerified={isVerified}
      formatDate={formatDate}
      onOpenThread={onOpenThread}
    />;
  }

  // Handle feed generator embeds
  if (record.$type === 'app.bsky.feed.defs#generatorView') {
    const feed = record as unknown as {
      displayName?: string;
      description?: string;
      uri?: string;
      creator?: { handle?: string };
    };

    // Build the bsky.app URL for this feed
    let feedUrl: string | null = null;
    if (feed.uri) {
      // URI format: at://did:xxx/app.bsky.feed.generator/rkey
      const match = feed.uri.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.generator\/([^/]+)$/);
      if (match) {
        const [, did, rkey] = match;
        const handle = feed.creator?.handle || did;
        feedUrl = `https://bsky.app/profile/${handle}/feed/${rkey}`;
      }
    }

    const content = (
      <div className="mt-2 p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
          </svg>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{feed.displayName || 'Feed'}</p>
        </div>
        {feed.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{feed.description}</p>}
      </div>
    );

    if (feedUrl) {
      return (
        <a
          href={feedUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </a>
      );
    }
    return content;
  }

  // Handle list embeds
  if (record.$type === 'app.bsky.graph.defs#listView') {
    const list = record as unknown as {
      name?: string;
      description?: string;
      uri?: string;
      creator?: { handle?: string };
    };

    // Build the bsky.app URL for this list
    let listUrl: string | null = null;
    if (list.uri) {
      // URI format: at://did:xxx/app.bsky.graph.list/rkey
      const match = list.uri.match(/^at:\/\/([^/]+)\/app\.bsky\.graph\.list\/([^/]+)$/);
      if (match) {
        const [, did, rkey] = match;
        const handle = list.creator?.handle || did;
        listUrl = `https://bsky.app/profile/${handle}/lists/${rkey}`;
      }
    }

    const content = (
      <div className="mt-2 p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{list.name || 'List'}</p>
        </div>
        {list.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{list.description}</p>}
      </div>
    );

    if (listUrl) {
      return (
        <a
          href={listUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </a>
      );
    }
    return content;
  }

  // Handle starter pack embeds
  if (record.$type === 'app.bsky.graph.defs#starterPackViewBasic') {
    const pack = record as unknown as {
      uri?: string;
      record?: { name?: string; description?: string };
      creator?: { handle?: string };
    };

    // Build the bsky.app URL for this starter pack
    let starterPackUrl: string | null = null;
    if (pack.uri) {
      // URI format: at://did:plc:xxx/app.bsky.graph.starterpack/rkey
      const match = pack.uri.match(/^at:\/\/([^/]+)\/app\.bsky\.graph\.starterpack\/([^/]+)$/);
      if (match) {
        const [, did, rkey] = match;
        const handle = pack.creator?.handle || did;
        starterPackUrl = `https://bsky.app/starter-pack/${handle}/${rkey}`;
      }
    }

    const content = (
      <div className="mt-2 p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{pack.record?.name || 'Starter Pack'}</p>
        </div>
        {pack.record?.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{pack.record.description}</p>}
      </div>
    );

    if (starterPackUrl) {
      return (
        <a
          href={starterPackUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </a>
      );
    }
    return content;
  }

  // Fallback for other record types - show type for debugging
  console.log('Unknown embed record type:', record.$type, record);
  return (
    <div className="mt-2 p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/50">
      <p className="text-sm text-gray-500">Embedded content</p>
    </div>
  );
}

// Video embed renderer with HLS support
function EmbedVideo({ video }: { video: AppBskyEmbedVideo.View }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const playlist = video.playlist;
  const thumbnail = video.thumbnail;
  const aspectRatio = video.aspectRatio;

  // Calculate aspect ratio for sizing
  const ratio = aspectRatio ? aspectRatio.width / aspectRatio.height : 16 / 9;
  const paddingBottom = `${(1 / ratio) * 100}%`;

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !playlist) return;

    // Check if HLS is supported natively (Safari)
    if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
      videoElement.src = playlist;
    } else if (Hls.isSupported()) {
      // Use hls.js for other browsers
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hlsRef.current = hls;

      // Add error handling
      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.error('HLS error:', data);
        if (data.fatal) {
          setError('Video failed to load');
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error('Network error - trying to recover');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error('Media error - trying to recover');
              hls.recoverMediaError();
              break;
            default:
              console.error('Unrecoverable error');
              hls.destroy();
              break;
          }
        }
      });

      hls.loadSource(playlist);
      hls.attachMedia(videoElement);
    } else {
      setError('Video playback not supported');
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [playlist]);

  return (
    <div
      className="mt-2 rounded-xl overflow-hidden bg-black"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative" style={{ paddingBottom }}>
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-contain"
          poster={thumbnail}
          controls
          preload="metadata"
          playsInline
          onError={(e) => {
            console.error('Video element error:', e);
            setError('Video failed to load');
          }}
        >
          Your browser does not support the video tag.
        </video>
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

// Main embed renderer
function PostEmbed({ embed, onOpenThread }: { 
  embed: AppBskyFeedDefs.PostView['embed']; 
  onOpenThread?: (uri: string) => void;
}) {
  if (!embed) return null;

  // Images
  if ('images' in embed && Array.isArray((embed as AppBskyEmbedImages.View).images)) {
    const imagesEmbed = embed as AppBskyEmbedImages.View;
    return <EmbedImages images={imagesEmbed.images} />;
  }

  // External link
  if ('external' in embed && (embed as AppBskyEmbedExternal.View).external) {
    const externalEmbed = embed as AppBskyEmbedExternal.View;
    return <EmbedExternal external={externalEmbed.external} />;
  }

  // Video
  if ('playlist' in embed && (embed as AppBskyEmbedVideo.View).playlist) {
    const videoEmbed = embed as AppBskyEmbedVideo.View;
    return <EmbedVideo video={videoEmbed} />;
  }

  // Record with media (quote + images/video) - check BEFORE pure record embed
  // because recordWithMedia has both 'record' and 'media' properties
  if ('media' in embed && (embed as AppBskyEmbedRecordWithMedia.View).media) {
    const recordWithMedia = embed as AppBskyEmbedRecordWithMedia.View;
    const media = recordWithMedia.media;

    return (
      <>
        {/* Render the media part */}
        {'images' in media && Array.isArray((media as AppBskyEmbedImages.View).images) && (
          <EmbedImages images={(media as AppBskyEmbedImages.View).images} />
        )}
        {'external' in media && (media as AppBskyEmbedExternal.View).external && (
          <EmbedExternal external={(media as AppBskyEmbedExternal.View).external} />
        )}
        {'playlist' in media && (media as AppBskyEmbedVideo.View).playlist && (
          <EmbedVideo video={media as AppBskyEmbedVideo.View} />
        )}
        {/* Render the quoted record */}
        {recordWithMedia.record && <EmbedRecord record={recordWithMedia.record.record} onOpenThread={onOpenThread} />}
      </>
    );
  }

  // Quoted post (pure record embed, no media)
  if ('record' in embed && (embed as AppBskyEmbedRecord.View).record) {
    const recordEmbed = embed as AppBskyEmbedRecord.View;
    return <EmbedRecord record={recordEmbed.record} onOpenThread={onOpenThread} />;
  }

  return null;
}

export default function Post({ post, onReply, onOpenThread, feedContext, reqId, supportsInteractions, feedUri, onOpenProfile, reason, replyParent, isInSelfThread, isFirstInThread, isLastInThread, isInThread, sourceFeed }: PostProps & { onReply?: () => void; onOpenThread?: (uri: string) => void; onOpenProfile?: (did: string) => void }) {
  const { settings } = useSettings();
  const { openComposer } = useComposer();
  
  // Check if this is a repost
  const isRepost = reason && '$type' in reason && reason.$type === 'app.bsky.feed.defs#reasonRepost';
  const repostedBy = isRepost && 'by' in reason ? reason.by : undefined;
  const { addBookmark, removeBookmark, isBookmarked, collections, getBookmarkCollections, addBookmarkToCollection, removeBookmarkFromCollection } = useBookmarks();
  const [showReplyComposer, setShowReplyComposer] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // Reply image state
  const [replyImages, setReplyImages] = useState<Array<{ file: File; preview: string; alt: string }>>([]);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const MAX_REPLY_IMAGES = 4;
  const MAX_IMAGE_SIZE = 20000000; // 20MB (will be compressed before upload)

  // Reply mention autocomplete state
  const [replyMentionQuery, setReplyMentionQuery] = useState<string | null>(null);
  const [replyMentionStart, setReplyMentionStart] = useState<number>(0);
  const [replySuggestions, setReplySuggestions] = useState<Array<{ did: string; handle: string; displayName?: string; avatar?: string }>>([]);
  const [replySelectedIndex, setReplySelectedIndex] = useState(0);
  const [replyLoadingSuggestions, setReplyLoadingSuggestions] = useState(false);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Helper to get stored counts for edited posts
  const getStoredEditCounts = (uri: string) => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem(`edited-post-counts:${uri}`);
      if (stored) {
        const data = JSON.parse(stored);
        // Expire after 30 days
        if (Date.now() - data.timestamp < 30 * 24 * 60 * 60 * 1000) {
          return data;
        }
        localStorage.removeItem(`edited-post-counts:${uri}`);
      }
    } catch {}
    return null;
  };

  const storedCounts = getStoredEditCounts(post.uri);

  // Like state - use stored counts if available (for edited posts)
  const [isLiked, setIsLiked] = useState(!!post.viewer?.like);
  const [likeUri, setLikeUri] = useState<string | undefined>(post.viewer?.like);
  const [likeCount, setLikeCount] = useState(storedCounts?.likeCount ?? post.likeCount ?? 0);
  const [liking, setLiking] = useState(false);

  // Repost state - use stored counts if available (for edited posts)
  const [isReposted, setIsReposted] = useState(!!post.viewer?.repost);
  const [repostUri, setRepostUri] = useState<string | undefined>(post.viewer?.repost);
  const [repostCount, setRepostCount] = useState(storedCounts?.repostCount ?? post.repostCount ?? 0);
  const [reposting, setReposting] = useState(false);

  // Reply count state - use stored counts if available (for edited posts)
  const [replyCount] = useState(storedCounts?.replyCount ?? post.replyCount ?? 0);

  // Quote state
  const [showQuoteComposer, setShowQuoteComposer] = useState(false);
  const [quoteText, setQuoteText] = useState('');
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Quote mention autocomplete state
  const [quoteMentionQuery, setQuoteMentionQuery] = useState<string | null>(null);
  const [quoteMentionStart, setQuoteMentionStart] = useState<number>(0);
  const [quoteSuggestions, setQuoteSuggestions] = useState<Array<{ did: string; handle: string; displayName?: string; avatar?: string }>>([]);
  const [quoteSelectedIndex, setQuoteSelectedIndex] = useState(0);
  const [quoteLoadingSuggestions, setQuoteLoadingSuggestions] = useState(false);
  const quoteTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Feed interaction state
  const [interactionSent, setInteractionSent] = useState<InteractionEvent | null>(null);
  const [sendingInteraction, setSendingInteraction] = useState(false);
  const [showMobileInteractionMenu, setShowMobileInteractionMenu] = useState(false);
  const mobileInteractionMenuRef = useRef<HTMLDivElement>(null);

  // Profile view state
  const [showProfile, setShowProfile] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);

  // Quotes view state
  const [showQuotes, setShowQuotes] = useState(false);

  // Threadgate editing state (for own posts)
  const [showThreadgateEditor, setShowThreadgateEditor] = useState(false);
  const [currentThreadgate, setCurrentThreadgate] = useState<ThreadgateType>(() => 
    getThreadgateType(post.threadgate?.record as { allow?: Array<{ $type: string; list?: string }> } | undefined)
  );
  const [updatingThreadgate, setUpdatingThreadgate] = useState(false);
  const [threadgateError, setThreadgateError] = useState<string | null>(null);

  // Delete state (for own posts)
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);

  // Edit state (for own posts)
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Share state
  const [showCopied, setShowCopied] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [shareMenuStyle, setShareMenuStyle] = useState<{ top: number; left: number } | null>(null);
  const shareMenuRef = useRef<HTMLDivElement>(null);
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const [copiedType, setCopiedType] = useState<'lea' | 'bluesky' | null>(null);

  // Bookmark collection dropdown state
  const [showBookmarkMenu, setShowBookmarkMenu] = useState(false);
  const [bookmarkMenuStyle, setBookmarkMenuStyle] = useState<{ top: number; left: number } | null>(null);
  const bookmarkMenuRef = useRef<HTMLDivElement>(null);
  const bookmarkButtonRef = useRef<HTMLButtonElement>(null);

  // Repost menu dropdown state
  const [showRepostMenu, setShowRepostMenu] = useState(false);
  const repostMenuRef = useRef<HTMLDivElement>(null);

  // Detach quote state
  const [isDetaching, setIsDetaching] = useState(false);
  const [isDetached, setIsDetached] = useState(false);
  const [showDetachConfirm, setShowDetachConfirm] = useState(false);

  const handleThreadgateUpdate = async (newType: ThreadgateType) => {
    if (updatingThreadgate || newType === currentThreadgate) return;
    
    setUpdatingThreadgate(true);
    setThreadgateError(null);
    try {
      await updateThreadgate(post.uri, newType);
      setCurrentThreadgate(newType);
      setShowThreadgateEditor(false);
    } catch (err) {
      console.error('Failed to update threadgate:', err);
      setThreadgateError(err instanceof Error ? err.message : 'Failed to update reply settings');
    } finally {
      setUpdatingThreadgate(false);
    }
  };

  const handleFeedInteraction = async (event: InteractionEvent) => {
    if (sendingInteraction) return;
    setSendingInteraction(true);
    try {
      console.log('Sending feed interaction:', { postUri: post.uri, event, feedContext, reqId, feedUri });
      await sendFeedInteraction(post.uri, event, feedContext, reqId, feedUri);
      console.log('Feed interaction sent successfully');
      setInteractionSent(event);
    } catch (err) {
      console.error('Failed to send interaction:', err);
    } finally {
      setSendingInteraction(false);
    }
  };

  const record = post.record as AppBskyFeedPost.Record;
  const author = post.author;
  const isVerified = isVerifiedResearcher(author.labels as Label[] | undefined);

  // Check for Lea extended text (custom fields for long posts)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extendedRecord = post.record as any;
  const hasExtendedText = !!extendedRecord.leaExtendedText;
  const fullText = extendedRecord.leaExtendedText || record.text;
  const fullFacets = extendedRecord.leaExtendedFacets || record.facets;

  // Track current text for editing (initialized from full text, updated on save)
  const [currentText, setCurrentText] = useState(fullText);
  const [currentFacets, setCurrentFacets] = useState(fullFacets);
  
  // Check if this is the current user's post
  const session = getSession();
  const isOwnPost = session?.did === author.did;

  // Check if post is less than 10 minutes old (for edit eligibility)
  const postAgeMs = Date.now() - new Date(record.createdAt).getTime();
  const isEditableAge = postAgeMs < 10 * 60 * 1000; // 10 minutes in ms
  
  // Check if this post quotes the current user's content (for detach feature)
  // We need to check if the embed contains a quote of one of our posts
  const getQuotedPostInfo = (): { quotedPostUri: string; quotedPostAuthorDid: string } | null => {
    if (!post.embed || !session?.did) return null;
    
    // Check for record embed (quote post)
    if ('record' in post.embed) {
      const recordEmbed = post.embed as AppBskyEmbedRecord.View;
      const embeddedRecord = recordEmbed.record;
      if (embeddedRecord && embeddedRecord.$type === 'app.bsky.embed.record#viewRecord') {
        const viewRecord = embeddedRecord as AppBskyEmbedRecord.ViewRecord;
        return { quotedPostUri: viewRecord.uri, quotedPostAuthorDid: viewRecord.author.did };
      }
    }
    
    // Check for recordWithMedia embed (quote + images)
    if ('media' in post.embed && 'record' in post.embed) {
      const rwm = post.embed as AppBskyEmbedRecordWithMedia.View;
      const embeddedRecord = rwm.record?.record;
      if (embeddedRecord && embeddedRecord.$type === 'app.bsky.embed.record#viewRecord') {
        const viewRecord = embeddedRecord as AppBskyEmbedRecord.ViewRecord;
        return { quotedPostUri: viewRecord.uri, quotedPostAuthorDid: viewRecord.author.did };
      }
    }
    
    return null;
  };
  
  const quotedPostInfo = getQuotedPostInfo();
  const canDetachQuote = quotedPostInfo && quotedPostInfo.quotedPostAuthorDid === session?.did && !isDetached;
  
  const handleDetachQuote = async () => {
    if (!quotedPostInfo || isDetaching) return;
    setIsDetaching(true);
    try {
      await detachQuote(post.uri, quotedPostInfo.quotedPostUri);
      setIsDetached(true);
      setShowDetachConfirm(false);
    } catch (error) {
      console.error('Failed to detach quote:', error);
    } finally {
      setIsDetaching(false);
    }
  };
  
  // Check if this post is from Paper Skygest feed - if so, it's definitely a paper post
  const isFromPaperFeed = feedUri === FEEDS.skygest.uri;
  
  // Detect paper link from text/embed, or trust Paper Skygest feed
  const detectedPaper = containsPaperLink(record.text, post.embed);
  const hasPaper = detectedPaper.hasPaper || isFromPaperFeed;
  const domain = detectedPaper.domain;
  
  const bookmarked = isBookmarked(post.uri);
  
  // Extract paper ID for paper discussion link
  // For embed, check external links
  const embedUri = post.embed && 'external' in post.embed 
    ? (post.embed as AppBskyEmbedExternal.View).external?.uri 
    : undefined;
  // Also check recordWithMedia embeds (quote + external link)
  const mediaEmbedUri = post.embed && 'media' in post.embed
    ? ((post.embed as AppBskyEmbedRecordWithMedia.View).media as AppBskyEmbedExternal.View)?.external?.uri
    : undefined;
  const effectiveEmbedUri = embedUri || mediaEmbedUri;
  
  // Try to extract paper URL
  // Path 1 (normal): Use extractPaperUrl which filters by known paper domains
  // Path 2 (Paper Skygest): Use extractAnyUrl - trust the feed's curation and extract any URL
  const paperUrl = hasPaper 
    ? (isFromPaperFeed 
        ? extractAnyUrl(record.text, effectiveEmbedUri, record.facets as LinkFacet[] | undefined)
        : extractPaperUrl(record.text, effectiveEmbedUri, record.facets as LinkFacet[] | undefined))
    : null;
  const paperId = paperUrl ? getPaperIdFromUrl(paperUrl) : null;

  // Close bookmark menu when clicking outside
  useEffect(() => {
    if (!showBookmarkMenu) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      if (bookmarkMenuRef.current && !bookmarkMenuRef.current.contains(e.target as Node)) {
        setShowBookmarkMenu(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showBookmarkMenu]);

  // Close repost menu when clicking outside
  useEffect(() => {
    if (!showRepostMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (repostMenuRef.current && !repostMenuRef.current.contains(e.target as Node)) {
        setShowRepostMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showRepostMenu]);

  // Close mobile interaction menu when clicking outside
  useEffect(() => {
    if (!showMobileInteractionMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (mobileInteractionMenuRef.current && !mobileInteractionMenuRef.current.contains(e.target as Node)) {
        setShowMobileInteractionMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMobileInteractionMenu]);

  // Close share menu when clicking outside
  useEffect(() => {
    if (!showShareMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (shareMenuRef.current && !shareMenuRef.current.contains(e.target as Node) &&
          shareButtonRef.current && !shareButtonRef.current.contains(e.target as Node)) {
        setShowShareMenu(false);
        setShareMenuStyle(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showShareMenu]);

  const handleBookmarkClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    // If collections exist, show menu for both adding and managing
    if (collections.length > 0) {
      if (!showBookmarkMenu && bookmarkButtonRef.current) {
        // Calculate position for the portal-rendered menu
        const rect = bookmarkButtonRef.current.getBoundingClientRect();
        // Estimate menu height: ~200px for a typical menu with a few collections
        const estimatedMenuHeight = 200;
        const menuWidth = 192; // w-48 = 12rem = 192px
        
        // Determine if menu should appear above or below
        const spaceAbove = rect.top;
        const spaceBelow = window.innerHeight - rect.bottom;
        const showAbove = spaceAbove > estimatedMenuHeight || spaceAbove > spaceBelow;
        
        // Calculate position
        let top = showAbove ? rect.top - estimatedMenuHeight - 8 : rect.bottom + 8;
        let left = rect.left;
        
        // Ensure menu doesn't go off-screen horizontally
        if (left + menuWidth > window.innerWidth - 16) {
          left = window.innerWidth - menuWidth - 16;
        }
        
        // Ensure menu doesn't go off-screen vertically
        if (top < 8) top = 8;
        if (top + estimatedMenuHeight > window.innerHeight - 8) {
          top = window.innerHeight - estimatedMenuHeight - 8;
        }
        
        setBookmarkMenuStyle({ top, left });
      }
      setShowBookmarkMenu(!showBookmarkMenu);
    } else {
      // No collections - simple toggle
      if (bookmarked) {
        removeBookmark(post.uri);
      } else {
        addBookmarkWithData();
      }
    }
  };

  const addBookmarkWithData = (collectionIds?: string[]) => {
    // Extract paper info if this post contains a paper link
    const paperInfo = extractPaperInfo(record.text, post.embed);

    const bookmarkData: BookmarkedPost = {
      uri: post.uri,
      cid: post.cid,
      authorDid: author.did,
      authorHandle: author.handle,
      authorDisplayName: author.displayName,
      authorAvatar: author.avatar,
      text: record.text,
      createdAt: record.createdAt,
      bookmarkedAt: new Date().toISOString(),
      paperUrl: paperInfo.url,
      paperDoi: paperInfo.doi,
      paperTitle: paperInfo.title,
      collectionIds: collectionIds || [],
    };
    addBookmark(bookmarkData, collectionIds);
  };

  const toggleBookmarkCollection = (collectionId: string) => {
    const currentCollections = getBookmarkCollections(post.uri);
    if (!bookmarked) {
      // Not bookmarked yet - add bookmark with this collection
      addBookmarkWithData([collectionId]);
    } else if (currentCollections.includes(collectionId)) {
      // Already in collection - remove from collection
      removeBookmarkFromCollection(post.uri, collectionId);
    } else {
      // Not in collection - add to collection
      addBookmarkToCollection(post.uri, collectionId);
    }
  };

  const handleRemoveBookmark = () => {
    removeBookmark(post.uri);
    setShowBookmarkMenu(false);
  };

  const handleDelete = async () => {
    if (deleting || !isOwnPost) return;
    
    // Confirm deletion
    if (!window.confirm('Are you sure you want to delete this post? This cannot be undone.')) {
      return;
    }
    
    setDeleting(true);
    try {
      await deletePost(post.uri);
      setDeleted(true);
    } catch (err) {
      console.error('Failed to delete post:', err);
      alert('Failed to delete post. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const handleStartEdit = () => {
    // Warn user about losing engagement
    const hasEngagement = likeCount > 0 || repostCount > 0 || replyCount > 0;
    if (hasEngagement) {
      const confirmed = window.confirm(
        'Warning: Editing will remove all likes and reposts. Reply counts will reset to 0 (though replies may still appear in thread view).\n\nThis cannot be undone. Continue?'
      );
      if (!confirmed) return;
    }

    setEditText(currentText);
    setEditing(true);
    // Focus textarea after render
    setTimeout(() => editTextareaRef.current?.focus(), 0);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditText('');
  };

  const EDITED_SUFFIX = ' (edited)';
  const MAX_EDIT_CHARS = 300 - EDITED_SUFFIX.length; // 291 chars to leave room for suffix

  const handleSaveEdit = async () => {
    if (saving || !editText.trim() || editText === currentText || editText.length > MAX_EDIT_CHARS) return;

    setSaving(true);
    try {
      // Store current counts before editing (they'll be lost on Bluesky but preserved in Lea)
      localStorage.setItem(`edited-post-counts:${post.uri}`, JSON.stringify({
        likeCount,
        repostCount,
        replyCount: post.replyCount || 0,
        timestamp: Date.now(),
      }));

      const textWithSuffix = editText + EDITED_SUFFIX;
      await editPost(post.uri, textWithSuffix);
      setCurrentText(textWithSuffix);
      setEditing(false);
      setEditText('');
    } catch (err) {
      console.error('Failed to edit post:', err);
      // Remove stored counts on failure
      localStorage.removeItem(`edited-post-counts:${post.uri}`);
      alert('Failed to edit post. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleShareClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (showShareMenu) {
      setShowShareMenu(false);
      setShareMenuStyle(null);
      return;
    }
    
    // Position menu above the button
    const button = shareButtonRef.current;
    if (button) {
      const rect = button.getBoundingClientRect();
      setShareMenuStyle({
        top: rect.top - 8, // Position above button
        left: rect.left + rect.width / 2, // Center on button
      });
    }
    setShowShareMenu(true);
  };

  const getLeaUrl = () => {
    // Parse AT URI to extract DID and rkey
    // Format: at://did:plc:xxx/app.bsky.feed.post/rkey
    const match = post.uri.match(/^at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/);

    if (match) {
      const [, did, rkey] = match;
      // Use buildPostUrl to properly handle handles with dots (uses DID when needed)
      return `${window.location.origin}${buildPostUrl(author.handle, rkey, did)}`;
    } else {
      // Fallback: encode the full URI
      return `${window.location.origin}/post/${encodeURIComponent(post.uri)}`;
    }
  };

  const getBlueskyUrl = () => {
    // Parse AT URI to extract DID and rkey
    // Format: at://did:plc:xxx/app.bsky.feed.post/rkey
    const match = post.uri.match(/^at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/);

    if (match) {
      const [, , rkey] = match;
      // Bluesky URLs use the full handle (e.g., hannawallach.bsky.social)
      return `https://bsky.app/profile/${author.handle}/post/${rkey}`;
    } else {
      // Fallback: can't construct Bluesky URL without proper format
      return null;
    }
  };

  const handleCopyLeaLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(getLeaUrl());
      setCopiedType('lea');
      setShowCopied(true);
      setShowShareMenu(false);
      setShareMenuStyle(null);
      setTimeout(() => {
        setShowCopied(false);
        setCopiedType(null);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  const handleCopyBlueskyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = getBlueskyUrl();
    if (!url) return;
    
    try {
      await navigator.clipboard.writeText(url);
      setCopiedType('bluesky');
      setShowCopied(true);
      setShowShareMenu(false);
      setShareMenuStyle(null);
      setTimeout(() => {
        setShowCopied(false);
        setCopiedType(null);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  const handleLike = async () => {
    if (liking) return;
    setLiking(true);
    try {
      if (isLiked && likeUri) {
        await unlikePost(likeUri);
        setIsLiked(false);
        setLikeUri(undefined);
        setLikeCount((c: number) => Math.max(0, c - 1));
      } else {
        const result = await likePost(post.uri, post.cid);
        setIsLiked(true);
        setLikeUri(result.uri);
        setLikeCount((c: number) => c + 1);
      }
    } catch (err) {
      console.error('Failed to like/unlike:', err);
    } finally {
      setLiking(false);
    }
  };

  const handleRepost = async () => {
    if (reposting) return;
    setReposting(true);
    try {
      if (isReposted && repostUri) {
        await deleteRepost(repostUri);
        setIsReposted(false);
        setRepostUri(undefined);
        setRepostCount((c: number) => Math.max(0, c - 1));
      } else {
        const result = await repost(post.uri, post.cid);
        setIsReposted(true);
        setRepostUri(result.uri);
        setRepostCount((c: number) => c + 1);
      }
    } catch (err) {
      console.error('Failed to repost/unrepost:', err);
    } finally {
      setReposting(false);
    }
  };

  const handleQuote = async () => {
    if (!quoteText.trim() || quoting) return;

    try {
      setQuoting(true);
      setQuoteError(null);

      const quoteRef: QuoteRef = {
        uri: post.uri,
        cid: post.cid,
      };

      // Convert legacy threadgate setting to new format
      const restriction = settings.autoThreadgate
        ? settings.threadgateType === 'following' ? ['following' as const]
          : settings.threadgateType === 'researchers' ? ['researchers' as const]
          : 'open' as const
        : 'open' as const;

      await createPost(
        quoteText,
        restriction,
        undefined,
        quoteRef
      );

      setQuoteText('');
      setShowQuoteComposer(false);
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : 'Failed to quote');
    } finally {
      setQuoting(false);
    }
  };

  // Search for reply mentions when query changes
  useEffect(() => {
    if (!replyMentionQuery || replyMentionQuery.length < 1) {
      setReplySuggestions([]);
      return;
    }

    const searchMentions = async () => {
      setReplyLoadingSuggestions(true);
      try {
        const results = await searchActors(replyMentionQuery, 6);
        setReplySuggestions(results);
        setReplySelectedIndex(0);
      } catch (err) {
        console.error('Failed to search mentions:', err);
      } finally {
        setReplyLoadingSuggestions(false);
      }
    };

    const debounce = setTimeout(searchMentions, 150);
    return () => clearTimeout(debounce);
  }, [replyMentionQuery]);

  // Handle reply text change with mention detection
  const handleReplyTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    const cursorPos = e.target.selectionStart;
    setReplyText(newText);

    // Find @ mention at cursor
    const textBeforeCursor = newText.slice(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);

    if (mentionMatch) {
      setReplyMentionQuery(mentionMatch[1]);
      setReplyMentionStart(cursorPos - mentionMatch[0].length);
    } else {
      setReplyMentionQuery(null);
      setReplySuggestions([]);
    }
  };

  // Insert selected mention into reply
  const insertReplyMention = useCallback((handle: string) => {
    const beforeMention = replyText.slice(0, replyMentionStart);
    const afterMention = replyText.slice(replyMentionStart + (replyMentionQuery?.length || 0) + 1);
    const newText = `${beforeMention}@${handle} ${afterMention}`;
    setReplyText(newText);
    setReplyMentionQuery(null);
    setReplySuggestions([]);

    // Focus back on textarea
    setTimeout(() => {
      if (replyTextareaRef.current) {
        const newCursorPos = replyMentionStart + handle.length + 2;
        replyTextareaRef.current.focus();
        replyTextareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  }, [replyText, replyMentionStart, replyMentionQuery]);

  // Insert emoji at cursor position in reply
  const insertReplyEmoji = useCallback((emoji: string) => {
    const textarea = replyTextareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newText = replyText.slice(0, start) + emoji + replyText.slice(end);
    setReplyText(newText);

    setTimeout(() => {
      textarea.focus();
      const newPos = start + emoji.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  }, [replyText]);

  // Insert emoji at cursor position in quote
  const insertQuoteEmoji = useCallback((emoji: string) => {
    // For quote, we don't have a ref, so just append
    setQuoteText(prev => prev + emoji);
  }, []);

  // Handle keyboard navigation in reply suggestions
  const handleReplyKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (replySuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setReplySelectedIndex(i => (i + 1) % replySuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setReplySelectedIndex(i => (i - 1 + replySuggestions.length) % replySuggestions.length);
    } else if (e.key === 'Enter' && replySuggestions.length > 0) {
      e.preventDefault();
      insertReplyMention(replySuggestions[replySelectedIndex].handle);
    } else if (e.key === 'Escape') {
      setReplyMentionQuery(null);
      setReplySuggestions([]);
    }
  };

  // Search for quote mentions when query changes
  useEffect(() => {
    if (!quoteMentionQuery || quoteMentionQuery.length < 1) {
      setQuoteSuggestions([]);
      return;
    }

    const searchQuoteMentions = async () => {
      setQuoteLoadingSuggestions(true);
      try {
        const results = await searchActors(quoteMentionQuery, 6);
        setQuoteSuggestions(results);
      } catch (err) {
        console.error('Failed to search quote mentions:', err);
      } finally {
        setQuoteLoadingSuggestions(false);
      }
    };

    const debounce = setTimeout(searchQuoteMentions, 150);
    return () => clearTimeout(debounce);
  }, [quoteMentionQuery]);

  // Handle quote text change with mention detection
  const handleQuoteTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    const cursorPos = e.target.selectionStart;
    setQuoteText(newText);

    // Find @ mention at cursor
    const textBeforeCursor = newText.slice(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);

    if (mentionMatch) {
      setQuoteMentionQuery(mentionMatch[1]);
      setQuoteMentionStart(cursorPos - mentionMatch[0].length);
    } else {
      setQuoteMentionQuery(null);
      setQuoteSuggestions([]);
    }
  };

  // Insert selected quote mention
  const insertQuoteMention = useCallback((handle: string) => {
    const beforeMention = quoteText.slice(0, quoteMentionStart);
    const afterMention = quoteText.slice(quoteMentionStart + (quoteMentionQuery?.length || 0) + 1);
    const newText = `${beforeMention}@${handle} ${afterMention}`;
    setQuoteText(newText);
    setQuoteMentionQuery(null);
    setQuoteSuggestions([]);

    // Set cursor position after the mention
    setTimeout(() => {
      if (quoteTextareaRef.current) {
        const newCursorPos = quoteMentionStart + handle.length + 2;
        quoteTextareaRef.current.focus();
        quoteTextareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  }, [quoteText, quoteMentionStart, quoteMentionQuery]);

  // Handle keyboard navigation in quote suggestions
  const handleQuoteKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (quoteSuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setQuoteSelectedIndex(i => (i + 1) % quoteSuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setQuoteSelectedIndex(i => (i - 1 + quoteSuggestions.length) % quoteSuggestions.length);
    } else if (e.key === 'Enter' && quoteSuggestions.length > 0) {
      e.preventDefault();
      insertQuoteMention(quoteSuggestions[quoteSelectedIndex].handle);
    } else if (e.key === 'Escape') {
      setQuoteMentionQuery(null);
      setQuoteSuggestions([]);
    }
  };

  // Reply image handlers
  const handleReplyImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remainingSlots = MAX_REPLY_IMAGES - replyImages.length;
    const filesToAdd = files.slice(0, remainingSlots);

    const newImages = filesToAdd.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      alt: '',
    }));

    setReplyImages(prev => [...prev, ...newImages]);
    if (replyFileInputRef.current) {
      replyFileInputRef.current.value = '';
    }
  };

  const handleReplyImageRemove = (index: number) => {
    setReplyImages(prev => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleReplyPaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(item => item.type.startsWith('image/'));

    if (imageItems.length > 0 && replyImages.length < MAX_REPLY_IMAGES) {
      e.preventDefault();
      const remainingSlots = MAX_REPLY_IMAGES - replyImages.length;
      const itemsToAdd = imageItems.slice(0, remainingSlots);

      itemsToAdd.forEach(item => {
        const file = item.getAsFile();
        if (file) {
          setReplyImages(prev => [...prev, {
            file,
            preview: URL.createObjectURL(file),
            alt: '',
          }]);
        }
      });
    }
  };

  const handleReply = async () => {
    if ((!replyText.trim() && replyImages.length === 0) || replying) return;

    try {
      setReplying(true);
      setReplyError(null);

      // Upload images if any
      let uploadedImages: { blob: unknown; alt: string }[] | undefined;
      if (replyImages.length > 0) {
        uploadedImages = [];
        for (const img of replyImages) {
          const uploaded = await uploadImage(img.file);
          uploadedImages.push({ blob: uploaded.blob, alt: img.alt });
        }
      }

      // For replies, we need root and parent
      // If this post is already a reply, use its root; otherwise this post is the root
      const existingReply = record.reply as ReplyRef | undefined;
      const replyRef: ReplyRef = {
        root: existingReply?.root || { uri: post.uri, cid: post.cid },
        parent: { uri: post.uri, cid: post.cid },
      };

      // Convert legacy threadgate setting to new format
      const replyRestriction = settings.autoThreadgate
        ? settings.threadgateType === 'following' ? ['following' as const]
          : settings.threadgateType === 'researchers' ? ['researchers' as const]
          : 'open' as const
        : 'open' as const;

      await createPost(
        replyText,
        replyRestriction,
        replyRef,
        undefined, // quote
        false, // disableQuotes
        uploadedImages
      );

      // Clean up image previews
      replyImages.forEach(img => URL.revokeObjectURL(img.preview));
      setReplyImages([]);
      setReplyText('');
      setShowReplyComposer(false);
      onReply?.();
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'Failed to reply');
    } finally {
      setReplying(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
  };

  // Dim non-verified or reposts if settings enabled
  const dimmed = (settings.dimNonVerified && !isVerified) || (settings.dimReposts && isRepost);

  // Show deleted state
  if (deleted) {
    return (
      <article className="border-b border-gray-200 dark:border-gray-800 p-4">
        <div className="flex items-center gap-2 text-gray-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <span className="text-sm">Post deleted</span>
        </div>
      </article>
    );
  }

  // Build article class based on context
  const articleClass = isInSelfThread || isInThread
    ? `hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors`
    : `border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors`;

  // Determine reply target - prefer feed-provided parent, fall back to extracting from record.reply
  const replyTarget = replyParent || (record.reply ? {
    author: { did: '', handle: '', displayName: undefined } // We don't have author info from record.reply
  } : null);
  const hasReplyInfo = replyTarget && replyTarget.author.handle;

  // Build post URL for linking
  // Parse the AT URI: at://did:plc:xxx/app.bsky.feed.post/rkey
  const postUrlMatch = post.uri.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/);
  const postUrl = postUrlMatch
    ? buildPostUrl(author.handle, postUrlMatch[2], author.did)
    : null;

  // Handle click on the article to open the thread
  const handleArticleClick = (e: React.MouseEvent) => {
    // Don't navigate away if reply or quote composer is open - user might lose their work
    if (showReplyComposer || showQuoteComposer) {
      e.preventDefault();
      return;
    }

    const target = e.target as HTMLElement;

    // If clicking on a link inside the post (not the wrapper), let it navigate normally
    const link = target.closest('a:not([data-post-wrapper])');
    if (link) {
      // Don't prevent default - let the link work
      // The link's onClick with stopPropagation will prevent this handler from doing anything else
      return;
    }

    // Don't trigger if clicking on other interactive elements (buttons, inputs, images, videos)
    const interactiveElement = target.closest('button, input, textarea, [role="button"], img, video');
    if (interactiveElement) {
      // Prevent the wrapper anchor from navigating
      e.preventDefault();
      return;
    }

    // If the event was already handled (e.g., by a button's onClick), don't navigate
    if (e.defaultPrevented) {
      return;
    }

    // Don't trigger if user is selecting text
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) return;

    // If cmd/ctrl/middle click, let the native link behavior handle it
    if (e.metaKey || e.ctrlKey || e.button === 1) return;

    // Prevent default link navigation and use callback instead
    e.preventDefault();

    // Open the thread
    onOpenThread?.(post.uri);
  };

  // Capture phase handler to intercept clicks on interactive elements before they cause navigation
  const handleClickCapture = (e: React.MouseEvent) => {
    // Don't navigate away if reply or quote composer is open - user might lose their work
    if (showReplyComposer || showQuoteComposer) {
      const target = e.target as HTMLElement;
      // Still allow external links to open
      const link = target.closest('a:not([data-post-wrapper])');
      if (link && (link as HTMLAnchorElement).target === '_blank') {
        return; // Let external link work
      }
      e.preventDefault();
      return;
    }

    // Check for text selection first - allow users to highlight text without navigating
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      e.preventDefault();
      return;
    }

    const target = e.target as HTMLElement;
    // For links inside the post (not the wrapper), let them navigate normally
    // Only prevent default for buttons, images (lightbox), inputs, etc.
    const link = target.closest('a:not([data-post-wrapper])');
    if (link) {
      // Let the link work normally - don't prevent default
      // stopPropagation in the link's onClick will prevent the post wrapper from handling it
      return;
    }

    // For non-link interactive elements (buttons, images, inputs, videos), prevent the wrapper anchor navigation
    const interactiveElement = target.closest('button, input, textarea, [role="button"], img, video');
    if (interactiveElement) {
      // For external links (target="_blank"), let them open naturally
      // Only prevent default for other interactive elements to stop the wrapper anchor from navigating
      const isExternalLink = interactiveElement.tagName === 'A' &&
        (interactiveElement as HTMLAnchorElement).target === '_blank';
      if (!isExternalLink) {
        e.preventDefault();
      }
    }
  };

  // If we have a URL and thread handler, wrap in an anchor for right-click support
  const ArticleWrapper = postUrl && onOpenThread ? 'a' : 'article';
  const articleProps = postUrl && onOpenThread
    ? { href: postUrl, onClick: handleArticleClick, onClickCapture: handleClickCapture, className: `${articleClass} cursor-pointer block`, 'data-post-wrapper': true, draggable: false }
    : { className: articleClass, onClick: onOpenThread ? handleArticleClick : undefined };

  return (
    <ArticleWrapper {...articleProps as React.HTMLAttributes<HTMLElement>}>
      {/* Source feed attribution (for remix feed) */}
      {sourceFeed && !repostedBy && (
        <div className="px-4 pt-2 pb-0">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            via {sourceFeed.displayName}
          </span>
        </div>
      )}
      {/* Repost header */}
      {repostedBy && (
        <div className="flex items-center gap-2 px-4 pt-3 pb-1 text-sm text-gray-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (e.shiftKey || e.metaKey || e.ctrlKey) {
                window.open(buildProfileUrl(repostedBy.handle, repostedBy.did), '_blank');
              } else if (onOpenProfile) {
                onOpenProfile(repostedBy.did);
              }
            }}
            className="hover:underline font-medium"
          >
            {repostedBy.displayName || repostedBy.handle} reposted
          </button>
        </div>
      )}
      {/* Reply indicator */}
      {!repostedBy && hasReplyInfo && (
        <div className="flex items-center gap-2 px-4 pt-3 pb-1 text-sm text-gray-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
          <span>Replying to </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (replyTarget!.author.did && onOpenProfile) {
                if (e.shiftKey || e.metaKey || e.ctrlKey) {
                  window.open(buildProfileUrl(replyTarget!.author.handle, replyTarget!.author.did), '_blank');
                } else {
                  onOpenProfile(replyTarget!.author.did);
                }
              }
            }}
            className="text-blue-500 hover:underline font-medium"
          >
            @{replyTarget!.author.handle}
          </button>
        </div>
      )}
      <div className={`flex gap-3 p-4 w-full max-w-full ${repostedBy || hasReplyInfo ? 'pt-2' : ''}`}>
        {/* Avatar */}
        <ProfileHoverCard
          did={author.did}
          handle={author.handle}
          onOpenProfile={(e) => {
            if (e?.shiftKey || e?.metaKey || e?.ctrlKey) {
              window.open(buildProfileUrl(author.handle, author.did), '_blank');
            } else if (onOpenProfile) {
              onOpenProfile(author.did);
            } else {
              window.location.href = buildProfileUrl(author.handle, author.did);
            }
          }}
        >
          <button
            className="flex-shrink-0 relative cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              if (e.shiftKey || e.metaKey || e.ctrlKey) {
                window.open(buildProfileUrl(author.handle, author.did), '_blank');
              } else if (onOpenProfile) {
                onOpenProfile(author.did);
              } else {
                window.location.href = buildProfileUrl(author.handle, author.did);
              }
            }}
          >
            {author.avatar ? (
              <img
                src={author.avatar}
                alt={author.displayName || author.handle}
                className={`w-12 h-12 rounded-full hover:opacity-80 transition-opacity ${
                  author.viewer?.following && author.viewer?.followedBy && settings.showMutualRing
                    ? 'ring-[3px] ring-purple-400 dark:ring-purple-400/60 shadow-[0_0_8px_rgba(192,132,252,0.5)] dark:shadow-[0_0_8px_rgba(167,139,250,0.4)]'
                    : author.viewer?.following && settings.showFollowingRing
                    ? 'ring-[3px] ring-blue-300 dark:ring-blue-400/60 shadow-[0_0_8px_rgba(147,197,253,0.5)] dark:shadow-[0_0_8px_rgba(96,165,250,0.4)]'
                    : author.viewer?.followedBy && settings.showFollowerRing
                    ? 'ring-[3px] ring-yellow-400 dark:ring-yellow-400/60 shadow-[0_0_8px_rgba(250,204,21,0.5)] dark:shadow-[0_0_8px_rgba(250,204,21,0.4)]'
                    : ''}`}
              />
            ) : (
              <div className={`w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold hover:opacity-80 transition-opacity ${
                  author.viewer?.following && author.viewer?.followedBy && settings.showMutualRing
                    ? 'ring-[3px] ring-purple-400 dark:ring-purple-400/60 shadow-[0_0_8px_rgba(192,132,252,0.5)] dark:shadow-[0_0_8px_rgba(167,139,250,0.4)]'
                    : author.viewer?.following && settings.showFollowingRing
                    ? 'ring-[3px] ring-blue-300 dark:ring-blue-400/60 shadow-[0_0_8px_rgba(147,197,253,0.5)] dark:shadow-[0_0_8px_rgba(96,165,250,0.4)]'
                    : author.viewer?.followedBy && settings.showFollowerRing
                    ? 'ring-[3px] ring-yellow-400 dark:ring-yellow-400/60 shadow-[0_0_8px_rgba(250,204,21,0.5)] dark:shadow-[0_0_8px_rgba(250,204,21,0.4)]'
                    : ''}`}>
                {(author.displayName || author.handle)[0].toUpperCase()}
              </div>
            )}
            {isVerified && (
              <span className="absolute -bottom-0.5 -right-0.5">
                <VerifiedBadge />
              </span>
            )}
          </button>
        </ProfileHoverCard>

        {/* Content */}
        <div className="flex-1 min-w-0 max-w-full overflow-hidden relative">
          {/* Detach Quote button - shown if this post quotes one of our posts */}
          {canDetachQuote && (
            <div className="absolute top-0 right-0">
              {showDetachConfirm ? (
                <div className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg" onClick={(e) => e.stopPropagation()}>
                  <span className="text-xs text-gray-600 dark:text-gray-300">Detach your post?</span>
                  <button
                    onClick={handleDetachQuote}
                    disabled={isDetaching}
                    className="px-2 py-0.5 text-xs font-medium text-white bg-gray-500 hover:bg-gray-600 rounded transition-colors disabled:opacity-50"
                  >
                    {isDetaching ? '...' : 'Yes'}
                  </button>
                  <button
                    onClick={() => setShowDetachConfirm(false)}
                    className="px-2 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowDetachConfirm(true); }}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 font-medium px-2 py-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
                >
                  Detach Quote
                </button>
              )}
            </div>
          )}

          {/* Header */}
          <div className="flex items-center gap-1 text-base lg:text-sm flex-wrap">
            <ProfileHoverCard
              did={author.did}
              handle={author.handle}
          onOpenProfile={(e) => {
                if (e?.shiftKey || e?.metaKey || e?.ctrlKey) {
                  window.open(buildProfileUrl(author.handle, author.did), '_blank');
                } else if (onOpenProfile) {
                  onOpenProfile(author.did);
                } else {
                  window.location.href = buildProfileUrl(author.handle, author.did);
                }
              }}
            >
              <button
                className="font-semibold text-gray-900 dark:text-gray-100 truncate hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  if (e.shiftKey || e.metaKey || e.ctrlKey) {
                    window.open(buildProfileUrl(author.handle, author.did), '_blank');
                  } else if (onOpenProfile) {
                    onOpenProfile(author.did);
                  } else {
                    window.location.href = buildProfileUrl(author.handle, author.did);
                  }
                }}
              >
                {author.displayName || author.handle}
              </button>
            </ProfileHoverCard>
            <span className="text-gray-500 truncate">@{author.handle}</span>
            <span className="text-gray-500">·</span>
            <span className="text-gray-500">{formatDate(record.createdAt)}</span>
            {/* Paper discussion link */}
            {hasPaper && settings.showPaperHighlights && paperId && (
              <a
                href={`/paper/${encodeURIComponent(paperId)}${paperUrl ? `?url=${encodeURIComponent(paperUrl)}` : ''}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full hover:bg-purple-200 dark:hover:bg-purple-800/40 transition-colors relative z-10"
                title="View paper discussion"
              >
                Discussion
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
          </div>
          {/* Labels from moderation services - shown below author info */}
          <ProfileLabels profile={author as unknown as BlueskyProfile} compact />

          {/* Post text */}
          {editing ? (
            <div className="mt-1" onClick={(e) => e.stopPropagation()}>
              <textarea
                ref={editTextareaRef}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full min-h-[80px] p-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                maxLength={MAX_EDIT_CHARS}
                disabled={saving}
              />
              <div className="flex items-center justify-between mt-2">
                <span className={`text-xs ${editText.length > MAX_EDIT_CHARS ? 'text-red-500' : 'text-gray-400'}`}>
                  {editText.length}/{MAX_EDIT_CHARS} <span className="text-gray-400">(+{EDITED_SUFFIX.length} for &quot;edited&quot; tag)</span>
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={handleCancelEdit}
                    disabled={saving}
                    className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={saving || !editText.trim() || editText === currentText || editText.length > MAX_EDIT_CHARS}
                    className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-base lg:text-[15px] text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
              <RichText text={currentText} facets={currentFacets} />
              {hasExtendedText && (
                <span className="inline-flex items-center ml-1 text-xs text-blue-500 dark:text-blue-400" title="Extended post - full content visible on Lea">
                  <svg className="w-3 h-3 mr-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V8z" clipRule="evenodd" />
                  </svg>
                  Extended
                </span>
              )}
            </p>
          )}

          {/* Embedded content (images, links, etc.) */}
          <PostEmbed embed={post.embed} onOpenThread={onOpenThread} />

          {/* Poll - only check for posts with the poll marker (📊) to avoid unnecessary API requests */}
          {record?.text?.includes('📊') && <PollDisplay postUri={post.uri} />}

          {/* Engagement actions */}
          <div className="flex gap-6 lg:gap-4 mt-3 text-base lg:text-sm text-gray-500">
            {/* Reply button */}
            <button
              onClick={() => setShowReplyComposer(!showReplyComposer)}
              className="flex items-center gap-1.5 lg:gap-1 hover:text-blue-500 transition-colors py-1"
            >
              <svg className="w-5 h-5 lg:w-4 lg:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {formatCount(replyCount)}
            </button>

            {/* Repost/Quote button with dropdown */}
            <div className="relative" ref={repostMenuRef}>
              <button
                onClick={() => setShowRepostMenu(!showRepostMenu)}
                disabled={reposting}
                className={`flex items-center gap-1.5 lg:gap-1 transition-colors py-1 ${
                  isReposted
                    ? 'text-green-500 hover:text-green-600'
                    : 'hover:text-green-500'
                } ${reposting ? 'opacity-50' : ''}`}
                title="Repost or quote"
              >
                <svg className="w-5 h-5 lg:w-4 lg:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {formatCount(repostCount)}
              </button>

              {/* Repost dropdown menu */}
              {showRepostMenu && (
                <div className="absolute bottom-full left-0 mb-2 w-36 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                  <button
                    onClick={() => {
                      handleRepost();
                      setShowRepostMenu(false);
                    }}
                    disabled={reposting}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-300"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {isReposted ? 'Undo repost' : 'Repost'}
                  </button>
                  <button
                    onClick={() => {
                      openComposer({
                        uri: post.uri,
                        cid: post.cid,
                        author: {
                          did: author.did,
                          handle: author.handle,
                          displayName: author.displayName,
                          avatar: author.avatar,
                        },
                        text: record.text,
                        createdAt: record.createdAt,
                      });
                      setShowRepostMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-300"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Quote post
                  </button>
                </div>
              )}
            </div>

            {/* View quotes button */}
            {(post.quoteCount ?? 0) > 0 && (
              <button
                onClick={() => setShowQuotes(true)}
                className="flex items-center gap-1.5 lg:gap-1 hover:text-purple-500 transition-colors py-1"
                title="View quotes"
              >
                <svg className="w-5 h-5 lg:w-4 lg:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
                {formatCount(post.quoteCount || 0)}
              </button>
            )}

            {/* Like button */}
            <button
              onClick={handleLike}
              disabled={liking}
              className={`flex items-center gap-1.5 lg:gap-1 transition-colors py-1 ${
                isLiked
                  ? 'text-red-500 hover:text-red-600'
                  : 'hover:text-red-500'
              } ${liking ? 'opacity-50' : ''}`}
            >
              <svg
                className="w-5 h-5 lg:w-4 lg:h-4"
                fill={isLiked ? 'currentColor' : 'none'}
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              {formatCount(likeCount)}
            </button>

            {/* Bookmark button */}
            <div className="relative" ref={bookmarkMenuRef}>
              <button
                ref={bookmarkButtonRef}
                type="button"
                onClick={handleBookmarkClick}
                className={`flex items-center gap-1.5 lg:gap-1 transition-colors py-1 ${
                  bookmarked
                    ? 'text-blue-500 hover:text-blue-600'
                    : 'hover:text-blue-500'
                }`}
                title={bookmarked ? 'Manage bookmark' : 'Bookmark'}
              >
                <svg
                  className="w-5 h-5 lg:w-4 lg:h-4"
                  fill={bookmarked ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </button>

              {/* Collection dropdown menu - rendered via portal to escape overflow clipping */}
              {showBookmarkMenu && collections.length > 0 && bookmarkMenuStyle && typeof document !== 'undefined' && createPortal(
                <div 
                  ref={bookmarkMenuRef}
                  className="fixed w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-[9999]"
                  style={{ top: bookmarkMenuStyle.top, left: bookmarkMenuStyle.left }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                    Add to collection
                  </div>
                  {collections.map((collection) => {
                    const isInCollection = bookmarked && getBookmarkCollections(post.uri).includes(collection.id);
                    // Get color class based on collection's stored color
                    const colorBgClass = {
                      'rose': 'bg-rose-500',
                      'emerald': 'bg-emerald-500',
                      'purple': 'bg-purple-500',
                      'blue': 'bg-blue-500',
                      'amber': 'bg-amber-500',
                      'cyan': 'bg-cyan-500',
                    }[collection.color] || 'bg-rose-500';
                    return (
                      <button
                        key={collection.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleBookmarkCollection(collection.id);
                        }}
                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                      >
                        <span className={`w-2 h-2 rounded-full ${colorBgClass}`} />
                        <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{collection.name}</span>
                        {isInCollection && (
                          <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                  {/* Uncategorized option */}
                  {!bookmarked && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        addBookmarkWithData([]);
                        setShowBookmarkMenu(false);
                      }}
                      className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 border-t border-gray-100 dark:border-gray-700"
                    >
                      <span className="w-2 h-2 rounded-full bg-gray-400" />
                      <span className="flex-1 text-gray-700 dark:text-gray-300">Uncategorized</span>
                    </button>
                  )}
                  {/* Remove bookmark option */}
                  {bookmarked && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveBookmark();
                      }}
                      className="w-full px-3 py-1.5 text-left text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 border-t border-gray-100 dark:border-gray-700"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      <span>Remove bookmark</span>
                    </button>
                  )}
                </div>,
                document.body
              )}
            </div>

            {/* Share button */}
            <div className="relative">
              <button
                ref={shareButtonRef}
                onClick={handleShareClick}
                className={`flex items-center gap-1.5 lg:gap-1 transition-colors py-1 ${
                  showCopied ? 'text-green-500' : 'hover:text-blue-500'
                }`}
                title={showCopied ? (copiedType === 'lea' ? 'Lea link copied!' : 'Bluesky link copied!') : 'Copy link'}
              >
                {showCopied ? (
                  <svg className="w-5 h-5 lg:w-4 lg:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 lg:w-4 lg:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                )}
              </button>

              {/* Share dropdown menu - rendered via portal to escape overflow clipping */}
              {showShareMenu && shareMenuStyle && typeof document !== 'undefined' && createPortal(
                <div
                  ref={shareMenuRef}
                  className="fixed w-44 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-[9999]"
                  style={{ 
                    top: shareMenuStyle.top, 
                    left: shareMenuStyle.left,
                    transform: 'translate(-50%, -100%)'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                    Copy link
                  </div>
                  <button
                    onClick={handleCopyLeaLink}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-300"
                  >
                    <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                    </svg>
                    <span>Lea link</span>
                  </button>
                  <button
                    onClick={handleCopyBlueskyLink}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-300"
                  >
                    <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 01-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z" />
                    </svg>
                    <span>Bluesky link</span>
                  </button>
                </div>,
                document.body
              )}
            </div>

            {/* Reply settings button - only for own posts */}
            {isOwnPost && (
              <button
                onClick={() => setShowThreadgateEditor(!showThreadgateEditor)}
                className={`flex items-center gap-1.5 lg:gap-1 transition-colors py-1 ${
                  currentThreadgate !== 'open'
                    ? 'text-amber-500 hover:text-amber-600'
                    : 'hover:text-amber-500'
                }`}
                title={`Reply settings: ${currentThreadgate === 'open' ? 'Anyone can reply' :
                  currentThreadgate === 'following' ? 'Only people you follow' :
                  currentThreadgate === 'verified' ? 'Your community' : 'Verified researchers only'}`}
              >
                <svg
                  className="w-5 h-5 lg:w-4 lg:h-4"
                  fill={currentThreadgate !== 'open' ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </button>
            )}

            {/* Edit button - only for own posts less than 10 minutes old */}
            {isOwnPost && !editing && isEditableAge && (
              <button
                onClick={handleStartEdit}
                className="flex items-center gap-1.5 lg:gap-1 transition-colors py-1 hover:text-blue-500"
                title="Edit post (available for 10 minutes after posting)"
              >
                <svg className="w-5 h-5 lg:w-4 lg:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}

            {/* Delete button - only for own posts */}
            {isOwnPost && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className={`flex items-center gap-1.5 lg:gap-1 transition-colors py-1 hover:text-red-500 ${deleting ? 'opacity-50' : ''}`}
                title="Delete post"
              >
                <svg className="w-5 h-5 lg:w-4 lg:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}

            {/* Feed interaction buttons - only show for feeds that support interactions */}
            {supportsInteractions && (
              <>
                {interactionSent ? (
                  <span className="text-xs text-gray-400 ml-auto">
                    {interactionSent === 'requestMore' ? 'Showing more like this' : 'Showing less like this'}
                  </span>
                ) : (
                  <>
                    {/* Desktop: show inline buttons */}
                    <button
                      onClick={() => handleFeedInteraction('requestMore')}
                      disabled={sendingInteraction}
                      className="hidden lg:flex items-center gap-1 hover:text-green-500 transition-colors ml-auto"
                      title="Show more like this"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 15l7-7 7 7" />
                      </svg>
                      <span className="text-xs">More</span>
                    </button>
                    <button
                      onClick={() => handleFeedInteraction('requestLess')}
                      disabled={sendingInteraction}
                      className="hidden lg:flex items-center gap-1 hover:text-orange-500 transition-colors"
                      title="Show less like this"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
                      </svg>
                      <span className="text-xs">Less</span>
                    </button>
                    {/* Mobile: show ... menu that expands */}
                    <div className="lg:hidden ml-auto relative" ref={mobileInteractionMenuRef}>
                      <button
                        onClick={() => setShowMobileInteractionMenu(!showMobileInteractionMenu)}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                        title="Feed preferences"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <circle cx="12" cy="6" r="2" />
                          <circle cx="12" cy="12" r="2" />
                          <circle cx="12" cy="18" r="2" />
                        </svg>
                      </button>
                      {showMobileInteractionMenu && (
                        <div className="absolute right-0 bottom-full mb-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[140px] z-20">
                          <button
                            onClick={() => { handleFeedInteraction('requestMore'); setShowMobileInteractionMenu(false); }}
                            disabled={sendingInteraction}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-green-600 dark:text-green-400"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 15l7-7 7 7" />
                            </svg>
                            <span className="text-sm">More like this</span>
                          </button>
                          <button
                            onClick={() => { handleFeedInteraction('requestLess'); setShowMobileInteractionMenu(false); }}
                            disabled={sendingInteraction}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-orange-600 dark:text-orange-400"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
                            </svg>
                            <span className="text-sm">Less like this</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* Reply composer */}
          {showReplyComposer && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
              <div className="relative">
                <textarea
                  ref={replyTextareaRef}
                  value={replyText}
                  onChange={handleReplyTextChange}
                  onKeyDown={handleReplyKeyDown}
                  onPaste={handleReplyPaste}
                  placeholder={`Reply to @${author.handle}...`}
                  className="w-full p-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                  rows={3}
                  disabled={replying}
                />
                {/* Mention suggestions dropdown */}
                {replySuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 max-h-[200px] overflow-y-auto">
                    {replySuggestions.map((user, index) => (
                      <button
                        key={user.did}
                        type="button"
                        onClick={() => insertReplyMention(user.handle)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 ${
                          index === replySelectedIndex ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                        }`}
                      >
                        {user.avatar ? (
                          <img src={user.avatar} alt="" className="w-7 h-7 rounded-full" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
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
                    {replyLoadingSuggestions && (
                      <div className="px-3 py-2 text-xs text-gray-400 text-center">Searching...</div>
                    )}
                  </div>
                )}
              </div>
              {/* Image previews */}
              {replyImages.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {replyImages.map((img, index) => (
                    <div key={index} className="relative w-16 h-16">
                      <img
                        src={img.preview}
                        alt={img.alt || `Image ${index + 1}`}
                        className="w-full h-full object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => handleReplyImageRemove(index)}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {replyError && (
                <p className="mt-1 text-xs text-red-500">{replyError}</p>
              )}
              <div className="flex justify-between items-center mt-2">
                <div className="flex items-center gap-2">
                  {/* Image upload button */}
                  <input
                    ref={replyFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleReplyImageSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => replyFileInputRef.current?.click()}
                    disabled={replyImages.length >= MAX_REPLY_IMAGES || replying}
                    className="p-1 text-gray-500 hover:text-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={replyImages.length >= MAX_REPLY_IMAGES ? 'Max 4 images' : 'Add image'}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <EmojiPicker onSelect={insertReplyEmoji} />
                  <span className={`text-xs ${replyText.length > 300 ? 'text-red-500' : 'text-gray-400'}`}>
                    {replyText.length}/300
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowReplyComposer(false);
                      setReplyText('');
                      setReplyImages([]);
                      setReplyError(null);
                    }}
                    className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReply}
                    disabled={(!replyText.trim() && replyImages.length === 0) || replying || replyText.length > 300}
                    className="px-3 py-1 text-sm bg-blue-500 text-white rounded-full hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {replying ? 'Posting...' : 'Reply'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Quote composer */}
          {showQuoteComposer && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
              <div className="relative">
                <textarea
                  ref={quoteTextareaRef}
                  value={quoteText}
                  onChange={handleQuoteTextChange}
                  onKeyDown={handleQuoteKeyDown}
                  placeholder="Add your thoughts..."
                  className="w-full p-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                  rows={3}
                  disabled={quoting}
                />
                {/* Quote mention suggestions dropdown */}
                {quoteSuggestions.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {quoteSuggestions.map((user, index) => (
                      <button
                        key={user.did}
                        type="button"
                        onClick={() => insertQuoteMention(user.handle)}
                        className={`w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${
                          index === quoteSelectedIndex ? 'bg-gray-100 dark:bg-gray-700' : ''
                        }`}
                      >
                        {user.avatar ? (
                          <img src={user.avatar} alt="" className="w-6 h-6 rounded-full" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-gray-300 dark:bg-gray-600" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {user.displayName || user.handle}
                          </div>
                          <div className="text-xs text-gray-500 truncate">@{user.handle}</div>
                        </div>
                      </button>
                    ))}
                    {quoteLoadingSuggestions && (
                      <div className="px-3 py-2 text-xs text-gray-500">Loading...</div>
                    )}
                  </div>
                )}
              </div>
              {/* Preview of quoted post */}
              <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-xs">
                <div className="flex items-center gap-1 text-gray-500">
                  <span className="font-medium text-gray-700 dark:text-gray-300">@{author.handle}</span>
                </div>
                <p className="mt-1 text-gray-600 dark:text-gray-400 line-clamp-2">{record.text}</p>
              </div>
              {quoteError && (
                <p className="mt-1 text-xs text-red-500">{quoteError}</p>
              )}
              <div className="flex justify-between items-center mt-2">
                <div className="flex items-center gap-2">
                  <EmojiPicker onSelect={insertQuoteEmoji} />
                  <span className={`text-xs ${quoteText.length > 300 ? 'text-red-500' : 'text-gray-400'}`}>
                    {quoteText.length}/300
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowQuoteComposer(false);
                      setQuoteText('');
                      setQuoteError(null);
                    }}
                    className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleQuote}
                    disabled={!quoteText.trim() || quoting || quoteText.length > 300}
                    className="px-3 py-1 text-sm bg-blue-500 text-white rounded-full hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {quoting ? 'Posting...' : 'Quote'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Threadgate editor - only for own posts */}
          {showThreadgateEditor && isOwnPost && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Who can reply to this post?
              </div>
              <div className="space-y-2">
                {[
                  { value: 'open' as ThreadgateType, label: 'Anyone', desc: 'Anyone can reply' },
                  { value: 'following' as ThreadgateType, label: 'People you follow', desc: 'Only people you follow can reply' },
                  { value: 'verified' as ThreadgateType, label: 'My community', desc: 'Verified researchers + your connections' },
                  { value: 'researchers' as ThreadgateType, label: 'Verified researchers only', desc: 'Only verified researchers can reply' },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleThreadgateUpdate(option.value)}
                    disabled={updatingThreadgate}
                    className={`w-full text-left p-2 rounded-lg border transition-colors ${
                      currentThreadgate === option.value
                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    } ${updatingThreadgate ? 'opacity-50 cursor-wait' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className={`font-medium text-sm ${
                          currentThreadgate === option.value
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-gray-700 dark:text-gray-300'
                        }`}>
                          {option.label}
                        </div>
                        <div className="text-xs text-gray-500">{option.desc}</div>
                      </div>
                      {currentThreadgate === option.value && (
                        <svg className="w-5 h-5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              {threadgateError && (
                <p className="mt-2 text-xs text-red-500">{threadgateError}</p>
              )}
              {updatingThreadgate && (
                <p className="mt-2 text-xs text-gray-500">Updating reply settings...</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Profile modal */}
      {showProfile && (
        <ProfileView
          did={author.did}
          avatar={author.avatar}
          displayName={author.displayName}
          handle={author.handle}
          onClose={() => setShowProfile(false)}
          onEdit={() => {
            setShowProfile(false);
            setShowProfileEditor(true);
          }}
        />
      )}

      {/* Profile editor modal */}
      {showProfileEditor && (
        <ProfileEditor onClose={() => setShowProfileEditor(false)} />
      )}

      {/* Quotes modal */}
      {showQuotes && (
        <QuotesView
          uri={post.uri}
          onClose={() => setShowQuotes(false)}
          onOpenThread={onOpenThread}
        />
      )}
    </ArticleWrapper>
  );
}
