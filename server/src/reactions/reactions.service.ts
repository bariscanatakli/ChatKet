import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsService } from '../rooms/rooms.service';

// Allowed emojis for reactions
const ALLOWED_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👎'];

@Injectable()
export class ReactionsService {
  constructor(
    private prisma: PrismaService,
    private roomsService: RoomsService,
  ) {}

  async addReaction(userId: string, messageId: string, emoji: string) {
    // Validate emoji
    if (!ALLOWED_EMOJIS.includes(emoji)) {
      throw new Error(`Invalid emoji. Allowed: ${ALLOWED_EMOJIS.join(' ')}`);
    }

    // Get message and verify access
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, roomId: true },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Check user is member of room
    const isMember = await this.roomsService.isMember(userId, message.roomId);
    if (!isMember) {
      throw new ForbiddenException('Not a member of this room');
    }

    // Add or update reaction (upsert)
    const reaction = await this.prisma.messageReaction.upsert({
      where: {
        messageId_userId_emoji: { messageId, userId, emoji },
      },
      create: { messageId, userId, emoji },
      update: {},
      include: {
        user: {
          select: { id: true, username: true },
        },
      },
    });

    return reaction;
  }

  async removeReaction(userId: string, messageId: string, emoji: string) {
    // Get message and verify access
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, roomId: true },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Check user is member of room
    const isMember = await this.roomsService.isMember(userId, message.roomId);
    if (!isMember) {
      throw new ForbiddenException('Not a member of this room');
    }

    await this.prisma.messageReaction.deleteMany({
      where: { messageId, userId, emoji },
    });

    return { success: true };
  }

  async getReactions(messageId: string) {
    const reactions = await this.prisma.messageReaction.findMany({
      where: { messageId },
      include: {
        user: {
          select: { id: true, username: true },
        },
      },
    });

    // Group by emoji
    const grouped: Record<string, { emoji: string; count: number; users: Array<{ id: string; username: string }> }> = {};
    
    for (const reaction of reactions) {
      if (!grouped[reaction.emoji]) {
        grouped[reaction.emoji] = {
          emoji: reaction.emoji,
          count: 0,
          users: [],
        };
      }
      grouped[reaction.emoji].count++;
      grouped[reaction.emoji].users.push(reaction.user);
    }

    return Object.values(grouped);
  }

  async getMessageWithReactions(messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        user: {
          select: { id: true, username: true },
        },
        reactions: {
          include: {
            user: {
              select: { id: true, username: true },
            },
          },
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
      },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Group reactions
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
      ...message,
      reactions: Object.values(reactionsGrouped),
    };
  }

  getAllowedEmojis() {
    return ALLOWED_EMOJIS;
  }
}
