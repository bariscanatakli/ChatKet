import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  
  // Enable CORS for client
  app.enableCors({
    origin: true, // Allow all origins in production (nginx handles this)
    credentials: true,
  });
  
  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  
  // Swagger configuration
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ChatKet API')
    .setDescription(`
## Real-time Chat API

ChatKet is an open-source real-time chat system.

### Features
- **Authentication**: One-time code + JWT based auth
- **Rooms**: Create, list, and join chat rooms
- **Real-time Messaging**: Socket.IO powered WebSocket communication
- **Rate Limiting**: 5 messages per 10 seconds, 30s mute on violation
- **Presence**: Online/offline tracking with heartbeat

### WebSocket Events (Socket.IO)

Connect to \`/socket.io\` with JWT token in \`auth.token\`.

**Client → Server:**
- \`room:join\` - Join a room: \`{ roomId: string }\`
- \`room:leave\` - Leave a room: \`{ roomId: string }\`
- \`message:send\` - Send message: \`{ roomId, content, clientMsgId }\`
- \`presence:heartbeat\` - Keep presence alive
- \`rooms:sync\` - Reconnect recovery: \`{ roomIds: string[] }\`

**Server → Client:**
- \`room:joined\` - Joined room notification
- \`room:left\` - Left room notification
- \`message:new\` - New message in room
- \`presence:update\` - User online/offline status
- \`rate:limited\` - Rate limit exceeded warning
- \`error\` - Error messages
    `)
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT token obtained from /auth/verify-code',
      },
      'JWT',
    )
    .addTag('Auth', 'Authentication endpoints - request code and verify')
    .addTag('Rooms', 'Room management - create, list, and join rooms')
    .addTag('Messages', 'Message retrieval - paginated message history')
    .addTag('Health', 'Health check endpoint')
    .build();
  
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'ChatKet API Docs',
    customfavIcon: 'https://nestjs.com/img/logo-small.svg',
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info .title { color: #2563eb }
    `,
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true,
    },
  });
  
  await app.listen(port);
  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log(`📚 Swagger docs at http://localhost:${port}/docs`);
}

bootstrap();
