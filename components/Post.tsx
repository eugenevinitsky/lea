'use client';

import { AppBskyFeedDefs, AppBskyFeedPost, AppBskyEmbedExternal } from '@atproto/api';
import { isVerifiedResearcher, Label } from '@/lib/bluesky';
import { useSettings } from '@/lib/settings';

interface PostProps {
  post: AppBskyFeedDefs.PostView;
}

// Paper link detection
const PAPER_DOMAINS = [
  'arxiv.org',
  'doi.org',
  'semanticscholar.org',
  'aclanthology.org',
  'openreview.net',
  'biorxiv.org',
  'medrxiv.org',
  'ssrn.com',
  'nature.com',
  'science.org',
  'pnas.org',
  'acm.org/doi',
  'ieee.org',
  'springer.com',
  'wiley.com',
];

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

export default function Post({ post }: PostProps) {
  const { settings } = useSettings();
  const record = post.record as AppBskyFeedPost.Record;
  const author = post.author;
  const isVerified = isVerifiedResearcher(author.labels as Label[] | undefined);
  const { hasPaper, domain } = containsPaperLink(record.text, post.embed);

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

  // Dim non-verified if setting enabled
  const dimmed = settings.dimNonVerified && !isVerified;

  return (
    <article className={`border-b border-gray-200 dark:border-gray-800 p-4 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors ${dimmed ? 'opacity-60' : ''}`}>
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="flex-shrink-0 relative">
          {author.avatar ? (
            <img
              src={author.avatar}
              alt={author.displayName || author.handle}
              className="w-12 h-12 rounded-full"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
              {(author.displayName || author.handle)[0].toUpperCase()}
            </div>
          )}
          {/* Badge on avatar */}
          {isVerified && (
            <div className="absolute -bottom-1 -right-1">
              <VerifiedBadge />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-1 text-sm flex-wrap">
            <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">
              {author.displayName || author.handle}
            </span>
            {isVerified && (
              <span className="text-emerald-500 text-xs font-medium px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 rounded">
                Researcher
              </span>
            )}
            <span className="text-gray-500 truncate">@{author.handle}</span>
            <span className="text-gray-500">·</span>
            <span className="text-gray-500">{formatDate(record.createdAt)}</span>
            {/* Paper indicator */}
            {hasPaper && settings.showPaperHighlights && (
              <PaperIndicator domain={domain} />
            )}
          </div>

          {/* Post text */}
          <p className="mt-1 text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
            {record.text}
          </p>

          {/* Engagement stats */}
          <div className="flex gap-6 mt-3 text-sm text-gray-500">
            <span>{post.replyCount || 0} replies</span>
            <span>{post.repostCount || 0} reposts</span>
            <span>{post.likeCount || 0} likes</span>
          </div>
        </div>
      </div>
    </article>
  );
}
