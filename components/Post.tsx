'use client';

import { useState, useEffect, useRef } from 'react';
import { AppBskyFeedDefs, AppBskyFeedPost, AppBskyEmbedExternal, AppBskyEmbedImages, AppBskyEmbedRecord, AppBskyEmbedRecordWithMedia, AppBskyEmbedVideo } from '@atproto/api';
import Hls from 'hls.js';
import { isVerifiedResearcher, Label, createPost, ReplyRef, QuoteRef, likePost, unlikePost, repost, deleteRepost, deletePost, sendFeedInteraction, InteractionEvent, getSession, updateThreadgate, getThreadgateType, ThreadgateType, FEEDS } from '@/lib/bluesky';
import { useSettings } from '@/lib/settings';
import { useBookmarks, BookmarkedPost } from '@/lib/bookmarks';
import ProfileView from './ProfileView';
import ProfileEditor from './ProfileEditor';
import ProfileHoverCard from './ProfileHoverCard';
import QuotesView from './QuotesView';
import Link from 'next/link';
import { extractPaperUrl, extractAnyUrl, getPaperIdFromUrl, PAPER_DOMAINS, LinkFacet } from '@/lib/papers';

interface PostProps {
  post: AppBskyFeedDefs.PostView;
  feedContext?: string;
  reqId?: string;
  supportsInteractions?: boolean;
  feedUri?: string;
  // Repost reason - if present, shows "Reposted by X" header
  reason?: AppBskyFeedDefs.ReasonRepost | AppBskyFeedDefs.ReasonPin | { $type: string };
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

// Render post text with clickable links, mentions, and hashtags
function RichText({ text, facets }: { text: string; facets?: AppBskyFeedPost.Record['facets'] }) {
  if (!facets || facets.length === 0) {
    return <>{text}</>;
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

    // Add text before this facet
    if (byteStart > lastIndex) {
      const beforeBytes = bytes.slice(lastIndex, byteStart);
      const beforeText = new TextDecoder().decode(beforeBytes);
      elements.push(beforeText);
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
      elements.push(
        <a
          key={byteStart}
          href={`https://bsky.app/profile/${did}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {facetText}
        </a>
      );
    } else if (feature.$type === 'app.bsky.richtext.facet#tag') {
      const tag = (feature as { tag: string }).tag;
      elements.push(
        <a
          key={byteStart}
          href={`https://bsky.app/hashtag/${tag}`}
          target="_blank"
          rel="noopener noreferrer"
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

  // Add remaining text after last facet
  if (lastIndex < bytes.length) {
    const afterBytes = bytes.slice(lastIndex);
    const afterText = new TextDecoder().decode(afterBytes);
    elements.push(afterText);
  }

  return <>{elements}</>;
}

// Render embedded images
function EmbedImages({ images }: { images: AppBskyEmbedImages.ViewImage[] }) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const gridClass = images.length === 1 ? 'grid-cols-1' :
                    images.length === 2 ? 'grid-cols-2' :
                    images.length === 3 ? 'grid-cols-2' :
                    'grid-cols-2';

  return (
    <>
      <div className={`grid ${gridClass} gap-1 mt-2 rounded-xl overflow-hidden`}>
        {images.map((image, index) => (
          <div
            key={index}
            className={`relative cursor-pointer ${images.length === 3 && index === 0 ? 'row-span-2' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setExpandedImage(image.fullsize);
            }}
          >
            <img
              src={image.thumb}
              alt={image.alt || 'Image'}
              className="w-full h-full object-cover"
              style={{ maxHeight: images.length === 1 ? '400px' : '200px' }}
            />
            {image.alt && (
              <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/70 text-white text-xs rounded">
                ALT
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox for expanded image */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setExpandedImage(null)}
        >
          <button
            onClick={() => setExpandedImage(null)}
            className="absolute top-4 right-4 p-2 text-white hover:bg-white/20 rounded-full"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={expandedImage}
            alt="Expanded image"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

// Render external link card
function EmbedExternal({ external }: { external: AppBskyEmbedExternal.ViewExternal }) {
  return (
    <a
      href={external.uri}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 block border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
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
        <p className="font-medium text-sm text-gray-900 dark:text-gray-100 line-clamp-2">{external.title}</p>
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
        <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
          {author.displayName || author.handle}
        </span>
        {isVerified && (
          <span className="text-emerald-500 text-xs font-medium px-1 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 rounded">
            Researcher
          </span>
        )}
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
              return (
                <div key={i} className="flex gap-1 rounded-lg overflow-hidden">
                  {images.slice(0, 4).map((img, j) => (
                    <img
                      key={j}
                      src={img.thumb}
                      alt={img.alt || ''}
                      className="object-cover flex-1 h-20"
                      style={{ maxWidth: `${100 / Math.min(images.length, 4)}%` }}
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
                <div key={i} className="rounded-lg overflow-hidden bg-black h-20 relative">
                  {video.thumbnail ? (
                    <img src={video.thumbnail} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-8 h-8 text-white/50" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                </div>
              );
            }
            // Handle nested quote (record embed within quoted post)
            if ('record' in embed && (embed as AppBskyEmbedRecord.View).record) {
              const recordEmbed = embed as AppBskyEmbedRecord.View;
              return <EmbedRecord key={i} record={recordEmbed.record} onOpenThread={onOpenThread} />;
            }
            // Handle recordWithMedia (quote + images in quoted post)
            if ('media' in embed && (embed as AppBskyEmbedRecordWithMedia.View).media) {
              const rwm = embed as AppBskyEmbedRecordWithMedia.View;
              const media = rwm.media;
              return (
                <div key={i}>
                  {'images' in media && Array.isArray((media as AppBskyEmbedImages.View).images) && (
                    <div className="flex gap-1 rounded-lg overflow-hidden mb-2">
                      {(media as AppBskyEmbedImages.View).images.slice(0, 4).map((img, j) => (
                        <img
                          key={j}
                          src={img.thumb}
                          alt={img.alt || ''}
                          className="object-cover flex-1 h-20"
                          style={{ maxWidth: `${100 / Math.min((media as AppBskyEmbedImages.View).images.length, 4)}%` }}
                        />
                      ))}
                    </div>
                  )}
                  {rwm.record && <EmbedRecord record={rwm.record.record} onOpenThread={onOpenThread} />}
                </div>
              );
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
}

// Render embedded/quoted post
function EmbedRecord({ record, onOpenThread }: { record: AppBskyEmbedRecord.View['record']; onOpenThread?: (uri: string) => void }) {
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
    const feed = record as unknown as { displayName?: string; description?: string; uri?: string };
    return (
      <div className="mt-2 p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/50">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{feed.displayName || 'Feed'}</p>
        {feed.description && <p className="text-xs text-gray-500 mt-1">{feed.description}</p>}
      </div>
    );
  }

  // Handle list embeds
  if (record.$type === 'app.bsky.graph.defs#listView') {
    const list = record as unknown as { name?: string; description?: string };
    return (
      <div className="mt-2 p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/50">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{list.name || 'List'}</p>
        {list.description && <p className="text-xs text-gray-500 mt-1">{list.description}</p>}
      </div>
    );
  }

  // Handle starter pack embeds
  if (record.$type === 'app.bsky.graph.defs#starterPackViewBasic') {
    const pack = record as unknown as { record?: { name?: string; description?: string } };
    return (
      <div className="mt-2 p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/50">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{pack.record?.name || 'Starter Pack'}</p>
        {pack.record?.description && <p className="text-xs text-gray-500 mt-1">{pack.record.description}</p>}
      </div>
    );
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
      hls.loadSource(playlist);
      hls.attachMedia(videoElement);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [playlist]);

  return (
    <div className="mt-2 rounded-xl overflow-hidden bg-black">
      <div className="relative" style={{ paddingBottom }}>
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-contain"
          poster={thumbnail}
          controls
          preload="metadata"
          playsInline
        >
          Your browser does not support the video tag.
        </video>
      </div>
    </div>
  );
}

// Main embed renderer
function PostEmbed({ embed, onOpenThread }: { embed: AppBskyFeedDefs.PostView['embed']; onOpenThread?: (uri: string) => void }) {
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

export default function Post({ post, onReply, onOpenThread, feedContext, reqId, supportsInteractions, feedUri, onOpenProfile, reason }: PostProps & { onReply?: () => void; onOpenThread?: (uri: string) => void; onOpenProfile?: (did: string) => void }) {
  const { settings } = useSettings();
  
  // Check if this is a repost
  const isRepost = reason && '$type' in reason && reason.$type === 'app.bsky.feed.defs#reasonRepost';
  const repostedBy = isRepost && 'by' in reason ? reason.by : undefined;
  const { addBookmark, removeBookmark, isBookmarked } = useBookmarks();
  const [showReplyComposer, setShowReplyComposer] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // Like state
  const [isLiked, setIsLiked] = useState(!!post.viewer?.like);
  const [likeUri, setLikeUri] = useState<string | undefined>(post.viewer?.like);
  const [likeCount, setLikeCount] = useState(post.likeCount || 0);
  const [liking, setLiking] = useState(false);

  // Repost state
  const [isReposted, setIsReposted] = useState(!!post.viewer?.repost);
  const [repostUri, setRepostUri] = useState<string | undefined>(post.viewer?.repost);
  const [repostCount, setRepostCount] = useState(post.repostCount || 0);
  const [reposting, setReposting] = useState(false);

  // Quote state
  const [showQuoteComposer, setShowQuoteComposer] = useState(false);
  const [quoteText, setQuoteText] = useState('');
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Feed interaction state
  const [interactionSent, setInteractionSent] = useState<InteractionEvent | null>(null);
  const [sendingInteraction, setSendingInteraction] = useState(false);

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

  // Share state
  const [showCopied, setShowCopied] = useState(false);

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
  
  // Check if this is the current user's post
  const session = getSession();
  const isOwnPost = session?.did === author.did;
  
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

  const handleBookmark = () => {
    if (bookmarked) {
      removeBookmark(post.uri);
    } else {
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
      };
      addBookmark(bookmarkData);
    }
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

  const handleShare = async () => {
    // Use Lea URL format: /?post=at://...
    const url = `${window.location.origin}/?post=${encodeURIComponent(post.uri)}`;
    
    try {
      await navigator.clipboard.writeText(url);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
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
        setLikeCount((c) => Math.max(0, c - 1));
      } else {
        const result = await likePost(post.uri, post.cid);
        setIsLiked(true);
        setLikeUri(result.uri);
        setLikeCount((c) => c + 1);
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
        setRepostCount((c) => Math.max(0, c - 1));
      } else {
        const result = await repost(post.uri, post.cid);
        setIsReposted(true);
        setRepostUri(result.uri);
        setRepostCount((c) => c + 1);
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

      await createPost(
        quoteText,
        settings.autoThreadgate ? settings.threadgateType : 'open',
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

  const handleReply = async () => {
    if (!replyText.trim() || replying) return;

    try {
      setReplying(true);
      setReplyError(null);

      // For replies, we need root and parent
      // If this post is already a reply, use its root; otherwise this post is the root
      const existingReply = record.reply as ReplyRef | undefined;
      const replyRef: ReplyRef = {
        root: existingReply?.root || { uri: post.uri, cid: post.cid },
        parent: { uri: post.uri, cid: post.cid },
      };

      await createPost(
        replyText,
        settings.autoThreadgate ? settings.threadgateType : 'open',
        replyRef
      );

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

  return (
    <article className={`border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors ${dimmed ? 'opacity-60' : ''}`}>
      {/* Repost header */}
      {repostedBy && (
        <div className="flex items-center gap-2 px-4 pt-3 pb-1 text-sm text-gray-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (e.shiftKey) {
                window.open(`/${repostedBy.handle}`, '_blank');
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
      <div className={`flex gap-3 p-4 ${repostedBy ? 'pt-2' : ''}`}>
        {/* Avatar */}
        <ProfileHoverCard
          did={author.did}
          handle={author.handle}
          onOpenProfile={(e) => {
            if (e?.shiftKey) {
              window.open(`/${author.handle}`, '_blank');
            } else if (onOpenProfile) {
              onOpenProfile(author.did);
            } else {
              setShowProfile(true);
            }
          }}
        >
          <button
            className="flex-shrink-0 relative cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              if (e.shiftKey) {
                window.open(`/${author.handle}`, '_blank');
              } else if (onOpenProfile) {
                onOpenProfile(author.did);
              } else {
                setShowProfile(true);
              }
            }}
          >
            {author.avatar ? (
              <img
                src={author.avatar}
                alt={author.displayName || author.handle}
                className={`w-12 h-12 rounded-full hover:opacity-80 transition-opacity ${author.viewer?.following ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-white dark:ring-offset-gray-950' : ''}`}
              />
            ) : (
              <div className={`w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold hover:opacity-80 transition-opacity ${author.viewer?.following ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-white dark:ring-offset-gray-950' : ''}`}>
                {(author.displayName || author.handle)[0].toUpperCase()}
              </div>
            )}
            {/* Badge on avatar */}
            {isVerified && (
              <div className="absolute -bottom-1 -right-1">
                <VerifiedBadge />
              </div>
            )}
          </button>
        </ProfileHoverCard>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-1 text-sm flex-wrap">
            <ProfileHoverCard
              did={author.did}
              handle={author.handle}
              onOpenProfile={(e) => {
                if (e?.shiftKey) {
                  window.open(`/${author.handle}`, '_blank');
                } else if (onOpenProfile) {
                  onOpenProfile(author.did);
                } else {
                  setShowProfile(true);
                }
              }}
            >
              <button
                className="font-semibold text-gray-900 dark:text-gray-100 truncate hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  if (e.shiftKey) {
                    window.open(`/${author.handle}`, '_blank');
                  } else if (onOpenProfile) {
                    onOpenProfile(author.did);
                  } else {
                    setShowProfile(true);
                  }
                }}
              >
                {author.displayName || author.handle}
              </button>
            </ProfileHoverCard>
            {isVerified && (
              <span className="text-emerald-500 text-xs font-medium px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 rounded">
                Researcher
              </span>
            )}
            <span className="text-gray-500 truncate">@{author.handle}</span>
            <span className="text-gray-500">·</span>
            <span className="text-gray-500">{formatDate(record.createdAt)}</span>
            {/* Paper indicator and discussion link */}
            {hasPaper && settings.showPaperHighlights && (
              <>
                <PaperIndicator domain={domain} />
                {paperId && (
                  <Link
                    href={`/paper/${encodeURIComponent(paperId)}${paperUrl ? `?url=${encodeURIComponent(paperUrl)}` : ''}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded-full hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors"
                    title="View paper discussion"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                    </svg>
                    Discussion
                  </Link>
                )}
              </>
            )}
          </div>

          {/* Post text */}
          <p
            className={`mt-1 text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words ${onOpenThread ? 'cursor-pointer' : ''}`}
            onClick={() => onOpenThread?.(post.uri)}
          >
            <RichText text={record.text} facets={record.facets} />
          </p>

          {/* Embedded content (images, links, etc.) */}
          <PostEmbed embed={post.embed} onOpenThread={onOpenThread} />

          {/* Reply context indicator - only show if post has replies */}
          {record.reply && onOpenThread && (post.replyCount ?? 0) > 0 && (
            <button
              onClick={() => onOpenThread(post.uri)}
              className="mt-1 text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              View thread
            </button>
          )}

          {/* Engagement actions */}
          <div className="flex gap-4 mt-3 text-sm text-gray-500">
            {/* Reply button */}
            <button
              onClick={() => setShowReplyComposer(!showReplyComposer)}
              className="flex items-center gap-1 hover:text-blue-500 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {post.replyCount || 0}
            </button>

            {/* Repost button */}
            <button
              onClick={handleRepost}
              disabled={reposting}
              className={`flex items-center gap-1 transition-colors ${
                isReposted
                  ? 'text-green-500 hover:text-green-600'
                  : 'hover:text-green-500'
              } ${reposting ? 'opacity-50' : ''}`}
              title="Repost"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {repostCount}
            </button>

            {/* Quote button */}
            <button
              onClick={() => setShowQuoteComposer(!showQuoteComposer)}
              className="flex items-center gap-1 hover:text-blue-500 transition-colors"
              title="Quote post"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </button>

            {/* View quotes button */}
            {(post.quoteCount ?? 0) > 0 && (
              <button
                onClick={() => setShowQuotes(true)}
                className="flex items-center gap-1 hover:text-purple-500 transition-colors"
                title="View quotes"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
                {post.quoteCount}
              </button>
            )}

            {/* Like button */}
            <button
              onClick={handleLike}
              disabled={liking}
              className={`flex items-center gap-1 transition-colors ${
                isLiked
                  ? 'text-red-500 hover:text-red-600'
                  : 'hover:text-red-500'
              } ${liking ? 'opacity-50' : ''}`}
            >
              <svg
                className="w-4 h-4"
                fill={isLiked ? 'currentColor' : 'none'}
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              {likeCount}
            </button>

            {/* Bookmark button */}
            <button
              onClick={handleBookmark}
              className={`flex items-center gap-1 transition-colors ${
                bookmarked
                  ? 'text-blue-500 hover:text-blue-600'
                  : 'hover:text-blue-500'
              }`}
              title={bookmarked ? 'Remove bookmark' : 'Bookmark'}
            >
              <svg
                className="w-4 h-4"
                fill={bookmarked ? 'currentColor' : 'none'}
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>

            {/* Share button */}
            <button
              onClick={handleShare}
              className={`flex items-center gap-1 transition-colors ${
                showCopied ? 'text-green-500' : 'hover:text-blue-500'
              }`}
              title={showCopied ? 'Copied!' : 'Copy link'}
            >
              {showCopied ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              )}
            </button>

            {/* Reply settings button - only for own posts */}
            {isOwnPost && (
              <button
                onClick={() => setShowThreadgateEditor(!showThreadgateEditor)}
                className={`flex items-center gap-1 transition-colors ${
                  currentThreadgate !== 'open'
                    ? 'text-amber-500 hover:text-amber-600'
                    : 'hover:text-amber-500'
                }`}
                title={`Reply settings: ${currentThreadgate === 'open' ? 'Anyone can reply' : 
                  currentThreadgate === 'following' ? 'Only people you follow' :
                  currentThreadgate === 'verified' ? 'Your community' : 'Verified researchers only'}`}
              >
                <svg
                  className="w-4 h-4"
                  fill={currentThreadgate !== 'open' ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </button>
            )}

            {/* Delete button - only for own posts */}
            {isOwnPost && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className={`flex items-center gap-1 transition-colors hover:text-red-500 ${deleting ? 'opacity-50' : ''}`}
                title="Delete post"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    <button
                      onClick={() => handleFeedInteraction('requestMore')}
                      disabled={sendingInteraction}
                      className="flex items-center gap-1 hover:text-green-500 transition-colors ml-auto"
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
                      className="flex items-center gap-1 hover:text-orange-500 transition-colors"
                      title="Show less like this"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
                      </svg>
                      <span className="text-xs">Less</span>
                    </button>
                  </>
                )}
              </>
            )}
          </div>

          {/* Reply composer */}
          {showReplyComposer && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={`Reply to @${author.handle}...`}
                className="w-full p-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                rows={3}
                disabled={replying}
              />
              {replyError && (
                <p className="mt-1 text-xs text-red-500">{replyError}</p>
              )}
              <div className="flex justify-between items-center mt-2">
                <span className={`text-xs ${replyText.length > 300 ? 'text-red-500' : 'text-gray-400'}`}>
                  {replyText.length}/300
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowReplyComposer(false);
                      setReplyText('');
                      setReplyError(null);
                    }}
                    className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReply}
                    disabled={!replyText.trim() || replying || replyText.length > 300}
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
              <textarea
                value={quoteText}
                onChange={(e) => setQuoteText(e.target.value)}
                placeholder="Add your thoughts..."
                className="w-full p-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                rows={3}
                disabled={quoting}
              />
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
                <span className={`text-xs ${quoteText.length > 300 ? 'text-red-500' : 'text-gray-400'}`}>
                  {quoteText.length}/300
                </span>
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
    </article>
  );
}
