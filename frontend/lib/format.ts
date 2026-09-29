const EMPTY = '—';

export type SupportedCurrency = 'USD' | 'ARS';

/**
 * Pesos argentinos: 0 decimales y separador de miles `es-AR`, así que
 * 1.473.000 se lee `$1.473.000` (no `$1,473,000.00` ni notación corta).
 */
export function formatArs(value: number): string {
  return `$${value.toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    useGrouping: true,
  })}`;
}

export function formatPrice(
  value: number | null | undefined,
  currency: string = 'USD',
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;

  if (currency.toUpperCase() === 'ARS') return formatArs(value);

  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return EMPTY;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return EMPTY;
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return EMPTY;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return EMPTY;

  const diff = Date.now() - time;
  if (diff < MINUTE) return 'hace instantes';
  if (diff < HOUR) {
    const minutes = Math.floor(diff / MINUTE);
    return `hace ${minutes} min`;
  }
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return `hace ${hours} h`;
  }
  const days = Math.floor(diff / DAY);
  return days === 1 ? 'hace 1 día' : `hace ${days} días`;
}

export function formatCardNumber(number: string, setTotal: number | null | undefined): string {
  if (!setTotal) return number;
  return `${number} / ${setTotal}`;
}

export function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}
