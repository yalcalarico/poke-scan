// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CardWithPricesDto } from '@/lib/api/cards';
import type { PriceDto, PriceHistoryDto } from '@/types/api';

import { CardPriceSection } from '../card-price-section';

/**
 * La regla que este archivo protege es de **rate limit**, no de estado.
 *
 * `GET /cards/:id/prices` es el único endpoint público del catálogo que puede
 * terminar pegándole al proveedor de precios, con un presupuesto duro de
 * 1.000/día y 30/min (`AGENTS.md` §3.1). Por eso la ficha lo pide desde el
 * cliente y con dos brakes:
 *
 * 1. Si el servidor ya trajo un precio fresco (menos de 24 h), el cliente
 *    **no vuelve a pedirlo**. Un request por visita a la ficha es lo que
 *    gastaría presupuesto de a poco; un request por montaje, sin mirar la
 *    frescura, lo gasta de golpe.
 * 2. Un `AbortError` es una corrida vieja (el componente se desmontó al
 *    cambiar de carta), no un error de pantalla: si encendiera el estado de
 *    error, la ficha mostraría "No pudimos consultar el precio" por haber
 *    cancelado.
 */
const getCardPrices = vi.fn<() => Promise<CardWithPricesDto>>();
const getCardPriceHistory = vi.fn<() => Promise<PriceHistoryDto>>();

vi.mock('@/lib/api/cards', () => ({
  getCardPrices: (...args: unknown[]) => getCardPrices(...(args as [])),
  getCardPriceHistory: (...args: unknown[]) => getCardPriceHistory(...(args as [])),
}));

vi.mock('@/hooks/use-currency', () => ({
  useCurrency: () => ({
    currency: 'USD',
    formatMoney: (usd: number | null | undefined) =>
      usd === null || usd === undefined ? '—' : `US$ ${usd.toFixed(2)}`,
  }),
}));

/** Una fila de precio con los defaults que espera `CardPriceSection`. */
function price(overrides: Partial<PriceDto> = {}): PriceDto {
  return {
    cardId: 'xy4-117',
    variant: 'normal',
    low: 1,
    mid: 2,
    high: 3,
    market: 12.34,
    provider: 'tcgdex',
    isStale: false,
    currency: 'USD',
    source: 'tcgplayer',
    fetchedAt: new Date().toISOString(),
    change: null,
    changeUsd: null,
    changePercent: null,
    windowLabel: null,
    ...overrides,
  };
}

function pricesPayload(prices: PriceDto[]): CardWithPricesDto {
  return {
    card: {
      id: 'xy4-117',
      name: 'AZ',
      setId: 'xy4',
      number: '117',
      supertype: 'pokemon',
      subtypes: [],
      hp: null,
      types: [],
      rarity: null,
      artist: null,
      imageSmall: '',
      imageLarge: '',
    },
    prices,
  };
}

/** La serie que dibuja el `PriceHistory` del hero: nunca viene en estos tests. */
function emptyHistory(): PriceHistoryDto {
  return {
    cardId: 'xy4-117',
    provider: 'tcgdex',
    source: 'tcgplayer',
    variant: null,
    currency: 'USD',
    windowDays: 30,
    from: null,
    to: null,
    points: [],
    change: null,
  };
}

beforeEach(() => {
  getCardPrices.mockReset();
  getCardPriceHistory.mockReset();
  getCardPriceHistory.mockResolvedValue(emptyHistory());
});

describe('CardPriceSection: cuándo se pide el precio', () => {
  it('con un precio fresco del servidor no vuelve a pedirlo', async () => {
    getCardPrices.mockResolvedValue(pricesPayload([price()]));

    render(<CardPriceSection cardId="xy4-117" initialPrices={[price()]} />);

    // El número entra en el primer render: no hay skeleton.
    expect(screen.getByText('US$ 12.34')).toBeInTheDocument();

    /*
     * La espera es por la **serie**, no por el precio: `PriceHistory` pide sus
     * datos en el mismo commit, así que cuando él respondió ya pasaron las
     * microtasks del efecto del precio. Un `waitFor` sobre "no lo llamó" pasa en
     * el primer chequeo y no prueba nada —por eso no se escribe así.
     */
    await waitFor(() => expect(getCardPriceHistory).toHaveBeenCalled());
    expect(getCardPrices).not.toHaveBeenCalled();
  });

  it('con un precio viejo del servidor sí lo refresca, una sola vez', async () => {
    const old = price({ fetchedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() });
    getCardPrices.mockResolvedValue(pricesPayload([price()]));

    render(<CardPriceSection cardId="xy4-117" initialPrices={[old]} />);

    // Primero muestra lo que hay, aunque esté viejo.
    expect(screen.getByText('US$ 12.34')).toBeInTheDocument();

    await waitFor(() => expect(getCardPrices).toHaveBeenCalledTimes(1));
    expect(getCardPrices).toHaveBeenCalledWith('xy4-117');
  });

  it('sin precio inicial pide uno y no queda en skeleton', async () => {
    getCardPrices.mockResolvedValue(pricesPayload([price()]));

    render(<CardPriceSection cardId="xy4-117" />);

    await waitFor(() => expect(getCardPrices).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('US$ 12.34')).toBeInTheDocument());
  });

  it('sin precio inicial y sin respuesta, muestra el hero vacío y no un error', async () => {
    getCardPrices.mockResolvedValue(pricesPayload([]));

    render(<CardPriceSection cardId="xy4-117" />);

    await waitFor(() =>
      expect(screen.getByText('No tenemos precio de mercado para esta carta todavía.')).toBeInTheDocument(),
    );
    expect(screen.queryByText('No pudimos consultar el precio')).not.toBeInTheDocument();
  });
});

describe('CardPriceSection: la cancelación no es un error', () => {
  it('un AbortError no enciende el ErrorState', async () => {
    getCardPrices.mockRejectedValue(new DOMException('Aborted', 'AbortError'));

    render(<CardPriceSection cardId="xy4-117" />);

    await waitFor(() => expect(getCardPrices).toHaveBeenCalledTimes(1));
    // El hero sigue en su estado de carga: no hay nada que avisar.
    expect(screen.queryByText('No pudimos consultar el precio')).not.toBeInTheDocument();
  });

  it('un error de red sí se avisa, con su reintento', async () => {
    getCardPrices.mockRejectedValue(new Error('Se cayó la conexión'));

    render(<CardPriceSection cardId="xy4-117" />);

    await waitFor(() =>
      expect(screen.getByText('No pudimos consultar el precio')).toBeInTheDocument(),
    );
  });

  it('cambiar la key remonta la sección y descarta el precio de la carta anterior', async () => {
    /*
     * La ficha monta `CardPriceSection` con `key={card.id}`, así que navegar de
     * una carta a otra no actualiza el componente: lo desmonta y monta otro. Es
     * lo que impide que la cifra de la carta anterior quede en pantalla mientras
     * llega la nueva, porque `prices` es estado del componente y el `cardId` solo
     * llega como prop.
     *
     * Si alguien saca esa `key` de `app/(app)/carta/[id]/page.tsx`, este test
     * sigue verde (el `rerender` también cambiaría el estado por otros caminos),
     * pero la ficha vuelve a mostrar el precio viejo un frame: por eso lo que
     * hay que mirar al tocar la `key` es el componente de la página, no este
     * archivo.
     */
    getCardPrices.mockImplementation((...args: unknown[]) => {
      const id = args[0] as string;
      return Promise.resolve(pricesPayload([price({ cardId: id, market: id === 'a' ? 10 : 99 })]));
    });

    const { rerender } = render(<CardPriceSection key="a" cardId="a" />);
    await waitFor(() => expect(screen.getByText('US$ 10.00')).toBeInTheDocument());

    rerender(<CardPriceSection key="b" cardId="b" />);

    // La cifra vieja no puede quedar un frame en pantalla.
    expect(screen.queryByText('US$ 10.00')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('US$ 99.00')).toBeInTheDocument());
  });
});
