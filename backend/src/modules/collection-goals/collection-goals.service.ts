import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CollectionGoal, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/index.js';
import type { CollectionGoalDto } from './collection-goals.dto.js';

function serializeGoal(
  goal: CollectionGoal,
  nextGoalId: string | null,
): CollectionGoalDto {
  return {
    id: goal.id,
    collectionId: goal.collectionId,
    title: goal.title,
    isNext: goal.id === nextGoalId,
    createdAt: goal.createdAt.toISOString(),
    updatedAt: goal.updatedAt.toISOString(),
  };
}

@Injectable()
export class CollectionGoalsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // El lock de la colección serializa altas y cambios del puntero, incluso entre procesos.
  private async ownedCollection(
    tx: Prisma.TransactionClient,
    userId: string,
    collectionId: string,
  ) {
    const rows = await tx.$queryRaw<
      { id: string; nextGoalId: string | null }[]
    >`
      SELECT id, "nextGoalId" FROM collections
      WHERE id = ${collectionId} AND "userId" = ${userId} FOR UPDATE
    `;
    const collection = rows[0];
    if (!collection) throw new NotFoundException('Colección no encontrada');
    return collection;
  }

  private async ownedGoal(
    tx: Prisma.TransactionClient,
    userId: string,
    collectionId: string,
    goalId: string,
  ) {
    const goal = await tx.collectionGoal.findFirst({
      where: { id: goalId, collectionId, collection: { userId } },
    });
    if (!goal) throw new NotFoundException('Objetivo no encontrado');
    return goal;
  }

  list(userId: string, collectionId: string): Promise<CollectionGoalDto[]> {
    return this.prisma.$transaction(async (tx) => {
      const collection = await this.ownedCollection(tx, userId, collectionId);
      const goals = await tx.collectionGoal.findMany({
        where: { collectionId, collection: { userId } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      return goals.map((goal) => serializeGoal(goal, collection.nextGoalId));
    });
  }

  create(
    userId: string,
    collectionId: string,
    title: string,
  ): Promise<CollectionGoalDto> {
    return this.prisma.$transaction(async (tx) => {
      const collection = await this.ownedCollection(tx, userId, collectionId);
      const goal = await tx.collectionGoal.create({
        data: { collectionId: collection.id, title },
      });
      let nextGoalId = collection.nextGoalId;
      if (nextGoalId === null) {
        await tx.collection.update({
          where: { id: collectionId, userId },
          data: { nextGoalId: goal.id },
        });
        nextGoalId = goal.id;
      }
      return serializeGoal(goal, nextGoalId);
    });
  }

  update(
    userId: string,
    collectionId: string,
    goalId: string,
    title: string,
  ): Promise<CollectionGoalDto> {
    return this.prisma.$transaction(async (tx) => {
      const collection = await this.ownedCollection(tx, userId, collectionId);
      await this.ownedGoal(tx, userId, collectionId, goalId);
      const goal = await tx.collectionGoal.update({
        where: { id: goalId, collectionId, collection: { userId } },
        data: { title },
      });
      return serializeGoal(goal, collection.nextGoalId);
    });
  }

  setNext(
    userId: string,
    collectionId: string,
    goalId: string,
  ): Promise<CollectionGoalDto> {
    return this.prisma.$transaction(async (tx) => {
      await this.ownedCollection(tx, userId, collectionId);
      const goal = await this.ownedGoal(tx, userId, collectionId, goalId);
      await tx.collection.update({
        where: { id: collectionId, userId },
        data: { nextGoalId: goal.id },
      });
      return serializeGoal(goal, goal.id);
    });
  }
}
