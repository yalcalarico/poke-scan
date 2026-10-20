# Comparación de referencias e históricos

La interfaz consume los endpoints locales `GET /cards/:id/comparison?variant=normal&days=30`, `GET /collections/:id/comparison?days=30` y `GET /portfolio/comparison?days=30`. Los contratos espejo están en `types/api.ts`; `lib/api/comparison.ts` valida la respuesta completa antes de exponerla a los componentes.

En la ficha, la variante es fija y se elige entre las variantes canónicas. Los períodos disponibles son 7, 30, 90 y 365 días. La comparación presenta dos fuentes de una misma referencia de mercado: ambas informan TCGplayer en USD, así que no representa consenso ni fuentes de mercado independientes. La referencia activa y el hero de precio actual mantienen su flujo propio.

Cada punto de carta conserva su fecha diaria, `fetchedAt` y `feedPublishedAt`; `upstreamUpdatedAt` permanece desconocido. La gráfica usa fechas UTC, permite el cero como importe conocido y corta líneas ante puntos nulos o días ausentes. Colecciones y portafolio muestran valor, copias con/sin precio, frescura y cortes de composición. El historial se mantiene en USD y no representa ganancia ni una serie histórica en ARS.

La escala vertical se ajusta al rango observado con margen y muestra tres referencias de precio; no fuerza el cero cuando todos los precios son positivos. El aviso de escala permanece visible. Si faltan días, el gráfico explica los cortes; con menos de tres observaciones avisa que todavía no hay datos suficientes para mostrar subidas y bajadas. No dibuja picos ni une fechas sin información.

Los paneles cargan y fallan de forma independiente al contenido principal. Reintentar vuelve a usar la API local; no inicia una consulta externa directa desde el navegador.
