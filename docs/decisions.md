# Decisiones de diseño

> Por qué el proyecto es como es. Cada decisión incluye lo que se descartó y
> por qué, para que no haya que volver a recorrer el camino.

---

## 1. Next.js + NestJS en vez de un monorepo con workspaces

**Contexto:** el proyecto nació con la intención de que dos agentes de IA
trabajaran en paralelo, cada uno en un proyecto sin pisar al otro.

**Elegido:** dos carpetas independientes, `frontend/` y `backend/`, cada una con
su `package.json` y su `pnpm-lock.yaml`. Sin workspaces, sin Turborepo.

**Por qué:**

- Un agente que trabaja en el backend nunca carga JSX en su contexto, y
  viceversa. Con un monorepo los dos leen el mismo árbol.
- Los agentes no se pisan en `package.json` ni en los lockfiles.
- Cada uno se despliega por separado.
- `pnpm run dev` en la raíz los levanta igual.

**Descartado:** npm workspaces + Turborepo. Daba type-checking cruzado y un
único `pnpm install`, a cambio de que cualquier agente toque el árbol entero.

**Costo asumido:** los tipos del contrato están duplicados a mano
(`frontend/types/api.ts` ↔ DTOs del backend). Regla estricta: **si tocás un
DTO, actualizá el otro lado en el mismo commit.**

---

## 2. Espejar el catálogo en PostgreSQL

**Contexto:** pokemontcg.io sin key permite 1.000 requests/día. El catálogo son
20.670 cartas: pedirlo en cada búsqueda es imposible.

**Elegido:** una tabla `cards` con el catálogo completo (20.670 filas, 176 sets),
sincronizada por un job. La búsqueda del usuario **nunca** toca la fuente.

**Por qué:**

- La búsqueda pasa de ~8,7 s (la latencia de la API) a milisegundos.
- El rate limit deja de ser una preocupación para el uso diario: 83 requests
  por sync completo es el 8 % del presupuesto diario.
- Se puede usar `pg_trgm` para búsqueda difusa con índice GIN, algo imposible
  contra una API HTTP.

**Consecuencia:** el catálogo es un snapshot. Si pokemontcg.io agrega un set
nuevo, no aparece hasta el próximo sync. Aceptado: son semanas, no minutos.

---

## 3. Precios bajo demanda, no precargados

**Contexto:** con 20.670 cartas, precargar todos los precios son 20.670
requests contra un presupuesto de 1.000/día. Imposible.

**Elegido:** los precios se piden **solo cuando hacen falta** y se cachean en
dos capas: Redis 1 h (rápido) y Postgres 24 h (persistente, con histórico
append-only).

**Por qué:** un usuario típico tiene decenas de cartas, no 20.670. Pedir solo
lo que mira usa una fracción del presupuesto.

**Regla de 24 h:** un precio más viejo de 24 h se vuelve a pedir. Es un balance
entre frescura y rate limit: TCGPlayer actualiza a diario, así que más rápido
que eso es tirar requests.

**Consecuencia conocida:** una carta recién agregada tarda ~2 s en tener precio,
y hasta entonces cuenta como $0 en el total. La UI lo maneja con skeleton y
un indicador "Actualizando precio…".

---

## 4. Cola en background con throttling

**Contexto:** agregar 50 cartas seguidas dispararía 50 requests al mismo tiempo
hacia el proveedor de precios, que pide "consideración" aunque no publique un límite.

**Elegido:** `enqueueRefresh` encola y procesa secuencialmente con 2,3 s entre
requests (~26/min) como cortesía hacia TCGdex. No es el límite de pokemontcg.io:
esa API entrega el catálogo y su cuota se aplica al sync de catálogo.

**Por qué no awaited en el request:** el usuario tardaría 2 minutos en ver su
alta confirmada. Fire-and-forget mantiene el alta en 54 ms.

---

## 5. OCR en el cliente, no en el servidor

**Contexto:** identificar una carta requiere visión por computador. Se evaluó
mandar la imagen al servidor.

**Elegido:** Tesseract.js corre entero en el navegador. Al servidor solo viajan
las **líneas de texto** resultantes.

**Por qué:**

- Sin upload, sin storage, sin concerns de privacidad de fotos de las cartas.
- El escáner funciona sin internet: Tesseract está auto-hospedado en
  `/public/tesseract` (~12 MB, cacheado por el service worker).
- El servidor nunca procesa imágenes: no necesita CPU ni queues.

**Costo:** +12 MB en el bundle de assets, y el primer escaneo de la sesión
tarda 8-12 s descargando wasm y `eng.traineddata`.

---

## 6. Tres variantes de preprocesado, gana la de mayor confianza de OCR

**Contexto:** el foil de las cartas rompe el OCR. Una carta holográfica leída
cruda puede no dar nada.

**Elegido:** se generan 3 variantes (original, grayscale+autoContrast,
adaptiveThreshold de Sauvola), se pasa cada una por Tesseract y **gana la de
mayor confianza**, no la más "nítida".

**Por qué la confianza y no la nitidez:** se implementó primero un selector por
nitidez (varianza de bordes) y **funcionaba peor que no hacer nada**. Una imagen
binarizada maximiza el gradiente total —cada transición salta de 0 a 255— así
que siempre ganaba, y la binarizada era justo la peor variante. Medido: nitidez
elegía threshold 8/8 veces, con 4/8 de acierto; la confianza elige bien 7/8.

**Por qué 3 pasadas de OCR (~2,6 s cada una) y no una:** la mejor variante varía
por carta. Medido: original gana 6/8, grayscale 7/8, threshold 4/8. Ninguna
sirve sola.

---

## 7. El backend matchea el OCR contra el catálogo, no el cliente

**Contexto:** al leer "115% 4 Charizard &" hay que decidir que el nombre es
"Charizard". ¿Heurísticas de regex en el cliente o fuzzy match?

**Elegido:** el cliente manda **todas las líneas sucias** y el backend las
fuzzy-matchea contra los 20.670 nombres reales.

**Por qué:** el cliente no tiene el catálogo. El catálogo es el mejor validador
que existe: si "Charizard" matchea exactamente un nombre del catálogo, es
"Charizard". Cualquier heurística de parsing (regex, stopwords, ventanas) es
inferior.

**Consecuencia:** el parser del cliente hace un trabajo modesto (limpiar y
mandar candidatos), y el backend carga con el ranking. Documentado en
`frontend/docs/scanner.md` y `backend/docs/api.md`.

---

## 8. Refresh tokens opacos, no JWT

**Elegido:** el access token es JWT (15 min). El refresh token es un string
aleatorio (`randomBytes(48)`) guardado hasheado en BD, con expiración de 30 días.

**Por qué:** un JWT no se puede revocar sin lista negra. Un string aleatorio en
BD se revoca con un UPDATE. Como la app tiene logout en varios dispositivos y
detección de robo, la revocabilidad importa más que la decodificación.

**Por qué se guarda hasheado (SHA-256):** si alguien lee la tabla
`refresh_tokens` no puede suplantar sesiones.

**Detección de reuso:** si un refresh token ya rotado se vuelve a usar, se
revocan **todas** las sesiones del usuario. Es la señal clásica de robo.

---

## 9. Ownership en el `where`, no como check previo

**Elegido:** `prisma.collection.findFirst({ where: { id, userId } })` en vez de
`findUnique({ where: { id } })` seguido de un `if (item.userId !== userId) throw
Forbidden`.

**Por qué:** ambos devuelven un error, pero distintos. Un 403 **confirma que el
recurso existe**. Con un 404, un atacante no puede distinguir "no existe" de "no
es tuyo", así que no puede enumerar IDs válidos probándolos.

Aplicado de forma consistente en colecciones, items, share links y amistades.

---

## 10. La vista de compartir es un link, no solo amigos

**Contexto:** el usuario pidió "compartir con amigos". Dos lecturas posibles:
links públicos, o un sistema de amigos.

**Elegido:** las dos, en fases. Los links públicos se implementaron primero
(Fase 5), el sistema de amigos después (Fase 8).

**Por qué ese orden:** un link público es un endpoint y una página. Un sistema
de amigos necesita búsqueda de usuarios, solicitudes, estados, privacidad y
una vista más. El link resuelve el 80 % del caso de uso con el 15 % del esfuerzo,
y sirve de base al caché compartido que reutiliza la vista de amigos.

**Modelo de privacidad:** el link expone `displayName` y nada más. Nunca email,
username ni id.

---

## 11. Cero N+1 con `$queryRaw` y `DISTINCT ON`

**Contexto:** el total de una colección requiere el último precio de cada item.
Con Prisma puro eso es un query por item.

**Elegido:** una consulta con `LEFT JOIN` contra un subquery
`SELECT DISTINCT ON (card_id, variant) ... ORDER BY card_id, variant, fetched_at DESC`.

**Por qué `DISTINCT ON`:** es la forma idiomática de Postgres para "la fila más
reciente por grupo", y el planner la resuelve en una pasada con el índice
`(cardId, variant, fetchedAt)` que ya existe.

**Consecuencia:** stats, lista de items, duplicados, share público y colección
de amigos usan todos el mismo patrón. Es la razón por la que la app no se
desploma con 500 items en una colección.

---

## 12. `pg_trgm` para búsqueda difusa, en una migración a mano

**Contexto:** buscar "pikachu" tiene que tolerar typos ("pikacu") y coincidencias
parciales.

**Elegido:** la extensión `pg_trgm` y los índices GIN se crean en
`prisma/migrations/20260925180600_add_pg_trgm/migration.sql`, **fuera** del
schema de Prisma.

**Por qué a mano:** Prisma no modela `gin_trgm_ops`, así que ve los índices
como objetos desconocidos.

**Consecuencia real y ya sufrida:** `prisma migrate dev` los **dropea** porque
no los reconoce. Hay que restaurarlos a mano después. Está en
`backend/docs/gotchas.md` y en `AGENTS.md`.

La estrategia de búsqueda es en capas: prefijo exacto primero (lo que el
usuario espera al teclear), y trigram como tolerancia a typos.
`cards_name_trgm_idx` se usa en las dos ramas de un `UNION ALL`; con un `OR`
único el planner abandona el índice y hace seq scan sobre 20k cartas (964 ms vs
38 ms medidos).

---

## 13. Búsqueda de usuarios también con trigram

**Elegido:** al agregar el modelo `Friendship`, se crearon dos índices trigram
más: `users_username_trgm_idx` y `users_display_name_trgm_idx`.

**Por qué:** buscar usuarios por prefijo es un LIKE, que sobre una tabla chica
no necesita trigram. Se agregaron por consistencia y porque la búsqueda tolera
coincidencia parcial ("juan" encuentra "Juana"). Costo cero en una tabla de
usuarios.

---

## 14. Conversión a ARS en el cliente, no en el server

**Contexto:** el usuario quiere ver precios en pesos.

**Elegido:** el server expone el rate (`GET /currency/usd-ars`) y el cliente
multiplica.

**Por qué:** si el server calculara ARS en cada lista de precios, cada request
público pagaría una consulta a DolarApi. Con la conversión en el cliente, el
rate se pide **una vez** y se aplica a todas las tarjetas ya renderizadas.

**Consecuencia:** `totalValueArs` y `priceArs` vienen `null` del server por
diseño. El DTO lo sugiere, pero es intencional. Documentado en
`backend/docs/pricing.md`.

---

## 15. Los precios no se cachean en Next.js

**Contexto:** la página de detalle de carta se renderiza en el server. Si se
cachea el precio en Next, la regla de 24 h del backend se pisa; y si se espera a
que la fuente responda, una carta vencida puede retener el SSR mientras la cola
respeta el rate limit.

**Elegido:** el SSR carga la carta/set (metadata estable, `revalidate: 3600`) y
no pide el precio. El cliente pide `/cards/:id/prices` al montar
`CardPriceSection`; el precio tiene su skeleton y el backend conserva la única
política de frescura/cache (Redis 1 h + Postgres 24 h).

**Trade-off:** una carta con precio cacheado también muestra el skeleton por el
tiempo de hidratación + la request del cliente, en vez de incluir la cifra en el
primer HTML. A cambio, la navegación de la ficha no queda atada al peor caso del
proveedor externo. La query de precios sigue siendo pública y pasa por la cola
throttled; no agregar polling ni refrescos por tile.

---

## 16. Errores de cámara: mostrar el detalle técnico

**Contexto:** cuando la cámara no abría, el mensaje era "Puede ser que otra app
la esté usando", que era una **suposición** escondida detrás de un error
genérico. El diagnóstico real costó muchísimo tiempo.

**Elegido:** el error de cámara se mapea a tipos específicos
(`permission-denied`, `no-camera`, `camera-busy`, `insecure-context`) y el
mensaje técnico real queda disponible en un `<details>` desplegable.

**Por qué:** además de ayudar al usuario, hace **diagnosticable** el problema. El
bug de StrictMode que rompía la cámara se encontró instrumentando `getUserMedia`
y `play()` desde el DevTools Protocol, no leyendo el código.

**Corolario general:** cuando un error no se puede explicar, exponer el detalle.
Un mensaje genérico esconde la causa.

---

## 17. Sin `any`, y tipos para lo unknowable

**Regla:** nada de `any`. Cuando el tipo no se conoce de antemano, se tipa con
un guard. Ejemplos reales del proyecto:

- `err instanceof DOMException ? err.name : ''` en lugar de castear errores
- `toNumber(value: Prisma.Decimal | null): number | null` para los Decimal de
  Prisma, que en runtime no son números
- `'text' in err` para acceder a `name` de un error desconocido

**Por qué:** los `Decimal` de Prisma y los errores del navegador son las dos
fuentes principales de bugs de tipo en runtime en este proyecto. Un `as number`
sobre un Decimal compila y rompe en el JSON.

---

## 18. Verificar con el navegador real, no solo con tests

**Regla:** los bugs más caros de este proyecto (input de búsqueda que se borraba,
cámara que no abría, grilla que se desbordaba) **pasaron tsc, lint y los tests**.

**Elegido:** para cualquier cambio de UI, verificar con Chrome headless y el
DevTools Protocol, con emulación de dispositivo real (390 px) y midiendo el DOM.

**Por qué:** los tres bugs anteriores eran de interacción y layout, categorías
que los tests unitarios no cubren. El de la cámara específicamente no se
encontró leyendo el código: se encontró interceptando `getUserMedia` y viendo
que el `play()` fallaba con `AbortError`.

**Herramienta:** `measure2.mjs`-style: conectar al puerto de debugging, navegar
con `Emulation.setDeviceMetricsOverride`, y leer `getBoundingClientRect` /
estados de React del DOM real.

---

## 19. El rediseño se construyó en paralelo y se activó de golpe, no por ruta

**Contexto:** el frontend tenía que pasar de una app a un design system nuevo
(tokens, tema claro/oscuro, 27 primitivas accesibles, 11 pantallas rediseñadas) sin
que ninguna persona se encontrara con una app rota a mitad del camino. La decisión
tenía dos variables: **dónde se construye** y **cuándo se activa**.

**Elegido:** construir la app nueva **al lado** de la vieja, bajo el prefijo `/v2`
y las carpetas `components/v2/` + `app/v2/`, y activarla **de golpe**, con un flip
que movió las carpetas, borró la app anterior y cambió las URLs de una sola vez
(2026-09-28).

**Por qué en paralelo (dónde se construye):**

- **Las dos apps podían compilar y testearse a la vez.** Un rediseño de esta
  magnitud rompe 33 componentes. Si se hace sobre la app viva, no hay forma de
  tener las dos en verde: o la nueva está a medio hacer y no se puede probar, o la
  vieja se tocó y el producto se rompió.
- **La app vieja siguió siendo la fuente de verdad del comportamiento.** Los bugs
  caros del escáner (el doble montaje de StrictMode, el `AbortError` del `play()`,
  el input de búsqueda que se borraba) se diagnosticaron y arreglaron **una sola
  vez**, en el código de producción, y el arreglo se copió a la app nueva. Sin
  convivencia, cada bug se arregla dos veces o se arregla solo en la copia.
- **Era la única forma de no bloquear el desarrollo del backend.** El backend
  cambió DTOs durante el rediseño (B4, B5, B7–B11). Con un frontend solo, cada
  cambio de contrato se negociaba contra una pantalla que estaba en construcción.

**Por qué de golpe y no por ruta (cuándo se activa):**

- **Una migración por ruta deja el producto en un estado híbrido que nadie pidió.**
  `/buscar` con el diseño nuevo y `/colecciones` con el viejo no es una versión
  intermedia útil: es un producto inconsistente, y el usuario que ve las dos
  pantallas en la misma sesión no sabe si está viendo algo bien o algo a medio
  hacer. El diseño es un contrato entre pantallas, no una propiedad de cada
  pantalla: un `Chip` con la forma nueva al lado de un filtro `<select>` viejo no
  es "parcialmente rediseñado", es roto.
- **El código viejo encima del nuevo obliga a mantener dos design systems en el
  mismo repo**, que es la forma más rápida de que el viejo sobreviva. Con las dos
  apps en el árbol, cada decisión nueva tiene que responder "¿cuál de las dos?" y
  la respuesta por defecto es la que no genera trabajo: copiar lo viejo. Después
  de ocho fases, borrar el código viejo es una tarde de dedos sobre el teclado, no
  una decisión.
- **Una sola URL por contenido.** Con dos versiones vivas, `/v2/share/abc` y
  `/share/abc` son la misma colección en dos direcciones. Eso obliga a poner
  `robots: noindex` en los layouts de la nueva, que es una pérdida de visibilidad
  deliberada en la única ruta que de verdad se indexa (la pública). Con el flip, cada
  URL tiene un contenido y el `noindex` desaparece por necesidad, no por goodwill.
- **El prefijo era el precio del paralelismo, y se paga solo en el flip.** Al vivir
  bajo `/v2/*`, los href se armaban con una constante única (`V2_BASE`) y no había
  ni un `href="/v2/…"` hardcodeado, así que el flip fue cambiar esa constante a `''`
  y mover carpetas. Sin el prefijo, el mismo trabajo habría sido cien ediciones
  manuales y un día entero buscando strings rotos.

**Lo que el flip costó, y por qué se aceptó:**

- **No hubo periodo de transición con ambos designs disponibles.** Durante la
  construcción, la app vieja era la que se veía, así que la nueva no acumuló
  usuarios reales hasta el flip. Eso es una ventaja y una zona ciega: los bugs de
  layout y de interacción de la app nueva se cazaron a ojo y con verificación
  manual, no con usuarios.
- **El `body {}` de `globals.css` y la `BottomNav` en standalone siguieron vivos
  durante todo el desarrollo del rediseño**, y hubo que recordar explícitamente que
  el rediseño los arreglaba. Es el tipo de deuda que sobrevive por inercia de la
  versión nueva. Está en `frontend/docs/gotchas.md` §H.
- **Quitar `V2_BASE` dejó espacios dentro de los template literals** (`` href: ` /buscar` ``,
  `${origin} /share/…`) que no detecta ni el typecheck ni el build ni el linter. Es
  el costo invisible de una transformación mecánica, y está en
  `frontend/docs/gotchas.md` §23.

**Costo asumido:** la duplicación temporal de componentes y de chrome durante ocho
fases, más un flip puntual que concentró el riesgo. A cambio: ni una sola pantalla
en producción corrió con dos versiones del diseño a la vez.

**La regla que sale de acá:** cuando el rediseño es del **sistema** y no de una
pantalla, la unidad de activación tiene que ser el sistema. El paralelismo sirve
para construir; no sirve para publicar. Y el código viejo se borra en el mismo
commit que activa el nuevo, porque "después lo borramos" es la fase que nunca
llega.
