import type { IdentifyRequestDto, IdentifyResponseDto } from '@/types/api';

import { apiFetch } from './api-client';

export const IDENTIFY_PATH = '/cards/identify';

export const IDENTIFY_LIMIT = 8;

/**
 * Ranquea candidatos del catálogo a partir de las líneas crudas del OCR.
 * El backend hace el fuzzy matching, así que no hace falta que el cliente
 * adivine el nombre: `lines` es la señal principal, `name`/`number`/`setHint`
 * solo suman bonus.
 */
export async function identifyCard(
  payload: IdentifyRequestDto,
  signal?: AbortSignal,
): Promise<IdentifyResponseDto> {
  return apiFetch<IdentifyResponseDto>(IDENTIFY_PATH, {
    method: 'POST',
    body: payload,
    signal,
  });
}
