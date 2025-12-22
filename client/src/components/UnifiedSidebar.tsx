import { useState, useEffect } from 'react';
import type { Room, DMConversation, UserProfile } from '../types';
import { roomsApi, dmApi, usersApi } from '../services/api';
import { formatDistanceToNow } from '../utils/formatTime';

interface UnifiedSidebarProps {
  rooms: Room[];
  token: string;
  selectedRoomId: string | null;
  selectedConversationId: string | null;
  onSelectRoom: (room: Room) => void;
  onSelectConversation: (conversation: DMConversation) => void;
  onRoomsUpdate: (rooms: Room[]) => void;
  totalUnread: number;
  onUnreadChange: (count: number) => void;
}

type TabType = 'all' | 'rooms' | 'dms';

export function UnifiedSidebar({
  rooms,
  token,
  selectedRoomId,
  selectedConversationId,
  onSelectRoom,
  onSelectConversation,
  onRoomsUpdate,
  totalUnread,
  onUnreadChange,
}: UnifiedSidebarProps) {
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [showCreateRoomModal, setShowCreateRoomModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showNewDMModal, setShowNewDMModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [availableRooms, setAvailableRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // DM state
  const [conversations, setConversations] = useState<DMConversation[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);

  // Load conversations
  useEffect(() => {
    if (!token) return;
    loadConversations();
    const interval = setInterval(loadConversations, 30000);
    return () => clearInterval(interval);
  }, [token]);

  const loadConversations = async () => {
    try {
      const data = await dmApi.getConversations(token);
      setConversations(data.map(d => ({ ...d, createdAt: d.updatedAt })));
      
      // Load unread counts
      let total = 0;
      const counts: Record<string, number> = {};
      for (const conv of data) {
        const result = await dmApi.getUnreadCount(token, conv.id);
        if (result.count > 0) {
          counts[conv.id] = result.count;
          total += result.count;
        }
      }
      setUnreadCounts(counts);
      onUnreadChange(total);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  };

  // Search users for new DM
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length >= 2) {
        setSearching(true);
        try {
          const results = await usersApi.searchUsers(token, searchQuery.trim());
          setSearchResults(results.map(r => ({
            ...r,
            createdAt: new Date().toISOString(),
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

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const room = await roomsApi.createRoom(token, newRoomName.trim());
      const newRoom: Room = {
        ...room,
        joinedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      };
      onRoomsUpdate([...rooms, newRoom]);
      setNewRoomName('');
      setShowCreateRoomModal(false);
      onSelectRoom(newRoom);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  const handleShowJoin = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const allRooms = await roomsApi.getRooms(token, true);
      const joinedIds = new Set(rooms.map((r) => r.id));
      const available = allRooms.filter((r) => !joinedIds.has(r.id));
      setAvailableRooms(available);
      setShowJoinModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rooms');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (roomId: string) => {
    setLoading(true);
    setError(null);

    try {
      const room = await roomsApi.joinRoom(token, roomId);
      const joinedRoom: Room = {
        ...room,
        lastSeenAt: new Date().toISOString(),
      };
      onRoomsUpdate([...rooms, joinedRoom]);
      setShowJoinModal(false);
      onSelectRoom(joinedRoom);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room');
    } finally {
      setLoading(false);
    }
  };

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
      setShowNewDMModal(false);
      setSearchQuery('');
    } catch (err) {
      console.error('Failed to start conversation:', err);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  const getInitials = (name: string) => name.slice(0, 2).toUpperCase();

  const getOtherUser = (conversation: DMConversation) => {
    return conversation.otherUser || conversation.user1 || conversation.user2;
  };

  // Unified list items
  type ListItem = 
    | { type: 'room'; data: Room; updatedAt: string }
    | { type: 'dm'; data: DMConversation; updatedAt: string };

  const getUnifiedList = (): ListItem[] => {
    const items: ListItem[] = [];

    // Add rooms
    if (activeTab === 'all' || activeTab === 'rooms') {
      rooms.forEach(room => {
        items.push({
          type: 'room',
          data: room,
          updatedAt: room.createdAt,
        });
      });
    }

    // Add DMs
    if (activeTab === 'all' || activeTab === 'dms') {
      conversations.forEach(conv => {
        items.push({
          type: 'dm',
          data: conv,
          updatedAt: conv.updatedAt || conv.createdAt || new Date().toISOString(),
        });
      });
    }

    // Sort by updatedAt (most recent first)
    return items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  };

  const unifiedList = getUnifiedList();

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Tabs */}
      <div className="flex-none px-3 pt-2">
        <div className="flex space-x-1 bg-slate-200/60 dark:bg-slate-700/60 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-all ${
              activeTab === 'all'
                ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setActiveTab('rooms')}
            className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-all ${
              activeTab === 'rooms'
                ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Rooms
          </button>
          <button
            onClick={() => setActiveTab('dms')}
            className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-all relative ${
              activeTab === 'dms'
                ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            DMs
            {totalUnread > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 text-white text-xs font-medium rounded-full flex items-center justify-center">
                {totalUnread > 9 ? '9+' : totalUnread}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex-none p-3">
        <div className="flex space-x-2">
          {(activeTab === 'all' || activeTab === 'rooms') && (
            <>
              <button
                onClick={() => setShowCreateRoomModal(true)}
                className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white py-2.5 px-4 rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all text-sm font-medium shadow-lg shadow-blue-500/25 flex items-center justify-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Room</span>
              </button>
              <button
                onClick={handleShowJoin}
                className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 py-2.5 px-4 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-all text-sm font-medium flex items-center justify-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                <span>Join</span>
              </button>
            </>
          )}
          {(activeTab === 'all' || activeTab === 'dms') && (
            <button
              onClick={() => setShowNewDMModal(true)}
              className={`${activeTab === 'dms' ? 'flex-1' : ''} bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-2.5 px-4 rounded-xl hover:from-emerald-600 hover:to-teal-700 transition-all text-sm font-medium shadow-lg shadow-emerald-500/25 flex items-center justify-center space-x-2`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span>New DM</span>
            </button>
          )}
        </div>
      </div>

      {/* Unified list */}
      <div className="flex-1 overflow-y-auto p-3">
        {unifiedList.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 bg-slate-200 dark:bg-slate-700 rounded-2xl flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 className="text-slate-700 dark:text-slate-300 font-medium mb-1">
              {activeTab === 'dms' ? 'No conversations yet' : 'No chats yet'}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {activeTab === 'dms' ? 'Start a new DM' : 'Create or join a room to start chatting'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {unifiedList.map((item) => {
              if (item.type === 'room') {
                const room = item.data;
                const isSelected = selectedRoomId === room.id;
                
                return (
                  <button
                    key={`room-${room.id}`}
                    onClick={() => onSelectRoom(room)}
                    className={`w-full text-left p-3 rounded-xl transition-all ${
                      isSelected
                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25'
                        : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        isSelected 
                          ? 'bg-white/20' 
                          : 'bg-gradient-to-br from-blue-500 to-indigo-600'
                      }`}>
                        <span className="font-bold text-sm text-white">
                          {room.name[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className={`font-semibold truncate ${isSelected ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                            {room.name}
                          </span>
                          <span className={`text-xs ml-2 flex items-center ${isSelected ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'}`}>
                            <svg className="w-3 h-3 mr-0.5" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                            </svg>
                            {room.memberCount}
                          </span>
                        </div>
                        <div className="flex items-center mt-0.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${isSelected ? 'bg-white/20 text-blue-100' : 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'}`}>
                            Room
                          </span>
                          <span className={`text-xs ml-2 ${isSelected ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                            {formatDate(room.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              } else {
                const conv = item.data;
                const otherUser = getOtherUser(conv);
                const unread = unreadCounts[conv.id] || 0;
                const isSelected = selectedConversationId === conv.id;

                return (
                  <button
                    key={`dm-${conv.id}`}
                    onClick={() => onSelectConversation(conv)}
                    className={`w-full text-left p-3 rounded-xl transition-all ${
                      isSelected
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25'
                        : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-600'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="relative">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          isSelected 
                            ? 'bg-white/20' 
                            : 'bg-gradient-to-br from-emerald-500 to-teal-600'
                        }`}>
                          <span className="font-bold text-sm text-white">
                            {getInitials(otherUser?.displayName || otherUser?.username || 'U')}
                          </span>
                        </div>
                        {unread > 0 && !isSelected && (
                          <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 text-white text-xs font-medium rounded-full flex items-center justify-center">
                            {unread > 9 ? '9+' : unread}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className={`font-semibold truncate ${isSelected ? 'text-white' : unread > 0 ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                            {otherUser?.displayName || otherUser?.username}
                          </span>
                          {conv.lastMessage && (
                            <span className={`text-xs ml-2 ${isSelected ? 'text-emerald-100' : 'text-slate-400 dark:text-slate-500'}`}>
                              {formatDistanceToNow(new Date(conv.lastMessage.createdAt))}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center mt-0.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${isSelected ? 'bg-white/20 text-emerald-100' : 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400'}`}>
                            DM
                          </span>
                          {conv.lastMessage && (
                            <span className={`text-xs ml-2 truncate ${isSelected ? 'text-emerald-100' : unread > 0 ? 'text-slate-600 dark:text-slate-400' : 'text-slate-400 dark:text-slate-500'}`}>
                              {conv.lastMessage.text}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              }
            })}
          </div>
        )}
      </div>

      {/* Create Room Modal */}
      {showCreateRoomModal && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Create New Room</h3>
            <form onSubmit={handleCreateRoom}>
              <input
                type="text"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="Enter room name..."
                className="w-full px-4 py-3 bg-slate-100 dark:bg-slate-700 border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-white dark:focus:bg-slate-600 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 mb-4 transition-all"
                maxLength={100}
                autoFocus
              />
              {error && (
                <div className="text-red-600 dark:text-red-400 text-sm mb-4 p-3 bg-red-50 dark:bg-red-900/30 rounded-xl">{error}</div>
              )}
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateRoomModal(false);
                    setError(null);
                    setNewRoomName('');
                  }}
                  className="flex-1 py-3 px-4 border border-slate-200 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newRoomName.trim() || loading}
                  className="flex-1 py-3 px-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 disabled:from-slate-300 disabled:to-slate-400 font-medium shadow-lg shadow-blue-500/25 disabled:shadow-none transition-all"
                >
                  {loading ? 'Creating...' : 'Create Room'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join Room Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Join a Room</h3>
            
            {error && (
              <div className="text-red-600 dark:text-red-400 text-sm mb-4 p-3 bg-red-50 dark:bg-red-900/30 rounded-xl">{error}</div>
            )}

            <div className="flex-1 overflow-y-auto mb-4">
              {availableRooms.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-slate-500 dark:text-slate-400">No rooms available to join</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {availableRooms.map((room) => (
                    <button
                      key={room.id}
                      onClick={() => handleJoinRoom(room.id)}
                      disabled={loading}
                      className="w-full text-left p-4 rounded-xl bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 disabled:opacity-50 transition-all"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                          <span className="text-white font-bold text-sm">{room.name[0].toUpperCase()}</span>
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white">{room.name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {room.memberCount} members • by {room.createdBy.username}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => {
                setShowJoinModal(false);
                setError(null);
              }}
              className="w-full py-3 px-4 border border-slate-200 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition-all"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* New DM Modal */}
      {showNewDMModal && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">New Direct Message</h3>
            
            <div className="relative mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search users..."
                autoFocus
                className="w-full px-4 py-3 pl-10 bg-slate-100 dark:bg-slate-700 border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
              />
              <svg
                className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            <div className="flex-1 overflow-y-auto mb-4">
              {searching ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                </div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-2">
                  {searchResults.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => startConversation(user.id)}
                      className="w-full flex items-center space-x-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl transition-all"
                    >
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${user.avatarColor || 'from-emerald-500 to-teal-600'} flex items-center justify-center`}>
                        <span className="text-white font-medium text-sm">
                          {getInitials(user.displayName || user.username)}
                        </span>
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-medium text-slate-800 dark:text-white">
                          {user.displayName || user.username}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">@{user.username}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : searchQuery.trim().length >= 2 ? (
                <p className="text-center text-slate-500 dark:text-slate-400 py-8">No users found</p>
              ) : (
                <p className="text-center text-slate-500 dark:text-slate-400 py-8">
                  Type at least 2 characters to search
                </p>
              )}
            </div>

            <button
              onClick={() => {
                setShowNewDMModal(false);
                setSearchQuery('');
                setSearchResults([]);
              }}
              className="w-full py-3 px-4 border border-slate-200 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
