import { describe, expect, it } from 'vitest';

import type { ShareLink } from '@/lib/api/share';
import { markShareLinkInactive, patchShareLink, prependShareLink, visibleShareLinks } from '../share-links-state';

function link(isActive: boolean): ShareLink {
  return {
    id: 'created-link',
    slug: 'slug',
    url: 'https://example.test/share/slug',
    collectionId: null,
    collectionName: null,
    isActive,
    createdAt: '2026-10-01T00:00:00.000Z',
    viewCount: 0,
    expiresAt: null,
  };
}

describe('overlay de enlaces compartidos', () => {
  it('conserva crear → desactivar/DELETE → activar sin recargar', () => {
    let overlay = prependShareLink({ prepended: [], patched: new Map() }, link(true));
    expect(visibleShareLinks([], overlay)[0]?.isActive).toBe(true);

    overlay = markShareLinkInactive([], overlay, 'created-link');
    expect(visibleShareLinks([], overlay)[0]?.isActive).toBe(false);

    overlay = patchShareLink(overlay, { ...link(false), isActive: true });
    expect(visibleShareLinks([], overlay)[0]?.isActive).toBe(true);
  });

  it('la última actualización también cubre enlaces creados que ya llegaron a base', () => {
    const overlay = prependShareLink({ prepended: [], patched: new Map() }, link(true));
    const updated = patchShareLink(overlay, { ...link(true), isActive: false });
    expect(visibleShareLinks([link(true)], updated).filter((entry) => entry.id === 'created-link'))
      .toEqual([{ ...link(true), isActive: false }]);
  });
});
