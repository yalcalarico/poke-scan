import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

export const CURATED_PRICE_SYNC_SETS = [
  { setId: 'me55', priority: 1 },
  { setId: 'me55c', priority: 1 },
  { setId: 'me2pt5', priority: 2 },
  { setId: 'sv8pt5', priority: 3 },
  { setId: 'sv3pt5', priority: 4 },
  { setId: 'me2', priority: 5 },
  { setId: 'me5', priority: 6 },
  { setId: 'me4', priority: 7 },
  { setId: 'me3', priority: 8 },
  { setId: 'sv10', priority: 9 },
  { setId: 'me1', priority: 10 },
] as const;

@Injectable()
export class PriceSyncRegistryService {
  private readonly logger = new Logger(PriceSyncRegistryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Incorpora únicamente los IDs curados que ya están en el catálogo local.
   * createMany + skipDuplicates deja intactas prioridades y deshabilitaciones.
   */
  async ensureCuratedSeed(): Promise<{
    inserted: number;
    missingSetIds: string[];
  }> {
    const configuredIds = CURATED_PRICE_SYNC_SETS.map(({ setId }) => setId);
    const existingSets = await this.prisma.cardSet.findMany({
      where: { id: { in: configuredIds } },
      select: { id: true },
    });
    const existingIds = new Set(existingSets.map(({ id }) => id));
    const missingSetIds = configuredIds.filter(
      (setId) => !existingIds.has(setId),
    );

    for (const setId of missingSetIds) {
      this.logger.warn(
        `El set curado ${setId} todavía no existe en el catálogo local`,
      );
    }

    const rows = CURATED_PRICE_SYNC_SETS.filter(({ setId }) =>
      existingIds.has(setId),
    ).map(({ setId, priority }) => ({
      setId,
      priority,
      origin: 'curated' as const,
    }));
    const result =
      rows.length === 0
        ? { count: 0 }
        : await this.prisma.priceSyncSet.createMany({
            data: rows,
            skipDuplicates: true,
          });

    return { inserted: result.count, missingSetIds };
  }

  async list(): Promise<
    Awaited<ReturnType<PrismaService['priceSyncSet']['findMany']>>
  > {
    return this.prisma.priceSyncSet.findMany({
      orderBy: [{ priority: 'asc' }, { setId: 'asc' }],
    });
  }

  /**
   * Repara señales perdidas e incorpora colecciones existentes en una sola
   * operación local; el conflicto conserva cualquier decisión operativa previa.
   */
  async reconcileCollectionSets(): Promise<number> {
    return this.prisma.$executeRaw`
      INSERT INTO price_sync_sets (
        "setId", enabled, priority, origin, "activatedAt", "lastDemandAt", "createdAt", "updatedAt"
      )
      SELECT DISTINCT c."setId", true, 100, 'collection'::"PriceSyncSetOrigin",
        now(), now(), now(), now()
      FROM collection_items ci
      JOIN cards c ON c.id = ci."cardId"
      ON CONFLICT ("setId") DO NOTHING
    `;
  }

  /** Agrega identidades validadas sin alterar bajas manuales ni prioridades existentes. */
  async reconcileValidatedSets(): Promise<number> {
    return this.prisma.$executeRaw`
      INSERT INTO price_sync_sets ("setId", enabled, priority, origin, "activatedAt", "createdAt", "updatedAt")
      SELECT x."setId", true, 200, 'validated'::"PriceSyncSetOrigin", NOW(), NOW(), NOW()
      FROM tcgcsv_set_mappings x JOIN cards c ON c."setId" = x."setId"
      WHERE x."externalId" ~ '^[1-9][0-9]{0,8}$'
        AND NOT EXISTS (SELECT 1 FROM tcgcsv_set_mappings other WHERE other."setId" = x."setId" AND other."externalId" <> x."externalId")
        AND NOT EXISTS (SELECT 1 FROM tcgcsv_set_mappings other WHERE other."externalId" = x."externalId" AND other."setId" <> x."setId"
          AND NOT ((x."externalId" = '1543' AND x."setId" IN ('tk1a','tk1b') AND other."setId" IN ('tk1a','tk1b'))
            OR (x."externalId" = '1542' AND x."setId" IN ('tk2a','tk2b') AND other."setId" IN ('tk2a','tk2b'))))
        AND NOT EXISTS (SELECT 1 FROM tcgcsv_set_mappings sibling JOIN tcgcsv_set_mappings other ON other."setId" = sibling."setId"
          WHERE sibling."externalId" = x."externalId" AND other."externalId" <> x."externalId")
      GROUP BY x."setId" ON CONFLICT ("setId") DO NOTHING
    `;
  }

  /** Una nueva alta en colección registra demanda sin reactivar un set deshabilitado. */
  async enableForCollection(setId: string): Promise<void> {
    await this.assertSetExists(setId);
    const result = await this.prisma.priceSyncSet.upsert({
      where: { setId },
      create: {
        setId,
        origin: 'collection',
        priority: 100,
        lastDemandAt: new Date(),
      },
      update: { lastDemandAt: new Date() },
    });
    if (result.enabled) await this.requestCycle();
  }

  /** Una acción manual explícita puede volver a habilitar el set. */
  async enableManually(setId: string, priority?: number): Promise<void> {
    const initialPriority = priority ?? 100;
    if (
      !Number.isSafeInteger(initialPriority) ||
      initialPriority <= 0 ||
      initialPriority > 2_147_483_647
    ) {
      throw new BadRequestException('La prioridad debe ser un entero positivo');
    }
    await this.assertSetExists(setId);

    await this.prisma.priceSyncSet.upsert({
      where: { setId },
      create: {
        setId,
        origin: 'manual',
        priority: initialPriority,
        lastDemandAt: new Date(),
      },
      update: {
        enabled: true,
        lastDemandAt: new Date(),
        ...(priority === undefined ? {} : { priority }),
      },
    });
    await this.requestCycle();
  }

  /** La deshabilitación queda persistida aunque el set aparezca en una colección. */
  async disable(setId: string): Promise<void> {
    await this.assertSetExists(setId);
    await this.prisma.priceSyncSet.upsert({
      where: { setId },
      create: { setId, origin: 'manual', enabled: false, priority: 100 },
      update: { enabled: false },
    });
  }

  private async requestCycle(): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO price_sync_controls (provider, "requestedGeneration", "handledGeneration", "nextCycleAt")
      VALUES ('tcgcsv', 1, 0, NOW())
      ON CONFLICT (provider) DO UPDATE SET "requestedGeneration" = CASE
        WHEN price_sync_controls."requestedGeneration" = price_sync_controls."handledGeneration" THEN price_sync_controls."requestedGeneration" + 1 ELSE price_sync_controls."requestedGeneration" END
    `;
  }

  private async assertSetExists(setId: string): Promise<void> {
    const set = await this.prisma.cardSet.findUnique({
      where: { id: setId },
      select: { id: true },
    });
    if (!set)
      throw new NotFoundException(
        `No existe el set ${setId} en el catálogo local`,
      );
  }
}
