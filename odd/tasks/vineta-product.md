# Viñeta — implementación del producto
Objetivo: implementar la dirección visual elegida y conectar sus funciones nuevas con la aplicación real. Rama de partida: `feat/collection-nm-policy`; rama de implementación actual: `feat/vineta-product`; entrega actual: un único PR general autorizado en `yalcalarico/poke-scan`, sin merge; después Home solamente en otro PR. La elección anterior de cadena fue reemplazada explícitamente.
Verificación: `pnpm run stop` con ownership comprobado; pruebas focales serializadas, `pnpm run check`, flujos aislados y navegador; verificación independiente de seguridad. Previsión inicial: 1.800–2.800 líneas authored; unidades coherentes, no minificadas.

## Specs

- **S1** — “Implement the design artboard design/vitrina-variantes/03-vitrina-comic.html”. Referencia visual: `design/vitrina-variantes/03-vitrina-comic.html`, título “Vitrina Viñeta”, tradeoff “Paneles narrativos, tramas y tinta marcada; más personalidad, menos neutralidad visual.” Comprobar correspondencia de pantallas, estados y navegación mobile/desktop, sin una segunda app. Corrección humana posterior: “las animaciones estan lentas, no parecen fluidas, la cartas en la vitrina no estan exactamente igual a como estaba en el diseño, los iconos y las secciones no quedaron igual”. Las pruebas funcionales previas no acreditan fidelidad exacta; se retomará por pantalla, primero Home después del PR general.
- **S2** — “Implement it in the project's real stack. Use the artboard as the visual spec: map its parts to the project's existing components and styles, and do not copy the artboard HTML verbatim.” Comprobar uso de componentes y clientes de API existentes; preservar escaneo, catálogo, precios TCGCSV, colecciones y enlaces reales.
- **S3** — “Take colors, typography, spacing, radius and shadows from design/system.md, the project's token source.” Comprobar tokens, foco, temas y movimiento reducido; reutilizar la capa visual existente y ofrecer pausa explícita de efectos.
- **S4** — “Report progress with the gentle_design tool: action "handoff", target "vitrina-variantes/03-vitrina-comic.html", status "in_progress" when you start; status "implemented" when it is done, with previewUrl set to the running app's loopback URL (localhost, 127.0.0.1 or [::1]) when one is running, so the canvas can compare it with the artboard.” No declarar implementado antes de observar los controles aplicables.
- **S5** — Decisión explícita: “Include the new product features”; alcance de la opción elegida: “Also implement goals, personal showcase, and account controls with real persistence where needed. PRO remains future-facing, without invented billing or benefits.” Comprobar persistencia, aislamiento por usuario/colección, validación de entradas y errores sin éxito ficticio. El artboard define los recorridos de objetivos, selección personal de cartas y perfil/clave; no autoriza inventar políticas legales, planes o beneficios.
- **S6** — “This design is not linked to an ODD feature document: size it under the project's ODD rules as usual.” / “This handoff itself commits nothing.” Registrar implementación, evidencia y decisiones sin inferir permiso de publicación ni atribuir commits al handoff.

## Tasks

- **T1** [S2,S5,S6] — Definir contratos comunes, migración aditiva y límites de edición; preparar entorno de pruebas sin alterar inventario real. Ruta: inline (schema y registros centrales, dueño único). Estado: done. Commit: `6374f44b3e167d1bb5e75f55e9c38084e8204f2e` (8 archivos/147 líneas añadidas). Evidencia: Prisma validate/generate y test migration verdes; luego dev migration aplicada con guard loopback/DB exacta y única pendiente esperada (job-11 código 0), sin crear/reescribir inventario, usuarios, precios o historia.
- **T2** [S1,S2,S5] — Ola paralela de producto: **T2a** objetivos persistentes por colección (crear/editar/elegir próximo y sugerencias); **T2b** vitrina personal con referencias reales, selección propia y preferencias persistentes; **T2c** perfil y cambio autenticado de clave con ajustes honestos de PRO/políticas. Cada subunidad conserva backend, frontend, pruebas y guía propios. Ruta: T2a delegated writer; los dos escritores restantes fallaron sin entregar implementación y no se relanzan. Continuación inline del parent tras «sigue», con pruebas serializadas y verificación independiente. Estado: done — corregidos tipos, espera post-save y B1 Unicode; gate completo post-corrección verde. Recheck independiente B1: HTTP→cliente real y 13 backend/17 frontend verdes; seguridad previa sin defecto de ownership/revocación reproducido. T2a: 11 backend/13 frontend reportadas; T2b inline: 10 HTTP + 10 cliente/rotación/componente verdes; T2c inline: 9 HTTP + 10 cliente/componente verdes. Rutas, persistencia y guías específicas agregadas. Seams de home/estilos y verificación global/independiente pertenecen a T5/T6. Commit: backend objetivos `43799e9`, vitrina `ee12bcf`, cuenta `1e3aad7`; clientes/UI objetivos `af3deb7`/`3ef8a41`, vitrina `8da7de6`/home `4b667b2`, cuenta `27b273b`/`a754fb6`; SHAs completos y boundaries en Log. Risk: item 2 (ownership y credenciales; cada subunidad tendrá evidencia propia).
- **T3** [S1,S2,S5] — Vitrina personal. Estado: dropped — consolidada en T2b para representar una única ola activa en el tracking; conserva su unidad independiente de cambios y verificación.
- **T4** [S1,S2,S5] — Cuenta real. Estado: dropped — consolidada en T2c para representar una única ola activa en el tracking; conserva su unidad independiente de cambios y verificación.
- **T5** [S1,S2,S3] — Integrar Viñeta en shell, primitivas/paneles, cartas y pantallas existentes, con pausa de efectos y reduced-motion. Ruta: inline (integración visual única; sin copiar HTML ni duplicar providers). Estado: pending — fidelidad exacta reabierta por reporte humano; empezar sólo Home en PR posterior al general. La base funcional permanece verificada: integración de fuente/guías, 9 pruebas focales, typecheck/build y aceptación renderizada 8/8 en ambos temas/mobile/desktop verdes. Límites vigentes: API simulada y fuente local sustituida; no cámara física/Safari/AA/pixel-perfect. Commit: tinta `1bb7a2377c1b8e3e95cfc173331ed70fdef960bf`, movimiento `564b15245fbe5731953f5d52055aeab32393fb32`.
- **T6** [S1-S6] — Integración, documentación, gates seriales, flujo aislado, navegador, verificación independiente, evaluación nativa y handoff con preview. Ruta: parent + verificadores acotados. Estado: in_progress — preparar/publicar primero PR general del estado actual, con issue aprobada y Refs; fidelity de Home va aparte. El handoff previo implemented se corrigió a in_progress tras reporte humano. Código final `564b15245fbe5731953f5d52055aeab32393fb32`; 12 slices de source registrados; slice de cierre identificable por el asunto único `docs(vineta): record verified implementation and preview`. Gate post-corrección completo verde; seguridad/B1 resueltos, real AppModule/JWT 6 casos/41 HTTP, browser baseline14/14 y nuevaUI8/8 verdes. Preview real `http://127.0.0.1:3000/inicio`; scheduler/colas suspendidos para no ejecutar ingesta/bookkeeping. Native ASSESS unavailable/unassessable por untracked incluso committed-only, sin reviewDue informado, lineage, consentimiento ni aprobación: no se inventan ni se repite evaluación idéntica. Estrategia actual single-pr por nueva instrucción humana; push/PR autorizados sólo para github.com/yalcalarico/poke-scan con GitHub CLI configurado; merge no autorizado. Fallos iniciales y límites permanecen en Log.

## Log

**L1 — Pedido original (verbatim)**

Implement the design artboard design/vitrina-variantes/03-vitrina-comic.html

Artboard: design/vitrina-variantes/03-vitrina-comic.html
Title: Vitrina Viñeta
Tradeoff: Paneles narrativos, tramas y tinta marcada; más personalidad, menos neutralidad visual.

Implement it in the project's real stack. Use the artboard as the visual spec: map its parts to the project's existing components and styles, and do not copy the artboard HTML verbatim.
Take colors, typography, spacing, radius and shadows from design/system.md, the project's token source.

Report progress with the gentle_design tool: action "handoff", target "vitrina-variantes/03-vitrina-comic.html", status "in_progress" when you start; status "implemented" when it is done, with previewUrl set to the running app's loopback URL (localhost, 127.0.0.1 or [::1]) when one is running, so the canvas can compare it with the artboard.
This design is not linked to an ODD feature document: size it under the project's ODD rules as usual.
This handoff itself commits nothing.

**L2 — Decisión de alcance (verbatim)**

User selected: 2. Include the new product features (value: include_product_features)

**L3 — Exploración y límites actuales**

El handoff está `in_progress`; todavía no hay implementación de producción. La home usa catálogo real y no preferencias personales. Hay colecciones múltiples y ajustes de moneda/sesión/eliminación, pero no objetivos conectados, vitrina editable ni cambio autenticado de clave identificado. Reutilizar AppVisualsProvider/VisualScope y los clientes/sesiones existentes. No restaurar V1/V2.

El runtime observado usa Node 22.20.0, pnpm 10.17.1, Next instalado 16.4.1 y RDD global on. No había listeners en 3000, 3001 o 3100; PostgreSQL 55432 y Redis 6379 estaban activos. `pnpm run stop` mata por puerto: comprobar ownership de nuevo antes de ejecutarlo. No se abrieron secretos ni `.env`. Los artefactos bajo `design/` son untracked preexistentes; no apropiarse de otros diseños ni borrarlos. La disponibilidad de navegador debe comprobarse mediante el runner local actual, no suponerse por el caché global que faltó en turnos anteriores.

**L4 — Contratos y ownership de implementación**

T1 terminó: Prisma validó schema, generó cliente 6.19.3 y aplicó la migración `20261029181255_vineta_product` sólo a DB local de tests. Ningún backend/frontend escuchaba en sus puertos; `pnpm run stop` terminó con código 0. T2–T4 se consolidaron en una ola T2 con subunidades T2a/T2b/T2c para tener un solo estado activo y mantener ownership disjunto. Las referencias T2/T3/T4 siguientes identifican respectivamente esas tres subunidades.

T1 añadió `CollectionGoal` (colección dueña, texto y timestamps), `Collection.nextGoalId` como referencia nullable con FK y `ShowcasePreference` (una preferencia por usuario, modo `value`/`personal`, IDs de cartas). La migración es aditiva; cliente Prisma 6.19.3 generado y schema validado. Los DTOs frontend comunes están en `frontend/types/api.ts`: `CollectionGoalDto`, `ShowcasePreferenceDto`, `ShowcaseCardDto`, `ShowcaseDto`, `PasswordChangeResponseDto`. Los escritores deben implementar sus DTOs backend compatibles, sin editar schema/types centrales.

T2 posee `backend/src/modules/collection-goals/`, `frontend/components/goals/`, `frontend/lib/api/goals*`, la ruta `colecciones/[id]/objetivos` y las conexiones de `collection-detail.tsx`/`collection-card.tsx`. Controladores autenticados para listar/crear/editar/elegir próximo dentro de una colección, con ownership en consultas; cero progreso fabricado. Debe entregar un `HomeGoalPanel` reutilizable para el seam de la home.

T3 posee `backend/src/modules/showcase/`, `frontend/components/home/`, `frontend/lib/api/showcase*`, la home `inicio/page.tsx` y `inicio/vitrina/`. Endpoint autenticado `/showcase`: lectura real de cartas propias con referencia local TCGCSV, preferencia guardada, selección manual validada contra ownership. Sin N+1 ni descargas a proveedores. En home usar atributos `data-vineta-hero`, `data-vineta-copy`, `data-vineta-showcase` como seams visuales; parent integra `HomeGoalPanel` después de terminar los escritores para no depender de una unidad paralela.

T4 posee `backend/src/modules/users/`, los nuevos archivos `auth/password-change*`, `auth/dto/change-password.dto.ts`, `auth/auth.controller.ts`/`auth.module.ts`, `frontend/components/settings/`, `frontend/lib/api/account*`, `ajustes/page.tsx` y rutas de edición de perfil/clave bajo ajustes. Reutilizar publicUserSelect, argon2, lock por usuario, authVersion, revocación de refresh/recovery y helpers de sesión existentes. No modificar formatos de tokens ni habilitar cambios de email. Los cambios de clave no pueden reintentarse automáticamente ni borrar una sesión más nueva desde una respuesta vieja.

El parent conserva `schema.prisma`, migración, `backend/src/app.module.ts`, `frontend/types/api.ts`, barrels centrales, guías compartidas, shell/UI/capa visual y este registro. Cada escritor incluye pruebas y una guía específica de su unidad. La pausa visual y Viñeta se integran en T5 sin tocar archivos que otro escritor esté editando.

Serialización: `.git/vineta-tests.lock` es un lock efímero creado por el parent, fuera de fuentes/versionado. Toda suite/typecheck/build de escritores adquiere `fcntl.flock(..., LOCK_EX)` leyendo ese archivo antes de ejecutar comandos; libera al salir, sin polling ni scripts de infraestructura del producto. El parent aplica migración sólo a DB local con nombre de tests, antes de permitir suites. No iniciar servidores ni correr otras suites sin ese lock durante escritura paralela.

**L5 — Evidencia de T2a y reparación de routing**

T2a retornó `completed`: 11 pruebas backend y 13 frontend verdes bajo lock; `git diff --check` verde. RED sólo acreditó módulos ausentes, no una aserción por regla; registrar esa limitación, no inventar TDD más fuerte. Parent conectó CollectionGoalsModule a AppModule. HomeGoalPanel queda para el seam.

Los otros dos lanzamientos fueron rechazados antes de escribir: el gate conservador reportó overlap para globs con rutas de App Router. No hubo segundo/tercer escritor activo ni cambios fuera de scope. Se crearon y registraron worktrees same-clone `.worktrees/vineta-showcase` y `.worktrees/vineta-account` desde HEAD 793e93b, con rama propia y copias de schema/types/spec/artboard. Node_modules se enlazan sólo a dependencias ya instaladas del mismo proyecto; no se copiaron `.env`, datos ni secretos. Sus suites resolverán el entorno de tests mediante el helper del repo original sin imprimir credenciales y usarán el lock del common Git dir.

ASSESS sobre el diff actual devolvió nativeRisk unassessable por selección explícita de untracked todavía necesaria; escalación item 2 mantiene verificación independiente obligatoria. No se inició lineage ni se obtuvo aprobación nativa. La llamada inicial desde codemode fue rechazada por el facade antes de operar; la evaluación directa sí devolvió el plan. Review sólo por herramientas directas en adelante.

Supuestos acotados para conectar el artboard: perfil edita nombre visible, no email sin verificación; contraseña usa los invariantes actuales de authVersion/revocación. Objetivos son textos por colección y elección del próximo, sin progreso ficticio. Preferencias de vitrina persisten por cuenta; precios y datos provienen de lecturas locales TCGCSV. PRO no implica plan activo, precio ni checkout. Estos supuestos evitan convertir mocks en permisos o información ficticia; cualquier divergencia contractual se eleva antes de escribirla.


**L6 — Continuación autorizada**

Usuario: «sigue». Se reconciliaron archivo y obs90; el proyecto Engram correcto es `poke-scan`. Los workers aislados mvtvm5y1-4-6w0i y mvtvm5y2-5-mjhr devolvieron `assistant reported an error`. La vitrina no dejó implementación y cuenta sólo dejó un test incompleto en su worktree. No se relanzan ni se promueven esos archivos. El parent continúa inline las unidades autorizadas, manteniendo límites de ownership, pruebas seriales y verificación independiente; ninguna prueba de esas unidades se considera pasada.


**L7 — Revisión del plan y evidencia de integración**

T6 continúa activo. El primer `pnpm run check` pasó lint (sólo warning preexistente de img en card-tilt.test.tsx) y se detuvo por dos tipos nuevos: identidad `item.card.id` y literal de fixture ShowcaseDto; corregidos y typecheck verde. La revisión de contrato agregó RED para mode `["value"]`, antes aceptado por coerción String; comparación estricta corrigió el caso y seis pruebas de cliente más typecheck pasaron. No hay suite completa ni build verdes aún. El instalador de Chromium local del proyecto terminó con código 0; no se modificaron dependencias. Se eliminaron diffs de formato de 14 archivos sólo tras comparar representación canónica Prettier idéntica; no se perdieron cambios semánticos.


**L8 — Revisión explícita del plan**

Pedido humano: “The todo plan has not been reviewed during several tool-use turns. Check whether it still matches the work performed and update tasks where needed. Do not mark work done without verification.”

Se revisó tarea por tarea. T2 se reabre por el único fallo observado del frontend completo: el test de editar/elegir objetivo espera desaparición del textbox, pero puede seguir en loading por reload; debe esperar el control final. Lint y tipos pasaron, backend Vitest 613 + scripts Node 25 y e2e 6 pasaron; frontend tuvo 669/670, por lo que no hay gate verde. Ops/build no fueron alcanzados. T5 conserva sólo evidencia focal de código/movimiento; layout renderizado no está acreditado. T6 sigue activo sin cierre ni handoff implemented.


**L9 — Gate completo e independencia**

`pnpm run check` terminó código 0 en job-7: lint, tipos, suites y builds completos. Esto precede la corrección B1, no la acredita. El verificador independiente mvu8wac2-6-bgwz comprobó 30 backend + 34 frontend verdes y un probe público de carrera: 200/401, incremento único de authVersion, revocación de refresh/recovery, 401 viejo y 429 sin mutaciones. No reprodujo defectos de ownership o revocación.

B1 es bloqueante S2/S5: título `'⚡'.repeat(59) + '😀'.repeat(31)` tiene 90 codepoints/121 unidades UTF-16. POST 201 y GET 200 backend, pero listGoals frontend da 502. `goals.ts` y editor usan length UTF-16 y el DTO usa codepoints. T2 permanece reabierta; se autoriza una corrección acotada a esa interoperabilidad, con pruebas permanentes y re-verificación de B1 únicamente, no otra revisión amplia. Navegador, runtime aislado con JWT real y revisión nativa siguen pendientes.


**L10 — Corrección acotada de B1**

Se reprodujeron cuatro fallos frontend con el ejemplo exacto del verificador y el límite de 120 emojis. Se corrigieron sólo conteo de codepoints en lector/editor y se retiró maxlength UTF-16; no se cambió el DTO backend ni otra política. Backend 13 + frontend 17 y typecheck focal terminaron código 0. Se fijaron regresiones permanentes y documentación de Unicode. Falta recheck independiente B1-only y gate completo posterior; T2 no se cierra todavía.


**L11 — B1 resuelto y gate posterior verde**

El recheck independiente mvu9ai5q-7-o1vm declaró B1 resolved, S2/S5 met para esa corrección: 13 backend/17 frontend y round-trip público POST201→GET200→listGoals real con el título exacto, sin cambiar producción. No repitió la revisión amplia. `pnpm run check` post-corrección (job-8) terminó código 0 incluyendo builds. T2 se cierra con esas pruebas; T6 sigue abierto por navegador, flujo aislado JWT firmado, revisión nativa y preview. El scratch del verificador quedó bajo ownership de su runtime; parent no borra rutas externas.


**L12 — Baseline real de navegador**

Job-9 `pnpm --dir frontend run test:browser` pasó 14/14 en Chromium aislado, sin screenshots/traces/videos. Teclado del escáner en ambos temas y forced-colors, login/restauración sintéticos, búsqueda, alta y edición conservaron contratos. No acredita JWT backend ni pantallas nuevas Viñeta; se mantiene T6 activo. El backstop de contexto del runtime exige delegar el próximo bloque acotado de varios pasos: prueba funcional de flujo HTTP real con JWT firmado, no otra revisión amplia.


**L13 — Aceptación HTTP con JWT firmado**

Runner funcional mvu9p3ho-8-r2ud (no nueva revisión amplia): seis casos, 41 requests HTTP con AppModule/JwtAuthGuard reales, código 0 y cero conexiones externas. Objetivo Unicode editado/próximo persistente; ajeno404; inválidos400 preservan fingerprint público. Vitrina personal null-price persistente y selección ajena400 sin cambios en ambas cuentas. Perfil persiste nombre/email intacto. Clave200, access/refresh/login viejos401; login nuevo200 y segunda cuenta/access/refresh200. Test DB local y dos usuarios sintéticos limpiados a cero; ningún precio/histórico insertado.

Incidente de setup scratch: faltaba packageManager raíz e intentó bootstrap Corepack antes de Vitest; corregido sólo scratch, red Corepack desactivada. Se registran dos ejecuciones verdes del mismo probe, segunda para detallar casos. pollPriceCycles hace bookkeeping aunque ingesta esté apagada; el runner detuvo los crons después de app.init. Fuente no modificada. Sigue pendiente UI nueva, runtime/preview, evidencia commits y review nativo; T6 abierto.


**L14 — Nueva UI y revisión del plan**

Pedido humano (verbatim): “The todo plan has not been reviewed during several tool-use turns. Check whether it still matches the work performed and update tasks where needed. Do not mark work done without verification.”

Runner mvu9whfh-9-00ia informó 8/8 casos finales en Chromium1440x1000/390x844, light/dark: home/vitrina/objetivos/perfil/clave, sin overflow/acciones tapadas en geometría medida, tinta/radios/sombras/títulos y foco computados, pausa data-paused y reduced-motion sin tilt. Unicode create/edit/next/readback, >120 sin request, preferencias/perfil y clave error/success-once/logout pasaron con fixtures stateful. Cero request inesperado/pageerror; 143 mensajes HTTP de consola esperados. Sin capturas/traces/videos ni listener3100 sobrante. Preliminares fallaron por setup/selectores e incluyeron timeout con servidor propio terminado; no se ocultan ni se presentan como primer intento limpio. No acredita backend otra vez ni fuente real/cámara/Safari/AA/pixel-perfect.

Se reconciliaron lista/documento/mirror: T1/T2/T5 done con evidencia limitada a su alcance; T3/T4 dropped sólo por consolidación; T6 in_progress, sin cierre anticipado. Plan read-only mvuam39t-a-2d60 propone 13 commits coherentes alrededor400 líneas, con UI objetivos~800 como excepción legítima por suite acoplada, sin cambios de source ni index. Ningún commit ejecutado todavía. El ASSESS más reciente del diff uncommitted devuelve nativeRisk unassessable por untracked; plan exige self+independent ya cubiertos. No inventar reviewDue ni consentimiento. Evaluación committed-only futura será candidato distinto, no replay del assess fallido. Sigue pendiente preview/runtime, recibos y handoff.


**L15 — Reconciliación solicitada y cambios observados**

Pedido humano (verbatim): “The todo plan has not been reviewed during several tool-use turns. Check whether it still matches the work performed and update tasks where needed. Do not mark work done without verification.”

Job-10 código0 creó rama feat/vineta-product y commit6374f44b3e167d1bb5e75f55e9c38084e8204f2e (contratos aditivos8 archivos/147 líneas). Job-11 código0 verificó localhost55432/pokemon_cards, ninguna migración incompleta y sólo20261029181255_vineta_product pendiente; deploy la aplicó, sin fixtures/usuarios/precios/histórico. T1 actualizado con esa evidencia, no se declara runtime listo. ASSESS committed-only base793e93bd22713c6115cc3d75f4549f2c1d737284 volvió unassessable por untracked; se registra unavailable, no aprobación ni lineage. No repetir idéntica evaluación por cada slice. Plan reconciliado: T2/T5 conservan pruebas observadas, T3/T4 consolidación; T6 activo,12 slices/preview/handoff aún no acreditados.


**L16 — Revisión del plan y boundary antes de otro commit**

Recordatorio del turno (verbatim): “The todo plan has not been reviewed during several tool-use turns. Check whether it still matches the work performed and update tasks where needed. Do not mark work done without verification.”

Segundo commit `43799e91b05da701e2135cb4b8f8e07a69b98463` contiene backend objetivos+HTTP tests+guía+wiring sólo objetivos,477 líneas. Slice previo `6374f44`147 líneas; boundary explícito entre ambos. Estrategia local: cada unidad coherente conserva pruebas/docs, objetivo~400 y excepciones justificadas por suite acoplada (objetivos backend477/UI~800). No revisar ni entregar la rama acumulada como candidato único; rangos por commit/parent cuando native permita evaluar. Sin push/PR/publicación ni autorización inferida. Boundary registrado antes del siguiente commit.

Jobs12/13 lanzaron API/frontend de preview propios. El bootstrap usa AppModule real, validación/helmet/metrics/CORS de loopback y suspende SchedulerRegistry/colas para no ejecutar bookkeeping/ingesta durante preview; no cambia fuentes. Job14 readiness terminó22 por HTTP404. Todavía se desconoce qué endpoint falló: no declarar ninguna comprobación parcial ni preview listo. T6 sigue activo para diagnóstico;11 slices/preview/handoff restantes. T1/T2/T5 conservan sólo sus pruebas observadas.


**L17 — Preview conectado y gate de estrategia**

Diagnóstico acotado: API/api/health200, frontend/inicio200, frontend/api/health404; next.config.ts sólo activa DEV_API_PROXY_TARGET en development. No hay regresión de producto demostrada. Se detuvo sólo job13 propio y se inició job15 Nextdev--webpack con NEXT_PUBLIC_API_URL/api y proxy existente. Job16 readiness código0 tras esperar arranque: homepage y proxy real respondieron correctamente. APIjob12 conserva módulos/guards/datos reales, colas/scheduler suspendidos para no ejecutar bookkeeping. Preview `http://127.0.0.1:3000/inicio` adjuntado al canvas con statusin_progress; no se marca implemented.

Se cargó skill chained-pr al superar presupuesto: delivery_strategyask-on-risk obliga elegir una vez el menú de tres estrategias antes del siguiente work-unit commit. Dos commits624 authoredlines; mejor división honesta13slices, backend objetivos477 y UIobjetivos~800 como sobrepasos justificados por comportamiento/suite acoplados. No se itera otra división ni se comprime código. Se recomienda feature/trackerbranchchain por dependencias de integración; alternativasdefaultbranchchain osinglePR. Elección futura no autoriza push/PR/merge ni consentimiento nativo. T6 queda blocked esperando esta decisión externa;11 slices y cierre/handoff pendientes.


**L18 — Estrategia elegida**

User selected: 1. Feature/tracker branch chain — recommended (value: chain_strategy=feature-branch-chain)

Se levanta el bloqueo de T6. Continuar unidades locales preservando pruebas/docs y los límites honestos; registrar los SHAs para futura cadena detrás de feature/tracker. No crear tracker/child PR, push o merge: la pregunta y decisión no lo autorizan. No implica consentimiento nativo ni excepción de tamaño aprobada.


**Slice U3 — boundary observado**

Commit `ee12bcf0f12319a83df91767a9d369b3fd7ff7fc`, parent `43799e91b05da701e2135cb4b8f8e07a69b98463`, 373 authored changed lines. Risk: item 2 (ownership). Pruebas/docs conservadas con comportamiento; source final no modificado, no suite repetida. Candidato eventual sólo este rango, no rama acumulada. Estrategia elegida feature-branch-chain; sin push/PR/merge. Boundary registrado antes del próximo commit.


**Slice U4 — boundary observado**

Commit `1e3aad75448d984d8380809bdd1b0d3ae3e0dc25`, parent `ee12bcf0f12319a83df91767a9d369b3fd7ff7fc`, 397 authored changed lines. Risk: items 2/4 (credentials, serialized revocation). Pruebas/docs conservadas con comportamiento; source final no modificado, no suite repetida. Candidato eventual sólo este rango, no rama acumulada. Estrategia elegida feature-branch-chain; sin push/PR/merge. Boundary registrado antes del próximo commit.


**Slice U5 — boundary observado**

Commit `af3deb75c29a61b2c3a8606d713d71dd31c40a5e`, parent `1e3aad75448d984d8380809bdd1b0d3ae3e0dc25`, 172 authored changed lines. Risk: none. Pruebas/docs conservadas con comportamiento; source final no modificado, no suite repetida. Candidato eventual sólo este rango, no rama acumulada. Estrategia elegida feature-branch-chain; sin push/PR/merge. Boundary registrado antes del próximo commit.


**Slice U6 — boundary observado**

Commit `3ef8a41e70a9e461ad9af4b74646cc1a81074e28`, parent `af3deb75c29a61b2c3a8606d713d71dd31c40a5e`, 811 authored changed lines. Risk: item 2 (private collections); cohesive ~800-line suite overage accepted under chosen layout. Pruebas/docs conservadas con comportamiento; source final no modificado, no suite repetida. Candidato eventual sólo este rango, no rama acumulada. Estrategia elegida feature-branch-chain; sin push/PR/merge. Boundary registrado antes del próximo commit.


**Slice U7 — boundary observado**

Commit `8da7de6967c51fc6972e481d1f8dc89457840b5d`, parent `3ef8a41e70a9e461ad9af4b74646cc1a81074e28`, 377 authored changed lines. Risk: item 2 (private selection). Pruebas/docs conservadas con comportamiento; source final no modificado, no suite repetida. Candidato eventual sólo este rango, no rama acumulada. Estrategia elegida feature-branch-chain; sin push/PR/merge. Boundary registrado antes del próximo commit.


**Slice U8 — boundary observado**

Commit `27b273b11d29cd1b30bfa489f6b897c50d1b6580`, parent `8da7de6967c51fc6972e481d1f8dc89457840b5d`, 452 authored changed lines. Risk: items 2/4 (credentials and session epochs). Pruebas/docs conservadas con comportamiento; source final no modificado, no suite repetida. Candidato eventual sólo este rango, no rama acumulada. Estrategia elegida feature-branch-chain; sin push/PR/merge. Boundary registrado antes del próximo commit.


**Slice U9 — boundary observado**

Commit `a754fb69304e3372782ea34889ae22956e19d1d1`, parent `27b273b11d29cd1b30bfa489f6b897c50d1b6580`, 216 authored changed lines. Risk: item 2 (profile updates). Pruebas/docs conservadas con comportamiento; source final no modificado, no suite repetida. Candidato eventual sólo este rango, no rama acumulada. Estrategia elegida feature-branch-chain; sin push/PR/merge. Boundary registrado antes del próximo commit.


**Slice U10 — boundary observado**

Commit `4b667b2d78e6ce77b6f329359b7199bcc2ee1739`, parent `a754fb69304e3372782ea34889ae22956e19d1d1`, 392 authored changed lines. Risk: item 2 (private session data). Pruebas/docs conservadas con comportamiento; source final no modificado, no suite repetida. Candidato eventual sólo este rango, no rama acumulada. Estrategia elegida feature-branch-chain; sin push/PR/merge. Boundary registrado antes del próximo commit.


**Slice U11 — boundary observado**

Commit `1bb7a2377c1b8e3e95cfc173331ed70fdef960bf`, parent `4b667b2d78e6ce77b6f329359b7199bcc2ee1739`, 405 authored changed lines. Risk: none. Pruebas/docs conservadas con comportamiento; source final no modificado, no suite repetida. Candidato eventual sólo este rango, no rama acumulada. Estrategia elegida feature-branch-chain; sin push/PR/merge. Boundary registrado antes del próximo commit.


**Slice U12 — boundary observado**

Commit `564b15245fbe5731953f5d52055aeab32393fb32`, parent `1bb7a2377c1b8e3e95cfc173331ed70fdef960bf`, 269 authored changed lines. Risk: none. Pruebas/docs conservadas con comportamiento; source final no modificado, no suite repetida. Candidato eventual sólo este rango, no rama acumulada. Estrategia elegida feature-branch-chain; sin push/PR/merge. Boundary registrado antes del próximo commit.


**L19 — Source completo y revisión final del plan**

Recordatorio del turno (verbatim): “The todo plan has not been reviewed during several tool-use turns. Check whether it still matches the work performed and update tasks where needed. Do not mark work done without verification.”

Se observaron12 commits source, último564b15245fbe5731953f5d52055aeab32393fb32; diff de backend/src, frontend/app/components/lib/types y Prisma vacío respecto a HEAD. Restan sólo guías centrales/índice/tarea para slice13, sin tocar código ni repetir suites verdes intactas. T6 no se marca done hasta observar handoff y recibo final. La UIobjetivos811 líneas es el sobrepaso real de la única división honesta; no se comprime código ni se infiere una excepción de política.

Nextdev regeneró automáticamente frontend/AGENTS.md cambiando sólo heading # por ## dentro del bloque administrado; se inspeccionó el diff. No se edita manualmente ni se stagea ese bloque, y se deja explícitamente fuera del cierre junto con design/ preexistente. No hay otros cambios de producto sin commit. Estado inicial404 pertenece a configuración nextstart/proxy; previewdev posterior pasó, y se conserva el fallo en evidencia. Evaluación nativa permanece unavailable, no aprobada.


**L20 — Cierre observado**

Pedido humano (verbatim): “continue”

El canvas devolvió handoff implemented para vitrina-variantes/03-vitrina-comic.html y preview http://127.0.0.1:3000/inicio. S1/S2/S3/S5 quedaron cubiertos por gates y aceptaciones acotadas registradas; S4 por respuesta real del canvas; S6 por recibos locales, sin atribuir commits al handoff ni publicar. Source final564b15245fbe5731953f5d52055aeab32393fb32, con todos los SHAs y boundaries anteriores; el cierre documental queda en el commit de asunto único docs(vineta): record verified implementation and preview, resoluble con git log.

Resultado: gate completo posterior a B1 verde, backend/cliente/componentes focales verdes, baseline navegador14/14 y Viñeta8/8, aceptación AppModule/JWT real6 casos/41 HTTP. Fallos previos de tipos, espera async y contrato Unicode fueron corregidos y probados; los incidentes scratch/setup/timeout y readiness404/proxy se conservan arriba. Sin capturas/traces/videos. Native assessment unavailable/unassessable: no reviewDue inventado, START/consent/lineage/approval inexistentes; no se declara revisión nativa aprobada. La verificación independiente obligatoria sí se completó.

Límites: UI contra fixtures stateful/fuente local en Chromium, sin cámara física/Safari/AA/pixel-perfect; flujo HTTP real separado acreditó DB/ownership/JWT. Preview actual usa datos locales reales con scheduler/colas suspendidos; no inventa precios, historia, planes o políticas. design/ preexistente y heading regenerado por Next en frontend/AGENTS.md se preservan fuera de los commits. Estrategia futura feature-branch-chain elegida; cero push/PR/merge. No queda tarea autorizada pendiente; publicación futura sigue siendo decisión humana.


**L21 — Corrección humana y secuencia nueva**

Pedido humano (verbatim): “Crea el PR y sube todo.

Luego, te pregunto, ya se implemento todo el design? Las animaciones estan lentas, no parecen fluidas, la cartas en la vitrina no estan exactamente igual a como estaba en el diseño, los iconos y las secciones no quedaron igual”

Precisión humana (verbatim): “primero sube el PR con todo, luego hagamos algo, vamos pagina por pagina, que quede exactamente igual que el desiño, comencemos con el home y asi vamos avanzando, limitemos el scope por pantalla asi podemos hacer todas las validaciones y dejar en cada PR cada pagina.”

Se reconoce que el cierre anterior fue demasiado amplio: gates funcionales/geométricos no prueban igualdad visual exacta o fluidez percibida. T5 se reabre para fidelidad; el reporte todavía requiere reproducción en Home, sin afirmar que ya funciona. El canvas vuelve a in_progress con esa limitación explícita. Este PR general no contiene correcciones nuevas de Home; debe documentar el estado actual y problemas reportados. Después, otra feature y otro PR limitados a Home. No avanzar otras pantallas en ese trabajo.

Humano autorizó explícitamente destino público github.com/yalcalarico/poke-scan, sesión GitHub CLI configurada, lecturas/push/un PR general, sin merge. Metadata fresca: defaultmaster, sesiónyalcalarico, permisoADMIN. No había PR de feat/vineta-product ni issue de Viñeta; única abierta20 es ajena (TCGCSV), no reutilizarla. También autorizó crear issue Viñeta, aplicarle status:approved, crear/aplicar type:feature y usar Refs sin cierre automático. Esa aprobación es del alcance, no del resultado visual ni del merge. La issue se crea por operación separada observada.

“Todo” incluye fuentes de diseño presentes y heading regenerado por Next, sin editar manualmente el bloque administrado, sin secretos/.env/cache/worktrees. Se inspeccionaron manifests/comments/handoff y URLs: sin credenciales observadas; sólo preview loopback en handoff. La publicación es pública y no se presentan prototipos como datos/precios reales. No se repiten suites/builds verdes intactos por empaquetar documentación y artefactos sin cambiar producto. Se verifica sintaxis de scripts inline, JSON y diff.


**L22 — Gate remoto observado**

Job18 terminó0: etiqueta type:feature creada e issue https://github.com/yalcalarico/poke-scan/issues/22 creada con status:approved/type:feature por instrucción humana exacta. PR general debe usar Refs #22, no Closes/Fixes. La aprobación de alcance no acredita fidelidad visual ni autoriza merge. Inspección estructural local:7HTML,4JSON y7scripts inline válidos; scripts no ejecutados y cero requests de red en esa inspección. No se corrió de nuevo la suite de producto por subir artefactos/documentación sin cambiar lógica frontend/backend.


**L23 — Incidente de empaquetado separado**

El primer commit de artefactos no se ejecutó: git diff --cached --check detectó espacios finales preexistentes dentro del CSS de siete HTML. El orquestador había lanzado el push de la base ya commiteada sin condicionar ese lanzamiento al exit2 del chequeo; se registra ese defecto de secuencia. No se creó PR ni se afirmó subida completa. Se normalizaron sólo espacios finales dentro de style, sin cambiar otros nodos ni scripts, comparando CSSOM y DOM sin style antes/después en los siete archivos: idénticos. La subida final debe apuntar al commit de artefactos, sin force; no es un fix de Home.
