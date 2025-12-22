import { IsString, IsNotEmpty, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRoomDto {
  @ApiProperty({
    description: 'Room name (3-40 characters)',
    example: 'General Chat',
    minLength: 3,
    maxLength: 40,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'Room name must be at least 3 characters' })
  @MaxLength(40, { message: 'Room name must be at most 40 characters' })
  name: string;
}
