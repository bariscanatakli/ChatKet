import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DMService {
  constructor(private prisma: PrismaService) {}

  // Get or create a conversation between two users
  async getOrCreateConversation(userId1: string, userId2: string) {
    // Always store user IDs in consistent order
    const [user1Id, user2Id] = [userId1, userId2].sort();

    let conversation = await this.prisma.dMConversation.findUnique({
      where: {
        user1Id_user2Id: { user1Id, user2Id },
      },
      include: {
        user1: {
          select: { id: true, username: true, displayName: true, avatarColor: true },
        },
        user2: {
          select: { id: true, username: true, displayName: true, avatarColor: true },
        },
      },
    });

    if (!conversation) {
      conversation = await this.prisma.dMConversation.create({
        data: { user1Id, user2Id },
        include: {
          user1: {
            select: { id: true, username: true, displayName: true, avatarColor: true },
          },
          user2: {
            select: { id: true, username: true, displayName: true, avatarColor: true },
          },
        },
      });
    }

    return conversation;
  }

  // Get all conversations for a user
  async getConversations(userId: string) {
    const conversations = await this.prisma.dMConversation.findMany({
      where: {
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      include: {
        user1: {
          select: { id: true, username: true, displayName: true, avatarColor: true },
        },
        user2: {
          select: { id: true, username: true, displayName: true, avatarColor: true },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            text: true,
            createdAt: true,
            senderId: true,
            readAt: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Transform to include other user and unread count
    const result = await Promise.all(
      conversations.map(async (conv) => {
        const otherUser = conv.user1Id === userId ? conv.user2 : conv.user1;
        const unreadCount = await this.prisma.directMessage.count({
          where: {
            conversationId: conv.id,
            receiverId: userId,
            readAt: null,
          },
        });

        return {
          id: conv.id,
          otherUser,
          lastMessage: conv.messages[0] || null,
          unreadCount,
          updatedAt: conv.updatedAt,
        };
      }),
    );

    return result;
  }

  // Send a direct message
  async sendMessage(
    senderId: string,
    receiverId: string,
    text: string,
    clientMsgId?: string,
    replyToId?: string,
  ) {
    // Validate text
    const trimmedText = text.trim();
    if (!trimmedText || trimmedText.length > 500) {
      throw new Error('Message must be 1-500 characters');
    }

    // Get or create conversation
    const conversation = await this.getOrCreateConversation(senderId, receiverId);

    // Check for duplicate if clientMsgId provided
    if (clientMsgId) {
      const existing = await this.prisma.directMessage.findUnique({
        where: {
          conversationId_senderId_clientMsgId: {
            conversationId: conversation.id,
            senderId,
            clientMsgId,
          },
        },
        include: {
          sender: {
            select: { id: true, username: true, displayName: true, avatarColor: true },
          },
          replyTo: {
            select: {
              id: true,
              text: true,
              sender: {
                select: { id: true, username: true },
              },
            },
          },
        },
      });
      if (existing) {
        return existing;
      }
    }

    // Create message
    const message = await this.prisma.directMessage.create({
      data: {
        conversationId: conversation.id,
        senderId,
        receiverId,
        text: trimmedText,
        clientMsgId,
        replyToId,
      },
      include: {
        sender: {
          select: { id: true, username: true, displayName: true, avatarColor: true },
        },
        replyTo: {
          select: {
            id: true,
            text: true,
            sender: {
              select: { id: true, username: true },
            },
          },
        },
      },
    });

    // Update conversation timestamp
    await this.prisma.dMConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    return message;
  }

  // Get messages in a conversation
  async getMessages(
    userId: string,
    conversationId: string,
    options: { before?: string; limit?: number } = {},
  ) {
    const { before, limit = 50 } = options;

    // Verify user is part of conversation
    const conversation = await this.prisma.dMConversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
      throw new ForbiddenException('Not part of this conversation');
    }

    const messages = await this.prisma.directMessage.findMany({
      where: {
        conversationId,
        ...(before && {
          createdAt: { lt: new Date(before) },
        }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        sender: {
          select: { id: true, username: true, displayName: true, avatarColor: true },
        },
        replyTo: {
          select: {
            id: true,
            text: true,
            sender: {
              select: { id: true, username: true },
            },
          },
        },
      },
    });

    return messages.reverse();
  }

  // Mark messages as read
  async markAsRead(userId: string, conversationId: string) {
    await this.prisma.directMessage.updateMany({
      where: {
        conversationId,
        receiverId: userId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
  }

  // Get unread count for a user
  async getUnreadCount(userId: string) {
    return this.prisma.directMessage.count({
      where: {
        receiverId: userId,
        readAt: null,
      },
    });
  }

  // Get conversation by ID with access check
  async getConversation(userId: string, conversationId: string) {
    const conversation = await this.prisma.dMConversation.findUnique({
      where: { id: conversationId },
      include: {
        user1: {
          select: { id: true, username: true, displayName: true, avatarColor: true },
        },
        user2: {
          select: { id: true, username: true, displayName: true, avatarColor: true },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
      throw new ForbiddenException('Not part of this conversation');
    }

    const otherUser =
      conversation.user1Id === userId ? conversation.user2 : conversation.user1;

    return {
      id: conversation.id,
      otherUser,
      createdAt: conversation.createdAt,
    };
  }
}
