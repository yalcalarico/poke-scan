import { Body, Controller, Get, Header, Inject, Patch, UseGuards, ValidationPipe } from '@nestjs/common';
import { UpdateProfileDto } from './update-profile.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import type { AuthUser, PublicUser } from '../../common/types/auth-user.js';
import { UsersService } from './users.service.js';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(@Inject(UsersService) private readonly usersService: UsersService) {}

  @Patch('me')
  @Header('Cache-Control', 'private, no-store')
  update(
    @CurrentUser() user: AuthUser,
    @Body(
      new ValidationPipe({
        expectedType: UpdateProfileDto,
        transform: true,
        whitelist: true,
      }),
    )
    dto: UpdateProfileDto,
  ): Promise<PublicUser> {
    return this.usersService.updateDisplayName(user.sub, dto.displayName);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<PublicUser> {
    return this.usersService.findById(user.sub);
  }
}
