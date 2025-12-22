import { Controller, Get, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoomsService } from '../rooms/rooms.service';

@ApiTags('Messages')
@ApiBearerAuth('JWT')
@Controller('rooms/:roomId/messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(
    private chatService: ChatService,
    private roomsService: RoomsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get message history',
    description: 'Returns paginated message history for a room. User must be a member of the room. Messages are ordered by creation time (newest first).',
  })
  @ApiParam({ name: 'roomId', description: 'Room ID (UUID)' })
  @ApiQuery({
    name: 'before',
    required: false,
    type: 'string',
    description: 'Cursor for pagination - get messages before this message ID',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: 'number',
    description: 'Maximum number of messages to return (default: 50)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of messages',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          content: { type: 'string' },
          clientMsgId: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          sender: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              username: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT' })
  @ApiResponse({ status: 403, description: 'Not a member of this room' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  async getMessages(
    @Request() req: any,
    @Param('roomId') roomId: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    // Verify membership
    await this.roomsService.requireMembership(req.user.id, roomId);

    const options = {
      before,
      limit: limit ? parseInt(limit, 10) : 50,
    };

    return this.chatService.getMessageHistory(roomId, options);
  }
}
