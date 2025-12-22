import { useState, useEffect } from 'react';
import type { DMConversation, UserProfile } from '../types';
import { dmApi, usersApi } from '../services/api';
import { formatDistanceToNow } from '../utils/formatTime';

interface DMListProps {
  token: string;
  onSelectConversation: (conversation: DMConversation) => void;
  onBack: () => void;
  selectedConversationId?: string;
  refreshTrigger?: number;
}

export function DMList({ token, onSelectConversation, onBack, selectedConversationId, refreshTrigger }: DMListProps) {
  const [conversations, setConversations] = useState<DMConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    loadConversations();
  }, [token, refreshTrigger]);

  useEffect(() => {
    const interval = setInterval(loadUnreadCounts, 30000);
    loadUnreadCounts();
    return () => clearInterval(interval);
  }, [conversations]);

  const loadConversations = async () => {
    try {
      const data = await dmApi.getConversations(token);
      // Map to DMConversation type
      setConversations(data.map(d => ({ ...d, createdAt: d.updatedAt })));
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadUnreadCounts = async () => {
    try {
      const counts: Record<string, number> = {};
      for (const conv of conversations) {
        const result = await dmApi.getUnreadCount(token, conv.id);
        if (result.count > 0) {
          counts[conv.id] = result.count;
        }
      }
      setUnreadCounts(counts);
    } catch (err) {
      console.error('Failed to load unread counts:', err);
    }
  };

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length >= 2) {
        setSearching(true);
        try {
          const results = await usersApi.searchUsers(token, searchQuery.trim());
          // Map to UserProfile with required fields
          setSearchResults(results.map(r => ({
            ...r,
            createdAt: new Date().toISOString(), // Default value
          })));
        } catch (err) {
          console.error('Search error:', err);
        } finally {
          setSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, token]);

  const startConversation = async (userId: string) => {
    try {
      const conversation = await dmApi.startConversation(token, userId);
      const fullConversation: DMConversation = {
        ...conversation,
        lastMessage: null,
        unreadCount: 0,
        updatedAt: conversation.createdAt,
      };
      setConversations((prev) => {
        const exists = prev.find((c) => c.id === fullConversation.id);
        if (exists) return prev;
        return [fullConversation, ...prev];
      });
      onSelectConversation(fullConversation);
      setShowSearch(false);
      setSearchQuery('');
    } catch (err) {
      console.error('Failed to start conversation:', err);
    }
  };

  const getOtherUser = (conversation: DMConversation) => {
    return conversation.otherUser || conversation.user1 || conversation.user2;
  };

  const getInitials = (name: string) => name.slice(0, 2).toUpperCase();

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-800">
      {/* Header */}
      <div className="flex-none p-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <button
              onClick={onBack}
              className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center">
              Direct Messages
              {totalUnread > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-blue-500 text-white rounded-full">
                  {totalUnread}
                </span>
              )}
            </h2>
          </div>
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={`p-2 rounded-lg transition-all ${
              showSearch
                ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </button>
        </div>

        {showSearch && (
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users..."
              autoFocus
              className="w-full px-4 py-2.5 pl-10 bg-slate-100 dark:bg-slate-700 border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm"
            />
            <svg
              className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Search Results */}
      {showSearch && searchQuery.trim().length >= 2 && (
        <div className="flex-none p-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
          {searching ? (
            <div className="flex items-center justify-center py-4">
              <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : searchResults.length > 0 ? (
            <div className="space-y-1">
              {searchResults.map((user) => (
                <button
                  key={user.id}
                  onClick={() => startConversation(user.id)}
                  className="w-full flex items-center space-x-3 p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all"
                >
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${user.avatarColor || 'from-violet-500 to-purple-600'} flex items-center justify-center`}>
                    <span className="text-white font-medium text-sm">
                      {getInitials(user.displayName || user.username)}
                    </span>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-slate-800 dark:text-white text-sm">
                      {user.displayName || user.username}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">@{user.username}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">
              No users found
            </p>
          )}
        </div>
      )}

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : conversations.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {conversations.map((conversation) => {
              const otherUser = getOtherUser(conversation);
              const unread = unreadCounts[conversation.id] || 0;
              const isSelected = selectedConversationId === conversation.id;

              return (
                <button
                  key={conversation.id}
                  onClick={() => onSelectConversation(conversation)}
                  className={`w-full flex items-center space-x-3 p-4 transition-all ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-900/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <div className="relative">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${otherUser?.avatarColor || 'from-violet-500 to-purple-600'} flex items-center justify-center`}>
                      <span className="text-white font-medium">
                        {getInitials(otherUser?.displayName || otherUser?.username || 'U')}
                      </span>
                    </div>
                    {unread > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 text-white text-xs font-medium rounded-full flex items-center justify-center">
                        {unread > 9 ? '9+' : unread}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between">
                      <p className={`font-medium truncate ${unread > 0 ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                        {otherUser?.displayName || otherUser?.username}
                      </p>
                      {conversation.lastMessage && (
                        <span className="text-xs text-slate-400 dark:text-slate-500 flex-none ml-2">
                          {formatDistanceToNow(new Date(conversation.lastMessage.createdAt))}
                        </span>
                      )}
                    </div>
                    {conversation.lastMessage && (
                      <p className={`text-sm truncate ${unread > 0 ? 'text-slate-600 dark:text-slate-400' : 'text-slate-400 dark:text-slate-500'}`}>
                        {conversation.lastMessage.text}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-2xl flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-slate-600 dark:text-slate-400 font-medium mb-1">No conversations yet</p>
            <p className="text-sm text-slate-400 dark:text-slate-500">
              Click the + button to start chatting
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
