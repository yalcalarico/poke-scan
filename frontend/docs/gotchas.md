# Trampas

Fallas reales que costaron tiempo. No son estilo: son cosas que rompieron la app, que
`pnpm run check` no detecta, y que hay que volver a tropezar si nadie las escribe.

**La numeración es estable y hay código que la cita.** Comments en
`components/`, `hooks/` y `lib/` dicen `gotchas #9` o `docs/gotchas.md` #2. Si
renumerás una trampa, esos comments pasan a apuntar a otra cosa. Las trampas nuevas
van al final (§23 en adelante).

**Alcance:** estas son las fallas que quedan vivas del proyecto, más las del
rediseño. Hay una sección de histórico al final (§H) con las decisiones que se
tomaron *a propósito* y cuyo código ya no existe: esas no son trampas, son el
porqué de algo que hay que seguir respetando.

---

## 1. React 19 StrictMode monta los efectos dos veces y rompe la cámara

**El bug más caro del proyecto.** En desarrollo, el `<video>` se quedaba negro con
la cámara "encendida" (el indicador del sistema) pero sin imagen, y `play()` fallaba
con `AbortError`.

Qué pasaba exactamente:

1. React 19 en dev monta el efecto, lo limpia y lo vuelve a montar. La cámara se
   pide dos veces.
2. El `getUserMedia` de la **primera** pasada resuelve **después** de que la segunda
   pasada ya haya asignado su `srcObject`.
3. El `cleanup` de la primera pasada corre después de que la segunda ya resolvió.
   Ese cleanup viejo hacía `video.srcObject = null` **sobre el stream nuevo** y
   abortaba el `play()` en vuelo.

El resultado: `srcObject` anulado, `play()` abortado, cámara muerta. Y como en
StrictMode **el cleanup y el setup se intercalan en el mismo ciclo**, el orden es
impredecible.

**El fix: un token de generación.**

```ts
// components/scanner/camera-view.tsx — generationRef
/** Sube en cada pasada del efecto; un cleanup viejo no toca un stream nuevo. */
const generationRef = useRef(0);

useEffect(() => {
  const video = videoRef.current;
  if (!video) return;
  const generation = ++generationRef.current;   // ← el token de ESTA pasada

  let disposed = false;
  let stream: MediaStream | null = null;

  startCamera(video)
    .then((started) => {
      if (disposed || generation !== generationRef.current) {
        stopCamera(started);   // llegó tarde: lo cierro yo
        return;
      }
      stream = started;
      streamRef.current = started;
      setIsStarting(false);
    })
    .catch((err) => { /* … */ });

  return () => {
    disposed = true;
    stopCamera(stream);
    // Solo se suelta el srcObject si sigue siendo el de ESTA pasada
    if (streamRef.current === stream || streamRef.current === null) {
      streamRef.current = null;
      if (video.srcObject === stream) video.srcObject = null;
    }
  };
}, []);
```

Tres defensas encadenadas: `disposed` local, `generationRef` global, y la
comparación `video.srcObject === stream` antes de soltar. **Cualquiera de las tres
sola no alcanza.**

**En producción no pasa** (StrictMode es solo dev), pero el bug era real: si
cualquier flujo de la app vuelve a montar el efecto — hot reload, navegación, un
`key` que cambia — el mismo problema vuelve. Y `startCamera` es una función
impura que pide un permiso al usuario, así que el costo de fallarla es alto.

Corolario: el efecto de arranque de `CameraView` tiene `[]` como deps **a
propósito**. Si dependiera de los callbacks (que cambian de identidad en cada render
de la página), la cámara se reiniciaría en cada render. Para tener los callbacks
frescos sin reiniciar nada está `handlersRef`.

El patrón también aparece, con la misma causa y una solución un poco distinta, en
`hooks/use-async.ts` y `hooks/use-infinite-list.ts` (`runIdRef`).

---

## 2. `play()` con `AbortError` no es fatal si el video ya tiene frames

`video.play()` rechaza con `AbortError: interrupted by a new load request` cuando el
elemento todavía no cargó metadata. **En desarrollo pasa siempre**, por el doble
montaje. Tratarlo como error fatal mostraba "No pudimos abrir la cámara" con la
cámara perfectamente funcional.

El hecho de que `play()` rechace **no dice nada sobre si hay imagen**. Hay que
mirar `videoWidth`:

```ts
// lib/scanner/camera.ts
try {
  await video.play();
} catch (err) {
  // Un AbortError acá no significa que la cámara falle: significa que el
  // elemento estaba recargando. Si el video ya tiene frames, seguimos.
  const hasFrames = await waitForVideoFrames(video);
  if (!hasFrames) {
    stopCamera(stream);
    video.srcObject = null;
    throw new CameraErrorException(getCameraErrorKind(err), (err as Error)?.message);
  }
  if (video.paused) {
    try {
      await video.play();
    } catch {
      // Último recurso: si ya hay frames, un play() que falla no impide
      // capturar con `captureFrame`, que lee del frame actual.
    }
  }
}
```

`waitForVideoFrames` tiene **8 s de timeout** y resuelve con el estado real
(`video.videoWidth > 0`), no con un rechazo: si nunca llega, devuelve `false` en vez
de dejar la promesa colgada para siempre.

Bonus: `captureFrame` lee del frame actual del `<video>`, así que **no necesita que
el video esté "playing"**. Con frames ya disponibles, capturar funciona.

---

## 3. El input de búsqueda se borraba al tipear

En `/buscar`, escribir una letra no hacía nada. El input aceptaba el carácter y al
cambio de estado se lo perdía.

**El anti-patrón.** Sincronizar el input desde la URL sin distinguir *quién* cambió
la URL:

```ts
// ❌ NO HACER ESTO
const [inputValue, setInputValue] = useState(urlQuery);

// input -> URL, con debounce
useEffect(() => {
  if (inputValue === urlQuery) return;
  const timer = setTimeout(() => pushQuery(inputValue.trim()), DEBOUNCE_MS);
  return () => clearTimeout(timer);
}, [inputValue, urlQuery, pushQuery]);

// URL -> input: pisa lo que el usuario acaba de escribir
useEffect(() => {
  setInputValue(urlQuery);   // 💥 siempre
}, [urlQuery]);
```

El ciclo: el usuario escribe `"c"` → `inputValue = "c"`, `urlQuery` sigue siendo `""`
→ el segundo efecto no tiene por qué esperar nada, así que en la **misma pasada**
hace `setInputValue("")` y el carácter desaparece. Antes de que corra el debounce de
300 ms, el input ya está vacío otra vez. Por eso "escribir no hacía nada".

Había un intento intermedio con un `skipInputSync` que se apagaba tarde: al tipear
la primera letra, `urlQuery` (`""`) seguía difiriendo de `inputValue` (`"c"`), así
que el flag no se activaba y el efecto lo pisaba igual.

**El fix: un ref que marca "este cambio de URL es mío".**

```ts
// components/search/catalog-search.tsx
/**
 * El último valor que NOSOTROS escribimos en la URL. Sirve para distinguir
 * "la URL cambió porque el usuario apretó Enter / llegó por un link" de "la
 * URL cambió porque vos mismo escribiste en el input": en el segundo caso no
 * hay que pisarle el input al usuario.
 */
const pushedQueryRef = useRef<string | null>(null);

const pushQuery = useCallback((value: string) => {
  pushedQueryRef.current = value;              // marcar ANTES de navegar
  updateUrl({ q: value || null, page: null });
}, [updateUrl]);

// URL -> input, solo cuando el cambio vino de afuera (link, atrás/adelante).
useEffect(() => {
  if (pushedQueryRef.current !== null && urlQuery === pushedQueryRef.current) {
    pushedQueryRef.current = null;             // era nuestro: consumir marca
    return;                                    // no tocar el input
  }
  setInputValue(urlQuery);
}, [urlQuery]);
```

La regla general: **el estado que el usuario controla no se deriva por `useEffect` de
un estado que uno mismo acaba de escribir.** Un ref con "esto lo escribí yo" es lo
más barato; si el estado derivado fuera complejo, la alternativa es despachar una
action explícita o usar un reducer.

Detalles que importan del mismo archivo:

- El efecto `input -> URL` **no depende de `urlQuery` a propósito**, aunque lo lea.
  Si dependiera, cada cambio de URL rearma el timer de debounce y la sincronización
  se realimenta.
- `updateUrl` usa `router.push(..., { scroll: false })`: sin eso, cada tecla que pasa
  el debounce saltaba al top de la página.
- "Limpiar filtros" tiene que setear `pushedQueryRef.current = ''` **antes** de
  limpiar, por la misma razón: si no, el efecto URL→input la sobreescribe.

El mismo patrón del ref "esto lo escribí yo" está en
`components/search/catalog-search.tsx` y en la lista de resultados, que se remonta
con `key` en vez de llamar a `reload()` en un efecto.

---

## 4. `revalidate` de Next vs la frescura de precios

`/carta/[id]` servía precios viejos y, peor, un mensaje de "todavía no hay precio"
**eterno**.

La cadena del problema:

1. La página hacía `fetch` de la carta con `next: { revalidate: 3600 }`. Next
   cachea la respuesta **1 hora** y no vuelve a preguntar.
2. El backend tiene su propia regla: un precio de más de 24 h se refresca, y si
   no hay precio lo pide a la fuente. Pero si Next no le pregunta, **el backend
   nunca llega a ejecutar esa lógica**.
3. Si la carta no tenía precio, el HTML cacheado con el mensaje vacío se servía 1 h.
   Y si volvía a pasar, otro mensaje. El mensaje era eterno: la única forma de
   refrescar era esperar a que expirara la entrada de Next.

**El fix: dos cosas, juntas.**

```ts
// app/(app)/carta/[id]/page.tsx — fetchJson
const response = await fetch(`${getApiBaseUrl()}${path}`, {
  headers: { Accept: 'application/json' },
  // Los datos de la carta no cambian: 1 h de caché está bien.
  ...(opts.noStore ? {} : { next: { revalidate: REVALIDATE } }),
  // El precio, en cambio, tiene su propia regla de frescura (24 h) que aplica
  // el backend. Si lo cacheáramos acá, la página podría servir un precio
  // vencido hasta una hora después de que correspondía refrescarlo, y el
  // cliente no se enteraría. El backend ya tiene su caché (Redis 1 h), así que
  // no cuesta nada preguntarle siempre.
  ...(opts.noStore ? { cache: 'no-store' as const } : {}),
  // Los precios pueden tardar varios segundos cuando hay que pegarle a la
  // fuente. Con este tope la página nunca se queda esperando.
  ...(opts.timeoutMs ? { signal: AbortSignal.timeout(opts.timeoutMs) } : {}),
});
```

Con `REVALIDATE = 3600` para la carta y
`{ timeoutMs: PRICE_TIMEOUT_MS, noStore: true }` para el precio.

`cache: 'no-store'` para que la regla de 24 h del backend sea la única que manda, y
`AbortSignal.timeout(1500)` para que la página **nunca** espere al precio: si no
llega a tiempo, se renderiza sin precios y `CardPriceSection` lo carga en el cliente
con su propio indicador de carga.

**Y el componente tiene la misma defensa desde el otro lado:**

```ts
// components/prices/card-price-section.tsx, con las constantes de price-delta.tsx
const PRICE_MAX_AGE_MS = 24 * 60 * 60 * 1000;      // la regla del backend
const PRICE_FRESHNESS_SLACK_MS = 5 * 60 * 1000;    // margen por reloj y por revalidate
```

Si el servidor trajo un precio de menos de ~24 h, el cliente **no vuelve a
pedirlo**: la tabla entra lista y nos ahorramos un request. Si no hay precio, o
envejeció, consulta. El `PRICE_FRESHNESS_SLACK_MS` existe porque el reloj del
navegador y el `revalidate` de Next siempre están un poco desfasados.

**La regla general:** `revalidate` de Next y la regla de frescura de un backend
chocan siempre. No se pueden cachear en dos capas cosas con caducidad propia; hay
que elegir una y dejar que la otra sea una optimización, no una autoridad.

---

## 5. `tesseract.js` nunca en el grafo del server

> **Aviso de numeración:** dos comentarios del código dicen `gotchas #5` queriendo
> decir *"una suposición sobre el entorno sin fallback"* — que era el número 5 de
> una versión anterior de esta lista. Hoy esa idea vive en §19
> (`useSyncExternalStore`) y en §H.2. Los archivos son
> `components/share/use-share-url.ts` y `components/share/install-cta.tsx`.

`tesseract.js` arrastra un worker bundle, wasm y datos de idioma. Si un Server
Component lo importa, **`pnpm run build` falla**. Es una restricción dura, no una
recomendación.

Las tres cosas que hay que respetar:

```ts
// 1. El import tiene que ser DINÁMICO y DENTRO de una función.
workerPromise = (async () => {
  const { createWorker } = await import('tesseract.js');
  return await createWorker('eng', 1, { ... });
})();
```

```ts
// 2. La función que lo llama tiene que assertar que está en el browser.
function assertBrowser(): void {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    throw new OcrUnavailableError('El OCR solo puede ejecutarse en el navegador.');
  }
}
```

3. `app/(app)/escanear/page.tsx` tiene `'use client'`, y todo `lib/scanner/*` que
   toca canvas (`preprocess.ts`, `pipeline.ts`, `camera.ts`) solo se importa desde
   ahí, desde `components/scanner/` o desde los tests.

**Cómo se rompe en la práctica:** alguien mete un helper de OCR en
`lib/format.ts` o en un componente "server-safe" para reutilizarlo, y el build
explota con un error de wasm que no dice nada de `tesseract`.

---

## 6. `next/image` necesita `images.remotePatterns`

Las imágenes de carta vienen de dos hosts. Sin declararlos, `next/image` falla en
runtime (no en build) con un error de optimizer:

```ts
// next.config.ts
images: {
  remotePatterns: [
    { protocol: "https", hostname: "images.pokemontcg.io", pathname: "/**" },
    { protocol: "https", hostname: "images.scrydex.com", pathname: "/**" },
  ],
},
```

`images.scrydex.com` está por el sync/migración a Scrydex: cuando cambia la fuente
de imágenes, hay que agregar el host nuevo **antes** de que las DTOs nuevas lo
traigan, o la página se rompe con URLs de imágenes.

Los dos hosts también están hardcodeados en `public/sw.js` (`IMAGE_HOSTS`), así que
cambiar la fuente de imágenes son **dos** archivos, no uno.

Y hay una defensa más: `components/cards/set-media.tsx` tiene su propia allowlist de
hosts en `parseRemoteImage()`, porque `SetDto.logoUrl` y `symbolUrl` vienen
textualmente de la fuente y el backend los espeja **sin validarlos**. No se puede
importar `next.config.ts` desde un Client Component sin meter la config entera en el
bundle, así que la lista está duplicada a propósito. Sin eso, un set con el logo en
otro host **tumba la pantalla entera** en el server (no es un 404, es un error de
render).

---

## 7. `tesseract.js` 7 con Next: los ~14 MB tienen que estar fuera del build

`public/tesseract/` contiene `worker.min.js`, los tres
`tesseract-core-{simd,relaxedsimd,}-lstm.wasm.js` y `eng.traineddata.gz` (~2,9 MB).
Son binarios de terceros servidos tal cual.

Tres cosas:

1. **El build NO debe incluir esos binarios.** eslint los ignora
   explícitamente:
   ```js
   // eslint.config.mjs
   globalIgnores([
     // Assets de Tesseract auto-hospedados: bundles de terceros minificados que
     // se sirven tal cual desde /public/tesseract.
     "public/tesseract/**",
   ]),
   ```
   Sin eso, el lint se pone lentísimo sobre 14 MB minificados.
2. **El `Dockerfile` tiene que copiar `public/` a mano.** `output: "standalone"`
   deja `public/` fuera del trace:
   ```dockerfile
   # public/ NO se copia solo en el trace: sin esto faltan manifest.json, sw.js,
   # los iconos y los assets de Tesseract.
   COPY --from=builder --chown=nextjs:nodejs /app/public ./public
   ```
   Sin esa línea, la imagen de producción arranca sin manifest, sin service worker y
   **sin el OCR**, y el síntoma es un escáner que dice "el OCR no está disponible".
3. **`corePath` es un directorio, no un archivo.** tesseract.js elige la variante
   `-simd` / `-relaxedsimd` / la lisa según el soporte del dispositivo. Si se pasa
   un `.wasm.js` fijo, en un dispositivo sin SIMD no arranca.

Para volver al CDN (debug, o quitar 14 MB del repo): `NEXT_PUBLIC_TESSERACT_CDN=1`
en `.env.local`.

---

## 8. Los scripts de Node de diagnóstico no resuelven `tesseract.js`

Un script suelto que hace `import { createWorker } from 'tesseract.js'` **fuera de
`frontend/`** no resuelve el módulo: Node busca en `node_modules` hacia arriba desde
la ruta del archivo, y el `node_modules` de `tesseract.js` vive en
`frontend/node_modules`. El error es un `ERR_MODULE_NOT_FOUND` que no tiene nada que
ver con tesseract.

Dos formas de resolverlo:

- Correr el script **desde adentro de `frontend/`** (o con `--experimental-strip-types`
  y el cwd ahí).
- O resolverlo a mano, que además es lo que hacen los tests: **`createWorker` +
  `worker.recognize()` + `toOcrResult()` de `lib/scanner/ocr.ts`**, que ya tiene la
  normalización de las dos formas de salida de Tesseract y los asserts de browser.

Cuando el script de diagnóstico se escribe para *investigar* algo del OCR, suele
quedarse en el repo y después nadie lo corre. Los que quedaron están en
`lib/scanner/__tests__/` como tests opt-in, que es donde se los puede volver a
correr. Ver [`testing.md`](testing.md#tests-opt-in).

---

## 9. `setState` sincrónico dentro de un `useEffect`

La regla `react-hooks/set-state-in-effect` de la config de Next 16 dispara con
llamadas **síncronas** a un setter dentro del cuerpo de un efecto, porque
provocan un render extra en cascada que casi siempre es un anti-patrón.

El caso real estaba en `CardPriceSection`, que además sufre del doble montaje de
StrictMode (se disparan **dos** fetches y el segundo pisa al primero):

```ts
// ❌ el lint complains, y en dev dispara el doble fetch
useEffect(() => {
  if (!startsFresh) void load();
}, [load]);
```

**El fix: `queueMicrotask` + un ref de guarda.**

```ts
const mounted = useRef(true);
/** Evita el doble fetch que provoca el doble montaje de StrictMode. */
const startedFor = useRef(false);

useEffect(() => {
  mounted.current = true;

  if (!startsFresh && !startedFor.current) {
    startedFor.current = true;
    // En una microtask, no en el cuerpo del efecto: así el arranque del fetch
    // ocurre después del commit y no provocamos un render en cascada.
    queueMicrotask(() => {
      if (mounted.current) void load();
    });
  }

  return () => { mounted.current = false; };
}, [load, startsFresh]);
```

Tres piezas, y las tres hacen falta:

- `queueMicrotask` saca la llamada al setter del camino sincrónico del efecto (el
  lint se calla y no hay render en cascada).
- `startedFor` evita el **doble** disparo de StrictMode: el segundo `useEffect`
  ve el ref ya en `true` y no vuelve a pedir.
- `mounted` evita que una respuesta tardía pinte sobre un componente que ya se
  desmontó (o que se desmontó y remontó, y el `startedFor` lo frenaría).

**El patrón equivalente, sin `queueMicrotask`, aparece en `app/(app)/escanear/page.tsx`:**
en vez de un ref de "montado" se usa un **contador de corrida**:

```ts
const runIdRef = useRef(0);
const runId = runIdRef.current + 1;
runIdRef.current = runId;

// ...en cada punto donde el resultado vuelve asíncrono:
if (runIdRef.current !== runId) return;   // es una corrida vieja, se ignora
```

Es la respuesta correcta cuando el usuario puede disparar varias operaciones
seguidas (escanea dos cartas rápido): en vez de un booleano, un número que
distingue "esta es la corrida actual" de "esta ya la canceló otra".

Y está en un tercer lugar que es el más fácil de no ver: `lib/theme.tsx` adopta el
valor real del store en un `queueMicrotask` dentro del efecto, no en el cuerpo. Sin
eso, el `ThemeProvider` dispara un re-render en cascada al montar y el tema parpadea.

Los seis call sites de este patrón, para que sea fácil encontrarlos:
`CardPriceSection`, `CardActions` (`disposed` + `queueMicrotask`),
`useAsync`, `useInfiniteList`, `ThemeProvider` y el `createPortal` de `Sheet`.

---

## 10. `notFound()` en una ruta con `loading.tsx` devuelve HTTP 200

`/carta/[id]` con un id inexistente y `/share/[slug]` con un slug inexistente
renderizan la 404 **correcta** pero responden **200**.

Motivo: el render de Next 16 es streaming. El shell — incluido el `loading.tsx` del
segmento — se manda al navegador apenas está listo, y con él los headers. Cuando el
componente async termina el `fetch` y llama a `notFound()`, el status 200 ya salió
por el cable y no se puede cambiar. El `not-found.tsx` que se ve es el correcto; lo
único mal es el status.

Consecuencias y cómo convivir con esto:

- **No confíes en el status** para SEO ni para analítica: `generateMetadata` ya
  devuelve `{ title: 'Carta no encontrada' }`, que es la señal usable.
- **Workaround si hace falta un 404 real**: sacar el `loading.tsx` del segmento (para
  que el status se commitee antes del flush del shell) o mover el chequeo a
  `middleware.ts` / un route handler. Ninguno de los dos está implementado.
- `/colecciones/[id]` esquiva el problema por diseño: es client component y muestra
  un `EmptyState` en vez de llamar a `notFound()`. El status también es 200, pero
  es una decisión, no un accidente.

Detalle en [`routes.md`](routes.md#9-la-limitación-conocida-404-que-devuelven-http-200).

---

## 11. El fondo del `<body>` va en `globals.css` con tokens, no en clases de Tailwind

> **Aviso de numeración:** el comentario de `components/prices/card-price-section.tsx`
> dice `gotchas.md #11` queriendo decir *"el estado `revalidating` que nunca se
> ponía en `true`"*, que era el número 11 de una versión anterior de esta lista. Ese
> estado ya no existe; el código que lo reemplazó es el `startedFor` + `queueMicrotask`
> de §9.

El `<body>` de `app/layout.tsx` **no lleva `bg-*`**, y eso no es un olvido:

> *"el fondo lo pone `globals.css` con el token `--canvas`, que es lo único que
> puede acertar en los dos temas a la vez. Con clases de Tailwind habría que
> duplicar la regla con `dark:` y el overscroll de iOS quedaría del color del tema
> anterior."*

O sea, la regla vigente es:

```css
/* app/globals.css */
body {
  background: var(--canvas);
  color: var(--text-primary);
  font-family: var(--font-sans), system-ui, sans-serif;
}
```

Dos motivos que no son el mismo:

1. **El overscroll de iOS usa el fondo del `<body>`.** Con clases, el color
   quedaría clavado al tema con el que se renderizó y al arrastrar hacia arriba
   aparecería una banda del otro. Esto **sigue siendo cierto** y es la razón por la
   que la regla existe.
2. **`font-family` es la única forma de que el texto que renderiza el server
   coincida con el del cliente.** Con la variable de `next/font` puesta en el
   `<html>`, acá se pasa la que corresponde y no hay un frame con la fuente de
   fallback.

**Lo que ya no es cierto (y por eso no está en el cuerpo de esta trampa):** la
app anterior tenía un `body { font-family: Arial; background: var(--background) }`
en `globals.css` que **pisaba** a las clases del `<body>` y hacía que todo
renderizara en Arial con un frame blanco en tema claro. Eso está arreglado; la
regla de §H.1 cuenta qué pasó.

---

## 12. Las 404 de client component no usan `notFound()`

`/colecciones/[id]` maneja el "no existe / no es tuyo" con `ApiError.status === 404`
y un `EmptyState`, porque es un client component: `notFound()` no se puede llamar
desde ahí, y aunque se pudiera no haría falta.

La distinción importa para dos cosas:

- **No se puede proteger una ruta en el server.** El token vive en el navegador
  (`sessionStorage`/`localStorage`), así que el server no sabe si hay sesión. Todas
  las rutas renderizan siempre y el componente cliente decide. La única con un
  componente dedicado es `RequireAuth`, que hace `router.replace('/login')`.
- **Un 404 de negocio no es un 404 de HTTP.** Que una colección no sea tuya no
  debería filtrar que existe: el backend responde 404 en vez de 403 justamente por
  eso (un 403 confirma que el recurso existe). Del lado del cliente, la pantalla de
  "Colección no encontrada" es la misma para las dos cosas.

---

## 13. El `BottomNav` y el safe area

`viewportFit: "cover"` es lo que hace que `env(safe-area-inset-*)` valga algo; sin
él las variables son 0 y el notch se come el contenido igual. Está en el `viewport`
del layout raíz.

La `BottomNav` lleva `pb-[env(safe-area-inset-bottom)]` y `ScreenContainer` lleva
`pb-[calc(5rem+env(safe-area-inset-bottom))]`: el segundo número es el alto de la
nav **más** el safe area. **Los dos tienen que desincronizarse juntos** — si uno se
cambia y el otro no, la última fila de cartas queda tapada o queda un hueco de 5
rem. El comentario de `ScreenContainer` lo dice: *"es el mismo número que usa la nav
para su propio inset, y si se desincronizan la última fila de cartas queda debajo de
la nav"*.

**Y la `BottomNav` no se oculta en standalone.** La app anterior lo hacía
(`.pwa-hide-in-standalone` en `globals.css`), y el resultado era que instalada como
PWA no había forma de llegar a colecciones ni a escanear. Ese es el gap funcional
más grave que se haya arreglado en el proyecto, y la regla actual es la inversa:
**si se agrega un `display-mode: standalone`, tiene que ser para algo que de verdad
sobra, no para la navegación.**

Lo mismo vale para el aviso offline: es un toast, no una banda, y por eso no
necesita ninguna regla de `padding-top` en el `<body>` ni un `top` en cada
`.sticky`. En `globals.css`, `html[data-offline='true']` solo declara
`color-scheme`.

---

## 14. El service worker solo en producción

`app/pwa-sw-register.tsx` corta con `process.env.NODE_ENV !== 'production'`, y no es
por descuido:

> *"en dev el SW cachearía el HMR y las páginas con el código viejo, hace imposible
> iterar"*

El `sw.js` tiene estrategia `NetworkFirst` para navegaciones, pero `CacheFirst` para
el resto de los assets same-origin, y eso incluye los chunks de HMR en desarrollo. El
síntoma es un dev server que sirve bundles viejos y que hay que "limpiar a mano"
borrando el SW desde DevTools.

Si alguna vez el SW se registra en dev y no se puede deshacer, el clearing manual es
DevTools → Application → Service Workers → Unregister + Clear storage.

---

## 15. El preprocesado del OCR: no elijas la variante por nitidez

Este está en [`scanner.md`](scanner.md) con los números, pero el resumen como
trampa: es tentador elegir la variante de imagen "más nítida" con una métrica de
borde, y **es la decisión equivocada**.

La energía de borde cruda elige `threshold` en **8/8** cartas, porque una imagen
binarizada la maximiza por construcción (cada transición salta los 255 niveles
completos). Y `threshold` es la variante que **más nombres rompe**: 4/8, contra 7/8
de `grayscale` (el default).

Por eso:

- `normalizedEdgeSharpness` existe (dividir por la desviación estándar de la
  luminancia) para comparar variantes con rango dinámico distinto.
- `VARIANT_MARGIN = 0.25` evita que una diferencia de ruido abandone el default.
- Y, igual, **`scanCardImage` no usa ninguna de las dos para elegir**: corre el OCR
  de las 3 y gana por `ocr.confidence`. La medida del pico a pico de 3/8 a 7/8 no
  viene de una estadística de imagen, viene de preguntarle al motor.

Si alguna vez se toca `VARIANT_MARGIN` o `analyzeVariants`, hay que volver a correr
`SCANNER_OCR_INTEGRATION=1` y mirar el desglose por variante, no razonar sobre la
métrica.

---

# Trampas del rediseño

Salieron al construir la app nueva. Las 15 de arriba son anteriores y de la infra
que las dos comparten; la diferencia es que estasVINIERON de construir el sistema
visual, y varios de sus comentarios explican por qué un componente es como es.

---

## 16. `tailwind-merge` se come la escala tipográfica

**El bug más silencioso del rediseño.** No daba ningún error, en ningún lado. Los
componentes se veían con el tamaño de letra equivocado y nadie sabía por qué.

### Síntoma

`cn('text-label', 'text-positive')` devolvía **`'text-positive'`**. El `text-label`
desaparecía. En pantalla: un label de 13 px se veía a 16 px. Y como la clase que
ganaba es la del color, el síntoma cambiaba según el orden de las props, así que
era intermitente yendo y viniendo entre pantallas.

### Causa

`tailwind-merge` no conoce las utilidades propias del design system, que en
Tailwind 4 son `@utility` en vez de `cva`. No teniendo un grupo donde meterlas, las
mete en el **grupo genérico de `font-size`**, que es el mismo donde caen los colores
de texto. Y dentro de un grupo, la última gana.

La culpa no es de `tailwind-merge` sino del **namespace**: `text-*` es ambiguo por
diseño de Tailwind, y el design system agrega diez pasos más a un prefijo que ya
significaba dos cosas.

### El código del bug

```ts
// ❌ NO HACER ESTO
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

`cn('text-label', 'text-positive')` → `'text-positive'`. El label queda en 16 px.

### El fix

```ts
// lib/cn.ts
const FONT_SIZE_GROUP = 'pokescan-font-size';

const FONT_SIZE_CLASSES = [
  'text-display-lg', 'text-display', 'text-h1', 'text-h2', 'text-h3',
  'text-body', 'text-body-strong', 'text-label', 'text-caption', 'text-overline',
] as const;

const twMerge = extendTailwindMerge<typeof FONT_SIZE_GROUP>({
  extend: {
    classGroups: { [FONT_SIZE_GROUP]: FONT_SIZE_CLASSES },
    conflictingClassGroups: {
      [FONT_SIZE_GROUP]: ['font-size'],
      'font-size': [FONT_SIZE_GROUP],
    },
  },
});
```

Dos detalles que no son opcionales:

- **Hacen falta las dos direcciones de `conflictingClassGroups`.** La clave declara
  "el grupo pisa a estos valores"; hace falta además la inversa para que un
  `text-[13px]` arbitrario (que §3.1 prohíbe, pero que se puede colar) gane a la
  escala. Con una sola dirección, las dos declaraciones de `font-size` conviven y
  gana la última **por orden de fuente, no por intención**.
- **El id del grupo es propio** (`'pokescan-font-size'`), no `'font-size'`. Reusar el
  id genérico rompe el tipo de `extendTailwindMerge` y arrastra a todos los
  consumidores de `cn()`.

### El test de regresión

`lib/__tests__/cn.test.ts`, 7 casos. Existe porque el bug **no se manifiesta en
ningún error**: sin el test, el próximo que agregue una utilidad `text-*` al design
system reintroduce el problema y nadie se entera. Los casos que importan:

```ts
// conviven
expect(cn('text-label', 'text-positive')).toBe('text-label text-positive');
// en cualquier orden
expect(cn('text-positive', 'text-label')).toBe('text-positive text-label');
// la escala pisa a la escala
expect(cn('text-label', 'text-h3')).toBe('text-h3');
// y pisa al tamaño arbitrario, en los dos órdenes
expect(cn('text-label', 'text-[13px]')).toBe('text-[13px]');
expect(cn('text-[13px]', 'text-label')).toBe('text-label');
// no toca lo que no es de tamaño
expect(cn('text-display', 'text-positive', 'tabular-nums'))
  .toBe('text-display text-positive tabular-nums');
// sigue resolviendo condicionales y arrays de clsx
expect(cn('px-4', false && 'hidden', ['gap-2', null], undefined)).toBe('px-4 gap-2');
```

> Nota de infraestructura: los tests de `lib/` usan **rutas relativas** (`from
> '../cn'`), no el alias `@/`, porque `vitest.config.ts` no lo tiene configurado.
> Está anotado arriba del `describe`.

---

## 17. Next compone los layouts hacia arriba y un route group anidado no corta la herencia

**La trampa más fácil de reintroducir**, porque la primera solución que se ocurre
funciona en el build y no funciona en pantalla.

### Síntoma

`/share/[slug]` y `/login` salían con la `BottomNav` de tu cuenta debajo — las
cuatro tabs de escanear, buscar, colecciones y ajustes — arriba de la colección de
otra persona o debajo de un formulario de dos campos.

Y la primera solución que se ocurre (mover la ruta a
`app/(app)/(public)/share/[slug]/`) **no arregla nada**: compila, `next dev` no
protesta, y la nav sigue ahí.

### Causa

Next compone los layouts hacia arriba: todo `page.tsx` bajo un directorio hereda el
`layout.tsx` de ese directorio, y ese layout monta la `BottomNav` a través de
`AppShell`.

Un route group (la carpeta con el nombre entre paréntesis) sirve para **compartir
layouts entre rutas hermanas** y para **sacarle una parte de la URL**. No hace una
tercera cosa: **no corta la herencia hacia arriba**. El grupo está *dentro* del
segmento, así que el layout del segmento sigue siendo ancestro.

La forma de verificarlo sin debate: en `.next/types/routes.d.ts`, `LayoutRoutes`
lista los **layout roots** del árbol. Un route group anidado no aparece ahí,
porque no es una ruta.

### El código del bug

```
app/
  (app)/                     ← layout.tsx con <AppShell> (y la BottomNav)
    (public)/                ← ✗ el grupo no corta la herencia
      share/[slug]/page.tsx  ← sigue heredando la BottomNav
```

### El fix

Las carpetas tienen que ser **hermanas**, no hijas:

```
app/
  (app)/     layout.tsx → <AppShell>     (con nav)
  (auth)/    layout.tsx → <PlainShell>   (sin nav)
  share/     layout.tsx → <PlainShell>   (sin nav)
```

Como el nombre del grupo **no forma parte de la URL**, `app/(auth)/login/page.tsx`
sigue sirviendo `/login` y `app/share/[slug]/page.tsx` sigue sirviendo
`/share/[slug]`: ningún link interno cambia.

`share/` no es un route group, y no debería serlo: no comparte layout con nadie,
así que no necesita la indirección del paréntesis.

El razonamiento completo está en los JSDoc de los tres `layout.tsx` y en
[`routes.md`](routes.md) §2.

### El efecto secundario que hay que conocer

Esa separación rompe la **herencia de `error.tsx` y `not-found.tsx`**. La rama
`(auth)` no hereda el `error.tsx` de `(app)`, así que hizo falta un
`app/(auth)/error.tsx` propio. Sin él, un error de render en el login muestra la
pantalla pelada de Next. Y `app/not-found.tsx` sí se hereda, porque está en el
layout raíz, que envuelve todo.

---

## 18. `typedRoutes` y los tipos de ruta: el typecheck te puede romper sin que toques nada

Esta es la trampa que **se repite sin que toques una línea de código**, y por eso
va con dos mitades: la del flag y la del estado generado.

### 18.a. La `BottomNav` exige que existan sus cuatro destinos

`tsconfig.json` incluye los tipos de ruta que Next genera:

```json
"include": [
  "next-env.d.ts",
  "**/*.ts", "**/*.tsx",
  ".next/types/**/*.ts",
  ".next/dev/types/**/*.ts",
  "**/*.mts"
]
```

Y con `typedRoutes` (que en Next 16 se activa por default en el plugin `next` de
`tsconfig.json`), **un `Link` cuyo `href` no resuelve a una ruta existente es un
error de typecheck**, no un 404 en runtime.

El efecto raro: como `NAV_ITEMS` declara las cuatro destinos de la `BottomNav` y
todas son `Link`, agregar una pantalla con una sola ruta rompe el typecheck por
destinos que no tocaste. La `BottomNav` **exige** que existan sus cuatro, y
`/buscar` tiene que existir sí o sí aunque la pantalla todavía no esté.

**Antes de agregar una pantalla, agregá el `page.tsx` de las cuatro que faltan.**
Es lo inverso a lo intuitivo: no estás agregando una pantalla, estás completando
un conjunto.

> **Verificado en este repo**: `next.config.ts` **no** declara `typedRoutes`, y una
> prueba con un `<Link href="/no-existe">` literal **no** produce error de
> typecheck. O sea que hoy el flag no está biting. Los tipos de ruta sí se generan
> (`.next/types/routes.d.ts` existe), y si alguien enciende `typedRoutes: true`,
> esta trampa pasa a morder. La mitad 18.b ya muerde hoy.

### 18.b. Los tipos generados quedan stale y el typecheck reporta errores en código correcto

### Síntoma

`pnpm run typecheck` falla con errores que **no existen**:

```
components/cards/card-grid.tsx(134,35): error TS2304: Cannot find name 'sizes'.
components/cards/card-tile.tsx(160,61): error TS2304: Cannot find name 'CONTROL_CLASSES'.
app/(app)/carta/[id]/page.tsx(94,7): error TS2304: Cannot find name 'parsePrices'.
```

Y lo peor: **son distintos en cada corrida**. Corriendo `tsc --noEmit` seis veces
seguidas con el árbol sin tocar, los errores cambiaron de archivo y de línea, y una
de las corridas salió limpia. Un `TS2304` en un archivo que se lee bien y que tiene
el símbolo declarado treinta líneas más arriba no es un error de código: es estado
basura.

### Causa

Dos fuentes, y hay que distinguirlas:

1. **`tsconfig.tsbuildinfo` corrupto o desfasado.** `tsconfig.json` tiene
   `"incremental": true` sin `tsBuildInfoFile`, así que el cache vive en
   `frontend/tsconfig.tsbuildinfo`. Un archivo ahí desactualizado hace que `tsc`
   re-escriba symbols de un archivo con el estado de otro, y el sintoma
   característico es `TS2304` / `TS2339` en código que se lee bien.
2. **Un `next dev` corriendo.** Turbopack escribe `.next/dev/types/**` y el
   `tsbuildinfo` de su propio typecheck **concurrentemente** con el `tsc` que
   estás corriendo a mano. Los dos están escribiendo el mismo archivo de estado.

### El fix

```bash
rm -f frontend/tsconfig.tsbuildinfo
rm -rf frontend/.next/types frontend/.next/dev/types
pnpm run typecheck     # el build/dev server regenera los tipos
```

Borrar `.next/types` **y** `.next/dev/types` es lo que resuelve la variante
cruzada `Route` contra `LayoutRoutes`, que aparece cuando se editan rutas a mano o
se borran tipos: los dos conjuntos se regeneran desde cero y vuelven a ser
consistentes entre sí.

**Regla práctica:** si el typecheck falla con un error que no podés explicar
leyendo el archivo, y `tsc --noEmit` da un resultado **distinto** en la segunda
corrida, no estás arreglando código: estás arreglando estado. Borrá los dos y
volvé a correr.

**Y la lección de fondo:** un typecheck **no determinista** no es un bug del
typecheck ni tuyo. Es información de que hay dos escritores sobre el mismo archivo.
Antes de empezar a "arreglar" 15 minutos de un componente, confirmá que el árbol
está quieto.

---

## 19. `react-hooks/set-state-in-effect`: `navigator.onLine` no es estado de React

El linter nuevo de React (el de la config de Next 16) marca `setState` **sincrónico**
dentro del cuerpo de un efecto: provoca un render extra en cascada que casi siempre
es un anti-patrón. La trampa #9 es el caso general; esta es la forma nueva, y la
solución es distinta.

### Síntoma

El toast de "Sin conexión" aparecía un frame tarde, o la primera pasada de StrictMode
afirmaba que estamos online cuando no lo estábamos.

### El código del bug

```ts
// ❌ NO HACER ESTO
const [isOnline, setIsOnline] = useState(true);

useEffect(() => {
  setIsOnline(navigator.onLine);            // el lint complains, y el primer
  const on = () => setIsOnline(true);       // render ya mintió
  const off = () => setIsOnline(false);
  window.addEventListener('online', on);
  window.addEventListener('offline', off);
  return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
}, []);
```

Dos fallos, no uno: el `setState` en el camino síncrono del efecto (el lint), y el
`true` inicial que es una **mentira** que el primer render repite.

### El fix

`useSyncExternalStore`, que es exactamente para esto: el valor **no es estado de
React**, es un valor del browser que ya existe antes del primer render.

```ts
// components/layout/offline-toast.tsx
function subscribeToConnection(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

function useIsOnline() {
  return useSyncExternalStore(
    subscribeToConnection,
    () => navigator.onLine,
    () => true,   // ← el server snapshot. Sin esto hay hydration mismatch.
  );
}
```

El JSDoc lo dice sin rodeos: *"Con `useState`+`efecto` el primer render afirmaría
que estamos online aunque no lo estuviéramos, y el toast aparecería un frame
tarde"*.

**El server snapshot no es opcional.** En el server no hay `navigator`; decir
`true` es lo que hace que el render del server y el primer render del cliente
coincidan. `useSyncExternalStore` exige las tres funciones.

El mismo patrón, con el mismo motivo, en:

- **`useShareUrl()`** (`components/share/use-share-url.ts`): server snapshot `''`,
  porque si el server renderizara `window.location.origin` el primer render del
  cliente no coincidiría.
- **`app/(app)/escanear/page.tsx`**:
  `useSyncExternalStore(subscribeToEnv, getBrowserEnv, () => null)` para la
  capacidad de la cámara. El server snapshot es `null` y la pantalla lo trata como
  "todavía no sé, no hagas nada"
  (`const cameraAvailable = env ? env.supported && env.secure : true;`).
- **`lib/theme.tsx`**: dos stores (`theme` y `resolvedTheme`) con los snapshots de
  `SERVER_THEME` y `SERVER_RESOLVED_THEME` de `lib/theme-script.ts`.

### La regla general

**Si el valor viene de un store externo del browser, es `useSyncExternalStore`. Si
es tuyo, es `useState`.** Y si tenés que distinguir los dos, no lo distingas: son
cosas distintas y se distinguen por la API que usan.

---

## 20. El guard de colores crudos no cubría las ramas hermanas del árbol

**Trampa de cobertura, no de código.** El linter de la regla dura de §1 del design
system ("cero colores crudos") daba verde sobre archivos que los tienen.

### Síntoma

El script pasaba en verde, y sin embargo `app/(v2public)/**` y `app/(v2auth)/**`
podían tener `slate-*`, `sky-*`, `text-white` o `bg-black` sin que nadie se enterara.

### Causa

El script tenía las raíces **hardcodeadas** a las carpetas donde la app nueva
vivía, y las ramas hermanas están en carpetas que **no están bajo** esas raíces: son
directorios del mismo nivel. El `walk()` es recursivo sobre cada raíz, así que no
las encuentra.

### El fix (ya aplicado)

Las raíces ahora son **`app`, `components`, `lib` y `hooks`**, que cubren todo el
árbol del frontend:

```js
// scripts/check-no-raw-colors.mjs
const ROOTS = ['app', 'components', 'lib', 'hooks'];
```

Dos cosas de ese cambio que conviene no perder:

- **Está enganchado a `pnpm run lint`**, que es `eslint && node
  scripts/check-no-raw-colors.mjs`. Antes no lo estaba, y la razón era que la app
  anterior usaba `slate-*` en cientos de lugares y el guard habría sido inútil. Con
  una sola versión, un color crudo **rompe el build**.
- **`scripts/` y los tests quedan afuera a propósito**: un fixture que reproduce a
  propósito el bug que se quiere evitar tiene que poder escribir la clase cruda, o
  el test no testea nada.
- **Saltea las líneas de comentario**, porque los docs de los tokens nombran las
  clases prohibidas justamente para decir que están prohibidas, y un grep ingenuo las
  contaría. Cualquier extensión del matcher tiene que mantener eso.

**La lección, que es la que importa:** un guard de cobertura es una afirmación
sobre el árbol, y el árbol cambia. Un guard que dice "miro estas tres carpetas" es
una decisión que hay que volver a revisar cada vez que se agrega una carpeta de
primer nivel. La versión buena dice "miro `app`, `components`, `lib` y `hooks`", que
es todo lo que hay.

---

## 21. `screen-header.tsx` es server-safe a propósito, y eso le prohíbe `usePathname()`

**La más fácil de "arreglar" rompiendo el diseño.** Cualquiera que necesite que el
header sepa dónde está va a meterle un `usePathname()`, y con eso rompe la
`/share/[slug]` pública y las diez pantallas server de golpe.

### Síntoma

Después del cambio, el header de `/share/[slug]` —la vista pública, la única que
no debe tener cromo de cuenta— empezó a mostrar el chevron de "volver". Y las
páginas que eran server pasaron a hidratar en el cliente, con el `request` extra
del JS que eso implica.

### Causa

`ScreenHeader` no lleva `'use client'`, y eso es una decisión, no un descuido: es lo
que permite que `/buscar`, `/carta/[id]`, `/ajustes`, `/`, `/login`, `/registro` y
`/share/[slug]` sean Server Components. Un `usePathname()` la vuelve client, y **un
Server Component no puede importar un módulo client**: una sola directiva de más
acorta el grafo entero de la rama.

Y el problema no es teórico. `back` es un prop **con destino explícito**:

```tsx
<ScreenHeader
  title="Buscar"
  back={{ href: '/buscar', label: 'el catálogo' }}   // no: infiere del pathname
  action={<IconButton … />}
 />
```

### El fix

Cada pantalla le pasa su `back` y su `action` desde abajo. `back` es un objeto
`{ href, label }`, no un booleano, y el `aria-label` del chevron se arma con el
label: `` `Volver a ${back.label}` ``.

Tres consecuencias de esa decisión que conviene no perder:

- **`/buscar` va sin `back` ni `action`.** Es una raíz de la `BottomNav` y el
  punto de arranque, así que no hay a dónde volver. Un chevron a una pantalla
  hermana o una `X` que no cierra nada serían dos controles que mienten.
- **El título va en un `<p>`, no en un `<h1>`,** porque es chrome. Las pantallas que
  necesitan el heading real lo ponen aparte como `<h1 className="sr-only">` y rotulan
  el `<main>` con él. Es lo que hacen `ajustes` y `carta/[id]`.
- **El título se centra si y solo si hay `back` o `action`** (`back || action ?
  'text-center' : 'text-left'`), y los dos lados son contenedores de 40×40 fijos,
  ocupados o no. Es lo que hace que el chevron de la izquierda y la acción de la
  derecha no lo descentren.

Si alguna vez hace falta un header que reaccione a la ruta, la salida es **un
wrapper client chico** que le pase props al `ScreenHeader` server — nunca el hook
adentro del server-safe.

---

## 22. Dos shells en vez de uno con una prop

**La trampa es la de la #17 vista del otro lado: la solución.** Vale la pena
tenerla escrita porque la tentación es la contraria — "un shell es un shell, copio
las tres líneas y listo" — y dos copias divergen sin que nadie se entere.

### Síntoma

El skip link aparece en `/buscar` y **no** en `/login`, porque el layout de `(auth)`
se escribió un día antes que el skip link. O peor: `OfflineToast` queda montado en
la rama pública y en la de auth no, y el visitante de un link compartido no se
entera de que está sin conexión.

### Causa

La trampa #17 obliga a que las tres ramas estén en carpetas distintas del árbol, y
cada una necesita su `layout.tsx`. El shell —los providers, el skip link, la nav,
el offline— está en las tres, y es el mismo código.

### El código del bug

```tsx
// ❌ NO HACER ESTO
// app/(app)/layout.tsx, app/(auth)/layout.tsx y app/share/layout.tsx, cada uno
// con su copia de <ThemeProvider><ToastProvider>…<BottomNav/>…
```

Tres copias que compilan las tres. La divergencia es cuestión de tiempo, y es
divergencia **de chrome**, que es justo lo que no se nota en un test.

### El fix

**Los providers y el skip link van arriba**, en `app/layout.tsx` + `app/providers.tsx`.
Se montan **una sola vez** y el layout raíz envuelve todo el árbol. Los layouts de
rama solo pintan el canvas y deciden si hay `BottomNav`.

Y el chrome de rama son **dos componentes en vez de uno parametrizado**:

```tsx
// components/layout/app-shell.tsx
<div className="flex min-h-dvh flex-col bg-canvas font-sans text-primary">
  {children}
  <BottomNav />
  <OfflineToast />
</div>

// components/layout/plain-shell.tsx
<div className="flex min-h-dvh flex-col bg-canvas font-sans text-primary">
  {children}
  <OfflineToast />
</div>
```

Dos archivos y no `AppShell nav={false}` porque **la diferencia no es un parámetro
de la pantalla, es de qué rama del árbol es la pantalla**. Un booleano en el call
site deja el problema abierto: reponer `<BottomNav />` en la ruta pública es un
copy-paste y nadie lo nota hasta que se ve.

### Las dos decisiones de adentro que no se tocan

1. **Los providers no van en los layouts de rama.** El JSDoc de `AppShell`: *"son
   de la app entera y no de un tipo de pantalla, así que montarlos por rama los
   duplicaría y el estado de la moneda y del tema se perdería al navegar"*.
2. **El `bg-canvas font-sans text-primary` va explícito** en los dos shells, aunque
   `globals.css` ya pone el fondo en el `body`. Es la misma regla de §11: el fondo del
   shell tiene que ser el token del tema, no el que herede el browser.

---

## 23. Quitar `V2_BASE` dejó espacios dentro de los template literals

**Trampa del flip, y la razón de que exista este documento.**

### Síntoma

Links rotos o mal formados que **no se ven en el código a simple vista**:

```tsx
// app/(app)/carta/[id]/loading.tsx
back={{ href: ` /buscar`, label: 'el catálogo' }}
//                                          ↑ el espacio
```

`next/link` con un `href` que empieza con un espacio no tira ningún error de
typecheck, no rompe el build y no aparece en el linter. En pantalla es un link que
no navega, o una URL compartida con un espacio adentro.

### Causa

Los href se armaban con `${V2_BASE}/buscar`. Cuando `V2_BASE` pasó a `''`, el
sed dejó el espacio que estaba entre `${V2_BASE}` y la barra:

```
`${V2_BASE}/buscar`   →   ` /buscar`
```

El resultado es un template literal sin interpolación, que es un string normal con
un espacio al principio. Compila perfecto.

### Dónde queda vivo hoy

Verificado en el árbol, quedan cinco:

| Archivo | Qué |
|---|---|
| `app/(app)/carta/[id]/loading.tsx` | `` href: ` /buscar` `` |
| `app/(app)/colecciones/[id]/loading.tsx` | `` href: ` /colecciones` `` |
| `components/set-progress/set-progress-skeleton.tsx` | `` href: ` /colecciones` `` |
| `app/(app)/carta/[id]/actions.tsx` | `` `${window.location.origin} /carta/${id}` `` (URL de compartir) |
| `components/share/use-share-url.ts` | `` `${origin} /share/${slug}` `` (URL pública) |

Los dos últimos son los más graves: no son navegación interna sino **URLs que se
copian y se mandan por WhatsApp**, así que el espacio viaja con el link.

### La regla

**Después de un rename o de sacar una constante de prefijo, grepéá el patrón, no
confíes en el editor.** El comando que lo encuentra:

```bash
# interpolación seguida de espacio y barra, o backtick con espacio y barra
grep -rnE '\$\{[^}]+\} ?/|` ?/[a-z]' frontend/app frontend/components frontend/lib
```

Y el fix es borrar el espacio y, de paso, **sacarle los backticks**: `` href: '/buscar' ``
en vez de `` href: `/buscar` ``. Un template literal sin interpolación es una
pista de que algo quedó a medias.

---

## 24. Los `error.tsx` por rama repiten el shell, y solo uno está bien

### Síntoma

Un error de render en `/colecciones` muestra la pantalla de error **sin fondo** o
con el `<body>` del tema anterior. Y el mismo fix aplicado en la otra rama la deja
con un `min-h-dvh` duplicado.

### Causa

`ScreenContainer` y los shells viven en los layouts de rama, y **`error.tsx` se
resuelve por segmento**: el de `(app)` no cubre `(auth)`. Así que hay dos
`error.tsx`, y los dos son Client Components (tienen que serlo, por `reset()`).

La diferencia entre los dos no es estética:

- `app/(app)/error.tsx` **sí** repite `min-h-dvh bg-canvas`, porque su layout de
  rama queda reemplazado por la frontera de error: el `AppShell` no se monta.
- `app/(auth)/error.tsx` **no** lo repite, porque el layout del grupo sí se monta
  alrededor. Y su salida es a la **home**, no al catálogo: en una pantalla de auth
  lo útil es volver al inicio, no ir al catálogo.

### La regla

Cuando un layout de rama existe, el `error.tsx` de esa rama tiene que decidir si
repite el shell o no, y **la respuesta no es la misma en las dos ramas**. No lo
patees: el síntoma es un error de fondo, y `min-h-dvh` de más o de menos en una
pantalla de error es exactamente el tipo de cosa que nadie va a notar hasta que se
ve en un dispositivo con la barra de direcciones escondida.

Y el `digest` va en un `<details>`: es lo único que permite correlacionar con los
logs del server, no le sirve a un usuario y ocupa espacio, pero sin él no hay forma
de depurar.

---

## 25. `ShareLinksSection` no va en `settings/`, y la carpeta `share/` tiene dos mitades

### Síntoma

Alguien importa un componente de la vista pública desde Ajustes, o al revés, y de
repente `/ajustes` arrastra el `fetch` de una colección ajena, o la página pública
empieza a pedir sesión.

### Causa

`components/share/` mezcla dos bloques que **no se deben importar cruzados**:

- Los de la **cuenta** (`ShareLinksSection`, `ShareLinkCard`, `ShareLinkCreator`)
  son client components y solo se usan en Ajustes.
- Los de la **landing** (`PublicCollectionView`, `InstallCta`) son de la ruta
  pública, que no pasa por el layout de `(app)`.

Por eso `ShareLinksSection` se compone desde `app/(app)/ajustes/page.tsx` aunque sea
una sección de ajustes, y no vive en `components/settings/`: la carpeta se agrupa
por **dónde se usa**, no por a qué pantalla pertenece.

`share-link-status.ts` y `copy-to-clipboard.ts` son lo único server-safe de la
carpeta, y por eso viven ahí y no dentro de un componente client.

### La regla

**Antes de mover un componente de carpeta, preguntá si el agrupamiento es por
pantalla o por uso.** Si es por uso, moverlo rompe la frontera de la vista pública
y nadie lo va a notar hasta que un visitante sin sesión vea un error 401. La
separación entre "tu cuenta" y "la colección de otra persona" es de seguridad y de
chrome, no de organización.

---

## Resumen: las que vuelven a aparecer

### Las quince anteriores (§1–§15)

| # | Trampa | Cómo se manifiesta |
|---|---|---|
| 1 | Doble montaje de StrictMode | todo lo que abre un recurso externo (cámara, fetch, worker). `generationRef` / `runIdRef` / `startedFor`. |
| 2 | `play()` con `AbortError` no es fatal | "No pudimos abrir la cámara" con la cámara funcionando. Mirar `videoWidth`, no el rechazo. |
| 3 | Estado controlado por el usuario derivado por `useEffect` | el input se borra, el estado "se reinicia". Un ref de "esto lo escribí yo". |
| 4 | Caché en dos capas con caducidades distintas | precios viejos o mensajes eternos. `no-store` + timeout. |
| 5 | Import de una lib pesada en el grafo del server | falla el build con un error de wasm que no dice nada. Import dinámico. |
| 6 | Host de imágenes sin declarar | error de optimizer en runtime, o la pantalla entera en el server. `remotePatterns` + allowlist propia. |
| 7 | Asset de terceros en el trace del build | producción sin OCR. `globalIgnores` + `COPY public/`. |
| 9 | `setState` sincrónico en un efecto | render en cascada, y doble fetch en dev. `queueMicrotask` + ref de guarda. |
| 10 | `notFound()` con `loading.tsx` responde 200 | la 404 se ve bien y el status miente. No confíes en el status. |
| 11 | Fondo del `<body>` en clases | overscroll de iOS del tema anterior. `globals.css` con tokens. |
| 12 | 404 de client component | no podés llamar `notFound()`; y un 404 de negocio no es un 404 de HTTP. |
| 13 | Safe area desincronizado con la nav | la última fila queda bajo la nav, o queda un hueco de 5 rem. |
| 14 | Service worker en dev | bundles viejos y caché que no se puede invalidar. |
| 15 | Elegir la variante de OCR por nitidez | 8/8 de `threshold`, que es la que más nombres rompe. Preguntarle al motor. |

### Las del rediseño (§16–§25)

Ordenadas por lo que costaron, no por número.

| # | Trampa | Cómo se manifiesta |
|---|---|---|
| 17 | **Un route group anidado no corta la herencia de layouts** | la `BottomNav` en `/share` y en `/login`, y compila igual. Las carpetas tienen que ser **hermanas**, no hijas. |
| 23 | **Sacar un prefijo deja espacios en los template literals** | links que no navegan y URLs compartidas con un espacio. Ningún error, ningún lint. |
| 16 | **`tailwind-merge` come la escala tipográfica** | un label a 16 px en vez de 13, sin ningún error en ningún lado. `extendTailwindMerge` + test de regresión de 7 casos. |
| 18 | **Los tipos de ruta generados quedan stale** | `TS2304` en código correcto, y **distinto en cada corrida**. Borrar `tsconfig.tsbuildinfo` y `.next/types`. |
| 21 | **`'use client'` de más en algo server-safe** | toda una rama pasa a client y aparece chrome donde no debía. `ScreenHeader` no puede usar `usePathname()`. |
| 19 | **`setState` sincrónico en un efecto para leer un store del browser** | el toast de "Sin conexión" un frame tarde, y el primer render miente. `useSyncExternalStore` + server snapshot. |
| 22 | **Copiar un shell en vez de componerlo** | el skip link aparece en tres rutas y en la cuarta no. `AppShell` / `PlainShell` + providers arriba. |
| 20 | **El guard de colores no cubría las ramas hermanas** | verde sobre archivos que sí tienen `slate-*`. Hoy cubre `app`, `components`, `lib`, `hooks` y falla el lint. |
| 25 | **Una carpeta con dos mitades que no se importan cruzadas** | un componente de la vista pública arrastrado a Ajustes, o al revés. |
| 24 | **El `error.tsx` de cada rama con un shell distinto** | error sin fondo en una rama, `min-h-dvh` duplicado en la otra. |

**El patrón detrás:** ocho de las diez (16, 18, 20, 21, 22, 23, 24, 25) son
fallos de **capa, no de lógica**. Compilan, pasan el lint, pasan los tests, y el
problema aparece en pantalla o en el flip.

La regla que sale de ahí: **cuando un bug no se deja explicar leyendo el archivo
donde se manifiesta, sospechá de la capa.** Preguntá quién escribió esta clase,
quién genera este tipo, quién define este árbol de rutas, y quién decide el scope
de este linter. Casi siempre la respuesta es que ese "alguien" es otro archivo
entero, y ahí está la respuesta.

---

# H. Histórico: decisiones que sobreviven sin el código que las causó

> Estas no son trampas: **el código al que apuntan ya no existe**. Son el porqué de
> algo que hay que seguir respetando, y están acá porque volver a cometer el error
> que las causó originalmente es más probable que tropezar con una regla que no
> explica su motivo.

## H.1 El fondo del `<body>` en `globals.css`, no en clases

**El bug:** el `globals.css` de la app anterior terminaba con un bloque heredado del
template de `create-next-app`:

```css
body {
  background: var(--background);
  color: var(--foreground);
  font-family: Arial, Helvetica, sans-serif;
}
```

Y `app/layout.tsx` ponía `bg-slate-950 text-white` **en el `<body>`**. Esa regla
venía **después** en la cascada y tenía la misma especificidad (un selector de
elemento), así que **ganaba**: el body no era `slate-950` sino el `--background` del
template (`#ffffff` en claro, `#0a0a0a` con `prefers-color-scheme: dark`).

La app se veía aceptable porque casi todos los hijos volvían a poner sus propios
colores, pero en tema claro había un frame de fondo **blanco** antes de que
hidrate, y la tipografía no era Geist en el body.

**La regla que quedó:** el `<body>` **no lleva clases de color**. El fondo y la
tipografía los pone `globals.css` con tokens. Ver §11 para el porqué de fondo
— y el motivo de fondo no es "evitá el pisado de Tailwind", es **el overscroll de
iOS y el match de la fuente entre server y cliente**.

## H.2 La `BottomNav` no se oculta en standalone

**El bug:** la app anterior tenía `BottomNav` con la clase
`pwa-hide-in-standalone` y `AppShell` con `pwa-content-inset`, y ambas estaban
definidas en `globals.css` bajo `@media (display-mode: standalone)`.

En modo standalone la pantalla ya ocupa todo el viewport, así que la idea era que
la nav sobrara. El resultado: **instalada como PWA no había forma de llegar a
`/colecciones` ni a `/escanear`**. Era el gap funcional más grave del producto.

**La regla que quedó:** la `BottomNav` se muestra siempre, sin
`display-mode: standalone`. Si alguna vez hace falta ocultarla en standalone, tiene
que ser duplicar la navegación adentro de la pantalla, nunca esconder la única que
hay. Ver §13.

## H.3 El service worker con `CacheFirst` en assets

**El bug:** el `sw.js` tiene `NetworkFirst` para navegaciones pero `CacheFirst`
para el resto de los assets same-origin, y en desarrollo eso incluye los chunks de
HMR.

**La regla que quedó:** el registro es solo en producción (§14). Y si alguna vez se
toca el `sw.js`, lembrar que el `CacheFirst` de assets es lo que hace que una
liberación de código se vea en el cliente sin refresh — que es lo que querés en
producción y lo que no querés en dev.

## H.4 El `body {}` de `globals.css` y el `overscroll`

Este es el mismo bug de H.1 y la misma regla de §11, pero vale la pena separarlo
porque **el motivo real no es el pisado de Tailwind**. Está en H.1 y en §11; no hay
una tercera versión. Si te lo estás preguntando: la respuesta está en el comentario
de `body {}` de `globals.css`, que dice *"1. El overscroll de iOS usa el fondo del
`body`. Con clases, el color quedaría clavado al tema con el que se renderizó y al
arrastrar hacia arriba aparecería una banda del otro."*

## H.5 La `BottomNav` con la cámara

**El bug:** la cámara de la app anterior era `z-40` y la `BottomNav` era `z-50`. En
browser, el shutter y el frame de detección quedaban **debajo** de la nav.

**La regla que quedó:** la escala de z-index es explícita
(`z-base` `z-sticky` `z-nav` `z-overlay` `z-sheet` `z-media` `z-offline`), y
`CameraView` es `fixed inset-0 z-media` — o sea, **arriba** de la nav, sin que
nadie tenga que esconderla. Ese es el patrón: en vez de que un componente baje su
z-index para acomodarse, se le da el z-index que le corresponde y listo.
