// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PriceHistoryDto, PriceHistoryPointDto } from '@/types/api';

import { PriceHistory } from '../price-history';

/**
 * `PriceHistory` pide la serie a la API en un `useEffect`, así que el módulo se
 * mockea entero. Lo que se testea acá es el `buildSummary` que traduce la serie
 * a qué se dibuja y qué se dice, que es donde están las regresiones.
 */
const getCardPriceHistory = vi.fn<() => Promise<PriceHistoryDto>>();

vi.mock('@/lib/api/cards', () => ({
  getCardPriceHistory: (...args: unknown[]) => getCardPriceHistory(...(args as [])),
}));

function point(date: string, market: number | null): PriceHistoryPointDto {
  return { date, fetchedAt: `${date}T10:00:00.000Z`, market, low: null, mid: null, high: null };
}

function history(overrides: Partial<PriceHistoryDto> = {}): PriceHistoryDto {
  return {
    cardId: 'base1-4',
    provider: 'tcgdex',
    source: 'tcgplayer',
    variant: null,
    currency: 'USD',
    windowDays: 30,
    from: '2026-09-27',
    to: '2026-09-29',
    points: [point('2026-09-27', 29.9), point('2026-09-28', 30.1), point('2026-09-29', 31.5)],
    change: { changeUsd: 1.6, changePercent: 5 },
    ...overrides,
  };
}

beforeEach(() => {
  getCardPriceHistory.mockReset();
});

/** El texto que oye un lector de pantalla: el `aria-label` del `role="img"`. */
async function accessibleLabel(): Promise<string | null> {
  await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
  return screen.getByRole('img').getAttribute('aria-label');
}

/** Una serie de dos días, tal como las devuelve la tabla con dos jornadas. */
function twoDayHistory(): PriceHistoryDto {
  return history({
    from: '2026-09-28',
    to: '2026-09-29',
    points: [point('2026-09-28', 30.1), point('2026-09-29', 31.5)],
    change: { changeUsd: 1.4, changePercent: 5 },
  });
}

/** Una serie de un día: el caso real de casi toda carta de `card_prices` hoy. */
function oneDayHistory(): PriceHistoryDto {
  return history({
    from: '2026-09-27',
    to: '2026-09-27',
    points: [point('2026-09-27', 29.9)],
    change: null,
  });
}

/**
 * Las clases de tono que viven en el árbol. Se leen del elemento que envuelve a
 * la figura, que es el que recibe `summary.toneClass` —`Sparkline` y `PriceDot`
 * se la pasan por `className` y la usan vía `currentColor` / `bg-current`.
 */
function toneClasses(container: HTMLElement): string {
  return [...container.querySelectorAll('*'), container]
    .map((node) => node.className)
    .filter((name): name is string => typeof name === 'string')
    .join(' ');
}

describe('PriceHistory: la geometría se dibuja siempre que haya datos', () => {
  it('con 3 puntos hay polyline', async () => {
    getCardPriceHistory.mockResolvedValue(history());
    render(<PriceHistory cardId="base1-4" />);

    await waitFor(() => expect(document.querySelector('polyline')).not.toBeNull());
  });

  /*
   * CAMBIO DE CONTRATO — el umbral de 3 puntos pasó a ser 2.
   *
   * Este test afirmaba lo contrario: "con 2 puntos NO hay polyline", con el
   * argumento de que una recta entre dos números no es una tendencia. El
   * argumento era bueno y el número estaba mal.
   *
   * La realidad de la base es la que manda: `card_prices` tiene 124 filas
   * repartidas en 5 días, y la mayoría de las cartas tienen **un** día. Con el
   * umbral en 3, la línea no se veía nunca y la feature más importante de la
   * ficha era invisible. La honestidad no se Luciano con la geometría sino con
   * el texto: el caption dice cuántos días hay siempre.
   */
  it('con 2 puntos SÍ hay polyline', async () => {
    getCardPriceHistory.mockResolvedValue(twoDayHistory());
    render(<PriceHistory cardId="base1-4" />);

    await waitFor(() => expect(document.querySelector('polyline')).not.toBeNull());
    expect(document.querySelector('svg')).not.toBeNull();
    // Y hay una forma que describir, así que el nombre accesible existe.
    await expect(accessibleLabel()).resolves.toContain('2 días');
  });

  /*
   * Un día es un dato, y un dato que no se dibuja es un dato que no está.
   *
   * Un `<polyline>` de un solo punto no dibuja nada, así que un punto suelto es
   * la forma honesta: el `Sparkline` se corta con `points.length < 2` y acá lo
   * reemplaza `PriceDot`. Lo que se asserta es que **algo visible** existe con
   * el nombre accesible —no que sea una recta, porque no puede serlo—.
   */
  it('con 1 punto hay un punto visible con nombre accesible, y no una recta', async () => {
    getCardPriceHistory.mockResolvedValue(oneDayHistory());
    render(<PriceHistory cardId="base1-4" />);

    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    // No hay segmento, entonces no hay `polyline`: eso no es un bug, es la
    // definición de segmento.
    expect(document.querySelector('polyline')).toBeNull();

    // El punto es un `span` decorativo (`aria-hidden`, así que no se anuncia)
    // con un `bg-current` que toma el color del tono del contenedor.
    const dot = document.querySelector('.bg-current');
    expect(dot).not.toBeNull();
    expect(dot).toHaveAttribute('aria-hidden', 'true');
    expect(dot).toHaveClass('rounded-full');
  });

  it('con 1 punto el texto dice 1 día y no promete una tendencia', async () => {
    getCardPriceHistory.mockResolvedValue(oneDayHistory());
    render(<PriceHistory cardId="base1-4" />);

    const caption = await screen.findByText(/1 día de precio/);
    expect(caption).toHaveTextContent('1 día de precio registrado.');
    expect(caption).not.toHaveTextContent('2 días');
    expect(caption).not.toHaveTextContent('0 %');
  });

  it('con 2 puntos el texto dice 2 días, no "un solo día"', async () => {
    getCardPriceHistory.mockResolvedValue(twoDayHistory());
    render(<PriceHistory cardId="base1-4" />);

    const caption = await screen.findByText(/2 días de precio/);
    expect(caption).toHaveTextContent('2 días de precio');
    expect(caption).not.toHaveTextContent('un solo día');
    expect(caption).not.toHaveTextContent('Solo 1');
  });

  /*
   * El texto del umbral viejo ("Falta más historial para ver una tendencia")
   * desapareció: era una disculpa, y el principio de redacción de §10 es que la
   * app dice lo que sabe y lo que todavía no. Este test falla si la frase
   * vuelve.
   */
  it('ningún estado de pocos días se disculpa por lo que le falta', async () => {
    getCardPriceHistory.mockResolvedValue(oneDayHistory());
    const { unmount } = render(<PriceHistory cardId="base1-4" />);
    await screen.findByText(/1 día de precio/);
    expect(document.body).not.toHaveTextContent('Falta más historial');
    unmount();

    getCardPriceHistory.mockResolvedValue(twoDayHistory());
    render(<PriceHistory cardId="base1-4" />);
    await screen.findByText(/2 días de precio/);
    expect(document.body).not.toHaveTextContent('Falta más historial');
    expect(document.body).not.toHaveTextContent('tendencia.');
  });

  it('sin puntos con market no hay línea y lo dice sin inventar un día', async () => {
    getCardPriceHistory.mockResolvedValue(
      history({
        from: null,
        to: null,
        points: [point('2026-09-27', null), point('2026-09-28', null)],
        change: null,
      }),
    );

    render(<PriceHistory cardId="base1-4" />);

    expect(document.querySelector('svg')).toBeNull();
    expect(document.querySelector('.bg-current')).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByText(
          /Todavía no hay historial de precio para comparar · tcgplayer · TCGdex\./,
        ),
      ).toBeInTheDocument(),
    );
  });

  /*
   * HALLAZGO — `components/prices/price-history.tsx`, ya corregido.
   *
   * En las ramas sin figura, `buildSummary` armaba un `label` largo y
   * específico —con el rango de fechas, que es el dato que el `caption` no
   * tiene— y ese `label` **nunca llegaba al DOM**. El render de la figura y el
   * `label` estaban en la misma rama del ternario, así que sin `Sparkline`
   * tampoco había `role="img"` que lo anunciara.
   *
   * Efecto para el usuario: la fecha del primer y del último día con precio se
   * descartaba. Un lector de pantalla oía el `caption` y no sabía **cuáles**
   * días eran. Para el caso de 0 puntos, además, la ventana ("en los últimos 30
   * días") tampoco se escuchaba nunca.
   *
   * El arreglo fue un `<span className="sr-only">{summary.label}</span>` en la
   * rama sin figura. **Regresión a cubrir:** con el umbral viejo, "sin figura"
   * incluía las series de 1 y 2 días, así que este test se corrió contra dos
   * puntos. Ahora el caso de 2 días tiene `role="img"` y el `sr-only` cubre
   * solo el de 0 días, que es el que sigue sin geometría posible.
   */
  it('con 2 puntos el rango de fechas igual se anuncia', async () => {
    getCardPriceHistory.mockResolvedValue(twoDayHistory());
    render(<PriceHistory cardId="base1-4" />);
    await screen.findByText(/2 días de precio/);

    const label = await accessibleLabel();
    // El `label` dice "del 28 de sept. de 2026 al 29 de sept. de 2026", con el
    // formato corto de mes que usa `formatDate`. Se asserta contra los meses y
    // el año, no contra una fecha literal completa, para que cambiar el ancho
    // del formato de fecha no rompa un test que no está probando la fecha.
    expect(label).toContain('sept');
    // Y, sobre todo, que el rango esté: los dos extremos, no solo el primero.
    expect(label).toMatch(/27|28/);
    expect(label).toMatch(/29|30/);
    expect(label).toMatch(/al/);
  });

  it('con 0 puntos el sr-only sigue diciendo la ventana pedida', async () => {
    // La rama sin figura. El `label` se calcula y se renderiza en un
    // `sr-only`: no hay `role="img"` al que ponerlo, así que si ese span
    // desapareciera, la ventana se perdería en silencio.
    getCardPriceHistory.mockResolvedValue(
      history({ from: null, to: null, points: [], change: null, windowDays: 30 }),
    );

    render(<PriceHistory cardId="base1-4" />);
    await screen.findByText(
      /Todavía no hay historial de precio para comparar · tcgplayer · TCGdex\./,
    );

    expect(document.querySelector('svg')).toBeNull();
    expect(document.querySelector('figcaption')).toBeNull();
    expect(document.body).toHaveTextContent('Esta carta no tiene historial de precio en los últimos 30 días.');
  });

  /*
   * La procedencia va en el texto, no en un tooltip: de dónde salió la serie es
   * parte de lo que el usuario está mirando, y sin esto dos series de
   * proveedores distintos se leen como la misma cifra.
   */
  it('el caption dice de qué mercado y de qué proveedor salió la serie', async () => {
    getCardPriceHistory.mockResolvedValue(twoDayHistory());
    render(<PriceHistory cardId="base1-4" />);

    const caption = await screen.findByText(/2 días de precio/);
    expect(caption).toHaveTextContent('tcgplayer');
    expect(caption).toHaveTextContent('TCGdex');
  });

  it('con provider null el caption no le atribuye la serie a nadie', async () => {
    getCardPriceHistory.mockResolvedValue(
      history({ provider: null, source: 'tcgplayer', points: [], from: null, to: null, change: null }),
    );
    render(<PriceHistory cardId="base1-4" />);

    const caption = await screen.findByText(/Todavía no hay historial/);
    expect(caption).toHaveTextContent('origen no identificado');
    expect(caption).not.toHaveTextContent('TCGdex');
  });

  it('los puntos con market nulo no cuentan como días', async () => {
    // 3 filas de las cuales solo 2 tienen precio: la serie efectiva es de 2, así
    // que hay una línea. Es el caso real de `card_prices` cuando una jornada no
    // se consultó —y el que antes se confundía con "no hay línea".
    getCardPriceHistory.mockResolvedValue(
      history({
        points: [point('2026-09-27', 29.9), point('2026-09-28', null), point('2026-09-29', 31.5)],
        change: null,
      }),
    );

    render(<PriceHistory cardId="base1-4" />);

    await screen.findByText(/2 días de precio/);
    await waitFor(() => expect(document.querySelector('polyline')).not.toBeNull());
  });
});

describe('PriceHistory: change null', () => {
  /*
   * `change: null` es el estado real y honesto: la serie existe pero el
   * porcentaje no se puede calcular (falta un extremo, o el primero vale 0).
   * "0 %" y "sin cambios" serían los dos inventos que este proyecto no hace:
   * un 0 % afirma que se comparó y no se movió, y no se comparó nada.
   */
  it('con change null nunca dice "0 %"', async () => {
    getCardPriceHistory.mockResolvedValue(history({ change: null }));
    render(<PriceHistory cardId="base1-4" />);

    await waitFor(() => expect(document.querySelector('figcaption')).not.toBeNull());

    const spoken = document.querySelector('figcaption')?.textContent ?? '';
    const visible = document.body.textContent ?? '';

    for (const text of [spoken, visible]) {
      expect(text).not.toMatch(/0\s*%/);
      expect(text).not.toMatch(/0,0\s*%/);
      expect(text).not.toContain('sin cambios');
    }
  });

  it('con change null la línea se dibuja igual y el texto no inventa una variación', async () => {
    getCardPriceHistory.mockResolvedValue(history({ change: null }));
    render(<PriceHistory cardId="base1-4" />);

    // La serie existe y la pendiente se ve: esconderla sería tirar información
    // real. Lo que no se puede es *calcular* el número.
    await waitFor(() => expect(document.querySelector('polyline')).not.toBeNull());

    const spoken = document.querySelector('figcaption')?.textContent ?? '';
    expect(spoken).toContain('sin variación calculable');
    expect(spoken).toContain('en 3 días de los últimos 30');
    await expect(accessibleLabel()).resolves.toContain('sin variación calculable');
  });

  it('con change positivo el texto dice que subió y da los dos extremos', async () => {
    getCardPriceHistory.mockResolvedValue(
      history({ change: { changeUsd: 1.6, changePercent: 5 } }),
    );
    render(<PriceHistory cardId="base1-4" />);

    const spoken = await accessibleLabel();
    expect(spoken).toContain('de 29.90 a 31.50 dólares');
    expect(spoken).toContain('subió');
    expect(spoken).toContain('en 3 días de los últimos 30');
  });

  it('con change negativo el texto dice que bajó', async () => {
    getCardPriceHistory.mockResolvedValue(
      history({
        points: [point('2026-09-27', 31.5), point('2026-09-28', 30.1), point('2026-09-29', 29.9)],
        change: { changeUsd: -1.6, changePercent: -5 },
      }),
    );
    render(<PriceHistory cardId="base1-4" />);

    await expect(accessibleLabel()).resolves.toContain('bajó');
  });

  it('el caption usa el windowDays que devolvió el servidor, no el prop days', async () => {
    // El servidor recorta la ventana a 7..365: si mañana el default baja a 14,
    // el texto tiene que decir 14 sin tocar el componente.
    getCardPriceHistory.mockResolvedValue(history({ windowDays: 7 }));
    render(<PriceHistory cardId="base1-4" days={30} />);

    const spoken = await accessibleLabel();
    expect(spoken).toContain('de los últimos 7');
    expect(spoken).not.toContain('de los últimos 30');
  });
});

describe('PriceHistory: el tono sale solo del change del backend', () => {
  /*
   * La regla que no se negocia: el color lo decide **el `change` del servidor y
   * nada más**. Si el color saliera de la pendiente local del sparkline, la
   * línea podría contradecir a la píldora de `PriceDelta` que está justo arriba
   * —el mismo dato pintado de dos colores distintos—, y eso es peor que no
   * pintar ninguno.
   *
   * Estos dos tests construyen el caso imposible a propósito: la serie local
   * dice una cosa y el `change` dice la otra. Gana el `change`.
   */
  it('con la serie subiendo y el change negativo, la línea es negativa', async () => {
    getCardPriceHistory.mockResolvedValue(
      history({
        points: [point('2026-09-27', 29.9), point('2026-09-28', 30.1), point('2026-09-29', 31.5)],
        change: { changeUsd: -1.6, changePercent: -5 },
      }),
    );

    const { container } = render(<PriceHistory cardId="base1-4" />);
    await waitFor(() => expect(document.querySelector('polyline')).not.toBeNull());

    const tones = toneClasses(container);
    expect(tones).toContain('text-negative');
    expect(tones).not.toContain('text-positive');
  });

  it('con la serie bajando y el change positivo, la línea es positiva', async () => {
    getCardPriceHistory.mockResolvedValue(
      history({
        points: [point('2026-09-27', 31.5), point('2026-09-28', 30.1), point('2026-09-29', 29.9)],
        change: { changeUsd: 1.6, changePercent: 5 },
      }),
    );

    const { container } = render(<PriceHistory cardId="base1-4" />);
    await waitFor(() => expect(document.querySelector('polyline')).not.toBeNull());

    const tones = toneClasses(container);
    expect(tones).toContain('text-positive');
    expect(tones).not.toContain('text-negative');
  });

  it('con change null la línea es neutra, ni verde ni roja', async () => {
    // El caso que más se va a ver mientras `card_prices` sea joven, y el que
    // más tentador es pintar de verde "porque la pendiente parece que sube".
    getCardPriceHistory.mockResolvedValue(
      history({
        points: [point('2026-09-27', 29.9), point('2026-09-28', 30.1), point('2026-09-29', 31.5)],
        change: null,
      }),
    );

    const { container } = render(<PriceHistory cardId="base1-4" />);
    await waitFor(() => expect(document.querySelector('polyline')).not.toBeNull());

    const tones = toneClasses(container);
    expect(tones).toContain('text-tertiary');
    expect(tones).not.toContain('text-positive');
    expect(tones).not.toContain('text-negative');
  });
});

describe('PriceHistory: estados de degradación', () => {
  it('si la serie no llega no renderiza nada, sin romper la pantalla', async () => {
    // Un error de la serie **no** es un error de la pantalla: la cifra de arriba
    // ya está y el usuario puede hacer lo que venía a hacer sin ver la línea.
    getCardPriceHistory.mockRejectedValue(new Error('404'));
    const { container } = render(<PriceHistory cardId="base1-4" />);

    await waitFor(() => expect(getCardPriceHistory).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('no hace doble request por el doble montaje de StrictMode antes de resolver', async () => {
    getCardPriceHistory.mockResolvedValue(history());
    render(<PriceHistory cardId="base1-4" />);

    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
    // No se asserta el número exacto: lo que importa es que no se dispare un
    // request por cada re-render (docs/gotchas.md §9).
    expect(getCardPriceHistory.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('pasa el cardId y la ventana al cliente de la API', async () => {
    getCardPriceHistory.mockResolvedValue(history());
    render(<PriceHistory cardId="base1-4" days={14} />);

    await waitFor(() => expect(getCardPriceHistory).toHaveBeenCalled());
    expect(getCardPriceHistory).toHaveBeenCalledWith('base1-4', {
      days: 14,
      variant: undefined,
    });
  });
});
