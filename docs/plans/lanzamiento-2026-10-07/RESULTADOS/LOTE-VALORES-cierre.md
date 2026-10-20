# Lote valores BE-04 + FE-03 — gate estándar nuevo

9/10/2026 UTC · 8/10 local · GPT-6.1 Sol HIGH. **Gate estándar y runtime actual aprobados; cleanup completo.** El nuevo `pnpm run check` pasó, exit0, con Turbopack16.3.6 y la estrategia experimental `workerThreads`:894 pruebas/0skips,22 comprobaciones API/SSR, captura anónima focal y QA browser actual. Coordinación conserva aceptación/cierre de IDs/planes/registro.

La [evidencia histórica](LOTE-VALORES-validacion.md) continúa registrando el EPERM y el runtime webpack anterior. No se reemplaza ni se vuelve verde retroactivamente. La [corrección causal focal](BUILD-GATE-causal.md) cambió exclusivamente cuatro líneas de `next.config.ts`, usando el transporte nativo que evita el listener del pool child processes; ese cambio ya fue revisado por coordinación. No explica por qué las fixtures anteriores pasaron con el default. Dependencias/versiones, contratos y guards se conservaron.

## Check completo de esta ejecución

Ownership,430 hashes de fuente actual recibida, hashes de Nest/Next y conteos/IDs de infra se guardaron antes de crear recursos. Se ejecutó `pnpm run stop`, luego **`pnpm run check` exacto**, con `DATABASE_URL_TEST` en el clon propio y Redis dedicado. No se apagaron flags globales de jobs/crons: las pruebas de defaults conservaron su configuración; el runtime los apaga por separado.

| Paso | Resultado nuevo |
|---|---|
| Lint backend/frontend y guards colores/URLs | Aprobados |
| Typecheck frontend de raíz | Aprobado |
| Backend Vitest,28 archivos |389 aprobadas |
| Scripts Node backend |13 aprobadas |
| Backend e2e,2 archivos |6 aprobadas |
| Frontend Vitest,59 archivos |486 aprobadas |
| **Total** |**894 aprobadas,0 skips** |
| Nest producción | Aprobado |
| Next16.3.6 estándar Turbopack |**Aprobado; workerThreads experimental explícito** |

[Log estándar nuevo](LOTE-VALORES-cierre-anexos/check-standard.log). Escalación aceptada, sin rechazo auto-review. Sin webpack, cambios de bundler, mocks del build ni guard debilitado. Node22.20.0/pnpm10.17.1 conservados. El typecheck de raíz no ejecuta el tsc amplio de specs backend; sus errores baseline históricos no se presentan como resueltos.

## Contrato y consumidor en runtime actual

API Nest se inició después del check con su `dist` actual; Next sirvió el `.next` Turbopack construido en ese mismo check. Login/registro reales con cuentas ficticias `example.invalid`; no JWT fabricado. Guard de fetch externo en procesos Node, scanner/worker/crons apagados sólo en runtime, Redis aislado y cotización ARS ficticia1000 por USD. No proveedores consultados.

[15 comprobaciones API](LOTE-VALORES-cierre-anexos/runtime-api.json) y [7 SSR/vigencia](LOTE-VALORES-cierre-anexos/runtime-ssr.json) aprobaron:

- Principal USD49,11 copias/9 cotizadas/2 sin referencia, cobertura9/11. Normal10×3, reversa5×1, stale4×2, futura6×1 y cero0×2; condición LP/MP conserva referencia sin ajuste. Último normal null/mid99 no hace fallback; otros proveedor/mercado/moneda quedan fuera.
- Recencia6 fresh/2 stale/1 unknown, mixed; fecha futura aporta con edad unknown. Upstream null/unknown, separado de consulta/evaluación. Cache hits conservan `evaluatedAt` de ficha y público.
- Vacía amount0/0copias/ratio null; cero conocido amount0/2cotizadas; desconocida amount null/0de2. Filtro de lista no cambia resumen completo. Portfolio15copias/11cotizadas/USD49 y snapshot anteriorUSD9 con cobertura propia3/2, recencia/evaluación null; ranking referencia de la misma fila y subtotal por cantidad.
- Hero normal10/delta+8 y reversa5/delta−45, historial por variante/envelope null, días UTC y procedencia. ARS es conversión de la referencia con tasa ficticia; no venta local ni ganancia histórica.
- Replay misma UUID conserva cantidad3; otra UUID deliberada sube a4. Fixture restaurada a2 para QA. Sin sesión401, dueño200 y ajeno404.
- Público allowlist, cobertura completa y `no-store`, sin notas/email/IDs privados. API y SSR calentados: revocar devuelve API404/SSR genérica; reactivar recupera; vencer con Redis aún caliente devuelve API404/SSR genérica normal y bot, sin payload/metadata protegida. Un200 genérico de Next es compatible con DEC-02.

Seis jobs propios permanecieron pending/attempts0;0 jobs propios ejecutados y0 intentos externos registrados por el guard. El guard cubre fetch Node, no es una medición universal de red. No fotos ni inventario del usuario.

## Captura focal anónima SEO-01

[Evidencia sanitizada](LOTE-VALORES-cierre-anexos/privacy-focused.json): una colección ficticia, API dueño200/anónima401/ajena404 y Next anónimo200. UUID aportado en la ruta y nombres de campos aparecen en scripts Flight; no en documento literal sin scripts. Valores de dueño/otro usuario/ítem, email, nota privada, nombre/colección, contraseña y dos access/dos refresh tokens reales no aparecen en respuesta completa. Sólo labels/clases/ubicaciones/booleans/hash de evidencia sanitizada se conservaron; no HTML ni valores protegidos en repo. `noindex` observado no se usa como prueba de autorización.

El primer probe extrajo un nombre de cookie incorrecto: verificó access tokens pero no refresh values. Su captura se preservó y la captura final exige dos cookies reales `pcs.refreshToken`. No se atribuye ese error del runner al producto ni se cuenta como un nuevo caso del lote. No se repitió la matriz SEO de67 respuestas, ni se acredita dominio/SEO productivo.

## Browser y preservación

La superficie CUA del subagente no tenía browsers disponibles. **Coordinación ejecutó la QA actual** con fixtures congeladas, sin mutar ítems: [evidencia propia de browser](LOTE-VALORES-cierre-browser-root.json), SHA256 `787bc9133dedf77b696dbd9d21e3fda29a4850f21ce1526c79f8e5a285d32f77`. Mobile390×844/desktop1280×844, claro/oscuro, sin overflow observado; ficha ARS10000/USD10 y delta/procedencia, historial, variantes/Sheet con seis celdas ausentes como rayas y labels accesibles, foco de teclado/Escape/retorno al disparador. Colección ARS49000/cobertura9/11, portfolioARS49000/11de15 y snapshot distinto sin ganancia/ARS histórico, lista vacía/cero/desconocido. Público readonlyUSD49/9de11, no notas/email y expirado genérico. DOM anónimo de colección muestra login, UUID sólo en scripts y no en main, sin valores de la fixture.

Incidencias conservadas: ChunkLoadError inicial sobre un chunk anterior ausente; reload explícito recuperó `/inicio`. HTTP/HTML actuales no referencian ese chunk y sus16 referencias de assets existen. [Probe sanitizado](LOTE-VALORES-cierre-anexos/chunk-probe-detail.json). No se afirma una causa definitiva ni se reconstruyó el output por ese episodio. Locator inicial por label no coincidió y se resolvió por role; probe inicial «Sin precio» buscaba innerText en vez de aria-label, corregido por AX/DOM; observación inmediata de logout capturó estado transitorio y nueva navegación confirmó login/ausencia de fixture. No se acreditan esas observaciones iniciales como resultados finales.

Observación de métricas legacy: privado muestra «Únicas7» y público «Cartas únicas6» para7grupos/6IDs. [Clasificación estática](LOTE-VALORES-cierre-anexos/unique-cards-static.json): `/stats.uniqueCards` privado usa `COUNT(item.id)` y público `COUNT(DISTINCT cardId)`; los tipos/docs ya explican esa diferencia y los SQL/labels coinciden con la baseline histórica. No son dos métricas iguales ni7IDs únicos. Handoff acotado futuro: aclarar el rótulo privado ambiguo; no modificar DTO/UI durante esta corrección de transporte.

## Cleanup y entrega

[Recibo final](LOTE-VALORES-cierre-anexos/cleanup.json): fixtures propias users/collections/items/shares/cards/prices/jobs en0; PIDs API6235/Next6247 cerrados por SIGTERM después de verificar comando/padre/puerto. Wrappers finalizaron con241/143 derivados de esa señal, no de fallos del gate. Base propia retirada después de verificar comentario exacto, propietario y0 conexiones; Redis dedicado retirado por ID/nombre/label/bind127.0.0.1:56379, tmpfs sin volumen anónimo. Sin reset/migrate-dev/flush compartido.

Conteos dev y TEST preservados: dev20670cartas/176sets/11migraciones/5GIN/22usuarios/22colecciones/69ítems/13shares/29325precios/18721jobs/1snapshot; TEST20670/176/11/5GIN/2usuarios/3colecciones/2ítems/1share/188precios/0jobs/0snapshots. IDs Postgres/Redis dev iguales y healthy. [Antes](LOTE-VALORES-cierre-anexos/source-inventory-before.json)/[después](LOTE-VALORES-cierre-anexos/source-inventory-after.json). **Comparación agregada acotada, no snapshot de todas las filas.** Puertos3000/3001/3002/3313/56379 libres, comprobación dirigida final de wrappers/pools sin matches. Sesión ficticia cerrada, tema oscuro inicial restaurado, viewport reset y ambas pestañas propias cerradas por coordinación. Estado temporal con credenciales eliminado.

Las430 fuentes recibidas del gate permanecen idénticas al final; no nuevos edits de producto. Artefactos Nest/Next del check conservados: output Next2061archivos al iniciar runtime,2076 al entregar;15 cachés adicionales y0 hashes existentes cambiados/0 archivos faltantes. Se conservan manifiestos iniciales/finales, sin afirmar output invariante. Baselines/harness/logs/manifests propios preservados intencionalmente en `/private/tmp/valores-cierre-sol-20261009`.

**Reservas de writer/suites/stack/output liberadas, recursos propios activos0.** Este gate nuevo permite a coordinación aceptar el cierre local de BE-04/FE-03 y resolver la habilitación siguiente; el productor no modifica IDs ni centrales.

[Evidencia nueva](LOTE-VALORES-cierre-evidencia.json). No se reclama teléfono físico, precisión DINOv2, participantes, PWA/offline ni producción.
