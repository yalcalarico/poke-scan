import { getScannerConfig } from '@/lib/api/identify';
import type { ScannerConfigDto } from '@/types/api';

/** Un recurso opcional del experimento no debe impedir escanear una foto. */
export function createScannerConfigLoader(
  progressive: boolean,
  fetchConfig: () => Promise<ScannerConfigDto> = getScannerConfig,
): () => Promise<ScannerConfigDto> {
  let pending: Promise<ScannerConfigDto> | null = null;
  return async () => {
    if (!progressive) return { setCodes: [], setNames: [] };
    if (!pending) {
      // La microtask convierte también un fallo sincrónico del módulo en un rechazo recuperable.
      pending = Promise.resolve().then(fetchConfig).catch(() => {
        pending = null;
        return { setCodes: [], setNames: [] };
      });
    }
    return pending;
  };
}
