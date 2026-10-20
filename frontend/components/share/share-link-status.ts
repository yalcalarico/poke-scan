import type { BadgeTone } from '@/components/ui';
import type { ShareLink } from '@/lib/api/share';

export type ShareLinkState = 'active' | 'disabled' | 'expired';

export interface ShareLinkStatus {
  state: ShareLinkState;
  label: string;
  tone: BadgeTone;
  description: string;
  canToggle: boolean;
  toggleLabel: 'Activar' | 'Desactivar' | null;
  canRevoke: boolean;
  canCopy: boolean;
}

export interface ShareLinkStatusOptions {
  now?: number;
}

export function isShareLinkExpired(link: ShareLink, now = Date.now()): boolean {
  if (!link.expiresAt) return false;
  const timestamp = new Date(link.expiresAt).getTime();
  return Number.isFinite(timestamp) && timestamp <= now;
}

export function shareLinkStatus(link: ShareLink, options: ShareLinkStatusOptions = {}): ShareLinkStatus {
  const expired = isShareLinkExpired(link, options.now);
  const state: ShareLinkState = expired ? 'expired' : link.isActive ? 'active' : 'disabled';
  const common = {
    canToggle: !expired,
    toggleLabel: (link.isActive ? 'Desactivar' : 'Activar') as 'Activar' | 'Desactivar',
    canRevoke: true,
    canCopy: !expired,
  };

  if (state === 'expired') {
    return {
      ...common,
      state,
      label: 'Vencido',
      tone: 'warning',
      description: 'Pasó la fecha de vencimiento. Podés crear otro enlace con una nueva fecha.',
      canToggle: false,
      toggleLabel: null,
    };
  }

  if (state === 'disabled') {
    return {
      ...common,
      state,
      label: 'Desactivado',
      tone: 'neutral',
      description: 'El enlace está apagado. Podés volver a activarlo mientras no haya vencido.',
    };
  }

  return {
    ...common,
    state,
    label: 'Activo',
    tone: 'positive',
    description: 'Cualquiera con el link puede ver tu colección.',
  };
}

export function countActiveShareLinks(links: readonly ShareLink[], now = Date.now()): number {
  return links.filter((link) => shareLinkStatus(link, { now }).state === 'active').length;
}

/** Un timeout por próximo vencimiento, sin polling ni solicitudes de datos. */
export function nextShareExpirationDelay(links: readonly ShareLink[], now = Date.now()): number | null {
  const timestamps = links.flatMap((link) => {
    const time = link.expiresAt ? Date.parse(link.expiresAt) : NaN;
    return Number.isFinite(time) && time > now ? [time] : [];
  });
  if (!timestamps.length) return null;
  return Math.min(2_147_483_647, Math.max(1, Math.min(...timestamps) - now + 1));
}
