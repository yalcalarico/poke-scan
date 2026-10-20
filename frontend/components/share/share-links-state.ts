import type { ShareLink } from '@/lib/api/share';

export interface LinkOverlay {
  prepended: readonly ShareLink[];
  patched: ReadonlyMap<string, ShareLink>;
}

export const EMPTY_LINK_OVERLAY: LinkOverlay = { prepended: [], patched: new Map() };

export function visibleShareLinks(base: readonly ShareLink[], overlay: LinkOverlay): ShareLink[] {
  const seen = new Set<string>();
  return [...overlay.prepended, ...base]
    .filter((link) => {
      if (seen.has(link.id)) return false;
      seen.add(link.id);
      return true;
    })
    .map((link) => overlay.patched.get(link.id) ?? link);
}

export function prependShareLink(overlay: LinkOverlay, link: ShareLink): LinkOverlay {
  return {
    ...overlay,
    prepended: [link, ...overlay.prepended.filter((entry) => entry.id !== link.id)],
  };
}

export function patchShareLink(overlay: LinkOverlay, link: ShareLink): LinkOverlay {
  return { ...overlay, patched: new Map(overlay.patched).set(link.id, link) };
}

export function markShareLinkInactive(
  base: readonly ShareLink[],
  overlay: LinkOverlay,
  id: string,
): LinkOverlay {
  const source = overlay.patched.get(id)
    ?? overlay.prepended.find((link) => link.id === id)
    ?? base.find((link) => link.id === id);
  return source ? patchShareLink(overlay, { ...source, isActive: false }) : overlay;
}
