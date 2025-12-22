import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface MessageDto {
  roomId: string;
  text: string;
  clientMsgId: string;
  replyToId?: string;
}

export interface MessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
  isDuplicate?: boolean;
}

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async sendMessage(userId: string, dto: MessageDto): Promise<MessageResult> {
    const { roomId, text, clientMsgId, replyToId } = dto;

    // Validate message text
    const trimmedText = text.trim();
    if (trimmedText.length === 0) {
      return { success: false, error: 'Message cannot be empty' };
    }
    if (trimmedText.length > 500) {
      return { success: false, error: 'Message too long (max 500 characters)' };
    }

    // Check for duplicate (idempotency)
    const existingDedupe = await this.prisma.messageDedupe.findUnique({
      where: {
        roomId_userId_clientMsgId: { roomId, userId, clientMsgId },
      },
    });

    if (existingDedupe) {
      // Return existing message ID (idempotent)
      return {
        success: true,
        messageId: existingDedupe.messageId,
        isDuplicate: true,
      };
    }

    // Create message and dedupe record atomically
    const message = await this.prisma.$transaction(async (tx) => {
      const newMessage = await tx.message.create({
        data: {
          roomId,
          userId,
          text: trimmedText,
          replyToId,
        },
      });

      await tx.messageDedupe.create({
        data: {
          roomId,
          userId,
          clientMsgId,
          messageId: newMessage.id,
        },
      });

      return newMessage;
    });

    return {
      success: true,
      messageId: message.id,
    };
  }

  async getMessage(messageId: string) {
    return this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        user: {
          select: { id: true, username: true },
        },
        replyTo: {
          select: {
            id: true,
            text: true,
            user: {
              select: { id: true, username: true },
            },
          },
        },
        reactions: {
          include: {
            user: {
              select: { id: true, username: true },
            },
          },
        },
      },
    });
  }

  async getMessageWithReactions(messageId: string) {
    const message = await this.getMessage(messageId);
    if (!message) return null;

    // Group reactions by emoji
    const reactionsGrouped: Record<string, { emoji: string; count: number; users: Array<{ id: string; username: string }> }> = {};
    
    for (const reaction of message.reactions) {
      if (!reactionsGrouped[reaction.emoji]) {
        reactionsGrouped[reaction.emoji] = {
          emoji: reaction.emoji,
          count: 0,
          users: [],
        };
      }
      reactionsGrouped[reaction.emoji].count++;
      reactionsGrouped[reaction.emoji].users.push(reaction.user);
    }

    return {
      messageId: message.id,
      roomId: message.roomId,
      text: message.text,
      createdAt: message.createdAt.toISOString(),
      sender: message.user,
      replyTo: message.replyTo,
      reactions: Object.values(reactionsGrouped),
    };
  }

  async addReaction(userId: string, messageId: string, emoji: string) {
    const ALLOWED_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👎'];
    if (!ALLOWED_EMOJIS.includes(emoji)) {
      throw new Error('Invalid emoji');
    }

    return this.prisma.messageReaction.upsert({
      where: {
        messageId_userId_emoji: { messageId, userId, emoji },
      },
      create: { messageId, userId, emoji },
      update: {},
    });
  }

  async removeReaction(userId: string, messageId: string, emoji: string) {
    await this.prisma.messageReaction.deleteMany({
      where: { messageId, userId, emoji },
    });
  }

  async getMessageHistory(
    roomId: string,
    options: { before?: string; limit?: number } = {},
  ) {
    const { before, limit = 50 } = options;
    const take = Math.min(limit, 100);

    const whereClause: any = { roomId };

    if (before) {
      const beforeMessage = await this.prisma.message.findUnique({
        where: { id: before },
      });
      if (beforeMessage) {
        whereClause.createdAt = { lt: beforeMessage.createdAt };
      }
    }

    const messages = await this.prisma.message.findMany({
      where: whereClause,
      include: {
        user: {
          select: { id: true, username: true },
        },
        replyTo: {
          select: {
            id: true,
            text: true,
            user: {
              select: { id: true, username: true },
            },
          },
        },
        reactions: {
          include: {
            user: {
              select: { id: true, username: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });

    // Return in chronological order with grouped reactions
    return messages.reverse().map((m) => {
      // Group reactions by emoji
      const reactionsGrouped: Record<string, { emoji: string; count: number; users: Array<{ id: string; username: string }> }> = {};
      
      for (const reaction of m.reactions) {
        if (!reactionsGrouped[reaction.emoji]) {
          reactionsGrouped[reaction.emoji] = {
            emoji: reaction.emoji,
            count: 0,
            users: [],
          };
        }
        reactionsGrouped[reaction.emoji].count++;
        reactionsGrouped[reaction.emoji].users.push(reaction.user);
      }

      return {
        messageId: m.id,
        roomId: m.roomId,
        text: m.text,
        createdAt: m.createdAt.toISOString(),
        sender: m.user,
        replyTo: m.replyTo,
        reactions: Object.values(reactionsGrouped),
      };
    });
  }

  async getMessagesSince(roomId: string, since: Date, limit: number = 100) {
    const messages = await this.prisma.message.findMany({
      where: {
        roomId,
        createdAt: { gt: since },
      },
      include: {
        user: {
          select: { id: true, username: true },
        },
        replyTo: {
          select: {
            id: true,
            text: true,
            user: {
              select: { id: true, username: true },
            },
          },
        },
        reactions: {
          include: {
            user: {
              select: { id: true, username: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: Math.min(limit, 100),
    });

    return messages.map((m) => {
      // Group reactions by emoji
      const reactionsGrouped: Record<string, { emoji: string; count: number; users: Array<{ id: string; username: string }> }> = {};
      
      for (const reaction of m.reactions) {
        if (!reactionsGrouped[reaction.emoji]) {
          reactionsGrouped[reaction.emoji] = {
            emoji: reaction.emoji,
            count: 0,
            users: [],
          };
        }
        reactionsGrouped[reaction.emoji].count++;
        reactionsGrouped[reaction.emoji].users.push(reaction.user);
      }

      return {
        messageId: m.id,
        roomId: m.roomId,
        text: m.text,
        createdAt: m.createdAt.toISOString(),
        sender: m.user,
        replyTo: m.replyTo,
        reactions: Object.values(reactionsGrouped),
      };
    });
  }
}
