import Image from 'next/image';
import Link from 'next/link';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import type { CardDto } from '@/types/api';

import { ShowOrDash } from './money';
import { rarityAccent } from './rarity-accent';

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
 *
 * ## El indicador de foco necesita 4 px de aire
 *
 * Es `outline` con `offset-2`, no el `ring-brand/20` de antes: el anillo medía
 * 1.38:1 contra el canvas y WCAG 2.2 SC 1.4.11 pide 3:1 (el mismo argumento y el
 * mismo color que `Button`, `Chip` y `Select`). Pero el `outline` se dibuja
 * **por fuera** del borde, así que necesita 2 px de offset + 2 px de grosor = 4 px
 * alrededor de la celda, y cualquier ancestro con `overflow` se los come.
 *
 * Por eso la grilla de §7.2 importa: `gap-3` en catálogo y `gap-2` en colección
 * son el margen real entre celdas, y los 8 px de `gap-2` dan exactamente los 4 px
 * que pide cada `outline` de cada lado. Si alguna vez las celdas se meten en un
 * scroller o en un contenedor con `overflow-hidden` sin padding vertical, el
 * indicador se recorta: el sitio más probable es el binder, y ya está resuelto
 * con `py-1.5` en `binder-view.tsx:212`.
 */
const CONTROL_CLASSES =
  'group flex min-w-0 flex-col gap-2 rounded-surface text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]';

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
  /**
   * El tile está elegido en un modo de selección múltiple.
   *
   * ## No hay checkbox, y por qué
   *
   * Lo intuitivo es poner un `<input type="checkbox">` arriba de la imagen. Eso
   * es **HTML inválido**: un control de formulario adentro del `<button>` o del
   * `<Link>` del tile, y en un navegador real el toque dispara las dos cosas
   * (navegar **y** tildar), el foco se pierde al cambiar de elemento y el
   * `Tab` entra a un input que no debería estar en ese orden. Es el mismo
   * argumento que el JSDOC de `onSelect` da para no anidar un botón, y la razón
   * por la que el `action` está fuera de los dos.
   *
   * Lo que hay entonces es un **`aria-hidden` decorativo**: el estado dibujado en
   * la esquina, más `aria-pressed` en el botón, que es lo que un lector de
   * pantalla anuncia de verdad. El control real es el dedo sobre el card y el
   * "Seleccionar todas" de la fila.
   *
   * ## Por qué `aria-pressed` y no `aria-selected`
   *
   * `aria-pressed` describe un botón que se puede activar y desactivar, que es
   * exactamente lo que es el tile en este modo. `aria-selected` pertenece a
   * opciones de un `listbox` o `grid` con `aria-multiselectable`, que es otra
   * interacción: ahí la selección **reemplaza** a la anterior, y acá se acumula.
   */
  isSelected?: boolean;
  /**
   * Se anuncia solo cuando el tile **está** elegido. Un lector de pantalla
   * recorriendo 24 celdas necesita oír "elegida" en las que lo están; no
   * necesita oír "no elegida" 24 veces, y el `aria-pressed` ya cubre el otro
   * lado del estado.
   */
  selectionLabel?: string;
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
 * ## La señal de rareza: una franja vertical de 2 px
 *
 * `rarity` ya estaba en el `alt` y en el filtro, pero no se veía, y una grilla
 * de 24 cartas sin ella es una pared de imágenes. El acento va como overlay
 * **dentro** del `div` de la imagen —nunca como `border`/`bg-surface` de la
 * celda, que es exactamente lo que §0.2 prohíbe y lo que haría volver a mirar
 * 20 cajas de gris—: 2 px de ancho por todo el alto de la carta, contra los
 * ~180 px que mide la celda. No tapan arte, no suman alto ni layout, y se leen
 * como el lomo de la carta: en una fila de la grilla forman una línea de color
 * que el ojo recorre sin leer un solo nombre.
 *
 * En `variant="catalog"` la rareza también se escribe, en `text-overline` sobre
 * el nombre. No es decoración: es lo que evita que el color sea el único portador
 * del dato (WCAG 1.4.1). En `variant="collection"` no se escribe —3 a 8 columnas
 * no hay ancho, y el `alt` de la imagen ya lleva la rareza al nombre accesible del
 * link—, y por eso la franja va con `title` para que un mouse la pueda leer.
 * Los tres niveles y el por qué están en `rarity-accent.ts`.
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
  isSelected = false,
  selectionLabel,
  className,
}: CardTileProps) {
  const isCollection = variant === 'collection';
  const setName = card.set?.name ?? card.setId;
  const alt = `Carta ${card.name}${card.rarity ? ` ${card.rarity}` : ''} del set ${setName}`;
  const showPrice = variant === 'catalog' && priceUsd !== undefined;
  const rarity = rarityAccent(card.rarity);

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

        {/*
          La señal de rareza. Va **adentro** de la imagen y no como borde de la
          celda: §0.2 dice que el tile ES la imagen, y un `border` en la celda la
          devuelve a ser una caja de gris compitiendo con el arte.

          `aria-hidden`: la rareza ya está en el `alt` de la imagen, que es parte
          del nombre accesible del link. Si el elemento no fuera decorativo, el
          lector anunciaría "Rare Holo" dos veces por tile.
        */}
        {rarity.bar ? (
          <span
            aria-hidden="true"
            title={card.rarity ?? undefined}
            className={cn('absolute inset-y-0 left-0 w-0.5', rarity.bar)}
          />
        ) : null}

        {/* La marca de selección: dentro de la imagen, no como borde de la celda,
            por el mismo motivo que la franja de rareza (§0.2). */}
        {isSelected ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-brand text-on-brand shadow-sm"
          >
            <Check strokeWidth={3} className="h-3 w-3" />
          </span>
        ) : null}

        {isSelected ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-surface ring-2 ring-brand ring-inset"
          />
        ) : null}
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

          {/*
            La rareza escrita. Es el camino **no visual** del dato, y por eso va
            solo en `catalog`: la rareza ya está en el `alt` de la imagen, que
            entra en el nombre accesible del link, así que repetirla en el texto
            visible la anunciaría dos veces. Repetirla **visible** es lo que
            importa para el usuario que ve y no usa lector (WCAG 1.4.1).

            `text-overline` y no `text-caption`: 11 px en mayúscula con tracking
            es la escala que ya dice "etiqueta" en este design system, y deja el
            nombre —que es lo que se lee— arriba, con su peso intacto.

            Suma 14 px al tile de catálogo. No es gratis, y es el costo de que
            el dato exista sin depender del color. En `collection` no se dibuja:
            a 3 columnas en 390 px no entra, y la variante es imagen sola.
          */}
          {card.rarity ? (
            <p
              className={cn('truncate text-overline', rarity.text)}
              title={card.rarity}
            >
              {card.rarity}
            </p>
          ) : null}

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

  /*
   * El estado de selección se anuncia con `aria-pressed` y no con el texto de la
   * marca, que es `aria-hidden`: `aria-pressed` es lo que un lector de pantalla
   * lee en un botón conmutable, y es el mismo atributo que usa el `Chip` de los
   * filtros (§8.4). `selectionLabel` se suma para que el anuncio diga **qué**
   * carta se eligió y no solo que "se tocó algo".
   *
   * Y el `aria-label` **no** se pisa: pisarlo haría que el lector anuncie menos
   * de lo que el botón dice hoy como link ("Carta Charizard holo del set Base
   * Set, 4 copias, elegida").
   */
  const selectionAria = isSelected && selectionLabel ? `, ${selectionLabel}` : '';

  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      {onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={isSelected ? true : undefined}
          className={CONTROL_CLASSES}
        >
          {tileBody}
          {selectionAria ? <span className="sr-only">{selectionAria}</span> : null}
        </button>
      ) : (
        <Link
          href={href ?? `/carta/${encodeURIComponent(card.id)}`}
          className={CONTROL_CLASSES}
        >
          {tileBody}
          {selectionAria ? <span className="sr-only">{selectionAria}</span> : null}
        </Link>
      )}

      {action ? <div className="mt-1.5 flex shrink-0 justify-end">{action}</div> : null}
    </div>
  );
}
