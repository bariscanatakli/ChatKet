import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';

@Injectable()
export class RoomsService {
  constructor(private prisma: PrismaService) {}

  async createRoom(userId: string, dto: CreateRoomDto) {
    // Create room with creator as member
    const room = await this.prisma.room.create({
      data: {
        name: dto.name,
        createdById: userId,
        memberships: {
          create: {
            userId,
          },
        },
      },
      include: {
        createdBy: {
          select: { id: true, username: true },
        },
        _count: {
          select: { memberships: true },
        },
      },
    });

    return {
      id: room.id,
      name: room.name,
      createdAt: room.createdAt,
      createdBy: room.createdBy,
      memberCount: room._count.memberships,
    };
  }

  async getUserRooms(userId: string) {
    const memberships = await this.prisma.roomMembership.findMany({
      where: { userId },
      include: {
        room: {
          include: {
            createdBy: {
              select: { id: true, username: true },
            },
            _count: {
              select: { memberships: true },
            },
          },
        },
      },
      orderBy: {
        room: { updatedAt: 'desc' },
      },
    });

    return memberships.map((m) => ({
      id: m.room.id,
      name: m.room.name,
      createdAt: m.room.createdAt,
      createdBy: m.room.createdBy,
      memberCount: m.room._count.memberships,
      joinedAt: m.joinedAt,
      lastSeenAt: m.lastSeenAt,
    }));
  }

  async joinRoom(userId: string, roomId: string) {
    // Check room exists
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        createdBy: {
          select: { id: true, username: true },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Check if already a member
    const existingMembership = await this.prisma.roomMembership.findUnique({
      where: {
        roomId_userId: { roomId, userId },
      },
    });

    if (existingMembership) {
      throw new ConflictException('Already a member of this room');
    }

    // Create membership
    const membership = await this.prisma.roomMembership.create({
      data: {
        roomId,
        userId,
      },
      include: {
        room: {
          include: {
            _count: {
              select: { memberships: true },
            },
          },
        },
      },
    });

    return {
      id: room.id,
      name: room.name,
      createdAt: room.createdAt,
      createdBy: room.createdBy,
      memberCount: membership.room._count.memberships,
      joinedAt: membership.joinedAt,
    };
  }

  async isMember(userId: string, roomId: string): Promise<boolean> {
    const membership = await this.prisma.roomMembership.findUnique({
      where: {
        roomId_userId: { roomId, userId },
      },
    });
    return !!membership;
  }

  async requireMembership(userId: string, roomId: string): Promise<void> {
    const isMember = await this.isMember(userId, roomId);
    if (!isMember) {
      throw new ForbiddenException('Not a member of this room');
    }
  }

  async getRoomMembers(roomId: string) {
    const memberships = await this.prisma.roomMembership.findMany({
      where: { roomId },
      include: {
        user: {
          select: { id: true, username: true },
        },
      },
    });

    return memberships.map((m) => ({
      id: m.user.id,
      username: m.user.username,
      joinedAt: m.joinedAt,
    }));
  }

  async updateLastSeen(userId: string, roomId: string) {
    await this.prisma.roomMembership.update({
      where: {
        roomId_userId: { roomId, userId },
      },
      data: {
        lastSeenAt: new Date(),
      },
    });
  }

  async getRoom(roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        createdBy: {
          select: { id: true, username: true },
        },
        _count: {
          select: { memberships: true },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    return {
      id: room.id,
      name: room.name,
      createdAt: room.createdAt,
      createdBy: room.createdBy,
      memberCount: room._count.memberships,
    };
  }

  async getAllRooms() {
    const rooms = await this.prisma.room.findMany({
      include: {
        createdBy: {
          select: { id: true, username: true },
        },
        _count: {
          select: { memberships: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rooms.map((room) => ({
      id: room.id,
      name: room.name,
      createdAt: room.createdAt,
      createdBy: room.createdBy,
      memberCount: room._count.memberships,
    }));
  }
}
