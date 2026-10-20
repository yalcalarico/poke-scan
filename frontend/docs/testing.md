# Tests del frontend

Corré `pnpm --dir frontend run test` para Vitest. Los tests de lógica de imagen usan Node con `helpers/canvas-shim.ts`; los de componentes declaran jsdom y reciben los matchers y cleanup de `vitest.setup.ts`.

Para verificar cambios completos usá `pnpm run check` desde la raíz. Antes de los tests backend, detené el stack con `pnpm run stop` para que el worker de precios no compita con los specs.

## Escáner visual

- `camera-visual.test.ts`: elige el #1, conserva su set, consulta precio solo para su ID y tolera falta de precios.
- `scan-page-camera.test.tsx`: la cámara principal automática suma a la sesión y sigue abierta sin selector.
- `scan-page-gallery.test.tsx`: las fotos subidas usan DINOv2, seleccionan el #1 y cancelan respuestas obsoletas.
- `auto-visual.test.ts`: encuadre, estabilidad, bloqueo mientras está ocupado, intervalo y no repetición de la misma carta.
- `preprocess-canvas.test.ts`: detección, orientación y recorte, incluida carta vertical con arte apaisado.
- `visual-photo.test.ts`: la galería normaliza; una captura ya encuadrada conserva sus píxeles y orientación.
- `camera-crop.test.ts` y `card-frame.test.ts`: guía compartida y mapeo al video original.
- `mobile-camera.test.tsx`: cámara solo en teléfonos; escritorio conserva subida y búsqueda.
- `session-storage.test.ts` y `organize-sheet.test.tsx`: restauración, límites y guardado por lotes.

La identidad visual se valida además contra fotos y el índice real mediante `pnpm run scanner:evaluate` y la API autenticada. La cámara física y permisos de iPhone no se simulan en Node: hay que probarlos en el dispositivo.

## Alcance

La suite también cubre los componentes, cliente HTTP, rutas del service worker, hooks y utilidades existentes. `public/sw.js` purga cachés antiguas con su versión; el reconocimiento necesita conexión y no existe un motor del navegador offline. El smoke `pnpm run verify:app` usa HTTP real, no reemplaza una prueba de navegación y cámara en un navegador.

La recuperación de cuenta tiene pruebas focales en `lib/api/recovery-api.test.ts`
para el estado HTTP exacto, ausencia de bearer y falta de refresh/replay;
`lib/recovery/recovery-capture-script.test.ts` cubre el fragmento estricto,
`replaceState`, fail-closed, entrada cliente y pérdida al volver; y
`components/auth/recovery-experience.test.tsx` cubre StrictMode, envío único,
éxito y resultado incierto. `lib/api/session-generation.test.ts` prueba respuestas
401/refresh tardías. El test del service worker verifica la purga de cachés
actuales y viejas. La navegación real, bfcache y teclado requieren el gate de
navegador y no se acreditan con Vitest.

La revisión FE-04 agregó cobertura del provider en `hooks/use-auth.test.tsx`,
cola compartida refresh/reset/login, espera de Web Lock con generación vieja y
revalidación tras refresh antes de replay/redirect. Recuperación prueba pares
status/código y shapes inesperados, mensajes/fields seguros, redirect:error y
no-store, pérdida de entrada incluso en la misma ruta, foco de campos, claves
astrales, login manual y anuncio único al terminar la espera. Los stubs de fetch,
Web Locks, history y bfcache son pruebas de frontera; no acreditan HTTP, cookies,
correo, navegador real, contraste AA ni tamaños computados. Eso y el check estándar
completo corresponden al gate integrado posterior.
