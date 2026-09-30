import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PRICE_PROVIDER,
  PROVIDER_IDS,
  type PriceProvider,
  type RemotePriceSet,
} from '../modules/providers/card-provider.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';

const SETS_CACHE_TTL_SECONDS = 24 * 60 * 60;
const MISS_TTL_SECONDS = 24 * 60 * 60;
const VALIDATION_SAMPLE = 25;
/** Con menos de la mitad de los números presentes, el matcheo es sospechoso. */
const MIN_VALIDATION_RATIO = 0.5;

/**
 * Sets de pokemontcg.io cuyo ID y nombre no matchean nada en tcgdex. El resto
 * de los ~176 sets matchea por nombre normalizado o por igualdad de ID
 * (tcgdex desciende de la misma numeración: base1, hgss2-4, svp, sve).
 *
 * Hay sets que NO se pueden mapear y la validación los rechaza a propósito:
 * `cel25c` y `me55c` (las "Classic Collection") usan la numeración original
 * de cada carta clásica ("15", "107") contra los "CC001".."CC025" de tcgdex,
 * y hasta tienen números repetidos entre cartas distintas. Quedan sin
 * precios en vivo, con lo último conocido.
 */
const SET_ID_OVERRIDES: Record<string, string> = {
  // "Pokémon Futsal Collection" → tcgdex lo tiene como "Pokémon Futsal 2020".
  fut20: 'fut2020',
};

export interface TcgdexSetMapping {
  tcgdexSetId: string;
}

export interface MapAllResult {
  mapped: { setId: string; name: string; tcgdexSetId: string }[];
  unmapped: { setId: string; name: string }[];
}

/** Pausa entre sets en mapAll: 176 validaciones seguidas sin freno no es
 * "considerate" con una infra comunitaria, aunque no publique límite. */
const MAP_ALL_PAUSE_MS = 250;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function normalizeName(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
}

/**
 * Clave comparable de un número de carta: tcgdex paddea algunos sets ("018")
 * y pokemontcg.io nunca ("18"), así que se compara sin ceros a la izquierda.
 */
function numberKey(value: string): string {
  return /^\d+$/.test(value) ? String(Number(value)) : value.toLowerCase();
}

/**
 * Token propio (no la clase) para poder inyectar un stub en los tests sin
 * levantar el módulo entero.
 */
export const TCGDEX_SET_MAPPING = Symbol('TCGDEX_SET_MAPPING');

/**
 * Resuelve el `tcgdexSetId` de nuestros `card_sets` y lo persiste.
 *
 * El catálogo sigue viniendo de pokemontcg.io, pero los precios se piden a
 * tcgdex por (set, localId): sin esta traducción de IDs no hay precios. Se
 * resuelve una sola vez por set y queda guardado en la fila.
 */
@Injectable()
export class TcgdexSetMappingService {
  private readonly logger = new Logger(TcgdexSetMappingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(PRICE_PROVIDER) private readonly provider: PriceProvider,
  ) {
    if (provider.id !== PROVIDER_IDS.TCGDEX) {
      throw new Error(
        `TcgdexSetMappingService no puede usarse con ${provider.id}; implementar el mapper nuevo antes de cambiar PRICE_PROVIDER`,
      );
    }
  }

  /**
   * Mapea todos los sets que falten y devuelve el reporte. Pensado para
   * `scripts/map-tcgdex-sets.ts` y para diagnóstico: en el flujo normal el
   * mapeo se resuelve solo, la primera vez que se pide un precio.
   */
  async mapAll(options: { retryMisses?: boolean } = {}): Promise<MapAllResult> {
    const sets = await this.prisma.cardSet.findMany({
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
    const result: MapAllResult = { mapped: [], unmapped: [] };
    for (const set of sets) {
      if (options.retryMisses) {
        await this.redis.del(this.missKey(set.id));
      }
      const mapping = await this.resolve(set.id);
      if (mapping === null) {
        result.unmapped.push({ setId: set.id, name: set.name });
      } else {
        result.mapped.push({ setId: set.id, name: set.name, tcgdexSetId: mapping.tcgdexSetId });
      }
      await delay(MAP_ALL_PAUSE_MS);
    }
    return result;
  }

  /**
   * Set de tcgdex para el nuestro, con caché del miss para no reintentar el
   * matcheo en cada refresh. El orden del matcheo: override manual → nombre
   * normalizado → igualdad de ID (tcgdex desciende de la misma numeración).
   * Antes de persistir se valida que los números de cartas nuestros existan
   * en el set candidato: es lo que atrapa un falso matcheo de nombre.
   */
  async resolve(setId: string): Promise<TcgdexSetMapping | null> {
    const ours = await this.prisma.cardSet.findUnique({
      where: { id: setId },
      select: {
        id: true,
        name: true,
        tcgdexSetId: true,
        externalIds: {
          where: { provider: this.provider.id },
          select: { externalId: true },
        },
      },
    });
    if (ours === null) return null;
    const externalId = ours.externalIds[0]?.externalId;
    if (externalId !== undefined) {
      if (ours.tcgdexSetId !== null && ours.tcgdexSetId !== externalId) {
        this.logger.error(
          `El mapping tcgdex de ${ours.id} difiere entre card_sets y card_set_external_ids`,
        );
        return null;
      }
      return { tcgdexSetId: externalId };
    }
    if (ours.tcgdexSetId !== null) {
      try {
        await this.persistMapping(ours.id, ours.tcgdexSetId);
      } catch (error) {
        this.logger.error(
          `No se pudo confirmar el mapping tcgdex de ${ours.id}: ${(error as Error).message}`,
        );
        return null;
      }
      return { tcgdexSetId: ours.tcgdexSetId };
    }

    if ((await this.redis.get(this.missKey(setId))) !== null) return null;

    let candidate: string | null = SET_ID_OVERRIDES[setId] ?? null;
    if (candidate === null) {
      try {
        candidate = await this.findCandidate(ours.id, ours.name);
      } catch (error) {
        // Error de red: indeterminado, no miss. La próxima corrida reintenta.
        this.logger.warn(
          `No se pudo buscar el set de tcgdex para ${ours.name} (${ours.id}): ${(error as Error).message}`,
        );
        return null;
      }
    }

    if (candidate === null || candidate.length === 0) {
      this.logger.warn(
        `No se encontró set de tcgdex para ${ours.name} (${ours.id}): queda sin precios en vivo`,
      );
      await this.redis.set(this.missKey(ours.id), '1', MISS_TTL_SECONDS);
      return null;
    }

    let valid: boolean;
    try {
      valid = await this.validate(ours.id, candidate);
    } catch (error) {
      this.logger.warn(
        `No se pudo validar el candidato tcgdex ${candidate} para ${ours.name} (${ours.id}): ${(error as Error).message}`,
      );
      return null;
    }

    if (!valid) {
      this.logger.warn(
        `El candidato tcgdex ${candidate} no valida contra las cartas de ${ours.name} (${ours.id}): se descarta`,
      );
      await this.redis.set(this.missKey(ours.id), '1', MISS_TTL_SECONDS);
      return null;
    }

    try {
      await this.persistMapping(ours.id, candidate);
    } catch (error) {
      this.logger.error(
        `No se pudo persistir el mapping tcgdex ${candidate} para ${ours.id}: ${(error as Error).message}`,
      );
      return null;
    }
    this.logger.log(`Set ${ours.name} (${ours.id}) → tcgdex ${candidate}`);
    return { tcgdexSetId: candidate };
  }

  private async persistMapping(setId: string, externalId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const where = {
        provider_externalId: { provider: this.provider.id, externalId },
      };
      const existing = await tx.cardSetExternalId.findUnique({
        where,
        select: { setId: true },
      });
      if (existing && existing.setId !== setId) {
        throw new Error(`El ID externo ${externalId} ya está asociado al set ${existing.setId}`);
      }
      if (!existing) {
        await tx.cardSetExternalId.create({
          data: { provider: this.provider.id, externalId, setId },
        });
      }
      await tx.cardSet.update({ where: { id: setId }, data: { tcgdexSetId: externalId } });
    });
  }

  private missKey(setId: string): string {
    return `${this.provider.id}:map:miss:${setId}`;
  }

  private async findCandidate(setId: string, name: string): Promise<string | null> {
    const sets = await this.listSets();
    const wanted = normalizeName(name);
    for (const set of sets) {
      if (normalizeName(set.name) === wanted) return set.id;
    }
    for (const set of sets) {
      if (set.id === setId) return set.id;
    }
    return null;
  }

  private async listSets(): Promise<RemotePriceSet[]> {
    const cacheKey = `${this.provider.id}:sets`;
    const cached = await this.redis.getJson<RemotePriceSet[]>(cacheKey);
    if (Array.isArray(cached) && cached.length > 0) return cached;
    const sets = await this.provider.listSets();
    if (sets.length > 0) {
      await this.redis.setJson(cacheKey, sets, SETS_CACHE_TTL_SECONDS);
    }
    return sets;
  }

  private async validate(setId: string, candidateId: string): Promise<boolean> {
    const detail = await this.provider.getSetDetail(candidateId);
    if (detail === null || detail.localIds.length === 0) return false;

    const ours = await this.prisma.card.findMany({
      where: { setId },
      select: { number: true },
      take: VALIDATION_SAMPLE,
    });
    // Set recién sincronizado sin cartas espejadas todavía: nada para validar.
    if (ours.length === 0) return true;

    const theirs = new Set(detail.localIds.map(numberKey));
    const hits = ours.filter((card) => theirs.has(numberKey(card.number))).length;
    return hits / ours.length >= MIN_VALIDATION_RATIO;
  }
}
