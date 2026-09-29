'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, FolderPlus, Share2 } from 'lucide-react';
import Link from 'next/link';

import { AddToCollectionSheet, ItemSheet } from '@/components/collections/item-sheet';
import { Chip, Skeleton, StatRow, useToast } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api/api-client';
import { listCollections, listItems, updateItem } from '@/lib/api/collections';
import { pluralize } from '@/lib/format';
import { conditionShort, variantLabel } from '@/lib/variants';
import type { CollectionDto, CollectionItemDto } from '@/types/api';

export interface CardActionsProps {
  cardId: string;
  cardName: string;
}

/** Cuántos items mira por colección antes de rendirse (la búsqueda es por nombre). */
const ITEMS_PER_COLLECTION = 12;

/**
 * Buscar en qué colección del usuario está esta carta.
 *
 * Se busca en **todas** las colecciones y no solo en la principal: el `StatRow` de
 * "Administrar" tiene que aparecer si la carta está en cualquiera de ellas, y
 * `listItems` es una lectura de Postgres (no toca pokemontcg.io), así que el costo
 * está en la latencia y no en el rate limit. Se filtra por `card.id` exacto
 * porque la búsqueda del backend es un `contains` sobre el nombre y "Gengar"
 * también matchea "Gengar ex".
 */
async function findItem(cardId: string, cardName: string): Promise<CollectionItemDto | null> {
  const collections: CollectionDto[] = await listCollections();
  if (!Array.isArray(collections) || collections.length === 0) return null;

  // La principal primero: es donde va a caer el `PATCH` si la carta está en dos.
  const ordered = [
    ...collections.filter((collection) => collection.isDefault),
    ...collections.filter((collection) => !collection.isDefault),
  ];

  const found = await Promise.all(
    ordered.map((collection) =>
      listItems(collection.id, { search: cardName, pageSize: ITEMS_PER_COLLECTION })
        .then((page) => page.data.find((item) => item.card.id === cardId) ?? null)
        .catch(() => null),
    ),
  );

  return found.find((item) => item !== null) ?? null;
}

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
 */
export function CardActions({ cardId, cardName }: CardActionsProps) {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const toast = useToast();

  const [foundItem, setFoundItem] = useState<CollectionItemDto | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [openSheet, setOpenSheet] = useState<'none' | 'add' | 'manage'>('none');
  const [addWithTrade, setAddWithTrade] = useState(false);
  const [isTogglingTrade, setIsTogglingTrade] = useState(false);

  /*
   * Sin sesión no hay item: se **deriva** en el render en vez de limpiarlo con un
   * efecto. Un `setState` en el cuerpo de un efecto es un render en cascada, y
   * acá no hay nada que sincronizar con el exterior (gotchas #2).
   */
  const item = isAuthenticated ? foundItem : null;

  useEffect(() => {
    if (!isAuthenticated) return;

    let disposed = false;

    // El arranque va en una microtask: un setter sincrónico en el cuerpo del
    // efecto dispara un render en cascada, y con el doble montaje de StrictMode
    // serían dos búsquedas (gotchas #9).
    queueMicrotask(() => {
      if (disposed) return;
      setIsResolving(true);
      findItem(cardId, cardName)
        .then((found) => {
          if (disposed) return;
          setFoundItem(found);
          setIsResolving(false);
        })
        .catch(() => {
          if (disposed) return;
          // La ficha se puede ver igual sin esta fila, así que no es un estado
          // de error de la pantalla. Se avisa igual, porque un "Administrar" que
          // no aparece parece que la carta no está en ninguna colección.
          toast.warning('No pudimos ver tus colecciones.');
          setIsResolving(false);
        });
    });

    return () => {
      disposed = true;
    };
  }, [cardId, cardName, isAuthenticated, reloadToken, toast]);

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
    if (!item) {
      setAddWithTrade(true);
      setOpenSheet('add');
      return;
    }
    setIsTogglingTrade(true);
    try {
      const next = !item.isForTrade;
      const updated = await updateItem(item.id, { isForTrade: next });
      setFoundItem(updated);
      toast.success(next ? 'Marcada para intercambio' : 'Ya no está para intercambio');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No pudimos actualizar la carta.');
    } finally {
      setIsTogglingTrade(false);
    }
  }, [item, toast]);

  return (
    <div className="flex flex-col gap-3">
      {isAuthenticated && isResolving ? (
        <Skeleton variant="stat" className="h-11 w-full" />
      ) : null}

      {isAuthenticated && item ? (
        <StatRow
          icon={FolderPlus}
          title="Administrar"
          description={`${variantLabel(item.variant)} · ${conditionShort(item.condition)}`}
          value={`${item.quantity} ${pluralize(item.quantity, 'copia', 'copias')}`}
          onClick={() => setOpenSheet('manage')}
        />
      ) : null}

      {/*
        Fila de chips con scroll propio: tres pills de 36 px no entran en 390 px
        con los gaps, y sin el `-mx-4` el scroll cortaría el pill contra el borde
        de la pantalla. El `py-1` evita que el anillo de foco quede recortado por
        el `overflow`.
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
              tone={item?.isForTrade ? 'positive' : 'neutral'}
              onClick={() => {
                void handleToggleTrade();
              }}
              disabled={isTogglingTrade}
            >
              {item?.isForTrade ? 'Para intercambio' : 'Intercambio'}
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
            href={"/login"}
            className="rounded-control text-brand underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-brand/20 dark:focus-visible:ring-brand/40"
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
            setFoundItem(created);
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
        onUpdated={setFoundItem}
        onDeleted={() => setFoundItem(null)}
      />
    </div>
  );
}
