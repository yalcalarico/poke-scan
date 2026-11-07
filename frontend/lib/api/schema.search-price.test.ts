import { describe, expect, it } from 'vitest';
import { toCardDto, toCardList } from './schema';

const card = { id: 'test-price', name: 'Carta sintética', setId: 'test-set' };

describe('precio opcional del catálogo', () => {
  it.each([12.5, 0, null])('conserva %s desde la página de búsqueda', (marketPriceUsd) => {
    expect(toCardList({ data: [{ ...card, marketPriceUsd }] })[0]).toMatchObject({ marketPriceUsd });
  });
  it.each(['12.5', NaN, Infinity])('sanea %s sin inventar un precio', (marketPriceUsd) => {
    expect(toCardDto({ ...card, marketPriceUsd })).toMatchObject({ marketPriceUsd: null });
  });
  it('preserva el contrato sin precio de otros consumidores', () => {
    expect(toCardDto(card)).not.toHaveProperty('marketPriceUsd');
  });
});
