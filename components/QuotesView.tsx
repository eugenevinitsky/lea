'use client';

import { useState, useEffect } from 'react';
import { AppBskyFeedDefs } from '@atproto/api';
import { getQuotes } from '@/lib/bluesky';
import Post from './Post';

interface QuotesViewProps {
  uri: string;
  onClose: () => void;
  onOpenThread?: (uri: string) => void;
}

export default function QuotesView({ uri, onClose, onOpenThread }: QuotesViewProps) {
  const [quotes, setQuotes] = useState<AppBskyFeedDefs.PostView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();

  useEffect(() => {
    async function loadQuotes() {
      try {
        setLoading(true);
        setError(null);
        const response = await getQuotes(uri);
        setQuotes(response.data.posts);
        setCursor(response.data.cursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load quotes');
      } finally {
        setLoading(false);
      }
    }

    loadQuotes();
  }, [uri]);

  const loadMore = async () => {
    if (!cursor || loading) return;
    try {
      setLoading(true);
      const response = await getQuotes(uri, cursor);
      setQuotes(prev => [...prev, ...response.data.posts]);
      setCursor(response.data.cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more quotes');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-950 rounded-2xl max-w-xl w-full my-8 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 p-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Quotes</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        {loading && quotes.length === 0 && (
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
            <p className="mt-2 text-gray-500">Loading quotes...</p>
          </div>
        )}

        {error && (
          <div className="p-8 text-center">
            <p className="text-red-500">{error}</p>
          </div>
        )}

        {!loading && !error && quotes.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-gray-500">No quotes yet</p>
          </div>
        )}

        {quotes.length > 0 && (
          <div>
            {quotes.map((post) => (
              <Post
                key={post.uri}
                post={post}
                onOpenThread={onOpenThread}
              />
            ))}

            {/* Load more button */}
            {cursor && !loading && (
              <div className="p-4">
                <button
                  onClick={loadMore}
                  className="w-full py-3 text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg"
                >
                  Load more
                </button>
              </div>
            )}

            {loading && quotes.length > 0 && (
              <div className="p-4 text-center text-gray-500">
                Loading more...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
