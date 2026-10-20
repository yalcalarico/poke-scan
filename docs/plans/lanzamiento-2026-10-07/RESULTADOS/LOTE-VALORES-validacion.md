# Lote valores BE-04 + FE-03 — validación integrada

8/10/2026 · GPT-6.1 Sol HIGH. **Gate abierto por el build estándar de Next.** Contrato/consumidor, 894 pruebas y 22 comprobaciones API/SSR aprobaron; `pnpm run check` terminó con exit 1 al procesar CSS con Turbopack (`EPERM` al abrir su puerto interno). El build alternativo webpack aprobado acredita el runtime usado para QA, pero no reemplaza el estándar. No se cierran IDs ni se habilita otro lote.

## Revisión y preservación

Se leyeron AGENTS raíz/frontend, planes y decisiones, entregas BE-04/UX-03/FE-03 y gates anteriores. La revisión conjunta confirma tipos aditivos y parsers compatibles, `valuation.amount` canónico, cobertura por copias, metadata de la misma fila exacta de variante/proveedor/mercado/moneda y snapshots con cobertura propia. La condición no ajusta la referencia; legacy ausente no inventa fechas ni cobertura.

**No se modificó código de producto.** Se capturaron 296 hashes recibidos, diff Git y copias antes del gate. Los 105 archivos de código reservados presentes en ese manifiesto permanecen idénticos; [diff propio vacío](LOTE-VALORES-own-code.diff). Se conservan [430 hashes finales de fuente](LOTE-VALORES-final-source-sha256.json) y [510 hashes de artefactos runtime](LOTE-VALORES-runtime-built-sha256.json). Se usaron Nest compilado actual y Next construido ahora; las imágenes INF-02 anteriores y el harness mock FE-03 no se cuentan como evidencia de este flujo.

## Check estándar

Se ejecutó `pnpm run stop` antes de tests y `pnpm run check` con `DATABASE_URL_TEST` resuelta por el guard real hacia el clon propio, Redis exclusivo y scanner deshabilitado. Suites DB/Redis seriales; no había otro stack/writer.

| Verificación | Resultado |
|---|---|
| Lint backend y frontend; guards colores/URLs | Aprobado |
| Tipos frontend definidos por la raíz | Aprobado |
| Backend Vitest · 28 archivos | 389 aprobadas, 0 skips |
| Backend scripts Node | 13 aprobadas, 0 skips |
| Backend e2e · 2 archivos | 6 aprobadas, 0 skips |
| Frontend Vitest · 59 archivos | 486 aprobadas, 0 skips |
| **Total de suites** | **894 aprobadas, 0 skips** |
| Nest build producción | Aprobado |
| Next 16.3.6 build estándar Turbopack | **Falló: EPERM en bind del proceso CSS** |
| Next actual `build --webpack` | Aprobado; alternativa explícita |

[Log completo del segundo estándar](LOTE-VALORES-check-standard-2.log) y [panic conservado](LOTE-VALORES-next-standard-panic.log). La escalación fue aceptada, sin rechazo de auto-review. Dos controles mínimos de Node con bind efímero loopback/default aprobaron en el entorno autorizado; el bind interno de Turbopack continúa sin resolver. No se cambiaron framework, dependencias, configuración, fuentes ni guards para ocultarlo.

El primer estándar [se conserva](LOTE-VALORES-check-standard.log): 8 unitarias fallaron y 381 pasaron porque el runner temporal heredó flags worker/crons false en casos que verifican defaults habilitados. Se corrigió solo el runner: esos flags se aplicaron al runtime; e2e conserva los flags de su configuración y las unitarias usan sus mocks. El segundo estándar es el resultado global disponible. No se repitieron las suites después sin un cambio nuevo. No se ejecutó `tsc` amplio de specs backend: los 8 errores baseline documentados por BE-04 no se presentan como resueltos; Nest build y el typecheck de raíz sí aprobaron.

## Flujo real aislado

**15 checks API + 7 checks SSR/vigencia aprobados**, con registro/login reales de cuentas ficticias, no JWT sintético. [API](LOTE-VALORES-runtime-api.json), [SSR](LOTE-VALORES-runtime-ssr.json) y sus [logs API](LOTE-VALORES-runtime-flow-4.log)/[SSR](LOTE-VALORES-runtime-ssr.log) conservan resultados sin tokens, cookies, credenciales ni IDs privados de usuarios.

| Caso | Evidencia integrada |
|---|---|
| Variantes/cantidades/ausencia/cero | Principal USD 49, 11 copias, 9 con precio y 2 sin precio; ratio 9/11. Normal 10 × 3, reversa 5 × 1, stale 4 × 2, futuro 6 × 1 y cero 0 × 2. Último normal null con mid 99 permanece ausente; otro proveedor/mercado/moneda no contribuyen. |
| Recencia | 6 fresh, 2 stale, 1 unknown; mixed. Precio futuro puede contribuir con edad unknown. Upstream null/unknown; evaluación conserva instante en cache hit, sin convertirse en «ahora». |
| Vacío/cero/desconocido | Vacía: amount 0, coverage 0/0, ratio null. Cero conocido: amount 0, 2/2 cotizadas. No vacía sin mercado: amount null, 0/2. |
| Scope de lista | Filtrar por search devuelve 1 grupo; resumen conserva las 11 copias del alcance completo. |
| Portfolio/ranking | USD 49, 15 copias, 11 con referencia. Snapshot previo USD 9, 3 copias/2 cotizadas, evaluatedAt/recency null. Ranking 5 entradas por unitario, misma fila de procedencia y subtotal cantidad × market. |
| Ficha/historia | Hero normal USD 10 y delta USD +8; reversa USD 5 y delta −45. Cache hit conserva evaluatedAt. Envelope histórico variant null y días YYYY-MM-DD UTC, con instantes fetchedAt UTC y procedencia por punto. |
| Escritura | Misma UUID conserva cantidad 3 al replay; nueva UUID intencional suma a 4. Luego se restauró la fixture a 2. Sin sesión 401; colección ajena 404. |
| Público | USD 49 y cobertura 9/11, allowlist, no notes/email/hash/IDs privados. Cache hit conserva evaluación pública. Scope truncado de 500 sigue cubierto por las suites SQL globales; no se afirma nueva fixture runtime de 500. |
| SSR/vigencia | API y Next calentados, UA normal/Twitterbot; no-store/noindex, HTML/Flight sin datos privados. Revocar devuelve API 404 y nueva SSR genérica. Reactivar vuelve a servir. Vencer por SQL propio con key Redis aún caliente devuelve API 404 y SSR genérica sin nombres/cartas anteriores. |

El runtime tuvo worker y tres crons desactivados, confirmados por logs, y un guard temporal de fetch externo. **0 intentos externos registrados y 0 jobs propios ejecutados**; 6 jobs de fixtures quedaron pending/attempts 0. Cotización ARS ficticia cacheada: 1 USD = 1.000 ARS, sin pedir una cotización real. No se guardaron fotos ni se operó inventario del usuario.

Tres errores del harness API están conservados y no se atribuyen al producto: parámetro q en vez de search; expectativa de Z para el día YYYY-MM-DD; Next heredó PORT 3001 y tomó IPv4 junto al Nest IPv6. Se corrigieron exclusivamente archivos/argumentos temporales, limpiando fixtures exactas entre los intentos de datos y frenando solo el Next propio antes de usar puerto 3000. Logs [1](LOTE-VALORES-runtime-flow.log), [2](LOTE-VALORES-runtime-flow-2.log), [3](LOTE-VALORES-runtime-flow-3.log); el JSON parcial del intento 2 se conserva. El JSON parcial original del intento 1 fue sobrescrito por el runner; su log de fallo permanece y no se afirma una captura JSON completa de ese intento.

## Browser actual

CUA sobre rutas reales Next y API actual, con cuenta ficticia: ficha a **390×844 y 1280×844, claro/oscuro**, sin overflow horizontal en los casos observados. Capturas emitidas inline por CUA; no hay PNG persistido. [Registro de comprobaciones](LOTE-VALORES-browser.json).

La ficha hidratada muestra ARS convertido, normal USD 10/delta +8 y fechas UTC separadas; historial Enter expande procedencia sin abrir variantes; hero Enter abre el sheet. Shift+Tab desde su panel inicial y Tab permanecen dentro; Escape devuelve foco al hero. Sheet de item inicia reversa/MP/cantidad 1 con unitario/subtotal USD 5; cambiar variante retira referencia previa y exige guardar antes de mostrar otra, sin mutación durante QA. Footer visible en mobile y retorno al disparador comprobados.

Portfolio conserva gráfico, rangos, cobertura actual y snapshot anterior distinto, aclaración de cambio actual sin ganancia ni historia ARS atribuible; lista de colecciones distingue vacío/cero/ausencia. Público mobile oscuro mantiene USD con preferencia privada ARS, coverage 9/11 y evaluación cacheada; recargar el enlace vencido muestra estado genérico. No se capturaron errores/advertencias de browser en las rutas muestreadas. Una captura inmediata desktop oscuro mostró USD antes del bootstrap de sesión; la captura posterior hidratada confirmó ARS. No se confunde ese primer frame con el estado final.

No se acreditan teléfono físico/PWA instalada, lector de pantalla, teclado virtual, contraste medido, forced-colors, offline real, movimiento reducido ejecutado ni comprensión con participantes. No hay resultado 9/10 ni precisión DINOv2 derivada de este gate.

## Aislamiento, cleanup y entrega

Marker ownership creado **antes** de crear `valores_gate_sol_20261008_test` y Redis exclusivo etiquetado en puerto 56379. Clon de `pokemon_cards_test`: catálogo 20.670, 11 migraciones, 5 GIN; no migrate/dev, db push ni cambios de schema. La fuente TEST tenía 2 usuarios/2 items al inventario inicial; no se afirma que estuviera vacía. Desarrollo tenía 22 usuarios/69 items. Las lecturas finales mantienen esos conteos, cards/migraciones/GIN; es comparación agregada, **no snapshot completo de filas**.

Cleanup exacto [aprobado](LOTE-VALORES-cleanup.json): fixtures propias 0; API/web terminadas por SIGTERM con PID/puerto/comando verificados; 0 conexiones al clon, comentario ownership verificado y DROP exacto, base restante 0. Redis identificado por ID/nombre/label retirado y ausencia verificada, sin FLUSHDB de desarrollo ni limpieza de claves ajenas. Puertos 3000/3001 libres; Postgres/Redis dev siguen healthy. Logout del browser ficticio, tema oscuro original restaurado, viewport reset y pestaña propia cerrada; archivo temporal con credenciales ficticias retirado. Baselines/logs/harness/hashes se preservan en `/private/tmp/valores-gate-sol-20261008`.

**Reservas de writer, suites, stack y browser liberadas; sin trabajo huérfano ni recursos vivos propios.** Coordinación conserva planes/registro/estado/cierre. La única acción requerida para el gate técnico integrado es resolver la restricción del build estándar y obtener su aprobación; los éxitos del contrato/API/web no autorizan declarar el lote completo ni empezar el siguiente.

[Evidencia central](LOTE-VALORES-evidencia.json).
