import { Module, forwardRef } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { MessagesController } from './messages.controller';
import { RateLimitService } from './rate-limit.service';
import { PresenceService } from './presence.service';
import { AuthModule } from '../auth/auth.module';
import { RoomsModule } from '../rooms/rooms.module';
import { DMModule } from '../dm/dm.module';

@Module({
  imports: [AuthModule, RoomsModule, DMModule],
  controllers: [MessagesController],
  providers: [ChatGateway, ChatService, RateLimitService, PresenceService],
  exports: [ChatService, ChatGateway, PresenceService],
})
export class ChatModule {}
