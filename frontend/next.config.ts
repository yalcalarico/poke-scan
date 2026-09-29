import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Implica el server de produccion auto-contenido que usa el Dockerfile.
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.pokemontcg.io", pathname: "/**" },
      { protocol: "https", hostname: "images.scrydex.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;
