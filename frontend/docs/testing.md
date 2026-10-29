# Tests del frontend

Corré `pnpm --dir frontend run test` para Vitest. Los tests de lógica de imagen usan Node con `helpers/canvas-shim.ts`; los de componentes declaran jsdom y reciben los matchers y cleanup de `vitest.setup.ts`.

Para verificar cambios completos usá `pnpm run check` desde la raíz. Antes de los tests backend, detené el stack con `pnpm run stop` para que el worker de precios no compita con los specs.

## Baseline de navegador (Chromium escritorio)

Desde la raíz, con pnpm 10.17.1, la preparación inicial es:

```sh
pnpm --dir frontend add -D @playwright/test
pnpm --dir frontend run test:browser:install
pnpm --dir frontend run test:browser
```

El instalador `test:browser:install` no acepta argumentos ni flags: incluso
`--dry-run` y `--with-deps` se rechazan antes de crear directorios o ejecutar procesos,
con salida 2, stdout vacío y stderr `El modo install no acepta argumentos adicionales.`
seguido de un salto de línea. Sin argumentos instala Chromium como antes.

Para enfocar un caso: `pnpm --dir frontend run test:browser --grep 'subida anónima'`.
Los wrappers usan `pnpm exec playwright` e imponen `PLAYWRIGHT_BROWSERS_PATH`
en `frontend/.playwright-browsers` tanto al instalar como al probar: no requiere export.
El runner arranca **sólo Next dev --webpack** en `127.0.0.1:3100` y rechaza
reutilizar un servidor existente. No levanta API, DB, Redis ni el stack.
Copia sólo fuentes/config necesarios a `.playwright-app/`, sin `.env*`, `.next`,
`.git`, binarios, output ni symlinks de fuentes; enlaza únicamente `node_modules`.
Next carga entorno y genera su dist dentro de esa copia, no en el frontend original.
El entorno hijo se reconstruye: sólo hereda PATH, sin NODE_OPTIONS, proxies ni endpoints;
HOME y temporales quedan en output local. Una copia previa hace fallar el arranque.
La salida normal o SIGINT/SIGTERM limpia sólo la copia creada, tras salir Next;
SIGKILL puede dejarla: no se borra automáticamente una copia de otra ejecución.
Prueba estructural (sin servidor): `pnpm --dir frontend exec node --test e2e/browser-runner.test.mjs`.

`e2e/scanner.spec.ts` navega la página real `/escanear` y verifica:

- Tab y Shift+Tab sobre «Subir una foto» y «Buscar a mano», con `:focus-visible`
  y outline computado sólido de 2 px, offset de 2 px y contraste ≥3:1 contra la
  superficie exterior bajo ese outline, no contra el fondo del botón. Conserva
  el color exacto del tema en claro/oscuro y comprueba forced-colors (se informa
  skip si la media query no es soportada). El outline RGB/RGBA se compone sobre
  la superficie opaca en sRGB antes de linealizar y calcular luminancia; no se
  fija un RGB de sistema portable para Highlight. Imágenes de fondo, superficies
  parcialmente transparentes y formatos no soportados fallan explícitamente.
- Enter sobre subida anónima lleva a `/login?next=escanear`, sin abrir archivos
  ni llamar reconocimiento u otros endpoints de escáner.
- Login sintético usa los nombres accesibles «Email (obligatorio)» y
  «Contraseña (obligatorio)», vuelve al escáner con un único login y sin refresh
  anticipado; recargar ejercita
  `/users/me` 401 → `/auth/refresh` → `/users/me` con bearer. La subida abre el
  selector, que se cancela sin enviar imágenes.

El contexto nuevo bloquea service workers. Toda API se intercepta: sólo permite
`GET /api/currency/usd-ars` (404, conversión deshabilitada) y, en el caso de login,
`POST /api/auth/login`, `GET /api/users/me` y `POST /api/auth/refresh` con shapes
`AuthResponseDto`/`UserDto`, credenciales `.invalid` y token sintéticos.
No hay comodín de respuestas exitosas: tráfico API o externo no previsto se
aborta **y hace fallar el test al cerrar**, aunque la UI capture el error.
Sólo pasan documentos/RSC de escáner/login, assets locales y el WebSocket
`ws://127.0.0.1:3100/_next/hmr` de Next (también transporta debug RSC para hidratar).
Webpack usa `NEXT_FONT_GOOGLE_MOCKED_RESPONSES`, verificado en el loader de Next:
Geist/Geist Mono reciben CSS local Arial, sin descargar CSS ni archivos de Google.
Un preload exclusivo de Next simula dist-tags npm como 503 y termina el proceso
ante conexiones TCP distintas del loopback :3100; también se hereda a sus workers.
El layout original no cambia. Esto no acredita tipografía de producción, backend,
cookies reales, reconocimiento, contraste AA, cámara, Safari ni iPhone físico.

Screenshots, videos y traces están apagados. `PLAYWRIGHT_NO_COPY_PROMPT=1` evita
extraer el snapshot de página de error; `preserveOutput: 'never'` descarta las
salidas por test, incluido `error-context.md` (sin opción pública propia de apagado).
Usa reporter de consola y `.playwright-output/` ignorado para la salida del runner.
Los binarios locales también están ignorados. ESLint excluye únicamente los
nuevos directorios generados `.playwright-browsers/**`, `.playwright-output/**`
y `.playwright-app/**`; el código fuente de `e2e/` y `scripts/` sigue lintado.
Vitest no recoge `e2e/*.spec.ts`:
sus dos configs mantienen sus includes existentes, sin modificar tests previos.

## Búsqueda y guardado por navegador

`e2e/search-save.spec.ts` recorre `/buscar` → ficha real → añadir a una colección
sintética existente. Cubre resultados, vacío y error de búsqueda; variante Holofoil,
alta NM, tres copias e intercambio; confirmación y lectura posterior tras recargar
la ficha y abrir Administrar. Un 503 de alta mantiene el formulario y sus valores,
no anuncia éxito y sigue sin ubicación al recargar. No modifica el caso 409.

El catálogo `e2e/catalog.json` es sintético y no tiene precios. El preload exclusivo
de Next responde sólo dos GET exactos: la carta `browser-card` y relacionadas del
set `browser-set`. `DEV_API_PROXY_TARGET` se fija a loopback :3100 sólo en el runner;
no se conecta a la API. Otros requests `/api/` desde Next terminan el proceso.
La guardia TCP sigue restringida a ese puerto. El navegador permite sólo las rutas,
queries, bearer y payload del escenario; todo lo demás cae en la guardia original.
El inventario vive en memoria por test y cambia únicamente con los POST/PATCH
esperados que terminan con éxito.

Ejecutá `pnpm --dir frontend run test:browser --grep 'búsqueda|fallo de alta'`
para estos casos o `pnpm --dir frontend run test:browser` para incluir el escáner.
La lectura del editor comprueba identidad, variante, cantidad e intercambio; NM
se comprueba también en payload y respuestas de ubicación/items. Esto acredita
integración del cliente con respuestas simuladas, no persistencia PostgreSQL,
ownership del backend ni idempotencia. No usa inventario, API ni precios reales;
no agrega capturas, traces o videos.

## Edición por navegador

`e2e/search-save.spec.ts` también recorre Administrar sobre el alta sintética:

- Edición de cantidad, intercambio y notas, confirmación y lectura tras recargar.
- Cierre sin guardar: ninguna escritura adicional y valores originales.
- Error 503 al actualizar: formulario y valores conservados, sin confirmación de
  éxito ni cambio de la carta al recargar.

Ejecutá `pnpm --dir frontend run test:browser --grep 'edición guardada'` para
estos tres casos. El escenario admite sólo el PATCH esperado a
`/api/items/browser-item`, con bearer, payload completo y sin query. El estado
sigue siendo local a cada test; no admite DELETE ni crea colecciones. Se conservan
los límites de aislamiento anteriores: no acredita persistencia PostgreSQL,
ownership backend, inventario real ni dispositivos físicos.

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
