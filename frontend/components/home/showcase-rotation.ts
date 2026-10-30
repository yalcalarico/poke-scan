const visits = new Map<string, number>();
/** La misma carga/reintento conserva su turno; otra navegación no rota cartas. */
export function showcaseVisit(userId: string): number {
  const existing = visits.get(userId);
  if (existing !== undefined) return existing;
  let turn = 0;
  try {
    const key = `pcs.showcase.visit.${userId}`;
    const raw = Number(sessionStorage.getItem(key) ?? "0");
    turn = Number.isSafeInteger(raw) && raw >= 0 && raw < 1_000_000 ? raw : 0;
    sessionStorage.setItem(key, String((turn + 1) % 1_000_000));
  } catch {
    /* Sin storage la vitrina conserva sus primeras cartas. */
  }
  visits.set(userId, turn);
  return turn;
}
export function rotateShowcase<T>(cards: readonly T[], turn: number): T[] {
  if (!cards.length) return [];
  return Array.from(
    { length: Math.min(3, cards.length) },
    (_, i) => cards[(turn + i) % cards.length],
  );
}
