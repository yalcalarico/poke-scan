# FE-07 + SEO-03 — revisión y correcciones Sol HIGH

2026-10-10 UTC · `/root/adquisicion_review_sol`. **Revisión local completa, gate pendiente.** La implementación recibida cumple la matriz de copy MKT-01 y el handoff local SEO-03 después de cuatro ajustes puntuales. FE-07 todavía necesita gate y QA visual; SEO-03 completo conserva dominio/configuración/salida productivos pendientes. No se cierran IDs ni se actualizan estados centrales.

Se preservaron los ocho archivos recibidos y la evidencia de Luna antes de modificar producto. [Baseline](evidencia-adquisicion-review/baseline.json), [verificación de ocho fuentes/copias del productor](evidencia-adquisicion-review/input-copy-verification.json), [diff exclusivo](evidencia-adquisicion-review/review.diff) y [evidencia estructurada](FE-07-SEO-03-review-evidencia.json) separan recibido, correcciones y verificaciones.

| Hallazgo | Resultado de revisión |
|---|---|
| FAQ independiente sin encabezado H1 | `FaqSection fullPage` usa H1; la sección embebida conserva H2. Mismo texto, ID y clases. La aserción existente de página completa ahora verifica nivel 1. |
| MIME ausente del descriptor OG explícito | Helper incluye `type: 'image/png'`, consistente con `contentType` de la imagen. Se amplía la aserción existente para las dos rutas. |
| Skip link raíz apunta a un destino ausente en adquisición | `id="contenido"` agregado al `<main>` existente de landing y FAQ. Fuente antes/después comprobada; foco y comportamiento reales quedan para gate. Root y shell intactos. |
| Colores de ImageResponse sin vínculo visible con tokens | `LIGHT_TOKENS` identifica canvas, marca, texto primario/secundario y señala sincronización con `globals.css`; los cuatro valores coinciden con CSS actual. ImageResponse no resuelve CSS variables; no se introduce otra paleta. |
| Posible contraste insuficiente según design-system | Hallazgo descartado: documentación conserva un valor oscuro anterior; CSS actual usa `#8a8a95`. Medición WCAG: 4,6798:1 claro y 4,9064:1 oscuro sobre `surface-2`, ambos AA. Se retiró la modificación temporal de caption; clase final idéntica a entrada. No se atribuye un fix de contraste. |

El copy coincide con las 22 filas aceptadas y los ocho ítems FAQ: fallback «Buscá. Revisá. Coleccioná.», CTA Gratis «Probar PokéScan», valores breves «Por set» y «Un link», Pro en evaluación con `/faq#faq-planes`, sin oferta/precio/cuotas/fecha/checkout. Referencia internacional, ARS al cambio actual, fecha de consulta separada de fuente y condición sin ajuste se explican en contenido. CSV, historial de cartas y observaciones del portafolio por consulta siguen Free. No se repitieron contratos o pruebas de capacidades ya aceptadas.

Las metadata de landing y FAQ son explícitas: descripción/título propios, canonical relativo, `siteName`, locale `es_AR`, URL, imagen/alt y Twitter. El título simple hereda el template raíz; el social agrega la marca una vez. No se presume combinación profunda de Open Graph ni se fija un host nuevo. `metadataBase` raíz y `NEXT_PUBLIC_SITE_URL` quedan intactos; el dominio por defecto existente no se acredita como despliegue aprobado.

Se contrastaron las guías empaquetadas con Next **16.3.6** y su resolver: la guía declara prioridad file-based; `mergeStaticMetadata` aplica la imagen de archivo en un nivel que no declara `images` propia. El helper declara `/opengraph-image` expresamente para OG/Twitter; el head efectivo por ruta/UA sigue sujeto al gate. La imagen exporta PNG 1200×630, marca/copy aceptados e icono local, leído con `node:fs` y `process.cwd()/public`; Docker standalone copia `public`. Next OG instalado carga Geist local con `fs`, aunque incluye fallback de assets dinámicos: esta lectura no acredita ausencia de requests en generación. No se generó ni sirvió el PNG aquí. [Fuentes leídas](evidencia-adquisicion-review/read-sources.json).

| Verificación | Resultado y evidencia |
|---|---|
| `pnpm run stop` antes de tests | Exit 0; [log completo](evidencia-adquisicion-review/logs/stop-before-regression.log). |
| FAQ + metadata, antes de corregir | Mismos seis casos: tres fallos esperados —H1 y MIME en dos rutas—, tres pases; exit 1. [Log causal](evidencia-adquisicion-review/logs/regression-before.log). |
| FAQ + metadata, después de corregir | Seis pases, dos archivos; exit 0. [Log completo](evidencia-adquisicion-review/logs/regression-after.log). Sin casos nuevos ni suite omitida. |
| Frontend lint posterior a última fuente | Exit 0; ESLint y guards de colores/espacios en URLs verdes. [Log final](evidencia-adquisicion-review/logs/lint-frontend-after-last-source.log). |
| Frontend `tsc --noEmit` posterior a última fuente | Exit 0, salida vacía. [Log final](evidencia-adquisicion-review/logs/typecheck-frontend-after-last-source.log). |
| `git diff --check` | Exit 0, salida vacía. [Log](evidencia-adquisicion-review/logs/diff-check-final.log). |

Las corridas de lint/tipos previas al retiro de la clase temporal también se conservan y se distinguen de las finales. Las últimas modificaciones de main/clase no alteran las aserciones focales ya verdes; no se repitió la suite por ellas. El warning de configuración Vitest permanece en logs. La primera medición privada de CSS falló por regex multilinea sin `re.S`; se corrigió la sonda, sin cambio de producto por ese error. [Medición y destinos antes/después](evidencia-adquisicion-review/static-review.json), [script](evidencia-adquisicion-review/static-review.py) e [incidencias](evidencia-adquisicion-review/incidencias.json).

La comparación final conserva **539/546 hashes recibidos**, con siete deltas de producto autorizados y cero faltantes. Los **29 archivos de evidencia del productor**, sus ocho copias finales y documentos de entrada permanecen intactos. Contra las **507 fuentes CUENTA**, siguen **502 intactas y cinco deltas de adquisición**; los tres archivos nuevos recibidos quedan identificados aparte. [Preservación y SHA-256 finales](evidencia-adquisicion-review/preservation-final.json). Cada objetivo tiene copia recibida/final y el manifest de entrega excluye su propio hash. Los hashes de centrales en fuentes leídas son una captura fechada, no invariantes del coordinador.

No hubo build, global, servidores, navegador, API, DB/Redis, consulta de proveedores, inferencia, despliegue ni contacto externo. Los históricos de backfill/socket hang up no se diagnosticaron ni repitieron. No se acredita composición 390/1280 en ambos temas, teclado/foco, movimiento reducido, preview servido, unfurl externo, lectores de pantalla, teléfonos o PWA instalada desde esta fase. El siguiente gate serial puede probar Next compilado, fallback prerender de landing, FAQ y las imágenes/tags efectivos sin API compilada obligatoria; la rama de cartas del preview existente no se declara validada con cartas reales.

**Reserva liberada al entregar; cero recursos runtime propios.** Coordinación decide aceptación y habilitación del gate estándar único; el estado central recibido 17/38 completos y 21 pendientes no cambia por esta revisión.
