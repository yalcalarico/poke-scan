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
