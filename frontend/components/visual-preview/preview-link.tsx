'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';
import { useVisualPreview } from './visual-preview';

/** Solo propaga la vista a destinos de la misma app. Conserva filtros y fragmento. */
export function previewHref(href: string, active: boolean | undefined): string {
  if (active === undefined || !href.startsWith('/') || href.startsWith('//')) return href;
  const url = new URL(href, 'https://pokescan.local');
  if (url.origin !== 'https://pokescan.local') return href;
  if (!active) {
    if (url.pathname === '/buscar-v2') url.pathname = '/buscar';
    url.searchParams.set('visual', 'classic');
  } else if (url.pathname === '/buscar') { url.pathname = '/buscar-v2'; url.searchParams.delete('visual'); }
  else if (url.pathname !== '/buscar-v2') url.searchParams.set('visual', 'v2');
  return `${url.pathname}${url.search}${url.hash}`;
}
export function PreviewLink({ href, ...props }: Omit<ComponentProps<typeof Link>, 'href'> & { href: string }) {
  const active = useVisualPreview();
  return <Link href={previewHref(href, active)} {...props} />;
}
