import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';
import { RateLimitService } from './rate-limit.service';
import { PresenceService } from './presence.service';
import { RoomsService } from '../rooms/rooms.service';
import { AuthService } from '../auth/auth.service';
import { DMService } from '../dm/dm.service';

interface AuthenticatedSocket extends Socket {
  data: {
    user: {
      id: string;
      username: string;
    };
  };
}

interface RoomSyncPayload {
  rooms: Array<{
    roomId: string;
    lastSeenAt: string;
  }>;
}

interface RoomJoinPayload {
  roomId: string;
  lastSeenAt?: string;
}

interface RoomLeavePayload {
  roomId: string;
}

interface MessageSendPayload {
  roomId: string;
  text: string;
  clientMsgId: string;
  replyToId?: string;
}

interface PresencePingPayload {
  roomId: string;
}

interface TypingPayload {
  roomId: string;
  isTyping: boolean;
}

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private chatService: ChatService,
    private rateLimitService: RateLimitService,
    private presenceService: PresenceService,
    private roomsService: RoomsService,
    private authService: AuthService,
    private dmService: DMService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const user = await this.authenticateSocket(client);
      if (!user) {
        console.log(`Connection rejected: invalid token`);
        client.disconnect(true);
        return;
      }

      client.data.user = user;
      this.presenceService.connect(user.id, client.id);
      console.log(`User ${user.username} connected (socket: ${client.id})`);
    } catch (error) {
      console.log(`Connection error:`, error);
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    const result = this.presenceService.disconnect(client.id);
    if (result) {
      console.log(`User disconnected (socket: ${client.id})`);
      
      // Notify rooms about user leaving
      for (const roomId of result.roomIds) {
        await this.broadcastRoster(roomId);
        this.server.to(roomId).emit('room:system', {
          type: 'leave',
          roomId,
          user: client.data.user,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  private async authenticateSocket(
    client: Socket,
  ): Promise<{ id: string; username: string } | null> {
    const token = this.extractToken(client);
    if (!token) return null;

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      const user = await this.authService.validateUser(payload.sub);
      if (!user) return null;

      return { id: user.id, username: user.username };
    } catch {
      return null;
    }
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (authToken) return authToken;

    const authHeader = client.handshake.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);

    const queryToken = client.handshake.query?.token;
    if (queryToken && typeof queryToken === 'string') return queryToken;

    return null;
  }

  @SubscribeMessage('rooms:sync')
  async handleRoomsSync(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: RoomSyncPayload,
  ) {
    const user = client.data.user;
    if (!user) return { success: false, error: 'Unauthorized' };

    try {
      const results = [];

      for (const room of payload.rooms) {
        // Verify membership
        const isMember = await this.roomsService.isMember(user.id, room.roomId);
        if (!isMember) continue;

        // Join socket room
        client.join(room.roomId);
        this.presenceService.joinRoom(user.id, room.roomId);

        // Fetch missed messages
        const lastSeenAt = room.lastSeenAt ? new Date(room.lastSeenAt) : new Date(0);
        const missedMessages = await this.chatService.getMessagesSince(
          room.roomId,
          lastSeenAt,
        );

        // Send missed messages
        for (const msg of missedMessages) {
          client.emit('message:new', msg);
        }

        // Send roster
        await this.sendRosterToClient(client, room.roomId);

        results.push({ roomId: room.roomId, synced: true, messageCount: missedMessages.length });
      }

      // Broadcast roster updates to other users (but no join message - this is a reconnect/sync)
      for (const room of payload.rooms) {
        await this.broadcastRoster(room.roomId);
      }

      return { success: true, results };
    } catch (error) {
      console.error('rooms:sync error:', error);
      return { success: false, error: 'Sync failed' };
    }
  }

  @SubscribeMessage('room:join')
  async handleRoomJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: RoomJoinPayload,
  ) {
    const user = client.data.user;
    if (!user) return { success: false, error: 'Unauthorized' };

    try {
      const { roomId, lastSeenAt } = payload;

      // Verify membership
      const isMember = await this.roomsService.isMember(user.id, roomId);
      if (!isMember) {
        return { success: false, error: 'Not a member of this room' };
      }

      // Join socket room
      client.join(roomId);
      this.presenceService.joinRoom(user.id, roomId);

      // Fetch missed messages if lastSeenAt provided
      if (lastSeenAt) {
        const missedMessages = await this.chatService.getMessagesSince(
          roomId,
          new Date(lastSeenAt),
        );
        for (const msg of missedMessages) {
          client.emit('message:new', msg);
        }
      }

      // Broadcast roster and system message
      await this.broadcastRoster(roomId);
      this.server.to(roomId).emit('room:system', {
        type: 'join',
        roomId,
        user: { id: user.id, username: user.username },
        createdAt: new Date().toISOString(),
      });

      return { success: true };
    } catch (error) {
      console.error('room:join error:', error);
      return { success: false, error: 'Join failed' };
    }
  }

  @SubscribeMessage('room:leave')
  async handleRoomLeave(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: RoomLeavePayload,
  ) {
    const user = client.data.user;
    if (!user) return { success: false, error: 'Unauthorized' };

    try {
      const { roomId } = payload;

      // Leave socket room
      client.leave(roomId);
      this.presenceService.leaveRoom(user.id, roomId);

      // Update last seen
      await this.roomsService.updateLastSeen(user.id, roomId);

      // Broadcast roster and system message
      await this.broadcastRoster(roomId);
      this.server.to(roomId).emit('room:system', {
        type: 'leave',
        roomId,
        user: { id: user.id, username: user.username },
        createdAt: new Date().toISOString(),
      });

      return { success: true };
    } catch (error) {
      console.error('room:leave error:', error);
      return { success: false, error: 'Leave failed' };
    }
  }

  @SubscribeMessage('message:send')
  async handleMessageSend(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: MessageSendPayload,
  ) {
    const user = client.data.user;
    if (!user) return { success: false, error: 'Unauthorized' };

    try {
      const { roomId, text, clientMsgId, replyToId } = payload;

      // Verify membership
      const isMember = await this.roomsService.isMember(user.id, roomId);
      if (!isMember) {
        return { success: false, error: 'Not a member of this room' };
      }

      // Check rate limit
      const rateLimitResult = this.rateLimitService.checkAndRecord(user.id, roomId);
      if (!rateLimitResult.allowed) {
        // Emit muted system message to user
        client.emit('room:system', {
          type: 'muted',
          roomId,
          user: { id: user.id, username: user.username },
          createdAt: new Date().toISOString(),
          until: rateLimitResult.mutedUntil?.toISOString(),
        });
        return {
          success: false,
          error: rateLimitResult.error,
          mutedUntil: rateLimitResult.mutedUntil?.toISOString(),
        };
      }

      // Send message with replyToId
      const result = await this.chatService.sendMessage(user.id, {
        roomId,
        text,
        clientMsgId,
        replyToId,
      });

      if (!result.success) {
        return result;
      }

      // Get full message for broadcast (including replyTo)
      const message = await this.chatService.getMessage(result.messageId!);
      if (message) {
        const messagePayload = {
          messageId: message.id,
          roomId: message.roomId,
          text: message.text,
          createdAt: message.createdAt.toISOString(),
          sender: message.user,
          replyTo: message.replyTo ? {
            id: message.replyTo.id,
            text: message.replyTo.text,
            sender: message.replyTo.user,
          } : null,
        };

        // Broadcast to room (including sender for consistency)
        this.server.to(roomId).emit('message:new', messagePayload);
      }

      // Update last seen
      await this.roomsService.updateLastSeen(user.id, roomId);

      return {
        success: true,
        messageId: result.messageId,
      };
    } catch (error) {
      console.error('message:send error:', error);
      return { success: false, error: 'Send failed' };
    }
  }

  @SubscribeMessage('presence:ping')
  async handlePresencePing(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: PresencePingPayload,
  ) {
    const user = client.data.user;
    if (!user) return { success: false, error: 'Unauthorized' };

    this.presenceService.ping(user.id, payload.roomId);

    // Optionally broadcast roster if status changed
    // For now, just acknowledge
    return { success: true };
  }

  @SubscribeMessage('typing:update')
  async handleTypingUpdate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: TypingPayload,
  ) {
    const user = client.data.user;
    if (!user) return { success: false, error: 'Unauthorized' };

    const { roomId, isTyping } = payload;

    // Verify membership
    const isMember = await this.roomsService.isMember(user.id, roomId);
    if (!isMember) {
      return { success: false, error: 'Not a member of this room' };
    }

    // Broadcast typing status to other users in the room (not the sender)
    client.to(roomId).emit('typing:update', {
      roomId,
      user: { id: user.id, username: user.username },
      isTyping,
    });

    return { success: true };
  }

  @SubscribeMessage('reaction:add')
  async handleReactionAdd(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { messageId: string; emoji: string },
  ) {
    const user = client.data.user;
    if (!user) return { success: false, error: 'Unauthorized' };

    try {
      const { messageId, emoji } = payload;

      // Get message to find room
      const message = await this.chatService.getMessage(messageId);
      if (!message) {
        return { success: false, error: 'Message not found' };
      }

      // Verify membership
      const isMember = await this.roomsService.isMember(user.id, message.roomId);
      if (!isMember) {
        return { success: false, error: 'Not a member of this room' };
      }

      // Valid emojis
      const ALLOWED_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👎'];
      if (!ALLOWED_EMOJIS.includes(emoji)) {
        return { success: false, error: 'Invalid emoji' };
      }

      // Broadcast reaction to room
      this.server.to(message.roomId).emit('reaction:update', {
        messageId,
        emoji,
        user: { id: user.id, username: user.username },
        action: 'add',
      });

      return { success: true };
    } catch (error) {
      console.error('reaction:add error:', error);
      return { success: false, error: 'Failed to add reaction' };
    }
  }

  @SubscribeMessage('reaction:remove')
  async handleReactionRemove(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { messageId: string; emoji: string },
  ) {
    const user = client.data.user;
    if (!user) return { success: false, error: 'Unauthorized' };

    try {
      const { messageId, emoji } = payload;

      // Get message to find room
      const message = await this.chatService.getMessage(messageId);
      if (!message) {
        return { success: false, error: 'Message not found' };
      }

      // Broadcast reaction removal to room
      this.server.to(message.roomId).emit('reaction:update', {
        messageId,
        emoji,
        user: { id: user.id, username: user.username },
        action: 'remove',
      });

      return { success: true };
    } catch (error) {
      console.error('reaction:remove error:', error);
      return { success: false, error: 'Failed to remove reaction' };
    }
  }

  @SubscribeMessage('dm:send')
  async handleDMSend(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { conversationId: string; receiverId: string; text: string; clientMsgId?: string; replyToId?: string },
  ) {
    const user = client.data.user;
    if (!user) return { success: false, error: 'Unauthorized' };

    try {
      const { conversationId, receiverId, text, clientMsgId, replyToId } = payload;

      // Validate text
      const trimmedText = text?.trim();
      if (!trimmedText || trimmedText.length > 500) {
        return { success: false, error: 'Message must be 1-500 characters' };
      }

      // Save message to database
      const message = await this.dmService.sendMessage(
        user.id,
        receiverId,
        trimmedText,
        clientMsgId,
        replyToId,
      );

      // Find receiver's socket
      const receiverSocketId = this.presenceService.getSocketId(receiverId);

      // Create DM notification payload
      const dmPayload = {
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        receiverId: message.receiverId,
        text: message.text,
        createdAt: message.createdAt.toISOString(),
        sender: message.sender,
        replyTo: message.replyTo,
      };

      // Send to receiver if online
      if (receiverSocketId) {
        this.server.to(receiverSocketId).emit('dm:new', dmPayload);
      }

      return { success: true, ...dmPayload };
    } catch (error) {
      console.error('dm:send error:', error);
      return { success: false, error: 'Failed to send DM' };
    }
  }

  @SubscribeMessage('dm:typing')
  async handleDMTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { conversationId: string; isTyping: boolean },
  ) {
    const user = client.data.user;
    if (!user) return { success: false, error: 'Unauthorized' };

    const { conversationId, isTyping } = payload;

    // Get conversation to find the other user
    try {
      const conversation = await this.dmService.getConversation(user.id, conversationId);
      if (!conversation) return { success: false, error: 'Conversation not found' };

      const receiverId = conversation.otherUser.id;
      const receiverSocketId = this.presenceService.getSocketId(receiverId);
      
      if (receiverSocketId) {
        this.server.to(receiverSocketId).emit('dm:typing', {
          conversationId,
          userId: user.id,
          username: user.username,
          isTyping,
        });
      }
    } catch (error) {
      console.error('dm:typing error:', error);
    }

    return { success: true };
  }

  // Public method to get socket ID for a user
  getSocketIdForUser(userId: string): string | undefined {
    return this.presenceService.getSocketId(userId) ?? undefined;
  }

  // Public method to emit to a specific socket
  emitToSocket(socketId: string, event: string, data: unknown) {
    this.server.to(socketId).emit(event, data);
  }

  private async broadcastRoster(roomId: string) {
    const userIds = this.presenceService.getRoomUsers(roomId);
    const users: Array<{ id: string; username: string; status: string }> = [];

    for (const userId of userIds) {
      const socketId = this.presenceService.getSocketId(userId);
      if (socketId) {
        const socket = this.server.sockets.sockets.get(socketId);
        if (socket?.data.user) {
          users.push({
            id: socket.data.user.id,
            username: socket.data.user.username,
            status: this.presenceService.getStatus(userId),
          });
        }
      }
    }

    this.server.to(roomId).emit('room:roster', { roomId, users });
  }

  private async sendRosterToClient(client: AuthenticatedSocket, roomId: string) {
    const userIds = this.presenceService.getRoomUsers(roomId);
    const users: Array<{ id: string; username: string; status: string }> = [];

    for (const userId of userIds) {
      const socketId = this.presenceService.getSocketId(userId);
      if (socketId) {
        const socket = this.server.sockets.sockets.get(socketId);
        if (socket?.data.user) {
          users.push({
            id: socket.data.user.id,
            username: socket.data.user.username,
            status: this.presenceService.getStatus(userId),
          });
        }
      }
    }

    client.emit('room:roster', { roomId, users });
  }
}
