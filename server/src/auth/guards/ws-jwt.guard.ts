import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { AuthService } from '../auth.service';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();
    const user = await this.validateToken(client);
    
    if (!user) {
      throw new WsException('Unauthorized');
    }
    
    // Attach user to socket data
    client.data.user = user;
    return true;
  }

  async validateToken(client: Socket): Promise<{ id: string; username: string } | null> {
    const token = this.extractToken(client);
    
    if (!token) {
      return null;
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      
      const user = await this.authService.validateUser(payload.sub);
      
      if (!user) {
        return null;
      }
      
      return {
        id: user.id,
        username: user.username,
      };
    } catch {
      return null;
    }
  }

  private extractToken(client: Socket): string | null {
    // Try auth object first (Socket.IO auth)
    const authToken = client.handshake.auth?.token;
    if (authToken) {
      return authToken;
    }

    // Try Authorization header
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    // Try query parameter
    const queryToken = client.handshake.query?.token;
    if (queryToken && typeof queryToken === 'string') {
      return queryToken;
    }

    return null;
  }
}
