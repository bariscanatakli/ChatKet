import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DMService } from './dm.service';

@ApiTags('dm')
@Controller('dm')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DMController {
  constructor(private dmService: DMService) {}

  @Get('conversations')
  @ApiOperation({ summary: 'Get all DM conversations' })
  async getConversations(@Request() req: { user: { id: string } }) {
    return this.dmService.getConversations(req.user.id);
  }

  @Post('conversations/:userId')
  @ApiOperation({ summary: 'Start or get conversation with a user' })
  async startConversation(
    @Request() req: { user: { id: string } },
    @Param('userId') otherUserId: string,
  ) {
    const conversation = await this.dmService.getOrCreateConversation(
      req.user.id,
      otherUserId,
    );
    return this.dmService.getConversation(req.user.id, conversation.id);
  }

  @Get('conversations/:conversationId')
  @ApiOperation({ summary: 'Get conversation details' })
  async getConversation(
    @Request() req: { user: { id: string } },
    @Param('conversationId') conversationId: string,
  ) {
    return this.dmService.getConversation(req.user.id, conversationId);
  }

  @Get('conversations/:conversationId/messages')
  @ApiOperation({ summary: 'Get messages in a conversation' })
  @ApiQuery({ name: 'before', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getMessages(
    @Request() req: { user: { id: string } },
    @Param('conversationId') conversationId: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.dmService.getMessages(req.user.id, conversationId, {
      before,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('conversations/:conversationId/read')
  @ApiOperation({ summary: 'Mark messages as read' })
  async markAsRead(
    @Request() req: { user: { id: string } },
    @Param('conversationId') conversationId: string,
  ) {
    await this.dmService.markAsRead(req.user.id, conversationId);
    return { success: true };
  }

  @Get('unread')
  @ApiOperation({ summary: 'Get total unread DM count' })
  async getUnreadCount(@Request() req: { user: { id: string } }) {
    const count = await this.dmService.getUnreadCount(req.user.id);
    return { count };
  }
}
