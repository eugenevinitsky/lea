'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { restoreSession, getSession, checkVerificationStatus, buildProfileUrl } from '@/lib/bluesky';
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
} from '@/lib/bluesky';
import { SettingsProvider } from '@/lib/settings';
import Login from '@/components/Login';

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢'];
const POLL_INTERVAL = 10000;
const ACCEPTED_DMS_KEY = 'lea_accepted_dm_dids';

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
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+|www\.[^\s<>"{}|\\^`[\]]+|[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?(?:\/[^\s<>"{}|\\^`[\]]*)?)/gi;
  
  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  
  const regex = new RegExp(urlRegex.source, 'gi');
  while ((match = regex.exec(text)) !== null) {
    const matchedUrl = match[0];
    const matchStart = match.index;
    
    if (matchStart > lastIndex) {
      elements.push(<span key={`text-${lastIndex}`}>{text.slice(lastIndex, matchStart)}</span>);
    }
    
    const isTruncated = matchedUrl.endsWith('...') || matchedUrl.endsWith('…');
    
    if (isTruncated) {
      elements.push(<span key={`text-${matchStart}`}>{matchedUrl}</span>);
    } else {
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
  
  if (lastIndex < text.length) {
    elements.push(<span key={`text-${lastIndex}`}>{text.slice(lastIndex)}</span>);
  }
  
  if (elements.length === 0) {
    return <>{text}</>;
  }
  
  return <>{elements}</>;
}

// Main Dashboard Content
function MessagesDashboardContent() {
  const [convos, setConvos] = useState<Convo[]>([]);
  const [followingDids, setFollowingDids] = useState<Set<string> | null>(null);
  const [acceptedDids, setAcceptedDids] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(ACCEPTED_DMS_KEY);
        if (stored) {
          return new Set(JSON.parse(stored));
        }
      } catch (e) {
        console.error('Failed to load accepted DIDs from localStorage:', e);
      }
    }
    return new Set();
  });
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
  const [isVerified, setIsVerified] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const session = getSession();

  // Check verification status
  useEffect(() => {
    if (session?.did) {
      checkVerificationStatus(session.did).then(setIsVerified);
    }
  }, [session?.did]);

  // Persist acceptedDids to localStorage
  useEffect(() => {
    if (acceptedDids.size > 0) {
      try {
        localStorage.setItem(ACCEPTED_DMS_KEY, JSON.stringify([...acceptedDids]));
      } catch (e) {
        console.error('Failed to save accepted DIDs to localStorage:', e);
      }
    }
  }, [acceptedDids]);

  // Handle reactions
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
        fetchConvos();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [fetchConvos]);

  // Poll for updates
  const pollForUpdates = useCallback(async () => {
    try {
      const response = await getChatLog(logCursor || undefined);
      if (response.logs.length > 0) {
        setLogCursor(response.logs[response.logs.length - 1].rev);

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

        fetchConvos();
      }
    } catch (err) {
      console.error('Poll error:', err);
    }
  }, [logCursor, selectedConvoId, fetchConvos]);

  // Initialize
  useEffect(() => {
    fetchConvos();

    getMyFollows().then(follows => {
      setFollowingDids(follows);
    }).catch(console.error);

    getChatLog().then(response => {
      if (response.logs.length > 0) {
        setLogCursor(response.logs[response.logs.length - 1].rev);
      }
    }).catch(console.error);
  }, [fetchConvos]);

  // Polling
  useEffect(() => {
    pollIntervalRef.current = setInterval(pollForUpdates, POLL_INTERVAL);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [pollForUpdates]);

  // Scroll to bottom
  useEffect(() => {
    if (messagesContainerRef.current && messages.length > 0 && !loading) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
          }
        }, 10);
      });
    }
  }, [messages, loading]);

  // Focus input
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

  // Search
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

  // Focus search input
  useEffect(() => {
    if (showNewChat) {
      searchInputRef.current?.focus();
    }
  }, [showNewChat]);

  // Start new chat
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
      fetchConvos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start chat');
    } finally {
      setStartingChat(false);
    }
  }, [session?.did, fetchMessages, fetchConvos]);

  const otherMember = selectedConvo?.members.find(m => m.did !== session?.did);

  // Filter conversations
  const followsLoaded = followingDids !== null;
  const { mainChats, requests } = convos.reduce(
    (acc, convo) => {
      const other = convo.members.find(m => m.did !== session?.did);
      if (!followsLoaded || (other && (followingDids.has(other.did) || acceptedDids.has(other.did)))) {
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
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/80 dark:bg-black/80 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => window.location.href = '/'}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                title="Back to home"
              >
                <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Messages
                {totalUnread > 0 && (
                  <span className="px-2 py-0.5 text-xs font-bold bg-blue-500 text-white rounded-full">
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
                )}
              </h1>
            </div>

            {/* Profile link */}
            <button
              onClick={() => window.location.href = `/u/${session?.handle}`}
              className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors flex items-center gap-1.5 ${
                isVerified
                  ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                  : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50'
              }`}
            >
              @{session?.handle}
              {isVerified && (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main content - 2 column layout */}
      <main className="max-w-5xl mx-auto">
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm border-b border-red-200 dark:border-red-800">
            {error}
          </div>
        )}

        <div className="flex h-[calc(100vh-65px)]">
          {/* Conversation list */}
          <div className="w-80 border-r border-gray-200 dark:border-gray-800 flex flex-col bg-white dark:bg-gray-900">
            {/* Tabs and new chat */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
              <div className="flex gap-1">
                <button
                  onClick={() => setShowRequests(false)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    !showRequests
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  Messages
                </button>
                <button
                  onClick={() => setShowRequests(true)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-1 ${
                    showRequests
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  Requests
                  {requestCount > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-500 text-white rounded-full">
                      {requestCount > 9 ? '9+' : requestCount}
                    </span>
                  )}
                </button>
              </div>
              <button
                onClick={() => setShowNewChat(true)}
                className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-colors"
                title="New message"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>

            {/* New chat search */}
            {showNewChat && (
              <div className="p-3 border-b border-gray-200 dark:border-gray-800">
                <div className="relative">
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search for a user..."
                    className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-800 border-0 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      setShowNewChat(false);
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                  >
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {searching ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full" />
                  </div>
                ) : searchResults.length > 0 && (
                  <div className="mt-2 max-h-60 overflow-y-auto">
                    {searchResults.map((user) => (
                      <button
                        key={user.did}
                        onClick={() => handleStartChat(user.did)}
                        disabled={startingChat}
                        className="w-full p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-left disabled:opacity-50"
                      >
                        <div className="flex items-center gap-2">
                          {user.avatar ? (
                            <img src={user.avatar} alt="" className="w-8 h-8 rounded-full" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                              {(user.displayName || user.handle)[0].toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                              {user.displayName || user.handle}
                            </p>
                            <p className="text-xs text-gray-500 truncate">@{user.handle}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto">
              {displayedConvos.length === 0 ? (
                <div className="p-8 text-center">
                  <svg className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <p className="text-sm text-gray-500">
                    {showRequests ? 'No message requests' : 'No conversations yet'}
                  </p>
                </div>
              ) : (
                displayedConvos.map((convo) => {
                  const other = convo.members.find(m => m.did !== session?.did) || convo.members[0];
                  const hasUnread = convo.unreadCount > 0;
                  const isSelected = selectedConvoId === convo.id;

                  return (
                    <div
                      key={convo.id}
                      className={`p-3 cursor-pointer transition-colors ${
                        isSelected 
                          ? 'bg-blue-50 dark:bg-blue-900/20' 
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      }`}
                      onClick={() => handleSelectConvo(convo.id)}
                    >
                      <div className="flex items-start gap-3">
                        {other.avatar ? (
                          <img src={other.avatar} alt="" className="w-12 h-12 rounded-full flex-shrink-0" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold flex-shrink-0">
                            {(other.displayName || other.handle)[0].toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className={`text-sm truncate ${hasUnread ? 'font-semibold text-gray-900 dark:text-gray-100' : 'font-medium text-gray-700 dark:text-gray-300'}`}>
                              {other.displayName || other.handle}
                            </span>
                            {convo.lastMessage && (
                              <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                                {formatTime(convo.lastMessage.sentAt)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <p className={`text-xs truncate flex-1 ${hasUnread ? 'text-gray-700 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400'}`}>
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
                              <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Request actions */}
                      {showRequests && (
                        <div className="flex gap-2 mt-2 ml-14">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setAcceptedDids(prev => new Set(prev).add(other.did));
                              setShowRequests(false);
                              handleSelectConvo(convo.id);
                            }}
                            className="px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-lg"
                          >
                            Accept
                          </button>
                          <button
                            onClick={(e) => handleDeleteConvo(convo.id, e)}
                            className="px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg"
                          >
                            Delete
                          </button>
                          <button
                            onClick={(e) => handleBlockAndDelete(convo.id, other.did, e)}
                            className="px-3 py-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg"
                          >
                            Block
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Message area */}
          <div className="flex-1 flex flex-col bg-white dark:bg-gray-900">
            {selectedConvoId && otherMember ? (
              <>
                {/* Convo header */}
                <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-800">
                  <a
                    href={buildProfileUrl(otherMember.handle, otherMember.did)}
                    className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                  >
                    {otherMember.avatar ? (
                      <img src={otherMember.avatar} alt="" className="w-10 h-10 rounded-full" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
                        {(otherMember.displayName || otherMember.handle)[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100 hover:underline">
                        {otherMember.displayName || otherMember.handle}
                      </p>
                      <p className="text-xs text-gray-500">@{otherMember.handle}</p>
                    </div>
                  </a>
                </div>

                {/* Messages */}
                <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                  {loading ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-gray-400">
                      <p>No messages yet. Start the conversation!</p>
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const isOwn = msg.sender.did === session?.did;
                      const isHovered = hoveredMessageId === msg.id;
                      const showPicker = showReactionPicker === msg.id;

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
                          {/* Reaction button */}
                          {isHovered && !showPicker && (
                            <button
                              onClick={() => setShowReactionPicker(msg.id)}
                              className={`absolute ${isOwn ? 'left-0' : 'right-0'} top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </button>
                          )}

                          {/* Reaction picker */}
                          {showPicker && (
                            <div
                              className={`absolute ${isOwn ? 'right-0' : 'left-0'} -top-10 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 px-2 py-1 flex gap-1 z-10`}
                              onMouseLeave={() => setShowReactionPicker(null)}
                            >
                              {QUICK_REACTIONS.map(emoji => (
                                <button
                                  key={emoji}
                                  onClick={() => handleReaction(msg.id, emoji)}
                                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-lg"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}

                          <div className={`flex flex-col max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
                            <div
                              className={`px-4 py-2.5 rounded-2xl text-sm ${
                                isOwn
                                  ? 'bg-blue-500 text-white rounded-br-md'
                                  : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-md'
                              }`}
                            >
                              <p className="whitespace-pre-wrap break-words">
                                <MessageText text={msg.text} isOwn={isOwn} />
                              </p>
                            </div>
                            <p className={`text-[10px] mt-1 ${isOwn ? 'text-gray-400' : 'text-gray-400'}`}>
                              {formatMessageTime(msg.sentAt)}
                            </p>

                            {/* Reactions */}
                            {Object.keys(reactionGroups).length > 0 && (
                              <div className={`flex gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                                {Object.entries(reactionGroups).map(([emoji, { count, hasOwn }]) => (
                                  <button
                                    key={emoji}
                                    onClick={() => handleReaction(msg.id, emoji)}
                                    className={`px-1.5 py-0.5 rounded-full text-xs flex items-center gap-0.5 transition-colors ${
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
                    })
                  )}
                </div>

                {/* Input */}
                <div className="p-4 border-t border-gray-200 dark:border-gray-800">
                  <div className="flex items-end gap-3">
                    <textarea
                      ref={inputRef}
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Type a message..."
                      rows={1}
                      className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-800 border-0 rounded-2xl text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:outline-none max-h-32"
                      style={{ minHeight: '44px' }}
                    />
                    <button
                      onClick={handleSend}
                      disabled={!newMessage.trim() || sending}
                      className="p-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-full disabled:cursor-not-allowed transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              // Empty state
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <svg className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <h2 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">Select a conversation</h2>
                  <p className="text-sm text-gray-500">Choose a conversation from the list or start a new one</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// Main page component with auth
export default function MessagesDashboard() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    restoreSession().then((restored) => {
      setIsLoggedIn(restored);
      setIsLoading(false);
    });
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Login onLogin={() => setIsLoggedIn(true)} />;
  }

  return (
    <SettingsProvider>
      <MessagesDashboardContent />
    </SettingsProvider>
  );
}
