import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional } from 'class-validator';
// El enum de variantes vive en el módulo de colecciones (es el que valida
// `AddItemDto`), pero el histórico de precios es de la carta: se importa la
// constante, no se copia. `card-variant.ts` no importa nada, así que no se
// genera un ciclo entre los dos módulos.
import { CARD_VARIANTS, type CardVariant } from '../../collections/dto/card-variant.js';

/** Ventana por defecto del histórico: la misma que usa el delta de 30 días. */
export const PRICE_HISTORY_DEFAULT_DAYS = 30;
/** Por debajo de una semana la "serie" son dos o tres puntos sueltos. */
export const PRICE_HISTORY_MIN_DAYS = 7;
/** Tope duro: 365 puntos es el payload más grande que se devuelve. */
export const PRICE_HISTORY_MAX_DAYS = 365;

/**
 * Query de `GET /cards/:id/prices/history`.
 *
 * `days` **se recorta** en el service en vez de dar 400: quien pide `days=5000`
 * quiere "todo el histórico que tengas", y contestarle un error obliga al
 * cliente a adivinar el tope. Lo que sí es un 400 es un `days` que no es un
 * número entero.
 */
export class PriceHistoryQueryDto {
  /**
   * Variante a la que se acota la serie. Sin él, la serie es **una fila por día**
   * con la mejor cotización disponible de la carta ese día (el mismo criterio
   * "mejor precio disponible" que usa `sort=price` del catálogo): hay cartas que
   * solo tienen `reverseHolofoil` o `firstEdition`, y fijar una variante los
   * dejaría sin serie.
   */
  @IsOptional()
  @IsIn(CARD_VARIANTS)
  variant?: CardVariant;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  days?: number = PRICE_HISTORY_DEFAULT_DAYS;
}
