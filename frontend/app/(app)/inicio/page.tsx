import type { Metadata } from 'next';

import { AppMark } from '@/components/brand';
import { ScreenContainer } from '@/components/layout/screen-container';
import {
  AppPreview,
  FeatureGrid,
  HomeCta,
  ScanSessionResume,
  fetchPreviewCards,
} from '@/components/home';
import { InstallCta } from '@/components/share';
import { cn } from '@/lib/cn';

export const metadata: Metadata = {
  title: 'Inicio',
  description:
    'Continuá escaneando, buscá cartas y revisá tus colecciones Pokémon.',
  robots: { index: false, follow: false },
};

const HERO_TITLE = 'Escaneá tus cartas y mirá su valor.';

/**
 * `/inicio` — el inicio de la app instalada. Server Component.
 *
 * ## Por qué server y no client
 *
 * Toda la pantalla es HTML estático: hero, features, footer y el mock. La única
 * parte que necesita el navegador es el CTA, porque el CTA depende de la sesión y
 * la sesión vive en `sessionStorage` (docs/routes.md: "no se puede proteger una
 * ruta en el server"). Esa parte es `HomeCta`, un client component chico; el
 * resto de la página no entra al bundle de cliente.
 *
 * ## La `BottomNav` sí va acá, y es lo correcto
 *
 * La landing pública `/` vive fuera de `(app)`. El `start_url` de la PWA apunta
 * acá para que instalar PokéScan abra el producto, no la página de marketing.
 * Esta ruta hereda el `BottomNav`; Inicio más las cuatro secciones —buscar,
 * escanear, colecciones y ajustes— son el producto y no se sacan.
 *
 * ## El mock
 *
 * Son cartas reales del catálogo, pedidas al backend con `fetchPreviewCards`. El
 * endpoint lee la tabla local, así que no toca el rate limit de pokemontcg.io, y
 * si falla la home se renderiza sin mock en vez de caer en el `error.tsx`.
 */
export default async function HomePage() {
  const previewCards = await fetchPreviewCards();

  return (
    <ScreenContainer labelledBy="home-title" className="flex flex-col gap-10 sm:gap-12">
      <section
        aria-labelledby="home-title"
        className={cn(
          'flex flex-col gap-8',
          // La segunda columna solo existe si hay mock: una grilla de dos columnas
          // con un hueco vacío se lee como que falta algo.
          previewCards.length > 0 && 'lg:grid lg:grid-cols-2 lg:items-center lg:gap-10',
        )}
      >
        <div className="flex flex-col items-center gap-5 text-center lg:items-start lg:text-left">
          <AppMark size={48} className="shadow-sm" />

          <h1 id="home-title" className="text-display text-primary">
            {HERO_TITLE}
          </h1>

          <p className="max-w-md text-body text-secondary">
            Apuntá la cámara, y PokéScan identifica la carta, te dice cuánto vale y la suma a tu
            colección.
          </p>

          <HomeCta />
        </div>

        {previewCards.length > 0 ? <AppPreview cards={previewCards} /> : null}
      </section>

      {/*
        La fila de "Continuás donde quedaste", arriba de las features.

        ## Por qué entre el hero y las features y no arriba del todo

        El hero es la promesa de la app para alguien que **no** conocela todavía,
        y arriba del todo es donde tiene que estar para eso. La fila es para
        alguien que ya la usó y dejó algo a medias: es un segundo mensaje, y va
        después de la primera impresión y antes de las features, que son lo
        último que se lee.

        ## Por qué no tiene `mt` propio

        El `flex flex-col gap-10` del `ScreenContainer` ya pone 40 px entre
        bloques, y el JSDOC de §4.1 dice que el ritmo vertical se maneja con
        `gap-*` en el contenedor y nunca con `space-y-*` ni con `mt` en un hijo.
        Agregar un `mt` acá pelearía con ese `gap`.
      */}
      <ScanSessionResume />

      <FeatureGrid />

      {/*
        El footer va **dentro** del `<main>`: es la única tierra de la pantalla y
        el landmark de contenido ya está. Un `<footer>` de página hermano
        agregaría un landmark que no contiene nada (§11: los landmarks existen
        para navegar, no para decorar). Mismo criterio de copy que el footer de
        `/share/[slug]`.

        **No lleva CTA de sesión**: "Crear cuenta" es la conversión del invitado,
        pero mostrársela a alguien que ya tiene cuenta es un botón que no hace
        falta, y hacerlo bien exigiría otro client component en el server. Los
        accesos de la pantalla son los del hero; abajo va lo que no depende de la
        sesión, que es instalar la PWA.
      */}
      <footer className="flex flex-col items-center gap-5 border-t border-line-subtle pt-8">
        <p className="text-caption text-tertiary">
          Escaneá, coleccioná y compartí con{' '}
          <span className="text-body-strong text-primary">PokéScan</span>.
        </p>

        {/*
          La CTA de instalar la PWA, en vez de un link a una política de
          privacidad: `/privacidad` no existe en ninguna de las dos versiones, y
          una URL inventada es un 404 en el lugar donde la app pide confianza.
        */}
        <InstallCta />
      </footer>
    </ScreenContainer>
  );
}
