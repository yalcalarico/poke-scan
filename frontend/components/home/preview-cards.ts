import { getApiBaseUrl } from '@/lib/api/api-client';
import { toCardList } from '@/lib/api/schema';
import type { CardDto } from '@/types/api';

/**
 * Cuántas cartas muestra el mock de la home. Tres es lo que entra en la
 * composición sin que la grilla se vuelva un mosaico, y son las mismas que
 * muestra `/buscar`.
 */
export const PREVIEW_LIMIT = 3;

/**
 * 1 h. El catálogo está espejado en Postgres y se resincroniza a mano
 * (docs/data-sources.md), así que una hora es un tope conservador: si mañana el
 * sync pasa a ser diario, este número ya es el correcto.
 *
 * **No es un request contra pokemontcg.io**: `/cards/search` lee la tabla local
 * (`AGENTS.md` §3.1). Por eso puede ir en el server sin tocar el rate limit —
 * lo que no podría ir en el server es un precio, que sí sale a la fuente.
 */
const REVALIDATE_SECONDS = 3600;

/**
 * Sin imagen el `CardTile` pinta un `next/image` con `src=""`, que el optimizador
 * rechaza en runtime y no en build: una carta sin foto no sirve para un mock que
 * existe justamente para mostrar fotos.
 *
 * El filtro vive acá y no en `toCardDto` (`lib/api/schema.ts`) porque es una
 * regla **de este mock**, no del contrato: una carta sin imagen es una carta
 * válida en el catálogo y en la ficha, y hay que poder buscarla y verla.
 */
function hasImage(card: CardDto): boolean {
  return Boolean(card.imageSmall || card.imageLarge);
}

/**
 * Las cartas del mock, o `[]`.
 *
 * El guard de cada carta es el central (`lib/api/schema.ts`); lo único que suma
 * este archivo es el filtro de imagen, que es una regla del mock y no del
 * contrato.
 *
 * **Nunca tira.** El mock es decorativo: si el backend está caído, la home tiene
 * que seguir mostrando el hero, los CTA y las features, que es todo lo que el
 * usuario vino a hacer. Un `throw` acá mandaría la pantalla entera al
 * `error.tsx` por tres imágenes, y eso es peor que un error de precios: el
 * contenido accesorio no puede tumbar la página (es el mismo criterio que el
 * scroller de "otras de este set" en `app/carta/[id]`).
 *
 * `[]` es un estado vacío legítimo del componente, no un error: `AppPreview`
 * devuelve `null` y la home se renderiza sin la composición.
 */
export async function fetchPreviewCards(): Promise<CardDto[]> {
  const params = new URLSearchParams({ pageSize: String(PREVIEW_LIMIT), sort: 'name' });

  try {
    const response = await fetch(`${getApiBaseUrl()}/cards/search?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!response.ok) return [];

    const raw: unknown = await response.json().catch(() => null);

    return toCardList(raw)
      .filter(hasImage)
      .slice(0, PREVIEW_LIMIT);
  } catch {
    return [];
  }
}
