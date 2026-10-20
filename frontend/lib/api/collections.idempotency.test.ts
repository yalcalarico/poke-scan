import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addItem } from './collections';
import { apiFetch } from './api-client';

vi.mock('./api-client', () => ({ apiFetch: vi.fn(), buildQueryString: vi.fn() }));

describe('addItem — identidad del intento', () => {
  beforeEach(() => { vi.mocked(apiFetch).mockReset(); });

  it('reenvía el payload y la clave originales, sin generar una operación nueva', async () => {
    const payload = { cardId: 'base1-4', quantity: 2 };
    const key = '4b564c9d-2f7b-4ef7-ab5e-20f2f3d9b647';
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('respuesta perdida')).mockResolvedValueOnce({ quantity: 7 });
    await expect(addItem('destino', payload, key)).rejects.toThrow('respuesta perdida');
    await expect(addItem('destino', payload, key)).resolves.toMatchObject({ quantity: 7 });
    expect(apiFetch).toHaveBeenNthCalledWith(1, '/collections/destino/items', {
      method: 'POST', body: payload, headers: { 'Idempotency-Key': key },
    });
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/collections/destino/items', {
      method: 'POST', body: payload, headers: { 'Idempotency-Key': key },
    });
  });

  it('una clave vacía viaja para ser rechazada y no se convierte en un alta sin protección', async () => {
    await addItem('destino', { cardId: 'base1-4' }, '');
    expect(apiFetch).toHaveBeenCalledWith('/collections/destino/items', expect.objectContaining({ headers: { 'Idempotency-Key': '' } }));
  });

  it('mantiene llamadas antiguas sin header', async () => {
    await addItem('destino', { cardId: 'base1-4' });
    expect(apiFetch).toHaveBeenCalledWith('/collections/destino/items', { method: 'POST', body: { cardId: 'base1-4' } });
  });
});
