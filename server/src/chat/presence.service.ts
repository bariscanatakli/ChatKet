import { Injectable } from '@nestjs/common';

export type PresenceStatus = 'online' | 'away' | 'offline';

interface PresenceEntry {
  lastPing: number;
  socketId: string;
  roomIds: Set<string>;
}

export interface UserPresence {
  id: string;
  username: string;
  status: PresenceStatus;
}

@Injectable()
export class PresenceService {
  // Configuration
  private readonly onlineTimeoutMs = 30 * 1000; // 30 seconds to offline

  // In-memory store: Map<userId, PresenceEntry>
  private presenceMap = new Map<string, PresenceEntry>();
  
  // Reverse lookup: Map<socketId, userId>
  private socketToUser = new Map<string, string>();

  // Room subscriptions: Map<roomId, Set<userId>>
  private roomUsers = new Map<string, Set<string>>();

  // Cleanup interval
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Periodic cleanup every 10 seconds
    this.cleanupInterval = setInterval(() => this.checkTimeouts(), 10 * 1000);
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
   * Register a user connection
   */
  connect(userId: string, socketId: string): void {
    // Clean up old socket if exists
    const existing = this.presenceMap.get(userId);
    if (existing && existing.socketId !== socketId) {
      this.socketToUser.delete(existing.socketId);
    }

    this.presenceMap.set(userId, {
      lastPing: Date.now(),
      socketId,
      roomIds: existing?.roomIds || new Set(),
    });
    this.socketToUser.set(socketId, userId);
  }

  /**
   * Unregister a user connection
   */
  disconnect(socketId: string): { userId: string; roomIds: string[] } | null {
    const userId = this.socketToUser.get(socketId);
    if (!userId) return null;

    const entry = this.presenceMap.get(userId);
    const roomIds = entry ? Array.from(entry.roomIds) : [];

    // Remove from rooms
    for (const roomId of roomIds) {
      this.leaveRoom(userId, roomId);
    }

    this.presenceMap.delete(userId);
    this.socketToUser.delete(socketId);

    return { userId, roomIds };
  }

  /**
   * Join a room for presence tracking
   */
  joinRoom(userId: string, roomId: string): void {
    const entry = this.presenceMap.get(userId);
    if (entry) {
      entry.roomIds.add(roomId);
    }

    let roomSet = this.roomUsers.get(roomId);
    if (!roomSet) {
      roomSet = new Set();
      this.roomUsers.set(roomId, roomSet);
    }
    roomSet.add(userId);
  }

  /**
   * Leave a room for presence tracking
   */
  leaveRoom(userId: string, roomId: string): void {
    const entry = this.presenceMap.get(userId);
    if (entry) {
      entry.roomIds.delete(roomId);
    }

    const roomSet = this.roomUsers.get(roomId);
    if (roomSet) {
      roomSet.delete(userId);
      if (roomSet.size === 0) {
        this.roomUsers.delete(roomId);
      }
    }
  }

  /**
   * Update last ping time
   */
  ping(userId: string, roomId?: string): void {
    const entry = this.presenceMap.get(userId);
    if (entry) {
      entry.lastPing = Date.now();
    }
  }

  /**
   * Get user's current status
   */
  getStatus(userId: string): PresenceStatus {
    const entry = this.presenceMap.get(userId);
    if (!entry) return 'offline';

    const elapsed = Date.now() - entry.lastPing;
    if (elapsed > this.onlineTimeoutMs) {
      return 'offline';
    }
    return 'online';
  }

  /**
   * Get socket ID for a user
   */
  getSocketId(userId: string): string | null {
    return this.presenceMap.get(userId)?.socketId || null;
  }

  /**
   * Get user ID for a socket
   */
  getUserId(socketId: string): string | null {
    return this.socketToUser.get(socketId) || null;
  }

  /**
   * Get all online users in a room
   */
  getRoomUsers(roomId: string): string[] {
    const roomSet = this.roomUsers.get(roomId);
    if (!roomSet) return [];
    return Array.from(roomSet);
  }

  /**
   * Get rooms a user is in
   */
  getUserRooms(userId: string): string[] {
    const entry = this.presenceMap.get(userId);
    if (!entry) return [];
    return Array.from(entry.roomIds);
  }

  /**
   * Check for timeout users (called periodically)
   * Returns list of users that went offline
   */
  private checkTimeouts(): { userId: string; roomIds: string[] }[] {
    const timedOut: { userId: string; roomIds: string[] }[] = [];
    const now = Date.now();

    for (const [userId, entry] of this.presenceMap.entries()) {
      const elapsed = now - entry.lastPing;
      if (elapsed > this.onlineTimeoutMs) {
        // User timed out - they'll appear offline but we don't disconnect them
        // They may still be connected, just not sending pings
      }
    }

    return timedOut;
  }

  /**
   * Get detailed presence for a room
   */
  async getRoomRoster(
    roomId: string,
    userDetails: Map<string, { id: string; username: string }>,
  ): Promise<UserPresence[]> {
    const userIds = this.getRoomUsers(roomId);
    
    return userIds.map((userId) => {
      const details = userDetails.get(userId);
      return {
        id: userId,
        username: details?.username || 'Unknown',
        status: this.getStatus(userId),
      };
    });
  }
}
