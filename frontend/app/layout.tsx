import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { THEME_SCRIPT } from "@/lib/theme-script";
import { PwaServiceWorker } from "./pwa-sw-register";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Un service worker de una instalación de producción puede seguir controlando
 * localhost al volver a `next dev` y servir chunks CacheFirst viejos. Se limpia
 * solo la registración de PokéScan y sus caches; el `localStorage` del usuario
 * (incluidas sus lecturas recordadas) queda intacto.
 */
const DEV_SERVICE_WORKER_CLEANUP = `
(() => {
  if (!('serviceWorker' in navigator)) return;

  const reloadKey = 'pokescan:dev:sw-cleaned';
  if (sessionStorage.getItem(reloadKey)) {
    sessionStorage.removeItem(reloadKey);
    return;
  }

  void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
    const appRegistrations = registrations.filter((registration) =>
      [registration.installing, registration.waiting, registration.active].some((worker) => {
        if (!worker) return false;
        const scriptUrl = new URL(worker.scriptURL);
        return scriptUrl.origin === location.origin && scriptUrl.pathname === '/sw.js';
      }),
    );
    if (appRegistrations.length === 0) return;

    await Promise.all(appRegistrations.map((registration) => registration.unregister()));
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith('pokescan-'))
        .map((name) => caches.delete(name)),
    );
    sessionStorage.setItem(reloadKey, '1');
    location.reload();
  }).catch((error) => console.warn('[pwa] no se pudo limpiar el service worker de desarrollo', error));
})();
`;

export const metadata: Metadata = {
  /**
   * `template` y no un título fijo: cada pantalla pone el suyo y el nombre de
   * la app queda siempre al final ("Charizard · PokéScan"). Sin esto, todas
   * caen en el título global y el título de pestaña no dice dónde estás.
   */
  title: {
    default: "PokéScan",
    template: "%s · PokéScan",
  },
  description:
    "Escaneá tus cartas Pokémon, mirá su valor y compartí tu colección",
  applicationName: "PokéScan",
  manifest: "/manifest.json",
  /**
   * Sin `metadataBase`, Next no puede resolver las URLs absolutas de las Open
   * Graph images, y las dos rutas que más las necesitan —la ficha de una carta
   * y una colección compartida— son justamente las que se comparten por
   * WhatsApp o iMessage. Sin esto, el unfurl de un link no trae imagen.
   *
   * Es el dominio de despliegue, y no se puede derivar del request en el
   * layout raíz sin volverlo dinámico (y con eso se pierde el prerender).
   */
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://pokescan.app",
  ),
  appleWebApp: {
    capable: true,
    title: "PokéScan",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: "PokéScan",
    locale: "es_AR",
  },
  twitter: {
    card: "summary_large_image",
  },
  // Next genera los <link rel="manifest">, <link rel="icon"> y
  // <link rel="apple-touch-icon"> a partir de `manifest` + `icons`.
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  // El tema lo resuelve la clase `dark` del script anti-flash, así que el
  // `themeColor` se declara para los dos: con un color fijo, la barra del
  // navegador queda de un tema mientras la app es del otro.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F4F6" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0B0F" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="es-AR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Anti-flash del tema: tiene que correr antes de que el navegador
            pinte, y por eso es un script inline y no un efecto de React. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {process.env.NODE_ENV !== "production" ? (
          <Script id="pokescan-dev-service-worker-cleanup" strategy="beforeInteractive">
            {DEV_SERVICE_WORKER_CLEANUP}
          </Script>
        ) : null}
      </head>
      {/*
        El `<body>` no lleva `bg-*`: el fondo lo pone `globals.css` con el
        token `--canvas`, que es lo único que puede acertar en los dos temas a
        la vez. Con clases de Tailwind habría que duplicar la regla con `dark:`
        y el overscroll de iOS quedaría del color del tema anterior.
      */}
      <body className="flex min-h-full flex-col">
        <Providers>
          {/*
            Skip link. Va acá y no en los layouts de rama: con la
            `BottomNav` fija y 20 cartas en grilla, el teclado no puede tener
            que atravesar diez controles para llegar al contenido.
          */}
          <a
            href="#contenido"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-offline focus:rounded-control focus:bg-surface focus:px-4 focus:py-2 focus:text-body-strong focus:shadow-lg"
          >
            Saltar al contenido
          </a>

          {children}
        </Providers>
        <PwaServiceWorker />
      </body>
    </html>
  );
}
