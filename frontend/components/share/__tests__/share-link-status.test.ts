import { describe, expect, it } from 'vitest';

import type { ShareLink } from '@/lib/api/share';
import { countActiveShareLinks, shareLinkStatus } from '../share-link-status';

function link(isActive: boolean, expiresAt: string | null): ShareLink {
  return {
    id: 'share-1',
    slug: 'public-slug',
    url: 'https://example.test/share/public-slug',
    collectionId: null,
    collectionName: null,
    isActive,
    createdAt: '2026-10-01T00:00:00.000Z',
    viewCount: 0,
    expiresAt,
  };
}

describe('shareLinkStatus', () => {
  const now = Date.parse('2026-10-07T12:00:00.000Z');

  it.each([
    { active: true, expiry: null, state: 'active', action: 'Desactivar' },
    { active: false, expiry: null, state: 'disabled', action: 'Activar' },
    { active: true, expiry: '2026-10-07T11:59:59.000Z', state: 'expired', action: null },
    { active: false, expiry: '2026-10-07T11:59:59.000Z', state: 'expired', action: null },
  ] as const)('resuelve activo=$active expiry=$expiry', ({ active, expiry, state, action }) => {
    const result = shareLinkStatus(link(active, expiry), { now });
    expect(result.state).toBe(state);
    expect(result.toggleLabel).toBe(action);
    expect(result.canToggle).toBe(action !== null);
  });

  it('no trata vencimiento inválido como vencido', () => {
    expect(shareLinkStatus(link(true, 'ayer'), { now }).state).toBe('active');
  });

  it('no cuenta como activo un enlace con expiresAt pasado aunque isActive siga true', () => {
    expect(countActiveShareLinks([
      link(true, null),
      link(false, null),
      link(true, '2026-10-07T11:59:59.000Z'),
    ], now)).toBe(1);
  });
});
