import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { GoalTitleDto } from './collection-goals.dto.js';
import { CollectionGoalsService } from './collection-goals.service.js';

// expectedType conserva validación también en runners sin metadata de tipos.
const titlePipe = new ValidationPipe({
  expectedType: GoalTitleDto,
  transform: true,
  whitelist: true,
});

@Controller('collections/:collectionId/goals')
@UseGuards(JwtAuthGuard)
export class CollectionGoalsController {
  constructor(
    @Inject(CollectionGoalsService)
    private readonly goals: CollectionGoalsService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('collectionId') collectionId: string,
  ) {
    return this.goals.list(user.sub, collectionId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('collectionId') collectionId: string,
    @Body(titlePipe) dto: GoalTitleDto,
  ) {
    return this.goals.create(user.sub, collectionId, dto.title);
  }

  @Patch(':goalId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('collectionId') collectionId: string,
    @Param('goalId') goalId: string,
    @Body(titlePipe) dto: GoalTitleDto,
  ) {
    return this.goals.update(user.sub, collectionId, goalId, dto.title);
  }

  @Patch(':goalId/next')
  setNext(
    @CurrentUser() user: AuthUser,
    @Param('collectionId') collectionId: string,
    @Param('goalId') goalId: string,
  ) {
    return this.goals.setNext(user.sub, collectionId, goalId);
  }
}
