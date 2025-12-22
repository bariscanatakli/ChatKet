import { Controller, Get, Post, Body, Param, UseGuards, Request, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { RoomsService } from './rooms.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateRoomDto } from './dto/create-room.dto';

@ApiTags('Rooms')
@ApiBearerAuth('JWT')
@Controller('rooms')
@UseGuards(JwtAuthGuard)
export class RoomsController {
  constructor(private roomsService: RoomsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new chat room',
    description: 'Creates a new room and automatically adds the creator as a member.',
  })
  @ApiResponse({
    status: 201,
    description: 'Room created successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string', example: 'General Chat' },
        createdAt: { type: 'string', format: 'date-time' },
        createdBy: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            username: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT' })
  @ApiResponse({ status: 409, description: 'Room name already exists' })
  async createRoom(@Request() req: any, @Body() dto: CreateRoomDto) {
    return this.roomsService.createRoom(req.user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List rooms',
    description: 'Returns user\'s joined rooms by default, or all rooms if `all=true` query param is set.',
  })
  @ApiQuery({
    name: 'all',
    required: false,
    type: 'string',
    description: 'Set to "true" to get all available rooms',
  })
  @ApiResponse({
    status: 200,
    description: 'List of rooms',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          _count: {
            type: 'object',
            properties: {
              members: { type: 'number' },
            },
          },
        },
      },
    },
  })
  async getRooms(@Request() req: any, @Query('all') all?: string) {
    if (all === 'true') {
      return this.roomsService.getAllRooms();
    }
    return this.roomsService.getUserRooms(req.user.id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get room details',
    description: 'Returns room information. User must be a member of the room.',
  })
  @ApiParam({ name: 'id', description: 'Room ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Room details' })
  @ApiResponse({ status: 403, description: 'Not a member of this room' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  async getRoom(@Request() req: any, @Param('id') roomId: string) {
    await this.roomsService.requireMembership(req.user.id, roomId);
    return this.roomsService.getRoom(roomId);
  }

  @Post(':id/join')
  @ApiOperation({
    summary: 'Join a room',
    description: 'Adds the current user as a member of the specified room.',
  })
  @ApiParam({ name: 'id', description: 'Room ID (UUID)' })
  @ApiResponse({
    status: 201,
    description: 'Joined room successfully',
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', format: 'uuid' },
        roomId: { type: 'string', format: 'uuid' },
        joinedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Room not found' })
  @ApiResponse({ status: 409, description: 'Already a member' })
  async joinRoom(@Request() req: any, @Param('id') roomId: string) {
    return this.roomsService.joinRoom(req.user.id, roomId);
  }

  @Get(':id/members')
  @ApiOperation({
    summary: 'Get room members',
    description: 'Returns list of all members in the room. User must be a member.',
  })
  @ApiParam({ name: 'id', description: 'Room ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'List of room members',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          userId: { type: 'string', format: 'uuid' },
          joinedAt: { type: 'string', format: 'date-time' },
          user: {
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
  @ApiResponse({ status: 403, description: 'Not a member of this room' })
  async getRoomMembers(@Request() req: any, @Param('id') roomId: string) {
    await this.roomsService.requireMembership(req.user.id, roomId);
    return this.roomsService.getRoomMembers(roomId);
  }
}
