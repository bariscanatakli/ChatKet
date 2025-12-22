import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { DMConversation, DirectMessage, UserProfile } from '../types';
import { dmApi } from '../services/api';
import { socketService } from '../services/socket';
import { formatDistanceToNow } from '../utils/formatTime';

interface DMChatProps {
  token: string;
  conversation: DMConversation;
  currentUser: UserProfile;
  onBack: () => void;
}

export function DMChat({ token, conversation, currentUser, onBack }: DMChatProps) {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const otherUser = conversation.otherUser || conversation.user1 || conversation.user2;

  useEffect(() => {
    loadMessages();
    markAsRead();

    // Subscribe to new DMs
    const unsubscribeDM = socketService.onDM((message) => {
      if (message.conversationId === conversation.id) {
        const dm: DirectMessage = {
          id: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          receiverId: message.receiverId,
          text: message.text,
          createdAt: message.createdAt,
          sender: message.sender,
        };
        setMessages((prev) => [...prev, dm]);
        markAsRead();
      }
    });

    // Subscribe to typing events
    const unsubscribeTyping = socketService.onDMTyping((event) => {
      if (event.conversationId === conversation.id && event.userId !== currentUser.id) {
        setOtherUserTyping(event.isTyping);
      }
    });

    return () => {
      unsubscribeDM();
      unsubscribeTyping();
    };
  }, [conversation.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadMessages = async () => {
    try {
      const data = await dmApi.getMessages(token, conversation.id);
      setMessages(data);
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async () => {
    try {
      await dmApi.markAsRead(token, conversation.id);
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setNewMessage(e.target.value);

      // Send typing indicator
      socketService.sendDMTyping(conversation.id, true);

      // Clear previous timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Set timeout to stop typing indicator
      typingTimeoutRef.current = setTimeout(() => {
        socketService.sendDMTyping(conversation.id, false);
      }, 2000);
    },
    [conversation.id]
  );

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    const text = newMessage.trim();
    setNewMessage('');
    setSending(true);

    // Stop typing indicator
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    socketService.sendDMTyping(conversation.id, false);

    // Optimistic update
    const tempMessage: DirectMessage = {
      id: `temp-${Date.now()}`,
      conversationId: conversation.id,
      senderId: currentUser.id,
      receiverId: otherUser?.id || '',
      text,
      createdAt: new Date().toISOString(),
      readAt: undefined,
      sender: currentUser,
    };
    setMessages((prev) => [...prev, tempMessage]);

    try {
      // Send via socket
      socketService.sendDM(conversation.id, otherUser?.id || '', text);
    } catch (err) {
      console.error('Failed to send message:', err);
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempMessage.id));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const getInitials = (name: string) => name.slice(0, 2).toUpperCase();

  const formatMessageTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Group messages by date
  const groupedMessages = messages.reduce((groups, message) => {
    const date = new Date(message.createdAt).toDateString();
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(message);
    return groups;
  }, {} as Record<string, DirectMessage[]>);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-800">
      {/* Header */}
      <div className="flex-none p-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${otherUser?.avatarColor || 'from-violet-500 to-purple-600'} flex items-center justify-center`}>
            <span className="text-white font-medium text-sm">
              {getInitials(otherUser?.displayName || otherUser?.username || 'U')}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-slate-800 dark:text-white truncate">
              {otherUser?.displayName || otherUser?.username}
            </h2>
            {otherUserTyping ? (
              <p className="text-sm text-blue-500 dark:text-blue-400">typing...</p>
            ) : otherUser?.status ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{otherUser.status}</p>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">@{otherUser?.username}</p>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${otherUser?.avatarColor || 'from-violet-500 to-purple-600'} flex items-center justify-center mb-4`}>
              <span className="text-white font-bold text-xl">
                {getInitials(otherUser?.displayName || otherUser?.username || 'U')}
              </span>
            </div>
            <p className="text-slate-600 dark:text-slate-400 font-medium mb-1">
              Start a conversation with {otherUser?.displayName || otherUser?.username}
            </p>
            <p className="text-sm text-slate-400 dark:text-slate-500">
              Send a message to get started
            </p>
          </div>
        ) : (
          Object.entries(groupedMessages).map(([date, dateMessages]) => (
            <div key={date}>
              {/* Date separator */}
              <div className="flex items-center justify-center my-4">
                <span className="px-3 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-full">
                  {new Date(date).toDateString() === new Date().toDateString()
                    ? 'Today'
                    : formatDistanceToNow(new Date(date))}
                </span>
              </div>

              {/* Messages for this date */}
              <div className="space-y-3">
                {dateMessages.map((message) => {
                  const isOwn = message.senderId === currentUser.id;

                  return (
                    <div
                      key={message.id}
                      className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[75%] px-4 py-2.5 rounded-2xl ${
                          isOwn
                            ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-br-md'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-white rounded-bl-md'
                        }`}
                      >
                        <p className="break-words">{message.text}</p>
                        <div
                          className={`flex items-center justify-end mt-1 space-x-1 ${
                            isOwn ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          <span className="text-xs">{formatMessageTime(message.createdAt)}</span>
                          {isOwn && message.readAt && (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-none p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <form onSubmit={handleSend} className="flex items-center space-x-3">
          <input
            ref={inputRef}
            type="text"
            value={newMessage}
            onChange={handleInputChange}
            placeholder="Type a message..."
            className="flex-1 px-4 py-3 bg-slate-100 dark:bg-slate-700 border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || sending}
            className="p-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed shadow-lg shadow-blue-500/25 disabled:shadow-none transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
