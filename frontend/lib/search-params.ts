/** Aplica un cambio de búsqueda sin descartar los parámetros que no tocó. */
export function applySearchParamChanges(
  current: string,
  changes: Readonly<Record<string, string | null>>,
): string {
  const params = new URLSearchParams(current);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === '') params.delete(key);
    else params.set(key, value);
  }
  return params.toString();
}
