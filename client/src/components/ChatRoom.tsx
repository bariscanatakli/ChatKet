import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Message, PendingMessage, User, UserPresence, RoomSystemEvent, TypingUser, ReplyTo, Reaction } from '../types';
import { roomsApi } from '../services/api';
import { socketService } from '../services/socket';
import { ReactionPicker, ReactionsDisplay } from './ReactionPicker';

// Combined timeline item type
type TimelineItem = 
  | { type: 'message'; data: Message; timestamp: number }
  | { type: 'system'; data: RoomSystemEvent; timestamp: number }
  | { type: 'pending'; data: PendingMessage; timestamp: number };

interface ChatRoomProps {
  roomId: string;
  roomName: string;
  token: string;
  currentUser: User;
  messages: Message[];
  roster: UserPresence[];
  typingUsers: TypingUser[];
  systemEvents: RoomSystemEvent[];
  isConnected: boolean;
  onSendMessage: (roomId: string, text: string, clientMsgId: string, replyToId?: string) => Promise<{ success: boolean; messageId?: string; error?: string }>;
  onTyping: (roomId: string, isTyping: boolean) => void;
  onLoadMessages: (messages: Message[]) => void;
  onBack: () => void;
  onViewProfile?: (user: User) => void;
}

export function ChatRoom({
  roomId,
  roomName,
  token,
  currentUser,
  messages,
  roster,
  typingUsers,
  systemEvents,
  isConnected,
  onSendMessage,
  onTyping,
  onLoadMessages,
  onBack,
  onViewProfile,
}: ChatRoomProps) {
  const [inputText, setInputText] = useState('');
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [showRoster, setShowRoster] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);
  const [activeReactionPicker, setActiveReactionPicker] = useState<string | null>(null);
  const [localReactions, setLocalReactions] = useState<Record<string, Message['reactions']>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasTypingRef = useRef(false);

  // Filter system events for this room
  const roomSystemEvents = systemEvents.filter((e) => e.roomId === roomId);

  // Filter typing users (exclude current user)
  const othersTyping = typingUsers.filter((u) => u.id !== currentUser.id);

  // Create unified timeline with messages and system events sorted by time
  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    
    // Add messages
    messages.forEach((msg) => {
      items.push({
        type: 'message',
        data: msg,
        timestamp: new Date(msg.createdAt).getTime(),
      });
    });
    
    // Add system events
    roomSystemEvents.forEach((event) => {
      items.push({
        type: 'system',
        data: event,
        timestamp: new Date(event.createdAt).getTime(),
      });
    });
    
    // Add pending messages
    pendingMessages.forEach((pending) => {
      items.push({
        type: 'pending',
        data: pending,
        timestamp: new Date(pending.createdAt).getTime(),
      });
    });
    
    // Sort by timestamp
    return items.sort((a, b) => a.timestamp - b.timestamp);
  }, [messages, roomSystemEvents, pendingMessages]);

  // Subscribe to reaction updates
  useEffect(() => {
    const unsubscribe = socketService.onReaction((event) => {
      if (event.reactions) {
        setLocalReactions((prev) => ({
          ...prev,
          [event.messageId]: event.reactions,
        }));
      }
    });
    return unsubscribe;
  }, []);

  // Handle reaction toggle
  const handleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      const currentReactions = localReactions[messageId] || messages.find((m) => m.messageId === messageId)?.reactions || [];
      const existingReaction = currentReactions.find((r) => r.emoji === emoji);
      const hasReacted = existingReaction?.users.some((u) => u.username === currentUser.username);

      // Optimistic update
      setLocalReactions((prev) => {
        const msgReactions = prev[messageId] || currentReactions;
        let updated: Reaction[];

        if (hasReacted) {
          updated = msgReactions
            .map((r) =>
              r.emoji === emoji
                ? { ...r, count: r.count - 1, users: r.users.filter((u) => u.username !== currentUser.username) }
                : r
            )
            .filter((r) => r.count > 0);
        } else {
          const existing = msgReactions.find((r) => r.emoji === emoji);
          if (existing) {
            updated = msgReactions.map((r) =>
              r.emoji === emoji ? { ...r, count: r.count + 1, users: [...r.users, { id: currentUser.id, username: currentUser.username }] } : r
            );
          } else {
            updated = [...msgReactions, { emoji, count: 1, users: [{ id: currentUser.id, username: currentUser.username }] }];
          }
        }

        return { ...prev, [messageId]: updated };
      });

      try {
        if (hasReacted) {
          socketService.removeReaction(messageId, emoji);
        } else {
          socketService.addReaction(messageId, emoji);
        }
      } catch (err) {
        console.error('Failed to update reaction:', err);
      }
    },
    [messages, localReactions, currentUser.username, currentUser.id]
  );

  // Get reactions for a message
  const getReactions = (message: Message) => {
    const reactions = localReactions[message.messageId] || message.reactions || [];
    return reactions.map((r) => ({
      emoji: r.emoji,
      count: r.count,
      users: r.users.map((u) => u.username),
      hasReacted: r.users.some((u) => u.username === currentUser.username),
    }));
  };

  // Transform API response to Message type
  const transformMessages = (apiMessages: Awaited<ReturnType<typeof roomsApi.getMessages>>): Message[] => {
    return apiMessages.map((m) => ({
      ...m,
      replyTo: m.replyTo ? {
        id: m.replyTo.id,
        text: m.replyTo.text,
        sender: m.replyTo.sender || (m.replyTo as any).user || { id: '', username: 'Unknown' },
      } : undefined,
    }));
  };

  // Load initial messages
  useEffect(() => {
    const loadInitialMessages = async () => {
      if (messages.length === 0) {
        setLoadingHistory(true);
        try {
          const history = await roomsApi.getMessages(token, roomId, { limit: 50 });
          onLoadMessages(transformMessages(history));
          setHasMore(history.length === 50);
        } catch (error) {
          console.error('Failed to load messages:', error);
        } finally {
          setLoadingHistory(false);
        }
      }
    };
    loadInitialMessages();
  }, [roomId, token, messages.length, onLoadMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingMessages, othersTyping]);

  // Focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle typing indicator
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.slice(0, 500);
    setInputText(value);

    // Send typing start
    if (value.length > 0 && !wasTypingRef.current) {
      wasTypingRef.current = true;
      onTyping(roomId, true);
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set timeout to stop typing
    if (value.length > 0) {
      typingTimeoutRef.current = setTimeout(() => {
        wasTypingRef.current = false;
        onTyping(roomId, false);
      }, 2000);
    } else {
      // Input cleared, stop typing immediately
      wasTypingRef.current = false;
      onTyping(roomId, false);
    }
  }, [roomId, onTyping]);

  // Cleanup typing timeout
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (wasTypingRef.current) {
        onTyping(roomId, false);
      }
    };
  }, [roomId, onTyping]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || !isConnected) return;

    // Stop typing indicator
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    wasTypingRef.current = false;
    onTyping(roomId, false);

    const clientMsgId = uuidv4();
    const currentReplyTo = replyTo;
    
    // Add to pending
    const pending: PendingMessage = {
      clientMsgId,
      roomId,
      text,
      status: 'sending',
      createdAt: new Date().toISOString(),
      replyTo: currentReplyTo || undefined,
    };
    setPendingMessages((prev) => [...prev, pending]);
    setInputText('');
    setReplyTo(null);

    try {
      const result = await onSendMessage(roomId, text, clientMsgId, currentReplyTo?.id);
      
      if (result.success) {
        setPendingMessages((prev) => prev.filter((m) => m.clientMsgId !== clientMsgId));
      } else {
        setPendingMessages((prev) =>
          prev.map((m) =>
            m.clientMsgId === clientMsgId ? { ...m, status: 'failed' } : m
          )
        );
      }
    } catch {
      setPendingMessages((prev) =>
        prev.map((m) =>
          m.clientMsgId === clientMsgId ? { ...m, status: 'failed' } : m
        )
      );
    }
  }, [inputText, isConnected, roomId, onSendMessage, onTyping, replyTo]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleLoadMore = async () => {
    if (loadingHistory || !hasMore || messages.length === 0) return;

    setLoadingHistory(true);
    try {
      const firstMessage = messages[0];
      const history = await roomsApi.getMessages(token, roomId, {
        before: firstMessage.messageId,
        limit: 50,
      });
      onLoadMessages([...transformMessages(history), ...messages]);
      setHasMore(history.length === 50);
    } catch (error) {
      console.error('Failed to load more messages:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const retryMessage = async (pending: PendingMessage) => {
    setPendingMessages((prev) =>
      prev.map((m) =>
        m.clientMsgId === pending.clientMsgId ? { ...m, status: 'sending' } : m
      )
    );

    try {
      const result = await onSendMessage(roomId, pending.text, pending.clientMsgId);
      
      if (result.success) {
        setPendingMessages((prev) => prev.filter((m) => m.clientMsgId !== pending.clientMsgId));
      } else {
        setPendingMessages((prev) =>
          prev.map((m) =>
            m.clientMsgId === pending.clientMsgId ? { ...m, status: 'failed' } : m
          )
        );
      }
    } catch {
      setPendingMessages((prev) =>
        prev.map((m) =>
          m.clientMsgId === pending.clientMsgId ? { ...m, status: 'failed' } : m
        )
      );
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getInitials = (username: string) => {
    return username.slice(0, 2).toUpperCase();
  };

  const getAvatarColor = (username: string) => {
    const colors = [
      'bg-gradient-to-br from-violet-500 to-purple-600',
      'bg-gradient-to-br from-blue-500 to-cyan-600',
      'bg-gradient-to-br from-emerald-500 to-teal-600',
      'bg-gradient-to-br from-orange-500 to-amber-600',
      'bg-gradient-to-br from-pink-500 to-rose-600',
      'bg-gradient-to-br from-indigo-500 to-blue-600',
    ];
    const index = username.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const onlineCount = roster.filter((u) => u.status === 'online').length;

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg border-b border-slate-200/60 dark:border-slate-700/60 px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={onBack}
              className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-all md:hidden"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
              <span className="text-white font-bold text-sm">{roomName[0].toUpperCase()}</span>
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white">{roomName}</h2>
              <div className="flex items-center space-x-2 text-xs">
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                <span className={isConnected ? 'text-emerald-600' : 'text-red-600'}>
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-slate-500">{onlineCount} online</span>
              </div>
            </div>
          </div>

          {/* Members button */}
          <button
            onClick={() => setShowRoster(!showRoster)}
            className="flex items-center space-x-2 px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl transition-all"
          >
            <div className="flex -space-x-2">
              {roster.slice(0, 3).map((user) => (
                <div
                  key={user.id}
                  className={`w-7 h-7 rounded-full ${getAvatarColor(user.username)} flex items-center justify-center text-[10px] font-medium text-white ring-2 ring-white`}
                  title={user.username}
                >
                  {getInitials(user.username)}
                </div>
              ))}
            </div>
            {roster.length > 3 && (
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">+{roster.length - 3}</span>
            )}
          </button>
        </div>
      </div>

      {/* Members panel (slide down) */}
      {showRoster && (
        <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur border-b border-slate-200/60 dark:border-slate-700/60 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {roster.map((rosterUser) => (
              <button
                key={rosterUser.id}
                onClick={() => rosterUser.id !== currentUser.id && onViewProfile?.({ id: rosterUser.id, username: rosterUser.username })}
                className={`flex items-center space-x-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 rounded-full ${
                  rosterUser.id !== currentUser.id ? 'hover:bg-slate-200 dark:hover:bg-slate-600 cursor-pointer' : ''
                } transition-all`}
              >
                <div className="relative">
                  <div className={`w-6 h-6 rounded-full ${getAvatarColor(rosterUser.username)} flex items-center justify-center text-[10px] font-medium text-white`}>
                    {getInitials(rosterUser.username)}
                  </div>
                  <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-700 ${rosterUser.status === 'online' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                </div>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{rosterUser.username}</span>
                {rosterUser.id === currentUser.id && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">(you)</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
      >
        {/* Load more button */}
        {hasMore && messages.length > 0 && (
          <div className="text-center py-2">
            <button
              onClick={handleLoadMore}
              disabled={loadingHistory}
              className="text-sm font-medium text-blue-600 hover:text-blue-700 disabled:text-slate-400 transition-colors"
            >
              {loadingHistory ? (
                <span className="flex items-center justify-center space-x-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Loading...</span>
                </span>
              ) : (
                '↑ Load older messages'
              )}
            </button>
          </div>
        )}

        {loadingHistory && messages.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center space-x-3 text-slate-500">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Loading messages...</span>
            </div>
          </div>
        )}

        {/* Unified Timeline - Messages and System Events */}
        {timeline.map((item, index) => {
          // System Event
          if (item.type === 'system') {
            const event = item.data;
            return (
              <div key={`system-${event.createdAt}-${index}`} className="flex justify-center py-1">
                <span className="inline-flex items-center space-x-1 bg-slate-200/80 dark:bg-slate-700/80 text-slate-600 dark:text-slate-400 text-xs px-3 py-1.5 rounded-full">
                  {event.type === 'join' && (
                    <>
                      <svg className="w-3 h-3 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                      </svg>
                      <span><strong>{event.user?.username}</strong> joined</span>
                      <span className="text-slate-400 dark:text-slate-500">• {formatTime(event.createdAt)}</span>
                    </>
                  )}
                  {event.type === 'leave' && (
                    <>
                      <svg className="w-3 h-3 text-slate-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.707-10.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L9.414 11H13a1 1 0 100-2H9.414l1.293-1.293z" clipRule="evenodd" />
                      </svg>
                      <span><strong>{event.user?.username}</strong> left</span>
                      <span className="text-slate-400 dark:text-slate-500">• {formatTime(event.createdAt)}</span>
                    </>
                  )}
                  {event.type === 'muted' && (
                    <>
                      <svg className="w-3 h-3 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <span>You are muted until {formatTime(event.until!)}</span>
                    </>
                  )}
                </span>
              </div>
            );
          }

          // Pending Message
          if (item.type === 'pending') {
            const pending = item.data;
            return (
              <div key={pending.clientMsgId} className="flex justify-end">
                <div className="max-w-[70%]">
                  {/* Reply preview for pending */}
                  {pending.replyTo && (
                    <div className="text-xs mb-1 px-3 py-1.5 rounded-lg bg-blue-400/30 text-blue-100 max-w-full">
                      <span className="font-medium">{pending.replyTo.sender?.username || 'User'}</span>
                      <p className="truncate opacity-75">{pending.replyTo.text}</p>
                    </div>
                  )}
                  <div
                    className={`px-4 py-2.5 rounded-2xl rounded-br-md ${
                      pending.status === 'failed'
                        ? 'bg-red-50 dark:bg-red-900/30 border-2 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
                        : 'bg-blue-400/70 text-white'
                    }`}
                  >
                    <p className="break-words text-[15px] leading-relaxed">{pending.text}</p>
                    <div className={`text-[10px] mt-1 flex items-center space-x-2 ${pending.status === 'failed' ? 'text-red-500 dark:text-red-400' : 'text-blue-200'}`}>
                      <span>{formatTime(pending.createdAt)}</span>
                      {pending.status === 'sending' && (
                        <span className="flex items-center space-x-1">
                          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          <span>Sending</span>
                        </span>
                      )}
                      {pending.status === 'failed' && (
                        <button
                          onClick={() => retryMessage(pending)}
                          className="font-medium hover:underline flex items-center space-x-1"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          <span>Retry</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          // Regular Message
          const message = item.data as Message;
          const isOwn = message.sender.id === currentUser.id;
          
          // Find previous message item in timeline
          const prevItem = timeline[index - 1];
          const prevMessage = prevItem?.type === 'message' ? prevItem.data as Message : null;
          const showAvatar = !isOwn && (!prevMessage || prevMessage.sender.id !== message.sender.id);
          
          // Find next message item in timeline  
          const nextItem = timeline[index + 1];
          const nextMessage = nextItem?.type === 'message' ? nextItem.data as Message : null;
          const isLastFromUser = !nextMessage || nextMessage.sender.id !== message.sender.id;
          
          const reactions = getReactions(message);
          
          return (
            <div
              key={message.messageId}
              className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${!isLastFromUser ? 'mb-0.5' : ''} group`}
            >
              {!isOwn && (
                <div className="w-8 mr-2 flex-shrink-0">
                  {showAvatar && (
                    <button
                      onClick={() => onViewProfile?.(message.sender)}
                      className={`w-8 h-8 rounded-full ${getAvatarColor(message.sender.username)} flex items-center justify-center text-xs font-medium text-white shadow-md hover:ring-2 hover:ring-blue-400 transition-all cursor-pointer`}
                      title={`View ${message.sender.username}'s profile`}
                    >
                      {getInitials(message.sender.username)}
                    </button>
                  )}
                </div>
              )}
              <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                {showAvatar && !isOwn && (
                  <button
                    onClick={() => onViewProfile?.(message.sender)}
                    className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-1 mb-1 hover:text-blue-500 dark:hover:text-blue-400 cursor-pointer"
                  >
                    {message.sender.username}
                  </button>
                )}
                
                {/* Reply preview */}
                {message.replyTo && (
                  <div className={`text-xs mb-1 px-3 py-1.5 rounded-lg ${isOwn ? 'bg-blue-400/30 text-blue-100' : 'bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300'} max-w-full`}>
                    <span className="font-medium">{message.replyTo.sender?.username || 'User'}</span>
                    <p className="truncate opacity-75">{message.replyTo.text}</p>
                  </div>
                )}
                
                <div className="relative">
                  <div
                    className={`px-4 py-2.5 ${
                      isOwn
                        ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-2xl rounded-br-md shadow-lg shadow-blue-500/20'
                        : 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white rounded-2xl rounded-bl-md shadow-md border border-slate-100 dark:border-slate-600'
                    }`}
                  >
                    <p className="break-words text-[15px] leading-relaxed">{message.text}</p>
                    <p className={`text-[10px] mt-1 ${isOwn ? 'text-blue-200' : 'text-slate-400 dark:text-slate-500'}`}>
                      {formatTime(message.createdAt)}
                    </p>
                  </div>
                  
                  {/* Message actions (shown on hover) */}
                  <div className={`absolute top-0 ${isOwn ? 'right-full mr-1' : 'left-full ml-1'} flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity`}>
                    <button
                      onClick={() => setReplyTo({ id: message.messageId, text: message.text, sender: message.sender })}
                      className="p-1.5 bg-white dark:bg-slate-700 rounded-lg shadow-md hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400"
                      title="Reply"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                    </button>
                    <div className="relative">
                      <button
                        onClick={() => setActiveReactionPicker(activeReactionPicker === message.messageId ? null : message.messageId)}
                        className="p-1.5 bg-white dark:bg-slate-700 rounded-lg shadow-md hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400"
                        title="React"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                      {activeReactionPicker === message.messageId && (
                        <ReactionPicker
                          onSelect={(emoji) => handleReaction(message.messageId, emoji)}
                          onClose={() => setActiveReactionPicker(null)}
                        />
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Reactions display */}
                {reactions.length > 0 && (
                  <ReactionsDisplay
                    reactions={reactions}
                    onToggleReaction={(emoji) => handleReaction(message.messageId, emoji)}
                  />
                )}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {othersTyping.length > 0 && (
          <div className="flex items-center space-x-2 py-2">
            <div className="flex -space-x-2">
              {othersTyping.slice(0, 3).map((user) => (
                <div
                  key={user.id}
                  className={`w-6 h-6 rounded-full ${getAvatarColor(user.username)} flex items-center justify-center text-[10px] font-medium text-white ring-2 ring-slate-50`}
                >
                  {getInitials(user.username)}
                </div>
              ))}
            </div>
            <div className="bg-white rounded-2xl rounded-bl-md px-4 py-2.5 shadow-md border border-slate-100">
              <div className="flex items-center space-x-1">
                <div className="flex space-x-1">
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-xs text-slate-500 ml-2">
                  {othersTyping.length === 1
                    ? `${othersTyping[0].username} is typing`
                    : othersTyping.length === 2
                    ? `${othersTyping[0].username} and ${othersTyping[1].username} are typing`
                    : `${othersTyping[0].username} and ${othersTyping.length - 1} others are typing`}
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg border-t border-slate-200/60 dark:border-slate-700/60 p-4">
        {/* Reply preview */}
        {replyTo && (
          <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-700 rounded-xl px-3 py-2 mb-3">
            <div className="flex items-center space-x-2 min-w-0">
              <div className="w-1 h-8 bg-blue-500 rounded-full flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-blue-600 dark:text-blue-400">Replying to {replyTo.sender?.username || 'User'}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 truncate">{replyTo.text}</p>
              </div>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        
        <div className="flex items-end space-x-3">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={isConnected ? 'Type a message...' : 'Disconnected...'}
              disabled={!isConnected}
              className="w-full px-4 py-3 bg-slate-100 dark:bg-slate-700 border-0 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-white dark:focus:bg-slate-600 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 placeholder-slate-400 dark:placeholder-slate-500 text-slate-800 dark:text-white transition-all"
            />
            <div className="absolute right-3 bottom-1 text-[10px] text-slate-400 dark:text-slate-500">
              {inputText.length}/500
            </div>
          </div>
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || !isConnected}
            className="p-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-2xl hover:from-blue-600 hover:to-blue-700 disabled:from-slate-300 disabled:to-slate-400 dark:disabled:from-slate-600 dark:disabled:to-slate-700 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/25 disabled:shadow-none"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
