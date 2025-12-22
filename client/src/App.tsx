import { useState, useEffect, useCallback } from 'react';
import { LoginForm, ChatRoom } from './components';
import { useAuth } from './hooks/useAuth';
import { useSocket } from './hooks/useSocket';
import { roomsApi, dmApi, usersApi } from './services/api';
import { socketService } from './services/socket';
import type { Room, Message, DMConversation, UserProfile, User } from './types';
import { ThemeProvider } from './contexts/ThemeContext';
import { ThemeToggle } from './components/ThemeToggle';
import { ProfileModal } from './components/ProfileModal';
import { DMChat } from './components/DMChat';
import { UserProfileView } from './components/UserProfileView';
import { DMNotificationToast, useDMNotifications } from './components/DMNotificationToast';
import { UnifiedSidebar } from './components/UnifiedSidebar';

type View = 'main' | 'dm-chat';

function AppContent() {
  const { token, user, isAuthenticated, login, logout } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [view, setView] = useState<View>('main');
  const [showProfile, setShowProfile] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<DMConversation | null>(null);
  const [totalUnread, setTotalUnread] = useState(0);
  const [viewingUser, setViewingUser] = useState<User | null>(null);
  const { notifications, addNotification, dismissNotification } = useDMNotifications();

  const {
    isConnected,
    systemEvents,
    joinRoom,
    leaveRoom,
    sendMessage,
    sendTyping,
    getRoomMessages,
    getRoomRoster,
    getTypingUsers,
    setRoomMessages,
  } = useSocket({ token, rooms });

  // Load user's rooms on authentication
  useEffect(() => {
    if (!token) {
      setRooms([]);
      setSelectedRoom(null);
      return;
    }

    const loadRooms = async () => {
      setLoadingRooms(true);
      try {
        const userRooms = await roomsApi.getRooms(token);
        setRooms(userRooms);
      } catch (error) {
        console.error('Failed to load rooms:', error);
      } finally {
        setLoadingRooms(false);
      }
    };

    loadRooms();
  }, [token]);

  // Load user profile
  useEffect(() => {
    if (!token) return;
    usersApi.getMyProfile(token).then(setUserProfile).catch(console.error);
  }, [token]);

  // Subscribe to DM notifications
  useEffect(() => {
    if (!token || !user) return;

    const unsubscribe = socketService.onDM((dm) => {
      // Don't show notification if we're already viewing this conversation
      if (view === 'dm-chat' && selectedConversation?.id === dm.conversationId) {
        return;
      }
      // Don't show notification for our own messages
      if (dm.senderId === user.id) {
        return;
      }
      // Show notification
      addNotification(dm);
      // Increment unread count
      setTotalUnread((prev) => prev + 1);
    });

    return unsubscribe;
  }, [token, user, view, selectedConversation, addNotification]);

  // Join socket room when selecting a room
  useEffect(() => {
    if (selectedRoom && isConnected) {
      joinRoom(selectedRoom.id);
    }
  }, [selectedRoom, isConnected, joinRoom]);

  const handleSelectRoom = useCallback((room: Room) => {
    // Leave previous room
    if (selectedRoom && selectedRoom.id !== room.id) {
      leaveRoom(selectedRoom.id);
    }
    setSelectedRoom(room);
  }, [selectedRoom, leaveRoom]);

  const handleSendMessage = useCallback(async (roomId: string, text: string, clientMsgId: string, replyToId?: string) => {
    return sendMessage(roomId, text, clientMsgId, replyToId);
  }, [sendMessage]);

  const handleTyping = useCallback((roomId: string, isTyping: boolean) => {
    sendTyping(roomId, isTyping);
  }, [sendTyping]);

  const handleLoadMessages = useCallback((roomId: string, messages: Message[]) => {
    setRoomMessages(roomId, messages);
  }, [setRoomMessages]);

  const handleLogout = useCallback(() => {
    if (selectedRoom) {
      leaveRoom(selectedRoom.id);
    }
    logout();
  }, [selectedRoom, leaveRoom, logout]);

  const handleSelectConversation = (conv: DMConversation) => {
    setSelectedConversation(conv);
    setView('dm-chat');
  };

  const handleViewProfile = useCallback((profileUser: User) => {
    setViewingUser(profileUser);
  }, []);

  const handleDMNotificationClick = useCallback(async (notification: { id: string; conversationId: string; sender: { id: string; username: string } }) => {
    dismissNotification(notification.id);
    try {
      const conversations = await dmApi.getConversations(token!);
      const conv = conversations.find(c => c.id === notification.conversationId);
      if (conv) {
        setSelectedConversation({
          ...conv,
          createdAt: conv.updatedAt,
        });
        setView('dm-chat');
      }
    } catch (err) {
      console.error('Failed to open conversation:', err);
    }
  }, [token, dismissNotification]);

  const handleStartDMFromProfile = useCallback(async (conversationId: string, otherUserProfile: UserProfile) => {
    const conv: DMConversation = {
      id: conversationId,
      otherUser: {
        id: otherUserProfile.id,
        username: otherUserProfile.username,
        displayName: otherUserProfile.displayName,
        avatarColor: otherUserProfile.avatarColor,
      },
      lastMessage: null,
      unreadCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setSelectedConversation(conv);
    setView('dm-chat');
  }, []);

  // Not authenticated - show login
  if (!isAuthenticated || !user || !token) {
    return <LoginForm onLogin={login} />;
  }

  // Loading rooms
  if (loadingRooms) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-blue-200">Loading your rooms...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden bg-slate-100 dark:bg-slate-900">
      {/* Sidebar - Unified Room & DM list */}
      <div className={`w-full md:w-80 flex-shrink-0 ${(selectedRoom || view === 'dm-chat') ? 'hidden md:flex md:flex-col' : 'flex flex-col'}`}>
        {/* Top bar with profile and theme toggle */}
        <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setShowProfile(true)}
            className="flex items-center space-x-2 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-all"
          >
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${userProfile?.avatarColor || 'from-violet-500 to-purple-600'} flex items-center justify-center`}>
              <span className="text-white font-medium text-sm">
                {(userProfile?.displayName || user.username).slice(0, 2).toUpperCase()}
              </span>
            </div>
            <span className="font-medium text-slate-800 dark:text-white text-sm">
              {userProfile?.displayName || user.username}
            </span>
          </button>
          
          <div className="flex items-center space-x-1">
            <ThemeToggle />
            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all"
              title="Logout"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>

        {/* Unified sidebar */}
        <div className="flex-1 overflow-hidden">
          <UnifiedSidebar
            rooms={rooms}
            token={token}
            selectedRoomId={selectedRoom?.id ?? null}
            selectedConversationId={selectedConversation?.id ?? null}
            onSelectRoom={(room) => {
              if (selectedConversation) setSelectedConversation(null);
              setView('main');
              handleSelectRoom(room);
            }}
            onSelectConversation={(conv) => {
              if (selectedRoom) setSelectedRoom(null);
              handleSelectConversation(conv);
            }}
            onRoomsUpdate={setRooms}
            totalUnread={totalUnread}
            onUnreadChange={setTotalUnread}
          />
        </div>
      </div>

      {/* Chat area */}
      <div className={`flex-1 ${!selectedRoom && view !== 'dm-chat' ? 'hidden md:flex' : 'flex'} flex-col`}>
        {view === 'dm-chat' && selectedConversation && userProfile ? (
          <DMChat
            token={token}
            conversation={selectedConversation}
            currentUser={userProfile}
            onBack={() => {
              setSelectedConversation(null);
              setView('main');
            }}
          />
        ) : selectedRoom ? (
          <ChatRoom
            roomId={selectedRoom.id}
            roomName={selectedRoom.name}
            token={token}
            currentUser={user}
            messages={getRoomMessages(selectedRoom.id)}
            roster={getRoomRoster(selectedRoom.id)}
            typingUsers={getTypingUsers(selectedRoom.id)}
            systemEvents={systemEvents}
            isConnected={isConnected}
            onSendMessage={handleSendMessage}
            onTyping={handleTyping}
            onLoadMessages={(messages) => handleLoadMessages(selectedRoom.id, messages)}
            onBack={() => setSelectedRoom(null)}
            onViewProfile={handleViewProfile}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-6 bg-slate-200 dark:bg-slate-700 rounded-3xl flex items-center justify-center">
                <svg className="w-10 h-10 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">Welcome to ChatKet</h2>
              <p className="text-slate-500 dark:text-slate-400">Select a conversation to start chatting</p>
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">or create a new room / DM</p>
            </div>
          </div>
        )}
      </div>

      {/* Profile Modal - Edit own profile */}
      <ProfileModal
        token={token}
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
        onUpdate={setUserProfile}
      />

      {/* User Profile View - View others' profiles */}
      {viewingUser && (
        <UserProfileView
          token={token}
          user={viewingUser}
          currentUserId={user.id}
          isOpen={!!viewingUser}
          onClose={() => setViewingUser(null)}
          onStartDM={handleStartDMFromProfile}
        />
      )}

      {/* DM Notifications Toast */}
      <DMNotificationToast
        notifications={notifications}
        onDismiss={dismissNotification}
        onClick={handleDMNotificationClick}
      />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
