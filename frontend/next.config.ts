import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: process.env.DEV_LAN_IP ? [process.env.DEV_LAN_IP] : [],
  async rewrites() {
    // El celu usa HTTPS y el mismo origen; Next habla con la API local por HTTP.
    const target = process.env.NODE_ENV === "development" ? process.env.DEV_API_PROXY_TARGET : undefined;
    return target ? [{ source: "/api/:path*", destination: `${target}/:path*` }] : [];
  },
  // Implica el server de produccion auto-contenido que usa el Dockerfile.
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.pokemontcg.io", pathname: "/**" },
      { protocol: "https", hostname: "images.scrydex.com", pathname: "/**" },
      { protocol: "https", hostname: "static.tcgcollector.com", pathname: "/content/images/**", search: "" },
      { protocol: "https", hostname: "www.serebii.net", pathname: "/card/xypromos/68.jpg", search: "" },
    ],
    /**
     * AVIF primero, WebP de respaldo.
     *
     * Las cartas Pokémon sonfoil y gradiente: son el peor caso para JPEG, que
     * es lo que el optimizador servía por default. AVIF a la misma calidad
     * perceptiva pesa ~40 % menos que WebP en estas imágenes, y el formato se
     * negocia por el header `Accept`, así que un browser que no lo soporte
     * recibe WebP sin que el componente tenga que saber nada.
     *
     * El orden importa: `getSupportedMimeType` toma el **primer** formato de la
     * lista que el `Accept` del browser declara, así que AVIF tiene que ir
     * primero para ganarle al WebP en los browsers que soportan los dos.
     *
     * ## Esto NO toca el rate limit de pokemontcg.io
     *
     * `AGENTS.md` §3.1 limita los requests **a la API**, y esto no es ninguno: el
     * optimizador de Next transforma la imagen que ya se descargó y la cachea en
     * disco. El único costo es CPU del servidor en el primer request de cada
     * (url, ancho, calidad), que es el mismo costo que ya paga hoy con JPEG.
     */
    formats: ["image/avif", "image/webp"],
    /**
     * El default de Next 16 es `[75]`, así que **no** cambiarlo acá sería
     * dejarlo explícito. La lista tiene que estar declarada en cuanto alguien
     * pase un `quality` distinto: `get-img-props` avisa por consola y el
     * optimizador cae al default, o sea que un `quality={60}` silencioso
     * seguiría saliendo a 75.
     *
     * 75 es el número que ya usa toda la app (ningún `<Image>` pasa `quality`),
     * y bajarlo globalmente sería cambiar el aspecto de 500 imágenes de golpe
     * para ahorrar bytes que el problema no reporta como problema. Si alguna vez
     * hace falta, se agrega `60` **acá** y se pasa `quality={60}` solo donde se
     * midió que ayuda.
     */
    qualities: [75],
  },
};

export default nextConfig;
