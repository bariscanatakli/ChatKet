import React, { useState } from 'react';
import type { Room, User } from '../types';
import { roomsApi } from '../services/api';

interface RoomListProps {
  rooms: Room[];
  token: string;
  currentUser: User;
  isConnected: boolean;
  selectedRoomId: string | null;
  onSelectRoom: (room: Room) => void;
  onRoomsUpdate: (rooms: Room[]) => void;
  onLogout?: () => void;
}

export function RoomList({
  rooms,
  token,
  currentUser,
  isConnected,
  selectedRoomId,
  onSelectRoom,
  onRoomsUpdate,
  onLogout,
}: RoomListProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [availableRooms, setAvailableRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setShowCreateModal(false);
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

  const getAvatarColor = (username: string) => {
    const colors = [
      'from-violet-500 to-purple-600',
      'from-blue-500 to-cyan-600',
      'from-emerald-500 to-teal-600',
      'from-orange-500 to-amber-600',
      'from-pink-500 to-rose-600',
      'from-indigo-500 to-blue-600',
    ];
    const index = username.charCodeAt(0) % colors.length;
    return colors[index];
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg border-b border-slate-200/60 dark:border-slate-700/60 p-4 shadow-sm">
        {/* User info */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getAvatarColor(currentUser.username)} flex items-center justify-center shadow-lg`}>
              <span className="text-white font-bold text-sm">{currentUser.username.slice(0, 2).toUpperCase()}</span>
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white">{currentUser.username}</h2>
              <div className="flex items-center space-x-1.5">
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                <span className={`text-xs ${isConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {isConnected ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>
          </div>
          {onLogout && (
            <button
              onClick={onLogout}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all"
              title="Logout"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex space-x-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white py-2.5 px-4 rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all text-sm font-medium shadow-lg shadow-blue-500/25 flex items-center justify-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Create</span>
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
        </div>
      </div>

      {/* Room list */}
      <div className="flex-1 overflow-y-auto p-3">
        {rooms.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 bg-slate-200 dark:bg-slate-700 rounded-2xl flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 className="text-slate-700 dark:text-slate-300 font-medium mb-1">No rooms yet</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Create or join a room to start chatting</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rooms.map((room) => (
              <button
                key={room.id}
                onClick={() => onSelectRoom(room)}
                className={`w-full text-left p-3 rounded-xl transition-all ${
                  selectedRoomId === room.id
                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25'
                    : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    selectedRoomId === room.id 
                      ? 'bg-white/20' 
                      : 'bg-gradient-to-br from-blue-500 to-indigo-600'
                  }`}>
                    <span className={`font-bold text-sm ${selectedRoomId === room.id ? 'text-white' : 'text-white'}`}>
                      {room.name[0].toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`font-semibold truncate ${selectedRoomId === room.id ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                        {room.name}
                      </span>
                      <span className={`text-xs ml-2 ${selectedRoomId === room.id ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'}`}>
                        {room.memberCount}
                        <svg className="w-3 h-3 inline ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                        </svg>
                      </span>
                    </div>
                    <div className={`text-xs mt-0.5 ${selectedRoomId === room.id ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                      by {room.createdBy.username} • {formatDate(room.createdAt)}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
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
                    setShowCreateModal(false);
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
                  {loading ? (
                    <span className="flex items-center justify-center space-x-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span>Creating...</span>
                    </span>
                  ) : 'Create Room'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join Modal */}
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
                  <div className="w-12 h-12 mx-auto mb-3 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400">No rooms available to join</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {availableRooms.map((room) => (
                    <button
                      key={room.id}
                      onClick={() => handleJoinRoom(room.id)}
                      disabled={loading}
                      className="w-full text-left p-4 rounded-xl bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500 disabled:opacity-50 transition-all"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                          <span className="text-white font-bold text-sm">{room.name[0].toUpperCase()}</span>
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white">{room.name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center space-x-2">
                            <span>{room.memberCount} members</span>
                            <span>•</span>
                            <span>by {room.createdBy.username}</span>
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
    </div>
  );
}
