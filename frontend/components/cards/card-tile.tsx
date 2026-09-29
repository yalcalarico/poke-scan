import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import type { CardDto } from '@/types/api';

import { ShowOrDash } from './money';

export type CardTileVariant = 'catalog' | 'collection';

/**
 * `sizes` por variante. Importa que sean correctas: sin esto, Next manda la
 * imagen más grande de la que necesita y el LCP de `/buscar` se va al primer
 * `fetch` de la grilla en vez de al de la primera carta.
 *
 * Las cuentas salen de §7.2 (2 col en catálogo, 3 en colección) y de
 * `max-w-6xl` con `px-4`/`px-6` de `ScreenContainer`.
 */
const SIZES: Record<CardTileVariant, string> = {
  catalog:
    '(max-width: 639px) 46vw, (max-width: 767px) 31vw, (max-width: 1023px) 23vw, (max-width: 1279px) 18vw, 15vw',
  collection:
    '(max-width: 639px) 31vw, (max-width: 767px) 23vw, (max-width: 1023px) 18vw, (max-width: 1279px) 15vw, 12vw',
};

/**
 * La superficie activable: el `<Link>` o el `<button>`, indistinto.
 *
 * Una sola constante y no dos strings parecidos, porque las dos ramas del render
 * tienen que verse **exactamente** igual. Si divergieran por una clase, el mismo
 * tile cambiaría de alto según si navega o abre la sheet.
 *
 * `group` va **acá** y no en la celda de afuera: es lo que acota el hover y el
 * `focus-visible` a la parte activable, así que pasar el puntero por la fila de
 * `action` —que es un dato, no un control— no levanta la imagen. Con el `group`
 * en la celda, el badge de duplicados hacía de disparador del hover.
 *
 * `text-left` está por el `<button>`: el `user agent` centra el contenido de un
 * button, y en `variant="catalog"` el nombre quedaría centrado abajo de una
 * imagen alineada a la izquierda.
 */
const CONTROL_CLASSES =
  'group flex min-w-0 flex-col gap-2 rounded-surface text-left focus-visible:ring-2 focus-visible:ring-brand/20 dark:focus-visible:ring-brand/40';

export interface CardTileProps {
  card: CardDto;
  /**
   * `catalog` (default): imagen + nombre + set + precio si vino. Es el tile de
   * búsqueda, de la ficha y de la lista de "otras de este set".
   *
   * `collection`: **solo la imagen** y el badge de cantidad debajo. El nombre
   * y el precio están en la sheet de detalle, y a 3 columnas en 390 px no hay
   * ancho para dos líneas de texto: ponerlas ahí convierte la grilla en una
   * lista de paragraphs con imágenes.
   */
  variant?: CardTileVariant;
  /** Cantidad de esa carta en la colección. `0`, `undefined` y `1` no pintan chip. */
  quantity?: number;
  /**
   * Precio en USD.
   *
   * - número → se muestra en `text-positive`.
   * - `null` → sabemos que no tiene precio: `—` con `aria-label="Sin precio"`.
   * - **omitido** → no se dibuja la fila de precio. `/cards/search` no devuelve
   *   precios, y pedir 20 `/cards/:id/prices` para pintar una grilla es 20
   *   requests contra el rate limit de pokemontcg.io (`AGENTS.md` §3.1). La
   *   fila aparece sola en las pantallas que ya traen el precio en la respuesta.
   */
  priceUsd?: number | null;
  /** `true` solo en las primeras 5: son las del LCP. */
  priority?: boolean;
  /**
   * Destino del link. Default: la ficha de la carta, `/carta/[id]`.
   *
   * Se ignora si viene `onSelect`: son las dos ramas excluyentes del render.
   */
  href?: string;
  /**
   * Convierte el tile en un `<button>` que dispara este callback, en vez de un
   * `<Link>` a la ficha.
   *
   * Existe porque hay pantallas donde **tocar la carta no es navegar**: el
   * detalle de colección y el binder quieren abrir el `ItemSheet` de ese ítem.
   * La salida anterior era un `IconButton` de engranaje dibujado encima, que la
   * referencia de diseño no tiene y que obliga al usuario a apuntar a un ícono
   * de 20 px en vez de a la carta.
   *
   * ## Por qué elegir una y no anidar
   *
   * Un `<button>` adentro de un `<Link>` es HTML inválido y, en un navegador
   * real, el toque dispara la navegación y el `onClick` juntos. No hay
   * `onclick`/`pointer-events` que lo arreglen sin romper el foco por teclado ni
   * el menú contextual del link. Así que el render elige: `onSelect` → `<button>`,
   * si no → `<Link>`. Nunca los dos.
   *
   * El nombre accesible del `<button>` sale del contenido (el `alt` de la imagen
   * y el chip de cantidad), que ya es "Carta <nombre> del set <set>". No lleva
   * `aria-label`: pisarlo haría que el lector anuncie menos de lo que el botón
   * dice hoy como link.
   */
  onSelect?: () => void;
  /**
   * Piso del `sizes` de `next/image`, para cuando la grilla no es la de §7.2.
   *
   * El binder es el caso: usa `variant="collection"` (3 columnas, `31vw`) pero
   * su grilla tiene **5** columnas y el slot mide ~65 px, o sea ~17vw. Sin esto
   * el browser descarga imágenes 2,4 veces más grandes que el slot y el
   * `srcset` entero es peso muerto en una pantalla que pinta 300 slots.
   *
   * Omitido = el valor por variante de arriba.
   */
  sizes?: string;
  /**
   * Acción bajo el tile (la barra de confianza del escáner). Va **fuera** del
   * link o del botón por la misma razón que no se anidan.
   */
  action?: ReactNode;
  /** Solo para ubicación (ancho, margen). La forma la decide `variant`. */
  className?: string;
}

/**
 * Lo primero que hay que entender de este componente: **el tile es la imagen, no
 * un contenedor** (§0.2). Por eso no lleva `border` ni `bg-surface`: la carta
 * flota sobre el canvas con `shadow-sm` y sube medio píxel en hover. Con un
 * `rounded-xl border bg-surface p-2` el resultado eran 20 cajas de gris
 * compitiendo con 20 obras de arte.
 *
 * El tile es un link a la ficha salvo que el consumidor le pase `onSelect`, que
 * lo vuelve un botón. El área clickeable es en los dos casos la imagen, el
 * nombre, el set y el precio sin que haga falta perseguir un botón.
 *
 * ## Sin `'use client'`
 *
 * No tiene estado, efectos ni handlers: es un Server Component. Vive en
 * `/carta/[id]`, en `/share/[slug]` y en `/colecciones/[id]`, que son server,
 * y ponerlo en client los obligaría a todos a ser client para mostrar una
 * imagen.
 *
 * @example
 * // Catálogo: la fila de precio no aparece porque el endpoint no la trae.
 * <CardTile card={card} priority={index < 5} />
 *
 * @example
 * // Colección: denso, con la cantidad debajo de la imagen.
 * <CardTile card={item.card} variant="collection" quantity={item.quantity} />
 *
 * @example
 * // Donde tocar la carta abre el detalle del ítem en vez de navegar a la ficha.
 * <CardTile card={item.card} variant="collection" onSelect={() => onOpen(item)} />
 */
export function CardTile({
  card,
  variant = 'catalog',
  quantity,
  priceUsd,
  priority = false,
  href,
  onSelect,
  sizes,
  action,
  className,
}: CardTileProps) {
  const isCollection = variant === 'collection';
  const setName = card.set?.name ?? card.setId;
  const alt = `Carta ${card.name}${card.rarity ? ` ${card.rarity}` : ''} del set ${setName}`;
  const showPrice = variant === 'catalog' && priceUsd !== undefined;

  /*
   * El cuerpo va a una variable y no a un fragmento inline: es lo que permite
   * que el `<Link>` y el `<button>` compartan el mismo markup sin duplicarlo.
   */
  const tileBody = (
    <>
      <div
        className={cn(
          'relative aspect-[63/88] overflow-hidden rounded-surface bg-surface-2 shadow-sm',
          'transition-[transform,box-shadow] duration-fast ease-standard',
          'group-hover:-translate-y-0.5 group-hover:shadow-md',
          'group-focus-visible:-translate-y-0.5 group-focus-visible:shadow-md',
        )}
      >
        <Image
          src={card.imageSmall || card.imageLarge}
          alt={alt}
          fill
          // `63/88` son los mm reales de una carta (§14). Fijar el ratio en el
          // contenedor es lo que evita que la grilla salte cuando cada imagen
          // termina de cargar.
          sizes={sizes ?? SIZES[variant]}
          priority={priority}
          className="object-cover"
        />
      </div>

      {variant === 'catalog' ? (
        <div className="flex min-w-0 flex-col gap-0.5">
          {/*
            `truncate` + `title`: en mobile el `title` no existe, así que el
            nombre se recorta a una línea. Es el trade-off explícito de §3.3
            para tile vertical — a 2 columnas en 390 px no entra un
            `line-clamp-2` sin que la fila de precio se vaya del alto.
          */}
          <p className="truncate text-body-strong text-primary" title={card.name}>
            {card.name}
          </p>
          <p className="truncate text-caption text-tertiary" title={setName}>
            {setName}
          </p>
          {showPrice ? (
            <ShowOrDash usd={priceUsd} tone="positive" size="md" className="mt-0.5 block" />
          ) : null}
        </div>
      ) : null}

      {/*
        El `x{N}` va **debajo**, no encima de la imagen: arriba taparía la
        esquina superior derecha de la carta, que es justo donde está el número
        y el set impreso. En catálogo se alinea a la derecha (es un dato,
        no el foco); en colección va centrado y circular, que es como lo muestra
        la referencia del binder.
      */}
      {quantity && quantity > 1 ? (
        isCollection ? (
          <span
            aria-label={`${quantity} copias`}
            className="mx-auto grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-overline text-secondary tabular-nums"
          >
            {quantity}
          </span>
        ) : (
          <span className="self-end rounded-full bg-surface-2 px-2 py-0.5 text-caption text-secondary tabular-nums">
            x{quantity}
          </span>
        )
      ) : null}
    </>
  );

  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      {onSelect ? (
        <button type="button" onClick={onSelect} className={CONTROL_CLASSES}>
          {tileBody}
        </button>
      ) : (
        <Link
          href={href ?? `/carta/${encodeURIComponent(card.id)}`}
          className={CONTROL_CLASSES}
        >
          {tileBody}
        </Link>
      )}

      {action ? <div className="mt-1.5 flex shrink-0 justify-end">{action}</div> : null}
    </div>
  );
}
