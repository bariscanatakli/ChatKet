import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReactionsService } from './reactions.service';

@ApiTags('reactions')
@Controller('messages')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReactionsController {
  constructor(private reactionsService: ReactionsService) {}

  @Get('emojis')
  @ApiOperation({ summary: 'Get allowed reaction emojis' })
  getAllowedEmojis() {
    return { emojis: this.reactionsService.getAllowedEmojis() };
  }

  @Get(':messageId/reactions')
  @ApiOperation({ summary: 'Get reactions for a message' })
  async getReactions(@Param('messageId') messageId: string) {
    return this.reactionsService.getReactions(messageId);
  }

  @Post(':messageId/reactions')
  @ApiOperation({ summary: 'Add reaction to a message' })
  async addReaction(
    @Request() req: { user: { id: string } },
    @Param('messageId') messageId: string,
    @Body() body: { emoji: string },
  ) {
    return this.reactionsService.addReaction(req.user.id, messageId, body.emoji);
  }

  @Delete(':messageId/reactions/:emoji')
  @ApiOperation({ summary: 'Remove reaction from a message' })
  async removeReaction(
    @Request() req: { user: { id: string } },
    @Param('messageId') messageId: string,
    @Param('emoji') emoji: string,
  ) {
    return this.reactionsService.removeReaction(req.user.id, messageId, emoji);
  }
}
