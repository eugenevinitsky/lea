'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  listConvos,
  getConvo,
  getMessages,
  sendMessage,
  updateRead,
  getChatLog,
  getMyFollows,
  Convo,
  ChatMessage,
  LogEntry,
  getSession,
} from '@/lib/bluesky';

const POLL_INTERVAL = 10000;

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

function formatMessageTime(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function DMSidebar() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [convos, setConvos] = useState<Convo[]>([]);
  const [followingDids, setFollowingDids] = useState<Set<string> | null>(null);
  const [showRequests, setShowRequests] = useState(false);
  const [selectedConvoId, setSelectedConvoId] = useState<string | null>(null);
  const [selectedConvo, setSelectedConvo] = useState<Convo | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalUnread, setTotalUnread] = useState(0);
  const [logCursor, setLogCursor] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const session = getSession();

  // Fetch conversations
  const fetchConvos = useCallback(async () => {
    try {
      setError(null);
      const response = await listConvos();
      setConvos(response.convos);
      const total = response.convos.reduce((sum, c) => sum + c.unreadCount, 0);
      setTotalUnread(total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, []);

  // Fetch messages for selected conversation
  const fetchMessages = useCallback(async (convoId: string) => {
    try {
      setLoading(true);
      const [convoResponse, messagesResponse] = await Promise.all([
        getConvo(convoId),
        getMessages(convoId),
      ]);
      setSelectedConvo(convoResponse.convo);
      setMessages(messagesResponse.messages.reverse());

      if (convoResponse.convo.unreadCount > 0) {
        await updateRead(convoId);
        fetchConvos(); // Refresh unread counts
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [fetchConvos]);

  // Poll for updates
  const pollForUpdates = useCallback(async () => {
    if (!isExpanded) return;

    try {
      const response = await getChatLog(logCursor || undefined);
      if (response.logs.length > 0) {
        setLogCursor(response.logs[response.logs.length - 1].rev);

        // Check for new messages in current convo
        if (selectedConvoId) {
          const newMsgs = response.logs
            .filter((log: LogEntry) =>
              log.$type === 'chat.bsky.convo.defs#logCreateMessage' &&
              log.convoId === selectedConvoId &&
              log.message
            )
            .map((log: LogEntry) => log.message!);

          if (newMsgs.length > 0) {
            setMessages(prev => {
              const currentIds = new Set(prev.map(m => m.id));
              const uniqueNew = newMsgs.filter(m => !currentIds.has(m.id));
              return [...prev, ...uniqueNew];
            });
            updateRead(selectedConvoId).catch(console.error);
          }
        }

        // Refresh convo list
        fetchConvos();
      }
    } catch (err) {
      console.error('Poll error:', err);
    }
  }, [isExpanded, logCursor, selectedConvoId, fetchConvos]);

  // Initialize and set up polling
  useEffect(() => {
    fetchConvos();

    // Fetch following list for filtering
    getMyFollows().then(follows => {
      setFollowingDids(follows);
    }).catch(console.error);

    // Initialize log cursor
    getChatLog().then(response => {
      if (response.logs.length > 0) {
        setLogCursor(response.logs[response.logs.length - 1].rev);
      }
    }).catch(console.error);
  }, [fetchConvos]);

  useEffect(() => {
    if (isExpanded) {
      pollIntervalRef.current = setInterval(pollForUpdates, POLL_INTERVAL);
      return () => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      };
    }
  }, [isExpanded, pollForUpdates]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when selecting a convo
  useEffect(() => {
    if (selectedConvoId) {
      inputRef.current?.focus();
    }
  }, [selectedConvoId]);

  const handleSelectConvo = (convoId: string) => {
    setSelectedConvoId(convoId);
    fetchMessages(convoId);
  };

  const handleBack = () => {
    setSelectedConvoId(null);
    setSelectedConvo(null);
    setMessages([]);
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedConvoId || sending) return;

    const text = newMessage.trim();
    setNewMessage('');
    setSending(true);

    try {
      const sent = await sendMessage(selectedConvoId, text);
      setMessages(prev => [...prev, sent]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
      setNewMessage(text);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const otherMember = selectedConvo?.members.find(m => m.did !== session?.did);

  // Filter conversations into main chats (from followed users) and requests (from strangers)
  // If followingDids hasn't loaded yet, show all in Messages to avoid flash of wrong content
  const followsLoaded = followingDids !== null;
  const { mainChats, requests } = convos.reduce(
    (acc, convo) => {
      const other = convo.members.find(m => m.did !== session?.did);
      if (!followsLoaded || (other && followingDids.has(other.did))) {
        acc.mainChats.push(convo);
      } else {
        acc.requests.push(convo);
      }
      return acc;
    },
    { mainChats: [] as Convo[], requests: [] as Convo[] }
  );

  const displayedConvos = showRequests ? requests : mainChats;
  const requestCount = requests.length;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="font-semibold text-gray-900 dark:text-gray-100">Messages</span>
          {totalUnread > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-bold bg-blue-500 text-white rounded-full">
              {totalUnread > 9 ? '9+' : totalUnread}
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-gray-200 dark:border-gray-800">
          {error && (
            <div className="p-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs">
              {error}
            </div>
          )}

          {selectedConvoId ? (
            // Message view
            <div className="flex flex-col h-[350px]">
              {/* Convo header */}
              <div className="flex items-center gap-2 p-2 border-b border-gray-100 dark:border-gray-800">
                <button
                  onClick={handleBack}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                >
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                {otherMember && (
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {otherMember.avatar ? (
                      <img src={otherMember.avatar} alt="" className="w-6 h-6 rounded-full" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                        {(otherMember.displayName || otherMember.handle)[0].toUpperCase()}
                      </div>
                    )}
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {otherMember.displayName || otherMember.handle}
                    </span>
                  </div>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full" />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">No messages yet</p>
                ) : (
                  <>
                    {messages.map((msg) => {
                      const isOwn = msg.sender.did === session?.did;
                      return (
                        <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[80%] px-2.5 py-1.5 rounded-xl text-xs ${
                              isOwn
                                ? 'bg-blue-500 text-white rounded-br-sm'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-sm'
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                            <p className={`text-[9px] mt-0.5 ${isOwn ? 'text-blue-100' : 'text-gray-400'}`}>
                              {formatMessageTime(msg.sentAt)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Input */}
              <div className="p-2 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    className="flex-1 px-2.5 py-1.5 bg-gray-100 dark:bg-gray-800 border-0 rounded-full text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!newMessage.trim() || sending}
                    className="p-1.5 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-full disabled:cursor-not-allowed"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            // Conversation list
            <div className="max-h-[350px] overflow-y-auto">
              {/* Tabs for Messages vs Requests */}
              <div className="flex border-b border-gray-100 dark:border-gray-800">
                <button
                  onClick={() => setShowRequests(false)}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                    !showRequests
                      ? 'text-blue-500 border-b-2 border-blue-500'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  Messages ({mainChats.length})
                </button>
                <button
                  onClick={() => setShowRequests(true)}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                    showRequests
                      ? 'text-blue-500 border-b-2 border-blue-500'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  Requests
                  {requestCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-amber-500 text-white rounded-full">
                      {requestCount > 9 ? '9+' : requestCount}
                    </span>
                  )}
                </button>
              </div>

              {displayedConvos.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-xs text-gray-400">
                    {showRequests ? 'No message requests' : 'No conversations yet'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {displayedConvos.map((convo) => {
                    const other = convo.members.find(m => m.did !== session?.did) || convo.members[0];
                    const hasUnread = convo.unreadCount > 0;

                    return (
                      <button
                        key={convo.id}
                        onClick={() => handleSelectConvo(convo.id)}
                        className="w-full p-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 text-left"
                      >
                        <div className="flex items-start gap-2">
                          {other.avatar ? (
                            <img src={other.avatar} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {(other.displayName || other.handle)[0].toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className={`text-xs truncate ${hasUnread ? 'font-semibold text-gray-900 dark:text-gray-100' : 'font-medium text-gray-700 dark:text-gray-300'}`}>
                                {other.displayName || other.handle}
                              </span>
                              {convo.lastMessage && (
                                <span className="text-[10px] text-gray-400 flex-shrink-0">
                                  {formatTime(convo.lastMessage.sentAt)}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <p className={`text-[11px] truncate flex-1 ${hasUnread ? 'text-gray-700 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400'}`}>
                                {convo.lastMessage ? (
                                  <>
                                    {convo.lastMessage.sender.did === session?.did && (
                                      <span className="text-gray-400">You: </span>
                                    )}
                                    {convo.lastMessage.text}
                                  </>
                                ) : (
                                  <span className="italic text-gray-400">No messages</span>
                                )}
                              </p>
                              {hasUnread && (
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
