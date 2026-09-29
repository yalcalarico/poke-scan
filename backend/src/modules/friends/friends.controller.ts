import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { FriendCollectionQueryDto } from './dto/friend-collection-query.dto.js';
import { FriendRequestDto, FriendRespondDto } from './dto/friend-request.dto.js';
import { SearchUsersDto } from './dto/search-users.dto.js';
import {
  FriendsService,
  type FriendCollectionDto,
  type FriendRequestResultDto,
  type FriendsListDto,
  type PaginatedUserSearch,
} from './friends.service.js';

@Controller()
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  @Get('users/search')
  searchUsers(
    @CurrentUser() user: AuthUser,
    @Query() dto: SearchUsersDto,
  ): Promise<PaginatedUserSearch> {
    return this.friendsService.searchUsers(user.sub, dto);
  }

  // ── Rutas estáticas ANTES que las paramétricas: si `request` fuera una ruta
  // dinámica, Express matchearía `/friends/:friendId` primero y "request"
  // dejaría de ser alcanzable.

  @Post('friends/request')
  sendRequest(
    @CurrentUser() user: AuthUser,
    @Body() dto: FriendRequestDto,
  ): Promise<FriendRequestResultDto> {
    return this.friendsService.sendRequest(user.sub, dto);
  }

  @Get('friends')
  list(@CurrentUser() user: AuthUser): Promise<FriendsListDto> {
    return this.friendsService.list(user.sub);
  }

  @Post('friends/:requesterId/respond')
  respond(
    @CurrentUser() user: AuthUser,
    @Param('requesterId') requesterId: string,
    @Body() dto: FriendRespondDto,
  ): Promise<FriendRequestResultDto> {
    return this.friendsService.respond(user.sub, requesterId, dto.accept);
  }

  @Get('friends/:friendId/collection')
  getFriendCollection(
    @CurrentUser() user: AuthUser,
    @Param('friendId') friendId: string,
    @Query() dto: FriendCollectionQueryDto,
  ): Promise<FriendCollectionDto> {
    return this.friendsService.getFriendCollection(user.sub, friendId, dto);
  }

  @HttpCode(204)
  @Delete('friends/:friendId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('friendId') friendId: string,
  ): Promise<void> {
    return this.friendsService.remove(user.sub, friendId);
  }

  @HttpCode(204)
  @Delete('friends/:friendId/block')
  block(
    @CurrentUser() user: AuthUser,
    @Param('friendId') friendId: string,
  ): Promise<void> {
    return this.friendsService.block(user.sub, friendId);
  }
}
