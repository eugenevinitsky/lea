'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  listConvos,
  getConvo,
  getConvoForMembers,
  getMessages,
  sendMessage,
  updateRead,
  getChatLog,
  getMyFollows,
  leaveConvo,
  blockUser,
  searchActors,
  addMessageReaction,
  removeMessageReaction,
  Convo,
  ChatMessage,
  LogEntry,
  getSession,
} from '@/lib/bluesky';

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢'];

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

// Render message text with clickable links
function MessageText({ text, isOwn }: { text: string; isOwn: boolean }) {
  // Match URLs: 
  // 1. With protocol (http:// or https://)
  // 2. Starting with www.
  // 3. Domain-style URLs (e.g., docs.google.com/...)
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+|www\.[^\s<>"{}|\\^`[\]]+|[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?(?:\/[^\s<>"{}|\\^`[\]]*)?)/gi;
  
  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  
  // Use exec to find all matches with their positions
  const regex = new RegExp(urlRegex.source, 'gi');
  while ((match = regex.exec(text)) !== null) {
    const matchedUrl = match[0];
    const matchStart = match.index;
    
    // Add text before this match
    if (matchStart > lastIndex) {
      elements.push(<span key={`text-${lastIndex}`}>{text.slice(lastIndex, matchStart)}</span>);
    }
    
    // Skip truncated URLs (ending with ... or …) - they won't work as links
    const isTruncated = matchedUrl.endsWith('...') || matchedUrl.endsWith('…');
    
    if (isTruncated) {
      // Render as plain text, not a link
      elements.push(<span key={`text-${matchStart}`}>{matchedUrl}</span>);
    } else {
      // Determine the href (add https:// if no protocol)
      const href = matchedUrl.match(/^https?:\/\//i) ? matchedUrl : `https://${matchedUrl}`;
      
      elements.push(
        <a
          key={`link-${matchStart}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`underline break-all ${
            isOwn
              ? 'text-blue-100 hover:text-white'
              : 'text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300'
          }`}
        >
          {matchedUrl}
        </a>
      );
    }
    
    lastIndex = matchStart + matchedUrl.length;
  }
  
  // Add any remaining text after the last match
  if (lastIndex < text.length) {
    elements.push(<span key={`text-${lastIndex}`}>{text.slice(lastIndex)}</span>);
  }
  
  // If no matches found, return plain text
  if (elements.length === 0) {
    return <>{text}</>;
  }
  
  return <>{elements}</>;
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
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ did: string; handle: string; displayName?: string; avatar?: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const session = getSession();

  // Handle adding/removing reactions
  const handleReaction = async (messageId: string, emoji: string) => {
    if (!selectedConvoId) return;

    const message = messages.find(m => m.id === messageId);
    const existingReaction = message?.reactions?.find(
      r => r.value === emoji && r.sender.did === session?.did
    );

    try {
      let updatedMessage: ChatMessage;
      if (existingReaction) {
        updatedMessage = await removeMessageReaction(selectedConvoId, messageId, emoji);
      } else {
        updatedMessage = await addMessageReaction(selectedConvoId, messageId, emoji);
      }

      // Update the message in state
      setMessages(prev => prev.map(m =>
        m.id === messageId ? updatedMessage : m
      ));
    } catch (err) {
      console.error('Failed to update reaction:', err);
    }

    setShowReactionPicker(null);
  };

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
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
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

  const handleDeleteConvo = async (convoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await leaveConvo(convoId);
      setConvos(prev => prev.filter(c => c.id !== convoId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleBlockAndDelete = async (convoId: string, userDid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await blockUser(userDid);
      await leaveConvo(convoId);
      setConvos(prev => prev.filter(c => c.id !== convoId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to block');
    }
  };

  // Handle search for new chat
  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const results = await searchActors(query);
      setSearchResults(results.filter(a => a.did !== session?.did).slice(0, 10));
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  }, [session?.did]);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    if (searchQuery) {
      searchTimeoutRef.current = setTimeout(() => {
        handleSearch(searchQuery);
      }, 300);
    } else {
      setSearchResults([]);
    }
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, handleSearch]);

  // Focus search input when opening new chat
  useEffect(() => {
    if (showNewChat) {
      searchInputRef.current?.focus();
    }
  }, [showNewChat]);

  // Start a new chat with a user
  const handleStartChat = useCallback(async (userDid: string) => {
    setStartingChat(true);
    try {
      const result = await getConvoForMembers([session!.did, userDid]);
      setShowNewChat(false);
      setSearchQuery('');
      setSearchResults([]);
      setSelectedConvoId(result.convo.id);
      setSelectedConvo(result.convo);
      fetchMessages(result.convo.id);
      fetchConvos(); // Refresh the convo list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start chat');
    } finally {
      setStartingChat(false);
    }
  }, [session?.did, fetchMessages, fetchConvos]);

  // Listen for external "open DM with user" events (e.g., from profile page DM button)
  useEffect(() => {
    const handleOpenDMWithUser = (event: CustomEvent<{ did: string }>) => {
      const userDid = event.detail.did;
      if (userDid && session?.did) {
        setIsExpanded(true);
        handleStartChat(userDid);
      }
    };

    window.addEventListener('openDMWithUser', handleOpenDMWithUser as EventListener);
    return () => {
      window.removeEventListener('openDMWithUser', handleOpenDMWithUser as EventListener);
    };
  }, [session?.did, handleStartChat]);

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
            <div className="flex flex-col h-[350px] overscroll-contain">
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
              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto overscroll-contain p-2 space-y-2">
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
                      const isHovered = hoveredMessageId === msg.id;
                      const showPicker = showReactionPicker === msg.id;

                      // Group reactions by emoji
                      const reactionGroups = msg.reactions?.reduce((acc, r) => {
                        if (!acc[r.value]) {
                          acc[r.value] = { count: 0, hasOwn: false };
                        }
                        acc[r.value].count++;
                        if (r.sender.did === session?.did) {
                          acc[r.value].hasOwn = true;
                        }
                        return acc;
                      }, {} as Record<string, { count: number; hasOwn: boolean }>) || {};

                      return (
                        <div
                          key={msg.id}
                          className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group relative`}
                          onMouseEnter={() => setHoveredMessageId(msg.id)}
                          onMouseLeave={() => {
                            setHoveredMessageId(null);
                            if (!showPicker) setShowReactionPicker(null);
                          }}
                        >
                          {/* Reaction button - shows on hover, positioned outside message */}
                          {isHovered && !showPicker && (
                            <button
                              onClick={() => setShowReactionPicker(msg.id)}
                              className={`absolute ${isOwn ? 'left-0 -translate-x-full mr-1' : 'right-0 translate-x-full ml-1'} top-1/2 -translate-y-1/2 p-1 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity`}
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </button>
                          )}

                          {/* Reaction picker */}
                          {showPicker && (
                            <div
                              className={`absolute ${isOwn ? 'right-0' : 'left-0'} -top-8 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 px-1 py-0.5 flex gap-0.5 z-10`}
                              onMouseLeave={() => setShowReactionPicker(null)}
                            >
                              {QUICK_REACTIONS.map(emoji => (
                                <button
                                  key={emoji}
                                  onClick={() => handleReaction(msg.id, emoji)}
                                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-sm"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}

                          <div className="flex flex-col">
                            <div
                              className={`max-w-[80%] px-2.5 py-1.5 rounded-xl text-xs ${
                                isOwn
                                  ? 'bg-blue-500 text-white rounded-br-sm'
                                  : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-sm'
                              }`}
                            >
                              <p className="whitespace-pre-wrap break-words">
                                <MessageText text={msg.text} isOwn={isOwn} />
                              </p>
                              <p className={`text-[9px] mt-0.5 ${isOwn ? 'text-blue-100' : 'text-gray-400'}`}>
                                {formatMessageTime(msg.sentAt)}
                              </p>
                            </div>

                            {/* Display reactions */}
                            {Object.keys(reactionGroups).length > 0 && (
                              <div className={`flex gap-0.5 mt-0.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                                {Object.entries(reactionGroups).map(([emoji, { count, hasOwn }]) => (
                                  <button
                                    key={emoji}
                                    onClick={() => handleReaction(msg.id, emoji)}
                                    className={`px-1 py-0.5 rounded-full text-[10px] flex items-center gap-0.5 transition-colors ${
                                      hasOwn
                                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                    }`}
                                  >
                                    <span>{emoji}</span>
                                    {count > 1 && <span>{count}</span>}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
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
          ) : showNewChat ? (
            // New chat search view
            <div className="max-h-[350px] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center gap-2 p-2 border-b border-gray-100 dark:border-gray-800">
                <button
                  onClick={() => {
                    setShowNewChat(false);
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                >
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">New Message</span>
              </div>

              {/* Search input */}
              <div className="p-2 border-b border-gray-100 dark:border-gray-800">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search for a user..."
                  className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 border-0 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Search results */}
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {searching ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full" />
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="p-4 text-center">
                    <p className="text-xs text-gray-400">
                      {searchQuery ? 'No users found' : 'Type to search for users'}
                    </p>
                  </div>
                ) : (
                  searchResults.map((user) => (
                    <button
                      key={user.did}
                      onClick={() => handleStartChat(user.did)}
                      disabled={startingChat}
                      className="w-full p-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 text-left disabled:opacity-50"
                    >
                      <div className="flex items-center gap-2">
                        {user.avatar ? (
                          <img src={user.avatar} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {(user.displayName || user.handle)[0].toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {user.displayName || user.handle}
                          </p>
                          <p className="text-xs text-gray-500 truncate">@{user.handle}</p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            // Conversation list
            <div className="max-h-[350px] overflow-y-auto">
              {/* Header with New Chat button */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-800">
                <div className="flex gap-1">
                  <button
                    onClick={() => setShowRequests(false)}
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                      !showRequests
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    Messages
                  </button>
                  <button
                    onClick={() => setShowRequests(true)}
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 ${
                      showRequests
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    Requests
                    {requestCount > 0 && (
                      <span className="px-1 py-0.5 text-[10px] font-bold bg-amber-500 text-white rounded-full">
                        {requestCount > 9 ? '9+' : requestCount}
                      </span>
                    )}
                  </button>
                </div>
                <button
                  onClick={() => setShowNewChat(true)}
                  className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-colors"
                  title="New message"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
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
                      <div
                        key={convo.id}
                        className="p-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      >
                        <button
                          onClick={() => handleSelectConvo(convo.id)}
                          className="w-full text-left"
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
                        {/* Block/Delete buttons for requests */}
                        {showRequests && (
                          <div className="flex gap-2 mt-2 ml-10">
                            <button
                              onClick={(e) => handleDeleteConvo(convo.id, e)}
                              className="px-2 py-1 text-[10px] font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                            >
                              Delete
                            </button>
                            <button
                              onClick={(e) => handleBlockAndDelete(convo.id, other.did, e)}
                              className="px-2 py-1 text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded"
                            >
                              Block
                            </button>
                          </div>
                        )}
                      </div>
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
