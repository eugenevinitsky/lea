'use client';

import { useState, useEffect, useCallback } from 'react';
import { listConvos, Convo, getSession } from '@/lib/bluesky';

interface ConversationListProps {
  onSelectConvo: (convoId: string) => void;
  selectedConvoId?: string;
  unreadCounts?: Record<string, number>;
  onRefresh?: () => void;
}

function formatTime(dateString: string) {
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
}

function ConvoItem({ convo, isSelected, onClick }: {
  convo: Convo;
  isSelected: boolean;
  onClick: () => void;
}) {
  const session = getSession();
  const otherMember = convo.members.find(m => m.did !== session?.did) || convo.members[0];
  const hasUnread = convo.unreadCount > 0;

  return (
    <div
      onClick={onClick}
      className={`p-3 cursor-pointer transition-colors ${
        isSelected
          ? 'bg-blue-50 dark:bg-blue-900/30'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
      }`}
    >
      <div className="flex items-start gap-3">
        {otherMember.avatar ? (
          <img
            src={otherMember.avatar}
            alt={otherMember.handle}
            className="w-10 h-10 rounded-full flex-shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            {(otherMember.displayName || otherMember.handle)[0].toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-sm truncate ${hasUnread ? 'font-semibold text-gray-900 dark:text-gray-100' : 'font-medium text-gray-700 dark:text-gray-300'}`}>
              {otherMember.displayName || otherMember.handle}
            </span>
            {convo.lastMessage && (
              <span className="text-xs text-gray-400 flex-shrink-0">
                {formatTime(convo.lastMessage.sentAt)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <p className={`text-xs truncate flex-1 ${hasUnread ? 'text-gray-800 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400'}`}>
              {convo.lastMessage ? (
                <>
                  {convo.lastMessage.sender.did === session?.did && (
                    <span className="text-gray-400">You: </span>
                  )}
                  {convo.lastMessage.text}
                </>
              ) : (
                <span className="italic text-gray-400">No messages yet</span>
              )}
            </p>
            {hasUnread && (
              <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ConversationList({
  onSelectConvo,
  selectedConvoId,
  unreadCounts,
  onRefresh,
}: ConversationListProps) {
  const [convos, setConvos] = useState<Convo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConvos = useCallback(async () => {
    try {
      setError(null);
      const response = await listConvos();

      // Update unread counts if provided externally
      const updatedConvos = response.convos.map(convo => ({
        ...convo,
        unreadCount: unreadCounts?.[convo.id] ?? convo.unreadCount,
      }));

      setConvos(updatedConvos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
    } finally {
      setLoading(false);
    }
  }, [unreadCounts]);

  useEffect(() => {
    fetchConvos();
  }, [fetchConvos]);

  // Update convos when unreadCounts changes externally
  useEffect(() => {
    if (unreadCounts && convos.length > 0) {
      setConvos(prev => prev.map(convo => ({
        ...convo,
        unreadCount: unreadCounts[convo.id] ?? convo.unreadCount,
      })));
    }
  }, [unreadCounts]);

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center">
        <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-red-500 mb-2">{error}</p>
        <button
          onClick={fetchConvos}
          className="text-sm text-blue-500 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (convos.length === 0) {
    return (
      <div className="p-4 text-center">
        <svg className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <p className="text-xs text-gray-400">No conversations yet</p>
        <p className="text-xs text-gray-400 mt-1">Start a chat from someone&apos;s profile</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-800">
      {convos.map((convo) => (
        <ConvoItem
          key={convo.id}
          convo={convo}
          isSelected={convo.id === selectedConvoId}
          onClick={() => onSelectConvo(convo.id)}
        />
      ))}
    </div>
  );
}
