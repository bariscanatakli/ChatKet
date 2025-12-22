import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RequestCodeDto } from './dto/request-code.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('request-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a one-time login code',
    description: 'Generates a 6-digit code for the given username. Code expires in 5 minutes. In dev mode, code is returned in response.',
  })
  @ApiBody({ type: RequestCodeDto })
  @ApiResponse({
    status: 200,
    description: 'Code generated successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Code sent successfully' },
        code: { type: 'string', example: '123456', description: 'Only in dev mode' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid username format' })
  async requestCode(@Body() dto: RequestCodeDto) {
    return this.authService.requestCode(dto);
  }

  @Post('verify-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify login code and get JWT token',
    description: 'Validates the one-time code and returns a JWT token valid for 7 days.',
  })
  @ApiBody({ type: VerifyCodeDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIs...' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            username: { type: 'string', example: 'john_doe' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired code' })
  async verifyCode(@Body() dto: VerifyCodeDto) {
    return this.authService.verifyCode(dto);
  }
}
