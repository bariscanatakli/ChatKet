import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RequestCodeDto } from './dto/request-code.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';

@Injectable()
export class AuthService {
  private readonly usernameRegex = /^[A-Za-z0-9_]{3,20}$/;
  private readonly codeExpiry = 10 * 60 * 1000; // 10 minutes
  private readonly saltRounds = 10;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async requestCode(dto: RequestCodeDto): Promise<{ message: string; code?: string }> {
    const { username } = dto;

    // Validate username format
    if (!this.usernameRegex.test(username)) {
      throw new BadRequestException(
        'Username must be 3-20 characters, alphanumeric and underscore only',
      );
    }

    // Find or create user
    let user = await this.prisma.user.findUnique({
      where: { username: username.toLowerCase() },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: { username: username.toLowerCase() },
      });
    }

    // Generate 6-digit code
    const code = this.generateCode();
    const codeHash = await bcrypt.hash(code, this.saltRounds);
    const expiresAt = new Date(Date.now() + this.codeExpiry);

    // Invalidate previous codes
    await this.prisma.loginCode.updateMany({
      where: {
        username: user.username,
        used: false,
        expiresAt: { gt: new Date() },
      },
      data: { used: true },
    });

    // Create new code
    await this.prisma.loginCode.create({
      data: {
        username: user.username,
        codeHash,
        expiresAt,
      },
    });

    // For this demo app, always return the code in response
    // In a real production app, you would send via email/SMS
    return {
      message: 'Code generated successfully',
      code, // Return code for demo purposes
    };
  }

  async verifyCode(dto: VerifyCodeDto): Promise<{ accessToken: string; user: { id: string; username: string } }> {
    const { username, code } = dto;

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { username: username.toLowerCase() },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid username or code');
    }

    // Find valid login codes
    const loginCodes = await this.prisma.loginCode.findMany({
      where: {
        username: user.username,
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Check each code
    let validCode = null;
    for (const loginCode of loginCodes) {
      const isValid = await bcrypt.compare(code, loginCode.codeHash);
      if (isValid) {
        validCode = loginCode;
        break;
      }
    }

    if (!validCode) {
      throw new UnauthorizedException('Invalid username or code');
    }

    // Mark code as used
    await this.prisma.loginCode.update({
      where: { id: validCode.id },
      data: { used: true },
    });

    // Generate JWT
    const payload = {
      sub: user.id,
      username: user.username,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        username: user.username,
      },
    };
  }

  async validateUser(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
    });
  }

  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}
