import { io, Socket } from 'socket.io-client';
import type {
  Message,
  MessageAck,
  RoomSystemEvent,
  RoomRosterEvent,
  TypingEvent,
  ReactionEvent,
  DMNewEvent,
  DMTypingEvent,
} from '../types';

// In production (Docker), Socket.IO is proxied through nginx
// In development, it runs on localhost:3000
const SOCKET_URL = import.meta.env.PROD ? '' : 'http://localhost:3000';

type EventCallback<T> = (data: T) => void;

class SocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  
  // Event listeners
  private messageListeners: EventCallback<Message>[] = [];
  private systemListeners: EventCallback<RoomSystemEvent>[] = [];
  private rosterListeners: EventCallback<RoomRosterEvent>[] = [];
  private connectionListeners: EventCallback<boolean>[] = [];
  private typingListeners: EventCallback<TypingEvent>[] = [];
  private reactionListeners: EventCallback<ReactionEvent>[] = [];
  private dmListeners: EventCallback<DMNewEvent>[] = [];
  private dmTypingListeners: EventCallback<DMTypingEvent>[] = [];

  connect(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }
      
      this.socket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });

      this.socket.on('connect', () => {
        console.log('Socket connected');
        this.reconnectAttempts = 0;
        this.notifyConnectionListeners(true);
        resolve();
      });

      this.socket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        this.notifyConnectionListeners(false);
      });

      this.socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        this.reconnectAttempts++;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          reject(new Error('Failed to connect after max attempts'));
        }
      });

      // Message events
      this.socket.on('message:new', (data: Message) => {
        this.messageListeners.forEach((cb) => cb(data));
      });

      // System events
      this.socket.on('room:system', (data: RoomSystemEvent) => {
        this.systemListeners.forEach((cb) => cb(data));
      });

      // Roster events
      this.socket.on('room:roster', (data: RoomRosterEvent) => {
        this.rosterListeners.forEach((cb) => cb(data));
      });

      // Typing events
      this.socket.on('typing:update', (data: TypingEvent) => {
        this.typingListeners.forEach((cb) => cb(data));
      });

      // Reaction events
      this.socket.on('reaction:update', (data: ReactionEvent) => {
        this.reactionListeners.forEach((cb) => cb(data));
      });

      // DM events
      this.socket.on('dm:new', (data: DMNewEvent) => {
        this.dmListeners.forEach((cb) => cb(data));
      });

      // DM typing events
      this.socket.on('dm:typing', (data: DMTypingEvent) => {
        this.dmTypingListeners.forEach((cb) => cb(data));
      });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // Room operations
  syncRooms(rooms: Array<{ roomId: string; lastSeenAt: string }>): Promise<{ success: boolean }> {
    return this.emit('rooms:sync', { rooms });
  }

  joinRoom(roomId: string, lastSeenAt?: string): Promise<{ success: boolean }> {
    return this.emit('room:join', { roomId, lastSeenAt });
  }

  leaveRoom(roomId: string): Promise<{ success: boolean }> {
    return this.emit('room:leave', { roomId });
  }

  // Message operations
  sendMessage(roomId: string, text: string, clientMsgId: string, replyToId?: string): Promise<MessageAck> {
    return this.emit('message:send', { roomId, text, clientMsgId, replyToId });
  }

  // Presence operations
  ping(roomId: string): Promise<{ success: boolean }> {
    return this.emit('presence:ping', { roomId });
  }

  // Typing operations
  sendTyping(roomId: string, isTyping: boolean): void {
    if (this.socket?.connected) {
      this.socket.emit('typing:update', { roomId, isTyping });
    }
  }

  // Reaction operations
  addReaction(messageId: string, emoji: string): Promise<{ success: boolean }> {
    return this.emit('reaction:add', { messageId, emoji });
  }

  removeReaction(messageId: string, emoji: string): Promise<{ success: boolean }> {
    return this.emit('reaction:remove', { messageId, emoji });
  }

  // DM operations
  sendDM(conversationId: string, receiverId: string, text: string, replyToId?: string): Promise<{ success: boolean }> {
    return this.emit('dm:send', { conversationId, receiverId, text, replyToId });
  }

  sendDMTyping(conversationId: string, isTyping: boolean): void {
    if (this.socket?.connected) {
      this.socket.emit('dm:typing', { conversationId, isTyping });
    }
  }

  // Event listeners
  onMessage(callback: EventCallback<Message>): () => void {
    this.messageListeners.push(callback);
    return () => {
      this.messageListeners = this.messageListeners.filter((cb) => cb !== callback);
    };
  }

  onSystemEvent(callback: EventCallback<RoomSystemEvent>): () => void {
    this.systemListeners.push(callback);
    return () => {
      this.systemListeners = this.systemListeners.filter((cb) => cb !== callback);
    };
  }

  onRoster(callback: EventCallback<RoomRosterEvent>): () => void {
    this.rosterListeners.push(callback);
    return () => {
      this.rosterListeners = this.rosterListeners.filter((cb) => cb !== callback);
    };
  }

  onConnectionChange(callback: EventCallback<boolean>): () => void {
    this.connectionListeners.push(callback);
    return () => {
      this.connectionListeners = this.connectionListeners.filter((cb) => cb !== callback);
    };
  }

  onTyping(callback: EventCallback<TypingEvent>): () => void {
    this.typingListeners.push(callback);
    return () => {
      this.typingListeners = this.typingListeners.filter((cb) => cb !== callback);
    };
  }

  onReaction(callback: EventCallback<ReactionEvent>): () => void {
    this.reactionListeners.push(callback);
    return () => {
      this.reactionListeners = this.reactionListeners.filter((cb) => cb !== callback);
    };
  }

  onDM(callback: EventCallback<DMNewEvent>): () => void {
    this.dmListeners.push(callback);
    return () => {
      this.dmListeners = this.dmListeners.filter((cb) => cb !== callback);
    };
  }

  onDMTyping(callback: EventCallback<DMTypingEvent>): () => void {
    this.dmTypingListeners.push(callback);
    return () => {
      this.dmTypingListeners = this.dmTypingListeners.filter((cb) => cb !== callback);
    };
  }

  private emit<T>(event: string, data: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error('Socket not connected'));
        return;
      }

      this.socket.emit(event, data, (response: T) => {
        resolve(response);
      });
    });
  }

  private notifyConnectionListeners(connected: boolean): void {
    this.connectionListeners.forEach((cb) => cb(connected));
  }
}

// Singleton instance
export const socketService = new SocketService();
