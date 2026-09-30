import { Inject, Injectable } from '@nestjs/common';

import { CARD_DATA_PROVIDER, type CardDataProvider } from '../modules/providers/card-provider.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface SyncState {
  lastPage: number;
  totalPages: number | null;
  isComplete: boolean;
}

/**
 * El cursor de los syncs de catálogo.
 *
 * Antes eran dos claves Redis sin TTL —`sync:cards:lastPage` y
 * `sync:cards:complete`— y eso tenía dos consecuencias:
 *
 * 1. **Un `flushall` reiniciaba el sync desde la página 1.** No desde cero en
 *    términos de datos (el `upsert` es idempotente), pero sí en términos de
 *    requests: volver a traer las 83 páginas de un catálogo que ya estaba
 *    completo son 83 requests de una cuota de 1.000 por día, gastados para
 *    comprobar algo que la base ya sabía.
 * 2. **La granularidad era global.** La clave no decía de qué job ni de qué
 *    provider era, así que el día que entre un segundo proveedor de catálogo
 *    ambos syncs comparten el mismo número de página.
 *
 * La tabla `sync_state` corrige las dos: el id es `<jobType>:<providerId>` y la
 * fila es un checkpoint, no un registro de auditoría.
 *
 * ## Por qué la fila se escribe DESPUÉS del commit
 *
 * Es la invariante que hace segura la reanudación: si el proceso muere entre
 * guardar la página y anotar el cursor, la página se reprocesa en el próximo
 * intento y el `upsert` la deja igual. Al revés —anotar el cursor antes de
 * guardar— perdería esa página para siempre, y el sync se daría por completo
 * con un hueco en el medio.
 */
@Injectable()
export class SyncStateService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CARD_DATA_PROVIDER) private readonly provider: CardDataProvider,
  ) {}

  /** El id del cursor de **cartas** del provider activo. */
  private get cardsId(): string {
    return `cards:${this.provider.id}`;
  }

  /** El estado del sync de cartas. Una base nueva arranca en la página 0. */
  async readCards(): Promise<SyncState> {
    const row = await this.prisma.syncState.findUnique({
      where: { id: this.cardsId },
      select: { lastPage: true, totalPages: true, isComplete: true },
    });
    return row ?? { lastPage: 0, totalPages: null, isComplete: false };
  }

  /**
   * Anota el cursor.
   *
   * `totalPages` se escribe en el mismo `UPDATE` que `lastPage` y no se pisa con
   * `undefined`: Prisma manda solo los campos presentes, así que un
   * `save({ lastPage })` dejaría el `totalPages` anterior — que además puede ser
   * de un `pageSize` distinto al de esta corrida— mezclado con el `lastPage` de
   * esta. Se lee primero y se reescribe explícito.
   */
  async saveCards(lastPage: number, totalPages?: number): Promise<void> {
    await this.prisma.syncState.upsert({
      where: { id: this.cardsId },
      create: {
        id: this.cardsId,
        lastPage,
        totalPages: totalPages ?? null,
        isComplete: false,
      },
      update: {
        lastPage,
        ...(totalPages === undefined ? {} : { totalPages }),
      },
    });
  }

  /** Marca el sync de cartas como terminado, con la fecha de `completedAt`. */
  async completeCards(totalPages?: number): Promise<void> {
    await this.prisma.syncState.upsert({
      where: { id: this.cardsId },
      create: {
        id: this.cardsId,
        lastPage: totalPages ?? 0,
        totalPages: totalPages ?? null,
        isComplete: true,
      },
      update: {
        isComplete: true,
        ...(totalPages === undefined ? {} : { totalPages }),
      },
    });
  }

  /**
   * Devuelve el cursor a cero.
   *
   * Lo usa `force: true`, que es la forma de rehacer el catálogo entero. Borra
   * la fila en vez de escribir `lastPage: 0`: una fila en cero es indistinguible
   * de una que nunca existió, y para `force` la diferencia no importa, pero
   * dejar la fila ausente hace que el próximo sync sin `force` la cree desde
   * cero con los valores por defecto.
   */
  async resetCards(): Promise<void> {
    await this.prisma.syncState
      .delete({ where: { id: this.cardsId } })
      .catch((error: unknown) => {
        // La fila puede no existir: `reset` sobre un sync que nunca corrió es un
        // no-op, no un error.
        if ((error as { code?: string }).code !== 'P2025') throw error;
      });
  }
}
