import { Module, forwardRef } from '@nestjs/common';
import { DMController } from './dm.controller';
import { DMService } from './dm.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [PrismaModule, forwardRef(() => ChatModule)],
  controllers: [DMController],
  providers: [DMService],
  exports: [DMService],
})
export class DMModule {}
