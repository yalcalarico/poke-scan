/** El regreso de una ficha solo puede apuntar al catálogo local. */
export function catalogReturnHref(value: string | string[] | undefined): string {
  if (typeof value !== 'string' || !value.startsWith('/buscar?')) return '/buscar';
  const url = new URL(value, 'https://pokescan.local');
  if (url.origin !== 'https://pokescan.local' || url.pathname !== '/buscar') return '/buscar';
  return `/buscar${url.search}`;
}
