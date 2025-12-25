'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getConvo,
  getMessages,
  sendMessage,
  updateRead,
  Convo,
  ChatMessage,
  getSession,
} from '@/lib/bluesky';

interface MessageViewProps {
  convoId: string;
  onBack: () => void;
  onMessageSent?: () => void;
  newMessages?: ChatMessage[];
}

function formatMessageTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }

  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function MessageBubble({ message, isOwn }: { message: ChatMessage; isOwn: boolean }) {
  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-2`}>
      <div
        className={`max-w-[75%] px-3 py-2 rounded-2xl ${
          isOwn
            ? 'bg-blue-500 text-white rounded-br-sm'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-sm'
        }`}
      >
        <p className="text-sm whitespace-pre-wrap break-words">{message.text}</p>
        <p className={`text-[10px] mt-1 ${isOwn ? 'text-blue-100' : 'text-gray-400'}`}>
          {formatMessageTime(message.sentAt)}
        </p>
      </div>
    </div>
  );
}

export default function MessageView({
  convoId,
  onBack,
  onMessageSent,
  newMessages = [],
}: MessageViewProps) {
  const [convo, setConvo] = useState<Convo | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const session = getSession();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const fetchConvoAndMessages = useCallback(async () => {
    try {
      setError(null);
      const [convoResponse, messagesResponse] = await Promise.all([
        getConvo(convoId),
        getMessages(convoId),
      ]);
      setConvo(convoResponse.convo);
      // Messages come newest first, so reverse them
      setMessages(messagesResponse.messages.reverse());

      // Mark as read
      if (convoResponse.convo.unreadCount > 0) {
        await updateRead(convoId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [convoId]);

  useEffect(() => {
    fetchConvoAndMessages();
  }, [fetchConvoAndMessages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Handle new messages from polling
  useEffect(() => {
    if (newMessages.length > 0) {
      const currentIds = new Set(messages.map(m => m.id));
      const newOnes = newMessages.filter(m => !currentIds.has(m.id));
      if (newOnes.length > 0) {
        setMessages(prev => [...prev, ...newOnes]);
        // Mark as read when receiving new messages while viewing
        updateRead(convoId).catch(console.error);
      }
    }
  }, [newMessages, convoId, messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;

    const text = newMessage.trim();
    setNewMessage('');
    setSending(true);

    try {
      const sentMessage = await sendMessage(convoId, text);
      setMessages(prev => [...prev, sentMessage]);
      onMessageSent?.();
      inputRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      setNewMessage(text); // Restore the message
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

  const otherMember = convo?.members.find(m => m.did !== session?.did) || convo?.members[0];

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error && !convo) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-sm text-red-500 mb-2">{error}</p>
          <button
            onClick={fetchConvoAndMessages}
            className="text-sm text-blue-500 hover:underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={onBack}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
        >
          <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        {otherMember && (
          <>
            {otherMember.avatar ? (
              <img
                src={otherMember.avatar}
                alt={otherMember.handle}
                className="w-8 h-8 rounded-full"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                {(otherMember.displayName || otherMember.handle)[0].toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {otherMember.displayName || otherMember.handle}
              </p>
              <p className="text-xs text-gray-500 truncate">@{otherMember.handle}</p>
            </div>
          </>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-400">No messages yet. Say hello!</p>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isOwn={message.sender.did === session?.did}
              />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="px-3 py-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-800">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-800 border-0 rounded-2xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none max-h-32"
            style={{ minHeight: '40px' }}
          />
          <button
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
            className="p-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-full transition-colors disabled:cursor-not-allowed"
          >
            {sending ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
