/** V2 es la apariencia por defecto; la clásica se pide explícitamente en la URL. */
export function isVisualVersionEnabled(value: string | null): boolean {
  return value !== 'classic';
}

export function visualVersionHref(pathname: string, query: string, enabled: boolean): string {
  const params = new URLSearchParams(query);
  let path = pathname;
  if (pathname === '/buscar' || pathname === '/buscar-v2') {
    path = enabled ? '/buscar-v2' : '/buscar';
    if (enabled) params.delete('visual'); else params.set('visual', 'classic');
  } else if (enabled) params.set('visual', 'v2');
  else params.set('visual', 'classic');
  const search = params.toString();
  return `${path}${search ? `?${search}` : ''}`;
}
