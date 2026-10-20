const utcDay = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
});

/** El instante cacheado conserva hora y zona; SSR y browser no usan sus zonas locales. */
export function formatReferenceTime(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(iso)) return '—';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== (iso.includes('.') ? iso : iso.replace('Z', '.000Z'))) return '—';
  return `${utcDay.format(date)} · ${date.toISOString().slice(11, 23)} UTC`;
}

/** Los snapshots son días UTC, no medianoches convertidas al huso del visitante. */
export function formatObservedDay(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '—';
  const date = new Date(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) return '—';
  return utcDay.format(date);
}
