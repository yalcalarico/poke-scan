// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PriceHistoryDto, PriceHistoryPointDto } from '@/types/api';

import { PriceHistory } from '../price-history';

/**
 * `PriceHistory` pide la serie a la API en un `useEffect`, así que el módulo se
 * mockea entero. Lo que se testea acá es el `buildSummary` que traduce la serie
 * a qué se dibuja y qué se dice, que es donde están las dos regresiones.
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

describe('PriceHistory: la línea se dibuja solo con 3 puntos o más', () => {
  it('con 3 puntos hay polyline', async () => {
    getCardPriceHistory.mockResolvedValue(history());
    render(<PriceHistory cardId="base1-4" />);

    await waitFor(() => expect(document.querySelector('polyline')).not.toBeNull());
  });

  /*
   * La regresión que se acaba de arreglar.
   *
   * Con 2 puntos hay exactamente una recta, y una recta entre dos números no es
   * una tendencia: es la definición de línea que une dos puntos. Dibujarla con
   * el mismo aspecto que una serie de 30 días y llamarla "precio" es mentir.
   *
   * Y el texto tiene que decir el día que hay de verdad: el bug anterior
   * anunciaba "un solo día" con una serie de 2 puntos, así que el lector
   * descrebía la serie antes de oírla.
   */
  it('con 2 puntos NO hay polyline', async () => {
    getCardPriceHistory.mockResolvedValue(
      history({
        from: '2026-09-28',
        to: '2026-09-29',
        points: [point('2026-09-28', 30.1), point('2026-09-29', 31.5)],
        change: { changeUsd: 1.4, changePercent: 5 },
      }),
    );

    render(<PriceHistory cardId="base1-4" />);

    await waitFor(() => expect(screen.getByText(/Falta más historial/)).toBeInTheDocument());

    // Ni `<svg>` ni `<polyline>`, y por lo tanto ningún `role="img"`: sin línea
    // no hay forma que describir, y un `role="img"` sin grafico sería un
    // announce que dice "imagen" sin imagen.
    expect(document.querySelector('svg')).toBeNull();
    expect(document.querySelector('polyline')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  /*
   * La regresión que se acaba de arreglar.
   *
   * Con 2 puntos hay exactamente una recta, y una recta entre dos números no es
   * una tendencia: es la definición de línea que une dos puntos. Dibujarla con
   * el mismo aspecto que una serie de 30 días y llamarla "precio" es la forma
   * más barata de mentir.
   *
   * Y el texto tiene que decir el día que hay de verdad. El bug anterior
   * anunciaba "un solo día" con una serie de 2 puntos, así que el lector
   * descrebía la serie antes de oírla.
   *
   * ## Dónde vive ese texto (y por qué el test asserta el `<p>`)
   *
   * Con menos de 3 puntos no hay `Sparkline`, así que **no hay `role="img"` ni
   * `figcaption`**: el único texto que llega al lector es el `<p>` visible de
   * abajo, que es `summary.caption`. Es correcto que diga el número real —lo
   * dice— y es lo que se asserta acá.
   *
   * Ojo con `summary.label`: `buildSummary` arma un `label`·
   * "Solo 2 días de precio registrados, del 28 de septiembre al 29 de
   * septiembre. Todavía no hay una tendencia." para esta rama, pero **nadie lo
   * renderiza**: el `label` solo se consume en la rama de `>= 3` puntos, dentro
   * del `Sparkline`: en esta rama el `label` se anuncia con un `sr-only` aparte.
   * Ver el test de más abajo.
   */
  it('con 2 puntos el texto dice 2 días, no "un solo día"', async () => {
    getCardPriceHistory.mockResolvedValue(
      history({
        from: '2026-09-28',
        to: '2026-09-29',
        points: [point('2026-09-28', 30.1), point('2026-09-29', 31.5)],
        change: { changeUsd: 1.4, changePercent: 5 },
      }),
    );

    render(<PriceHistory cardId="base1-4" />);

    const caption = await screen.findByText(/Falta más historial/);
    expect(caption).toHaveTextContent('Solo 2 días de precio.');
    expect(caption).not.toHaveTextContent('un solo día');
    expect(caption).not.toHaveTextContent('Solo 1');
    // El `caption` no promete una tendencia; el `label` (que sí lo dice) es el
    // que en esta rama llega por un `sr-only`. Ver el test de más abajo.
    expect(caption).toHaveTextContent('Falta más historial para ver una tendencia.');

    // El texto que un lector oye es exactamente este: no hay una segunda
    // fuente (ni `aria-label`, ni `figcaption`) que pueda contradecirlo.
    expect(document.querySelector('figcaption')).toBeNull();
  });

  it('con 1 punto el texto sí dice un solo día', async () => {
    getCardPriceHistory.mockResolvedValue(
      history({
        from: '2026-09-27',
        to: '2026-09-27',
        points: [point('2026-09-27', 29.9)],
        change: null,
      }),
    );

    render(<PriceHistory cardId="base1-4" />);

    expect(
      await screen.findByText('Solo 1 día de precio. Falta más historial para ver una tendencia.'),
    ).toBeInTheDocument();
    expect(document.querySelector('svg')).toBeNull();
  });

  /*
   * HALLAZGO — `components/prices/price-history.tsx:210-224` y `:172-185`.
   *
   * En las dos ramas de "no hay línea" (`dayCount === 0` y
   * `dayCount < MIN_POINTS_FOR_LINE`), `buildSummary` arma un `label` largo y
   * específico —con el rango de fechas, que es el dato que el `caption` no
   * tiene— y ese `label` **nunca llega al DOM**. El render de la línea y el
   * `label` están en la misma rama del ternario, así que con menos de 3 puntos
   * no hay `role="img"` que lo anuncie ni `figcaption` que lo muestre.
   *
   * Efecto para el usuario: la fecha del primer y del último día con precio se
   * descarta. Un lector de pantalla oye "Solo 2 días de precio. Falta más
   * historial para ver una tendencia." y no sabe **cuáles** dos días son. Para
   * el caso de 0 puntos, además, el `label` que sí menciona la ventana
   * ("en los últimos 30 días") tampoco se escucha nunca.
   *
   * No es una mentira —el `caption` no afirma ningún día que no sea verdad—, pero
   * es información que el componente calculó y tiraba.
   * El arreglo fue un `<span className="sr-only">{summary.label}</span>` en la
   * rama sin `Sparkline`: el rango queda disponible para el lector sin repetir
   * la frase cuando sí hay línea, donde el nombre lo da el `role="img"` del
   * `Sparkline`.
   */
  it('con 2 puntos el rango de fechas igual se anuncia', async () => {
    getCardPriceHistory.mockResolvedValue(
      history({
        from: '2026-09-28',
        to: '2026-09-29',
        points: [point('2026-09-28', 30.1), point('2026-09-29', 31.5)],
        change: { changeUsd: 1.4, changePercent: 5 },
      }),
    );

    render(<PriceHistory cardId="base1-4" />);
    await screen.findByText(/Falta más historial/);

    // El `label` dice "del 27 de sept de 2026 al 28 de sept de 2026", con el
    // formato corto de mes que usa `formatDate`. Se asserta contra los meses y
    // el año, no contra una fecha literal completa, para que cambiar el ancho
    // del formato de fecha no rompa un test que no está probando la fecha.
    expect(document.body).toHaveTextContent('27');
    expect(document.body).toHaveTextContent('28');
    expect(document.body).toHaveTextContent('sept');
    // Y, sobre todo, que el rango esté: los dos extremos, no solo el primero.
    expect(document.body).toHaveTextContent(/27.*al.*28/);
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
    await waitFor(() =>
      expect(
        screen.getByText('Todavía no hay historial de precio para comparar.'),
      ).toBeInTheDocument(),
    );
  });

  it('los puntos con market nulo no cuentan para el mínimo de 3', async () => {
    // 3 filas de las cuales solo 2 tienen precio: la serie efectiva es de 2, así
    // que no hay línea. Es el caso real de `card_prices` cuando una jornada no
    // se consultó.
    getCardPriceHistory.mockResolvedValue(
      history({
        points: [point('2026-09-27', 29.9), point('2026-09-28', null), point('2026-09-29', 31.5)],
        change: null,
      }),
    );

    render(<PriceHistory cardId="base1-4" />);

    expect(await screen.findByText(/Solo 2 días de precio\./)).toBeInTheDocument();
    expect(document.querySelector('svg')).toBeNull();
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
