import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { RoomsModule } from './rooms/rooms.module';
import { ChatModule } from './chat/chat.module';
import { UsersModule } from './users/users.module';
import { DMModule } from './dm/dm.module';
import { ReactionsModule } from './reactions/reactions.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    AuthModule,
    RoomsModule,
    ChatModule,
    UsersModule,
    DMModule,
    ReactionsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
