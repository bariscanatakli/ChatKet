import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        bio: true,
        avatarColor: true,
        status: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async getProfileByUsername(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        displayName: true,
        bio: true,
        avatarColor: true,
        status: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async updateProfile(
    userId: string,
    data: {
      displayName?: string;
      bio?: string;
      avatarColor?: string;
      status?: string;
    },
  ) {
    // Validate display name
    if (data.displayName !== undefined) {
      if (data.displayName && (data.displayName.length < 1 || data.displayName.length > 50)) {
        throw new Error('Display name must be 1-50 characters');
      }
    }

    // Validate bio
    if (data.bio !== undefined) {
      if (data.bio && data.bio.length > 200) {
        throw new Error('Bio must be at most 200 characters');
      }
    }

    // Validate status
    if (data.status !== undefined) {
      if (data.status && data.status.length > 100) {
        throw new Error('Status must be at most 100 characters');
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        displayName: data.displayName,
        bio: data.bio,
        avatarColor: data.avatarColor,
        status: data.status,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        bio: true,
        avatarColor: true,
        status: true,
        createdAt: true,
      },
    });

    return user;
  }

  async searchUsers(query: string, excludeUserId?: string) {
    const users = await this.prisma.user.findMany({
      where: {
        AND: [
          {
            OR: [
              { username: { contains: query, mode: 'insensitive' } },
              { displayName: { contains: query, mode: 'insensitive' } },
            ],
          },
          excludeUserId ? { id: { not: excludeUserId } } : {},
        ],
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarColor: true,
      },
      take: 20,
    });

    return users;
  }
}
