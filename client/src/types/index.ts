// User types
export interface User {
  id: string;
  username: string;
}

export interface UserProfile extends User {
  displayName?: string;
  bio?: string;
  avatarColor?: string;
  status?: string;
  createdAt: string;
}

// Auth types
export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
}

export interface RequestCodeResponse {
  message: string;
  code?: string; // Only in dev mode
}

export interface VerifyCodeResponse {
  accessToken: string;
  user: User;
}

// Room types
export interface Room {
  id: string;
  name: string;
  createdAt: string;
  createdBy: User;
  memberCount: number;
  joinedAt?: string;
  lastSeenAt?: string;
}

// Reaction types
export interface Reaction {
  emoji: string;
  count: number;
  users: Array<{ id: string; username: string }>;
}

// Reply types
export interface ReplyTo {
  id: string;
  text: string;
  sender: { id: string; username: string };
}

// Message types
export interface Message {
  messageId: string;
  roomId: string;
  text: string;
  createdAt: string;
  sender: User;
  replyTo?: ReplyTo | null;
  reactions?: Reaction[];
}

export interface PendingMessage {
  clientMsgId: string;
  roomId: string;
  text: string;
  status: 'sending' | 'sent' | 'failed';
  createdAt: string;
  replyTo?: ReplyTo | null;
}

// Direct Message types
export interface DMConversation {
  id: string;
  user1?: UserProfile;
  user2?: UserProfile;
  otherUser?: {
    id: string;
    username: string;
    displayName?: string;
    avatarColor?: string;
    status?: string;
  };
  lastMessage?: {
    id: string;
    text: string;
    createdAt: string;
    senderId: string;
    readAt?: string;
  } | null;
  unreadCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  text: string;
  createdAt: string;
  readAt?: string;
  sender: {
    id: string;
    username: string;
    displayName?: string;
    avatarColor?: string;
  };
  replyTo?: {
    id: string;
    text: string;
    sender: { id: string; username: string };
  } | null;
}

// Presence types
export type PresenceStatus = 'online' | 'away' | 'offline';

export interface UserPresence {
  id: string;
  username: string;
  status: PresenceStatus;
}

// Socket event payloads
export interface RoomSyncPayload {
  rooms: Array<{
    roomId: string;
    lastSeenAt: string;
  }>;
}

export interface RoomJoinPayload {
  roomId: string;
  lastSeenAt?: string;
}

export interface MessageSendPayload {
  roomId: string;
  text: string;
  clientMsgId: string;
}

export interface MessageAck {
  success: boolean;
  messageId?: string;
  error?: string;
  mutedUntil?: string;
}

export interface RoomSystemEvent {
  type: 'join' | 'leave' | 'muted';
  roomId: string;
  user?: User;
  createdAt: string;
  until?: string;
}

export interface RoomRosterEvent {
  roomId: string;
  users: UserPresence[];
}

// Typing indicator types
export interface TypingEvent {
  roomId: string;
  user: User;
  isTyping: boolean;
}

export interface TypingUser {
  id: string;
  username: string;
  startedAt: number;
}

// Reaction event types
export interface ReactionEvent {
  messageId: string;
  emoji: string;
  user: User;
  action: 'add' | 'remove';
  reactions: Reaction[];
}

// DM event types
export interface DMNewEvent {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  text: string;
  createdAt: string;
  sender: User;
}

export interface DMTypingEvent {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

// Theme types
export type Theme = 'light' | 'dark' | 'system';
