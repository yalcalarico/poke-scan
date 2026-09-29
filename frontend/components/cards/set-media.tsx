'use client';

import { useState, type ReactNode } from 'react';
import Image from 'next/image';

import { cn } from '@/lib/cn';

/**
 * Hosts que `next.config.ts` acepta en `images.remotePatterns`.
 *
 * Duplicado a propósito: importar `next.config.ts` desde un Client Component
 * metería la config entera en el bundle del navegador, y el allowlist de dos
 * hosts es más barato de mantener acá que con una importación cruzada. Si se
 * agrega un host hay que tocar los dos lugares — es la deuda known de este
 * archivo y está anotada en `next.config.ts`.
 */
const ALLOWED_HOSTS = new Set(['images.pokemontcg.io', 'images.scrydex.com']);

/**
 * `SetDto.logoUrl` y `SetDto.symbolUrl` vienen textualmente de la fuente
 * (pokemontcg.io hoy, TCGdex/scrydex después) y el backend los espeja sin
 * validarlos. `next/image` **lanza** cuando el host no está en
 * `remotePatterns`, y eso en el server es un error de render, no un 404: sin
 * este chequeo, un set con el logo en otro host tumba la pantalla entera.
 *
 * Con el host permitido queda un segundo problema: la URL puede estar bien formada
 * y el recurso no existir (algunos sets no tienen logo), y eso sí es un error de
 * red, que se maneja con `onError` y un fallback de texto.
 */
function parseRemoteImage(src: string): URL | null {
  try {
    const url = new URL(src);
    if (url.protocol !== 'https:') return null;
    if (!ALLOWED_HOSTS.has(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

/** El optimizador de Next no sirve SVG: sin esto el `<img>` apunta a un 400. */
function isVector(url: URL): boolean {
  return url.pathname.toLowerCase().endsWith('.svg');
}

interface RemoteSetImageProps {
  src: string | null;
  /** Se muestra cuando la imagen no se puede usar. */
  fallback: ReactNode;
  alt: string;
  width: number;
  height: number;
  className?: string;
}

/**
 * El envoltura de una imagen remota del set con degradación a texto.
 *
 * **Es client component y no por conveniencia sino por necesidad**: el
 * `onError` de `next/image` y el `useState` que recuerda que ya falló son los
 * dos caminos que hacen que un recurso 404 no tumbe la pantalla. No hay forma de
 * tenerlos en el server.
 *
 * **Vive en `cards/` y no en la pantalla de carta**: la decisión de qué hacer
 * con un host desconocido es de *datos del set*, no de una ruta, y la usan tres
 * pantallas —la ficha, el progreso por set y el binder—. Importar desde `app/`
 * es al revés de lo que hace Next: queda atado al árbol de rutas y se rompe en
 * cuanto la pantalla se mueve.
 */
function RemoteSetImage({ src, fallback, alt, width, height, className }: RemoteSetImageProps) {
  const [failed, setFailed] = useState(false);
  const url = src ? parseRemoteImage(src) : null;

  if (!url || failed) {
    return <span className={cn('block', className)}>{fallback}</span>;
  }

  return (
    <Image
      src={url.toString()}
      alt={alt}
      width={width}
      height={height}
      unoptimized={isVector(url)}
      onError={() => setFailed(true)}
      className={cn('h-auto w-auto object-contain', className)}
      /**
       * Los call site ajustan el logo con `max-w-*`, y `next/image` avisa con
       * un error de consola cuando el CSS cambia una dimensión y no la otra:
       * no puede saber si el `max-w` viene con un `h-auto` que compensa o con
       * un alto fijo que deforma el logo. Declarar `height: auto` inline le
       * dice que sí, y de paso fija la relación de aspecto aunque un día
       * alguien saque el `h-auto` de las clases.
       */
      style={{ height: 'auto' }}
    />
  );
}

export interface SetLogoProps {
  logoUrl: string | null;
  /** Nombre del set: es el fallback cuando el logo no se puede mostrar. */
  name: string;
  className?: string;
}

/**
 * El logo oficial del set, debajo de la imagen de la carta. `SetDto.logoUrl` es
 * un campo del contrato que casi no se usaba.
 */
export function SetLogo({ logoUrl, name, className }: SetLogoProps) {
  return (
    <RemoteSetImage
      src={logoUrl}
      alt={`Logo del set ${name}`}
      width={160}
      height={40}
      className={className}
      fallback={<span className="text-body-strong text-secondary">{name}</span>}
    />
  );
}

export interface SetSymbolProps {
  symbolUrl: string | null;
  name: string;
  className?: string;
}

/** El símbolo del set, en la fila de datos. `SetDto.symbolUrl`, el otro campo muerto. */
export function SetSymbol({ symbolUrl, name, className }: SetSymbolProps) {
  return (
    <RemoteSetImage
      src={symbolUrl}
      alt={`Símbolo del set ${name}`}
      width={28}
      height={28}
      className={cn('inline-block align-middle', className)}
      fallback={<span className="text-body text-tertiary">—</span>}
    />
  );
}
