/** El regreso de una ficha solo puede apuntar a uno de los catálogos locales. */
export function catalogReturnHref(value: string | string[] | undefined, preview = false): string {
  const fallback = preview ? '/buscar-v2' : '/buscar';
  if (typeof value !== 'string' || !/^\/buscar(?:-v2)?(?:\?|$)/.test(value)) return fallback;
  try {
    const url = new URL(value, 'https://pokescan.local');
    if (url.origin !== 'https://pokescan.local' || !['/buscar', '/buscar-v2'].includes(url.pathname)) return fallback;
    return `${url.pathname}${url.search}`;
  } catch { return fallback; }
}
