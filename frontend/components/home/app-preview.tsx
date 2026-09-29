import { CardTile } from '@/components/cards/card-tile';
import { Badge, Surface } from '@/components/ui';
import { formatCardNumber } from '@/lib/format';
import type { CardDto } from '@/types/api';

export interface AppPreviewProps {
  /** Las cartas del catálogo, ya parseadas. `[]` = no hay mock. */
  cards: readonly CardDto[];
}

/**
 * El mock de la app: una composición con cartas **reales** del catálogo, no una
 * captura ni un placeholder.
 *
 * ## Por qué cartas reales y no un dibujo
 *
 * Un mock con formas de gris es una promesa que el producto no cumple: la
 * pantalla de la app tiene fotos de cartas, con su color y su ilustración, y un
 * bloque gris se lee como "está cargando". Además, un bloque con forma de carta
 * no se puede hacer con `Skeleton` sin mentir: `Skeleton` significa "el dato está
 * llegando" y acá el dato ya llegó.
 *
 * Y no se inventan URLs de imagen: se piden tres cartas al endpoint que ya
 * existe (`fetchPreviewCards`), que lee la tabla local del catálogo. Si el
 * backend no responde, el componente no se renderiza y la home sigue entera.
 *
 * ## Cómo se compone
 *
 * - **Mobile (390 px)**: se apila. La carta destacada arriba, y debajo el
 *   nombre del set y la grilla de las otras dos. Apilado porque a 390 px una
 *   fila de dos columnas con una carta de `aspect-[63/88]` deja 140 px de ancho
 *   para el texto, y el nombre del set se corta a media palabra (§3.3).
 * - **`sm:` en adelante**: dos columnas — la carta destacada a la izquierda con
 *   ancho fijo, y a la derecha los datos y la grilla. Es la lectura de la
 *   pantalla de búsqueda, que es lo que la home quiere previsualizar.
 *
 * Server Component: no tiene estado ni handlers, y el `CardTile` tampoco (§8.1).
 *
 * ## `aria-hidden`: el mock es decorativo y repite lo de abajo
 *
 * Los tres `CardTile` de acá son cartas reales del catálogo, así que cada uno
 * anuncia "Carta <nombre> <rareza> del set <set>" por su `alt`. Para quien entra
 * a `/` con lector de pantalla eso son ~20 palabras que **no aportan nada**: las
 * tres `FeatureGrid` de más abajo ya dicen qué hace la app, y en el peor de los
 * casos el texto empuja el CTA primario más abajo de donde tiene que estar.
 *
 * Se tapa el bloque entero: no se borran las imágenes ni se toca el layout, solo
 * se lo saca del árbol de accesibilidad. Es el mismo criterio de `AppMark`, que
 * usa `alt=""` con el motivo escrito ("el nombre de la app siempre está al lado
 * como texto").
 *
 * ## Por qué además `inert`
 *
 * Los tres `CardTile` son `<Link>`, o sea **enfocables**. Un `aria-hidden` solo
 * los saca del árbol de accesibilidad pero los deja en el recorrido del Tab, y
 * el resultado es peor que antes: tres paradas donde el foco se mueve y el
 * lector no anuncia nada (WCAG 2.2 SC 4.1.2 y la regla de axe
 * `aria-hidden-focus`). `inert` cierra las dos puertas —ni se anuncian ni se
 * enfocan— y es el mismo par que usa el `Sheet` para el resto del documento
 * (`sheet.tsx:86-98`).
 *
 * El costo es que las cartas del mock dejan de ser tocables. Es el costo
 * correcto: son un preview, los destinos reales están en las `FeatureGrid` de
 * abajo, y tocar una carta al azar y saltar a `/carta/[id]` desde el hero es una
 * navegación que nadie pidió.
 *
 * ## Por qué va en el `div` interno y no en la `Surface`
 *
 * Porque `SurfaceProps` todavía no declara `aria-hidden`
 * (`components/ui/surface.tsx:7-20`) y pasárselo da error de tipos. El `div` es
 * el único hijo, así que taparlo cubre el 100 % de lo anunciable. Si algún día
 * la `Surface` acepta el atributo, esto se sube un nivel.
 */
export function AppPreview({ cards }: AppPreviewProps) {
  const [featured, ...rest] = cards;
  if (!featured) return null;

  const setName = featured.set?.name ?? featured.setId;
  const setTotal = featured.set?.total ?? featured.set?.printedTotal ?? null;

  return (
    // Sin `overflow-hidden`: el `CardTile` sube medio píxel en hover y un clip
    // acá lo cortaría justo en el movimiento (§0.2).
    <Surface elevated padded={false} className="rounded-panel">
      <div
        // Ver el bloque de arriba: decorativo, `aria-hidden` + `inert` para que
        // no deje links mudos en el recorrido del Tab.
        aria-hidden="true"
        inert
        className="grid gap-4 p-4 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)] sm:gap-5 sm:p-5"
      >
        <div className="mx-auto w-28 shrink-0 sm:mx-0 sm:w-full">
          <CardTile card={featured} variant="collection" />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex min-w-0 flex-col items-start gap-1.5">
            <p className="line-clamp-2 text-h3 text-primary">{featured.name}</p>
            <p className="truncate text-caption text-secondary" title={setName}>
              {setName}
            </p>
            {/* `tabular-nums`: el "4 / 102" se compara contra el de al lado (§3.2). */}
            <Badge className="tabular-nums">N.º {formatCardNumber(featured.number, setTotal)}</Badge>
          </div>

          {rest.length > 0 ? (
            <ul className="grid grid-cols-2 gap-3 sm:gap-4">
              {rest.map((card) => (
                <li key={card.id} className="min-w-0">
                  <CardTile card={card} variant="collection" />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </Surface>
  );
}
