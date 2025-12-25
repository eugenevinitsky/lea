'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ConversationList from './ConversationList';
import MessageView from './MessageView';
import { getChatLog, ChatMessage, LogEntry, listConvos } from '@/lib/bluesky';

interface DirectMessagesProps {
  onClose: () => void;
  isVisible: boolean;
}

const POLL_INTERVAL = 10000; // 10 seconds

export default function DirectMessages({ onClose, isVisible }: DirectMessagesProps) {
  const [selectedConvoId, setSelectedConvoId] = useState<string | null>(null);
  const [logCursor, setLogCursor] = useState<string | null>(null);
  const [newMessagesByConvo, setNewMessagesByConvo] = useState<Record<string, ChatMessage[]>>({});
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);

  // Poll for new messages
  const pollForUpdates = useCallback(async () => {
    if (isPollingRef.current) return;
    isPollingRef.current = true;

    try {
      const response = await getChatLog(logCursor || undefined);

      if (response.logs.length > 0) {
        // Update cursor for next poll
        const lastLog = response.logs[response.logs.length - 1];
        setLogCursor(lastLog.rev);

        // Group new messages by convo
        const messagesByConvo: Record<string, ChatMessage[]> = {};
        response.logs.forEach((log: LogEntry) => {
          if (log.$type === 'chat.bsky.convo.defs#logCreateMessage' && log.message) {
            if (!messagesByConvo[log.convoId]) {
              messagesByConvo[log.convoId] = [];
            }
            messagesByConvo[log.convoId].push(log.message);
          }
        });

        if (Object.keys(messagesByConvo).length > 0) {
          setNewMessagesByConvo(prev => {
            const updated = { ...prev };
            Object.entries(messagesByConvo).forEach(([convoId, messages]) => {
              updated[convoId] = [...(prev[convoId] || []), ...messages];
            });
            return updated;
          });

          // Refresh unread counts
          const convosResponse = await listConvos();
          const counts: Record<string, number> = {};
          convosResponse.convos.forEach(c => {
            counts[c.id] = c.unreadCount;
          });
          setUnreadCounts(counts);
        }
      }
    } catch (err) {
      console.error('Failed to poll for chat updates:', err);
    } finally {
      isPollingRef.current = false;
    }
  }, [logCursor]);

  // Start/stop polling based on visibility
  useEffect(() => {
    if (!isVisible) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    // Initial poll
    pollForUpdates();

    // Set up interval
    pollIntervalRef.current = setInterval(pollForUpdates, POLL_INTERVAL);

    // Also poll when tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isVisible) {
        pollForUpdates();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isVisible, pollForUpdates]);

  // Initialize cursor on mount
  useEffect(() => {
    const initCursor = async () => {
      try {
        const response = await getChatLog();
        if (response.logs.length > 0) {
          setLogCursor(response.logs[response.logs.length - 1].rev);
        }
      } catch (err) {
        console.error('Failed to initialize chat log cursor:', err);
      }
    };
    initCursor();
  }, []);

  // Initial unread counts
  useEffect(() => {
    const fetchUnreads = async () => {
      try {
        const response = await listConvos();
        const counts: Record<string, number> = {};
        response.convos.forEach(c => {
          counts[c.id] = c.unreadCount;
        });
        setUnreadCounts(counts);
      } catch (err) {
        console.error('Failed to fetch unread counts:', err);
      }
    };
    fetchUnreads();
  }, []);

  const handleSelectConvo = (convoId: string) => {
    setSelectedConvoId(convoId);
    // Clear new messages for this convo since we're viewing it
    setNewMessagesByConvo(prev => {
      const updated = { ...prev };
      delete updated[convoId];
      return updated;
    });
  };

  const handleBack = () => {
    setSelectedConvoId(null);
  };

  const handleMessageSent = () => {
    // Could refresh conversation list here if needed
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg h-[600px] max-h-[80vh] bg-white dark:bg-gray-900 rounded-xl shadow-xl overflow-hidden flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Messages</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {selectedConvoId ? (
            <MessageView
              convoId={selectedConvoId}
              onBack={handleBack}
              onMessageSent={handleMessageSent}
              newMessages={newMessagesByConvo[selectedConvoId] || []}
            />
          ) : (
            <div className="h-full overflow-y-auto">
              <ConversationList
                onSelectConvo={handleSelectConvo}
                selectedConvoId={selectedConvoId || undefined}
                unreadCounts={unreadCounts}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Export a hook for checking unread count
export function useUnreadMessageCount() {
  const [totalUnread, setTotalUnread] = useState(0);

  useEffect(() => {
    const fetchUnreads = async () => {
      try {
        const response = await listConvos();
        const total = response.convos.reduce((sum, c) => sum + c.unreadCount, 0);
        setTotalUnread(total);
      } catch (err) {
        // Silently fail - user might not be logged in yet
      }
    };

    fetchUnreads();

    // Poll every 30 seconds for unread count when not viewing DMs
    const interval = setInterval(fetchUnreads, 30000);

    // Also update on visibility change
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchUnreads();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return totalUnread;
}
