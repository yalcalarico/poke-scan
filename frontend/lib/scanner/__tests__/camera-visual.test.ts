import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recognizeCameraCard } from '../camera-visual';
const mocks = vi.hoisted(() => ({ visual: vi.fn(), prices: vi.fn() }));
vi.mock('@/lib/api/visual-identify', () => ({ identifyVisual: mocks.visual }));
vi.mock('@/lib/api/cards', () => ({ getCardPrices: mocks.prices }));
const card = { id: 'me55-59', name: 'Toxtricity', setId: 'me55', number: '59' };
describe('selección visual por defecto', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it('conserva el set del candidato #1 y consulta precio sólo para ese ID', async () => {
    mocks.visual.mockResolvedValue({ candidates: [{ card, similarity: 0.7 }, { card: { ...card, id: 'swsh8-108', setId: 'swsh8' }, similarity: 0.8 }] });
    mocks.prices.mockResolvedValue({ prices: [{ market: 1.5, variant: 'holofoil' }] });
    const signal = new AbortController().signal;
    const selected = await recognizeCameraCard('data:image/jpeg;base64,YQ==', signal);
    expect(selected?.card.id).toBe('me55-59');
    expect(selected?.prices?.[0].market).toBe(1.5);
    expect(mocks.prices).toHaveBeenCalledTimes(1);
    expect(mocks.prices.mock.calls[0][0]).toBe('me55-59');
  });
  it('no pierde la identidad cuando falta precio, y no crea entradas sin candidatos', async () => {
    mocks.visual.mockResolvedValue({ candidates: [{ card, similarity: 0.7 }] });
    mocks.prices.mockRejectedValue(new Error('Sin precio'));
    expect((await recognizeCameraCard('imagen', new AbortController().signal))?.card.id).toBe('me55-59');
    mocks.prices.mockClear();
    mocks.visual.mockResolvedValue({ candidates: [] });
    expect(await recognizeCameraCard('imagen', new AbortController().signal)).toBeNull();
    expect(mocks.prices).not.toHaveBeenCalled();
  });
});
