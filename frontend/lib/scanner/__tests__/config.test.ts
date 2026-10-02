import { describe, expect, it, vi } from 'vitest';
import { createScannerConfigLoader } from '../config';
import { getScannerConfig } from '@/lib/api/identify';
import { getScannerConfig as barrelExport } from '@/lib/api';

describe('configuración opcional del escáner', () => {
  it('expone la misma función desde el módulo y el barrel', () => {
    expect(typeof getScannerConfig).toBe('function');
    expect(barrelExport).toBe(getScannerConfig);
  });
  it('no carga el recurso experimental cuando está apagado', async () => {
    const fetcher = vi.fn(() => { throw new TypeError('getScannerConfig is not a function'); });
    const load = createScannerConfigLoader(false, fetcher);
    expect(await load()).toEqual({ setCodes: [], setNames: [] });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('recupera fallos sincrónicos y permite volver a intentar', async () => {
    const fetcher = vi.fn().mockImplementationOnce(() => { throw new TypeError('undefined'); })
      .mockResolvedValue({ setCodes: ['30C'], setNames: ['30th Celebration'] });
    const load = createScannerConfigLoader(true, fetcher);
    expect(await load()).toEqual({ setCodes: [], setNames: [] });
    expect((await load()).setCodes).toEqual(['30C']);
  });
  it('comparte requests simultáneos y recupera errores de red', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ setCodes: ['PAR'], setNames: ['Paradox Rift'] });
    const load = createScannerConfigLoader(true, fetcher);
    await Promise.all([load(), load()]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await load()).setCodes).toEqual(['PAR']);
    await load();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
