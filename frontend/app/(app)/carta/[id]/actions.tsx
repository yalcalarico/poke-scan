'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, FolderPlus, Share2 } from 'lucide-react';
import Link from 'next/link';

import { AddToCollectionSheet, ItemSheet } from '@/components/collections/item-sheet';
import { Chip, Skeleton, StatRow, useToast } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api/api-client';
import { getCardLocation, listItems, updateItem } from '@/lib/api/collections';
import { toCardLocation } from '@/lib/api/schema';
import { pluralize } from '@/lib/format';
import { conditionShort, variantLabel } from '@/lib/variants';
import type { CardLocationDto, CollectionItemDto } from '@/types/api';

export interface CardActionsProps {
  cardId: string;
  cardName: string;
}

/**
 * Cuántos items mira al resolver el ítem completo.
 *
 * Es la misma búsqueda por nombre que usaba la versión anterior de este archivo
 * (`search` es un `contains` sobre el nombre, así que "Gengar" también trae
 * "Gengar ex"), y por eso el resultado se filtra por `card.id` exacto. Ahora
 * corre **contra una sola colección**, la que devolvió `/cards/:id/location`, en
 * vez de una por cada colección del usuario.
 */
const ITEMS_PER_PAGE = 12;

/**
 * Las acciones de la ficha: la fila "Administrar" y la fila de chips.
 *
 * ## Por qué estas tres y no Favorites / My collection / Wishlist
 *
 * La referencia de diseño muestra esos tres chips, pero **no existen en el
 * producto**: no hay favoritos, ni una "mi colección" separada de las colecciones
 * del usuario, ni lista de deseos en el contrato. Un chip que lleva a una feature
 * inexistente es peor que no tenerlo, así que van las tres acciones que sí se
 * pueden cumplir hoy:
 *
 * - **Añadir a colección** → el `Sheet` de alta (con el 409 tratado como éxito).
 * - **Para intercambio** → marca o desmarca el item en la colección del usuario.
 *   Solo si hay sesión: sin sesión no hay item que marcar.
 * - **Compartir** → `navigator.share` si el navegador lo tiene, portapapeles si
 *   no, y en los dos casos un toast que dice qué pasó (§8.10).
 *
 * Sin sesión los dos primeros chips no se renderizan: un chip deshabilitado sin
 * explicación es un mueble. En su lugar hay una línea que dice qué hacer.
 *
 * ## Cómo se sabe si la carta está en la colección
 *
 * Con `GET /cards/:id/location`, **una** request autenticada. Antes eran `1 + N`:
 * un `GET /collections` y un `GET /collections/:id/items?search=` por cada
 * colección del usuario, en paralelo. Con ocho colecciones eran nueve requests
 * concurrentes en el montaje de `/carta/[id]`, que es la segunda pantalla más
 * visitada, y nueve de esos trabajo existían solo para decidir si se dibujaba
 * una fila.
 *
 * El endpoint no toca pokemontcg.io: es un `$queryRaw` sobre `collection_items`
 * con el `userId` del token, así que el rate limit de `AGENTS.md` §3.1 no tiene
 * nada que ver acá. Lo que sí mejoró es el waterfall en el LCP percibido de la
 * columna derecha.
 *
 * Devuelve `null` (no un 404) cuando la carta existe y el usuario no la tiene:
 * "no la tenés" no es un error. El 404 queda para "la carta no existe".
 *
 * ## Por qué el ítem completo se pide aparte y más tarde
 *
 * `location` trae lo que la `StatRow` necesita —variante, condición, cantidad— y
 * el `itemId` del `PATCH`, pero **no** trae `isForTrade` ni las notas, que son
 * lo que el `ItemSheet` y el toggle de intercambio necesitan. Y no hay endpoint
 * `GET /items/:id`: la única forma de traer el `CollectionItemDto` completo es
 * `listItems` sobre su colección.
 *
 * Así que esa segunda request está **diferida al primer toque** —abrir la hoja o
 * cambiar la marca— en vez de estar en el montaje. El resultado: el montaje hace
 * **una** request en vez de `1 + N`, y la que falta solo se pide si el usuario
 * hace algo que la necesita. Prefetcharla en el montaje devolvería el waterfall a
 * la pantalla sin ganar nada visible.
 */
export function CardActions({ cardId, cardName }: CardActionsProps) {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const toast = useToast();

  const [location, setLocation] = useState<CardLocationDto | null>(null);
  const [item, setItem] = useState<CollectionItemDto | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [isResolvingItem, setIsResolvingItem] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [openSheet, setOpenSheet] = useState<'none' | 'add' | 'manage'>('none');
  const [addWithTrade, setAddWithTrade] = useState(false);
  const [isTogglingTrade, setIsTogglingTrade] = useState(false);

  /*
   * Sin sesión no hay location: se **deriva** en el render en vez de limpiarlo
   * con un efecto. Un `setState` en el cuerpo de un efecto es un render en
   * cascada, y acá no hay nada que sincronizar con el exterior (gotchas #2).
   */
  const ownedLocation = isAuthenticated ? location : null;

  useEffect(() => {
    if (!isAuthenticated) return;

    let disposed = false;

    /*
     * El arranque va en una microtask: un setter sincrónico en el cuerpo del
     * efecto dispara un render en cascada, y con el doble montaje de StrictMode
     * serían dos requests (gotchas #9). Esta request no gasta rate limit, así
     * que el costo del doble disparo es de red y no de presupuesto.
     */
    queueMicrotask(() => {
      if (disposed) return;
      setIsResolving(true);
      getCardLocation(cardId)
        .then((found) => {
          if (disposed) return;
          setLocation(toCardLocation(found));
          setIsResolving(false);
        })
        .catch(() => {
          if (disposed) return;
          /*
           * La ficha se puede ver igual sin esta fila, así que no es un estado
           * de error de la pantalla. Se avisa igual, porque un "Administrar" que
           * no aparece parece que la carta no está en ninguna colección.
           *
           * El 404 también cae acá y **no** debería: `/carta/[id]` ya verifique
           * que la carta existe antes de montar este componente, así que un 404
           * acá es una inconsistencia entre las dos requests, no un caso normal.
           */
          toast.warning('No pudimos ver tus colecciones.');
          setIsResolving(false);
        });
    });

    return () => {
      disposed = true;
    };
  }, [cardId, isAuthenticated, reloadToken, toast]);

  /**
   * El ítem completo, contra la **única** colección donde puede estar.
   *
   * Se cachea en el estado para que el segundo toque no vuelva a pedirlo, y
   * `cardName` está en las dependencias porque el `search` del backend lo usa:
   * sin eso, un cambio de nombre dejaría el ítem viejo cacheado.
   */
  const resolveItem = useCallback(async (): Promise<CollectionItemDto | null> => {
    if (!ownedLocation) return null;
    if (item) return item;

    setIsResolvingItem(true);
    try {
      const page = await listItems(ownedLocation.collectionId, {
        search: cardName,
        pageSize: ITEMS_PER_PAGE,
      });
      /*
       * `search` es un `contains` sobre el nombre, así que "Gengar" trae
       * "Gengar ex" también. El `card.id` exacto es el que decide; si la página
       * no lo tiene, el ítem no está en la primera página de resultados y
       * `location` estaba equivocado, así que se trata como "no hay ítem".
       */
      const found = page.data.find((candidate) => candidate.card.id === cardId) ?? null;
      setItem(found);
      return found;
    } catch {
      toast.warning('No pudimos abrir esa carta de tu colección.');
      return null;
    } finally {
      setIsResolvingItem(false);
    }
  }, [cardId, cardName, item, ownedLocation, toast]);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/carta/${encodeURIComponent(cardId)}`;

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: cardName, text: `${cardName} en PokéScan`, url });
        return;
      } catch (error: unknown) {
        // El usuario cerró la hoja de compartir: no es un error y no hay nada que
        // recuperar copiando al portapapeles.
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado');
    } catch {
      toast.error('No pudimos compartir. Copiá el link de la barra de direcciones.');
    }
  }, [cardId, cardName, toast]);

  const handleToggleTrade = useCallback(async () => {
    // Sin item todavía no hay nada que marcar: se abre el alta, que ya trae el
    // switch de "para intercambio" prendido, que es lo que el chip pidió.
    const current = item ?? (await resolveItem());
    if (!current) {
      /*
       * Hay location pero el ítem no se pudo resolver. Es el caso raro de las
       * dos requests en desacuerdo, y no tiene un camino de recuperación desde
       * acá: reintentar la resolución es lo mismo que va a pasar si el usuario
       * insiste. El aviso honesto es que no pudimos ver la carta, no "no está".
       */
      toast.warning('No pudimos ver esa carta en tu colección.');
      return;
    }
    setIsTogglingTrade(true);
    try {
      const next = !current.isForTrade;
      const updated = await updateItem(current.id, { isForTrade: next });
      setItem(updated);
      toast.success(next ? 'Marcada para intercambio' : 'Ya no está para intercambio');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No pudimos actualizar la carta.');
    } finally {
      setIsTogglingTrade(false);
    }
  }, [item, resolveItem, toast]);

  const handleOpenManage = useCallback(async () => {
    const current = await resolveItem();
    if (!current) return;
    setOpenSheet('manage');
  }, [resolveItem]);

  /*
   * Los tres datos de la fila, con el ítem completo como fuente y `location`
   * como respaldo.
   *
   * `location` ya trae variante, condición y cantidad, así que la fila se
   * dibuja en el primer render sin esperar al ítem completo. Los números del
   * respaldo son **los mismos** que va a mostrar el ítem cuando llegue, así que
   * no hay un estado intermedio en el que la fila diga algo distinto de su
   * destino: no hay parpadeo de texto ni de ancho cuando entra el detalle.
   *
   * Va en un solo objeto y no en tres constantes sueltas porque las tres se
   * escriben juntas en el mismo `StatRow` y una de ellas sin las otras dos
   * produciría `variantLabel(null)`, que no existe.
   */
  const row = ownedLocation
    ? {
        variant: item?.variant ?? ownedLocation.variant,
        condition: item?.condition ?? ownedLocation.condition,
        quantity: item?.quantity ?? ownedLocation.quantity,
        isForTrade: item?.isForTrade ?? false,
      }
    : null;

  return (
    <div className="flex flex-col gap-3">
      {isAuthenticated && isResolving ? (
        <Skeleton variant="stat" className="h-11 w-full" />
      ) : null}

      {row ? (
        <StatRow
          icon={FolderPlus}
          title="Administrar"
          description={`${variantLabel(row.variant)} · ${conditionShort(row.condition)}`}
          value={`${row.quantity} ${pluralize(row.quantity, 'copia', 'copias')}`}
          onClick={() => void handleOpenManage()}
        />
      ) : null}

      {/*
        Fila de chips con scroll propio: tres pills de 40 px no entran en 390 px
        con los gaps, y sin el `-mx-4` el scroll cortaría el pill contra el borde
        de la pantalla.

        El `py-1` **no es decoración**: es lo que evita que el indicador de foco
        quede recortado. `overflow-x: auto` hace computar `overflow-y: auto`
        (CSS Overflow 3), así que la fila recorta también en vertical; y el
        indicador son `outline-offset: 2px` + `outline-width: 2px`, o sea 4 px
        por fuera del pill. Con el `ring` viejo eran 2 px y el padding sobraba;
        ahora es el mínimo exacto, y bajarlo a `py-0` parte el indicador contra
        el borde de la fila.
      */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:px-0">
        {isAuthenticated ? (
          <>
            <Chip
              mode="content"
              size="md"
              icon={FolderPlus}
              onClick={() => {
                setAddWithTrade(false);
                setOpenSheet('add');
              }}
            >
              Añadir
            </Chip>
            <Chip
              mode="content"
              size="md"
              icon={ArrowLeftRight}
              tone={row?.isForTrade ? 'positive' : 'neutral'}
              onClick={() => {
                void handleToggleTrade();
              }}
              // `isResolvingItem` va incluido porque el chip es el disparador de
              // esa resolución: sin el `disabled`, un segundo toque durante el
              // `listItems` dispara dos toggles sobre el mismo ítem y el
              // `PATCH` final depende del orden de llegada de las dos
              // respuestas.
              disabled={isTogglingTrade || isResolvingItem}
            >
              {row?.isForTrade ? 'Para intercambio' : 'Intercambio'}
            </Chip>
          </>
        ) : null}

        <Chip mode="content" size="md" icon={Share2} onClick={() => void handleShare()}>
          Compartir
        </Chip>
      </div>

      {!isAuthenticated && !isAuthLoading ? (
        <p className="text-caption text-secondary">
          <Link
            href="/login"
            className="rounded-control text-brand underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]"
          >
            Iniciá sesión
          </Link>{' '}
          para guardar esta carta en una colección.
        </p>
      ) : null}

      <AddToCollectionSheet
        cardId={cardId}
        cardName={cardName}
        open={openSheet === 'add'}
        defaultForTrade={addWithTrade}
        onClose={() => setOpenSheet('none')}
        onAdded={(created) => {
          if (created) {
            setItem(created);
            /*
             * La carta acaba de entrar en una colección, así que ahora **sí**
             * está: sin esto la `StatRow` seguiría ausente hasta que se
             * recargara la pantalla, y "la agregué y no me aparece Administrar"
             * parece que el alta falló.
             */
            setLocation((current) =>
              current ?? {
                collectionId: created.collectionId,
                collectionName: '',
                itemId: created.id,
                quantity: created.quantity,
                variant: created.variant,
                condition: created.condition,
              },
            );
            return;
          }
          // 409: el backend sumó la cantidad a un item que ya existía y del que
          // acá no tenemos el id, así que hay que volver a consultarlo.
          setReloadToken((token) => token + 1);
        }}
      />

      <ItemSheet
        item={item}
        open={openSheet === 'manage'}
        onClose={() => setOpenSheet('none')}
        onUpdated={setItem}
        onDeleted={() => {
          setItem(null);
          // El ítem ya no está: la `location` cacheada lo seguiría mostrando.
          setLocation(null);
        }}
      />
    </div>
  );
}
