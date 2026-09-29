import type { BadgeTone } from '@/components/ui';
import type { ShareLink } from '@/lib/api/share';

/**
 * Los cuatro estados de un enlace público, y por qué son cuatro.
 *
 * El bug que se arregla acá: antes `shareLinkStatus()` devolvía
 * `"Revocado"` para **cualquier** `isActive === false`. Como el backend
 * implementa "desactivar" y "revocar" con la **misma** columna
 * (`share_links.isActive`), un enlace que el usuario apagó hace un rato y uno
 * que revocó para siempre se veían exactamente igual, con la misma etiqueta y
 * sin ninguna acción posible. El usuario no podía saber si el link era
 * recuperable.
 *
 * El contrato no alcanza para arreglarlo del lado del backend (ver
 * `REVOKED_TRACKING_NOTE` más abajo), así que la distinción se modela acá con
 * las cuatro consecuencias que el usuario puede observar:
 *
 * | Estado | ¿El link funciona? | ¿Se recupera? | Acción de estado |
 * |---|---|---|---|
 * | `active` | sí | sí | Desactivar |
 * | `disabled` | no | **sí**, con un clic | Activar |
 * | `expired` | no | no, sin tocar la fecha | ninguna |
 * | `revoked` | no | **no**, hay que crear otro | ninguna |
 */
export type ShareLinkState = 'active' | 'disabled' | 'expired' | 'revoked';

export interface ShareLinkStatus {
  state: ShareLinkState;
  /** Chip de 20 px (§8.5). */
  label: string;
  tone: BadgeTone;
  /**
   * Una línea que responde la única pregunta que importa: ¿puedo recuperarlo?
   * Se muestra siempre, en los cuatro estados. Sin esto el usuario tiene que
   * adivinar desde el color del chip.
   */
  description: string;
  /** Hay un `PATCH { isActive }` que lo cambia sin romper nada. */
  canToggle: boolean;
  toggleLabel: 'Activar' | 'Desactivar' | null;
  /** Irreversible: solo tiene sentido mientras el link todavía existe. */
  canRevoke: boolean;
  /** Copiar un link revocado no sirve de nada. */
  canCopy: boolean;
}

const STATUS: Record<ShareLinkState, Omit<ShareLinkStatus, 'toggleLabel'>> = {
  active: {
    state: 'active',
    label: 'Activo',
    tone: 'positive',
    description: 'Cualquiera con el link puede ver tu colección.',
    canToggle: true,
    canRevoke: true,
    canCopy: true,
  },
  disabled: {
    state: 'disabled',
    label: 'Desactivado',
    tone: 'neutral',
    // La diferencia con `revoked` es toda esta línea: se puede volver a
    // prender. Por eso el tono es `neutral` y no `negative`.
    description: 'No funciona, pero podés volver a activarlo cuando quieras.',
    canToggle: true,
    canRevoke: true,
    canCopy: true,
  },
  expired: {
    state: 'expired',
    label: 'Vencido',
    // `warning` y no `error` (§2.3): es "esto está viejo", y el usuario igual
    // puede hacer algo (matarlo y generar otro).
    tone: 'warning',
    description: 'Pasó la fecha que le pusiste. El link no vuelve solo.',
    canToggle: false,
    canRevoke: true,
    canCopy: true,
  },
  revoked: {
    state: 'revoked',
    label: 'Revocado',
    // `negative`: es terminal. No es un dato viejo, es algo que ya no existe
    // para siempre, y por eso no se le ofrece ninguna acción que prometa volver.
    tone: 'negative',
    description: 'No se puede recuperar. Si lo necesitás, creá un enlace nuevo.',
    canToggle: false,
    canRevoke: false,
    canCopy: false,
  },
};

/**
 * **Deuda conocida, y es una deuda de contrato.**
 *
 * `revokeShareLink()` (`DELETE /share/:id`) y "desactivar"
 * (`PATCH /share/:id { isActive: false }`) terminan en la misma columna
 * `share_links.isActive`, y `ShareLinkDto` no trae ningún campo que las
 * distinga. El modelo de Prisma ya tiene el precedente de lo que hay que hacer:
 * `RefreshToken.revokedAt` (nullable) marca "esto se tiró, no se resurrecta".
 *
 * Lo que se hace mientras tanto: el consumidor le pasa `revoked: true` a
 * `shareLinkStatus()` para los enlaces que *él mismo* acaba de revocar, que es
 * el 100 % de los casos en que la distinción importa (el usuario la está
 * mirando en el mismo gesto). El resto de la lista, y después de recargar, un
 * enlace revocado degrada a `disabled`: el copy sigue siendo honesto —dice que
 * lo podés volver a activar y no miente— pero ofrece una acción que el backend
 * va a honrar de verdad (reactivarlo vuelve a prender el mismo slug).
 *
/**
 * El arreglo real es `revokedAt: DateTime?` en `ShareLink` + el campo en
 * `ShareLinkDto`, y es un cambio de backend: no se hace acá.
 */

export interface ShareLinkStatusOptions {
  /**
   * `true` cuando el usuario revocó este enlace en esta sesión. Nadie más puede
   * saberlo con el contrato actual.
   */
  revoked?: boolean;
  now?: number;
}

/** `expiresAt` vencido. Una fecha inválida no vence: no se puede parsear, no se inventa. */
export function isShareLinkExpired(link: ShareLink, now: number = Date.now()): boolean {
  if (!link.expiresAt) return false;
  const timestamp = new Date(link.expiresAt).getTime();
  if (Number.isNaN(timestamp)) return false;
  return timestamp <= now;
}

export function shareLinkStatus(
  link: ShareLink,
  options: ShareLinkStatusOptions = {},
): ShareLinkStatus {
  const state: ShareLinkState = options.revoked
    ? 'revoked'
    : !link.isActive
      ? 'disabled'
      : isShareLinkExpired(link, options.now)
        ? 'expired'
        : 'active';

  const base = STATUS[state];

  return {
    ...base,
    toggleLabel: state === 'active' ? 'Desactivar' : state === 'disabled' ? 'Activar' : null,
  };
}
