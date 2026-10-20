# Auditoría de documentación — 20/10/2026

> **Limpieza aplicada posteriormente:** ver [entrega y verificación](documentation-cleanup-2026-10-20.md). Este informe e inventario describen el snapshot anterior.

**Resultado:** hay documentación operativa desactualizada, diseños sustituidos y demasiado historial presentado junto al estado actual. No corresponde borrar las evidencias ni tratar todo documento antiguo como obsoleto. Esta entrega es una revisión y propuesta; no mueve, elimina ni reescribe las fuentes existentes.

## Cobertura y método

Snapshot auditado: `3262248b548910f3532178f674fcc74987d009d5`. Se inventariaron **1.717 archivos documentales y anexos**, incluidos **327 Markdown**, sin seguir enlaces simbólicos. El universo incluye `docs/`, `frontend/docs/`, `backend/docs/`, README/instrucciones raíz, documentación operativa de `infra/`, accesos Obsidian y manuales versionados de herramientas.

Se revisaron semánticamente las guías de entrada, frontend/backend, arquitectura, fuentes, decisiones, coordinación y familias de planes; las afirmaciones señaladas se contrastaron con manifiestos, rutas, servicios, schema y scripts. Los anexos históricos se inventariaron por familia, hashes, duplicación y referencias: **no se afirma haber revalidado su contenido como funcionalidad actual ni haber releído cada línea de cada copia**. No se verificaron enlaces externos, precios de proveedores ni condiciones comerciales.

| Grupo | Cantidad | Tratamiento |
|---|---:|---|
| Guías actuales de referencia | 32 | Conservar y corregir contradicciones puntuales |
| Coordinación mezclada con historial | 16 | Consolidar estado; separar la bitácora |
| Planes de dominio | 4 | Revisar vigencia por sección, conservar pendientes reales |
| Diseños visuales sustituidos | 5 | Candidatos a archivo histórico, con reemplazo explícito |
| Planes terminados | 4 | Candidatos a archivo, preservando cualquier pendiente todavía válido |
| Evaluaciones y protocolos | 92 | Conservar método/fecha/limitaciones y enlace al último contraste |
| Anexos de evidencia | 1.264 | Preservar contenido, hashes y rutas |
| Resultados/revisiones fechados | 202 | Mantener como historia; no convertirlos en órdenes actuales |
| Contratos o entregables humanos | 16 | Comprobar reemplazo antes de archivar |
| Operación y hardware diferido | 11 | Conservar; actualizar instrucciones afectadas |
| Herramienta beta | 3 | Conservar en uso manual |
| Accesos Obsidian | 11 | Son enlaces, no once copias de la documentación |
| Manuales de herramientas | 57 | Fuera del juicio de «no uso» de producto; no retirarlos por su antigüedad |

La clasificación completa y sus límites están en [el inventario](documentation-inventory-2026-10-20.json). Son categorías propuestas para revisión, no estados aprobados de tareas.

## Qué está obsoleto o contradice el código

| Prioridad | Documento | Hallazgo comprobado | Acción recomendada |
|---|---|---|---|
| Alta | [docs/files/00-README.md](../files/00-README.md):4–15 y [01-CONTRACTS.md](../files/01-CONTRACTS.md):3–14 | Se presentan como punto de entrada/fuente de verdad de un `POST /api/cards/identify` público y OCR. El flujo actual es DINOv2 autenticado en `identify-visual`. | Retirarles autoridad operativa y archivar el paquete de diseño sustituido. Reemplazos: [scanner](../../frontend/docs/scanner.md), [API](../../backend/docs/api.md), [regla DINOv2](../../AGENTS.md). |
| Alta | [AGENTS.md](../../AGENTS.md):46–62,278–284 | Reduce el sistema de precios a pokemontcg.io y dice que búsqueda por número/artista, orden por precio e intercambio server-side siguen sin UI. Estas capacidades ya existen. | Actualizar la fuente de instrucciones. Conservar rate limits aplicables, separación catálogo/precios y demás restricciones técnicas. |
| Alta | [backend/docs/jobs.md](../../backend/docs/jobs.md):358–394 | Afirma «No hay scheduler» y «ningún @Cron»; luego describe crons y backfill horario. También llama al gate «compartido por proceso» en :23. | Reescribir una sola descripción vigente: diario TCGdex 03:15 UTC, TCGCSV 21:00 UTC, reanudación y gate persistente. |
| Alta | [README.md](../../README.md):102,116–118 | Presenta backfill horario y dice que Redis necesita reiniciar el backend para reconectar. | Sustituir por el comportamiento actual de ciclos diarios y reconexión. |
| Alta | [Seis registros centrales](../plans/lanzamiento-2026-10-07/) | Comparten encabezados hasta el 15/10, seguidos por «corrección activa» y pasos ya cerrados. No incorporan los hitos posteriores de precios diarios, V2 y contraste del escáner. | Un estado actual breve con enlaces; bitácora fechada aparte. Mantener contratos y decisiones, sin recalcular ni cerrar IDs automáticamente. |
| Media | [architecture.md](../architecture.md):23–73, [data-sources.md](../data-sources.md):8–20, [providers.md](../../backend/docs/providers.md):20–40 | Resumen incompleto de TCGCSV, comparación e históricos. La tabla de Scrydex mezcla disponibilidad externa con integración local. | Actualizar arquitectura y catálogo de fuentes; aclarar implementado, opcional/configurable y alternativa futura. No verificar o inventar estado comercial del proveedor en esta limpieza. |
| Media | [backend/README.md](../../backend/README.md):82–106,118–120 y [modules.md](../../backend/docs/modules.md):3–43 | Inventarios de 10 modelos/3 migraciones y 104 tests quedaron atrás. El schema tiene 27 modelos y hay 16 migraciones; el mapa de módulos omite account-deletion y metrics. | Actualizar el mapa y retirar cifras volátiles de la guía de entrada. Los conteos de pruebas deben quedar en recibos fechados. |
| Media | [backend/docs/api.md](../../backend/docs/api.md):12–30,1860–1867 | Índice/conteos no reflejan rutas añadidas; aún describe el flag Redis `sync:cards:complete` como referencia de sync. | Sincronizar índice con controllers y describir el estado/lock PostgreSQL actual. Conservar los contratos vigentes. |
| Media | [frontend/docs/routes.md](../../frontend/docs/routes.md):5–15,30 | El encabezado ya activa V2 por defecto, pero el cuerpo dice que no hay alias y sigue llamando experimental a `/buscar-v2`. Declara 15 pantallas frente a 16 `page.tsx`. | Unificar el texto con V2 predeterminada y Clásica explícita; conservar la ruta compatible. |
| Media | [frontend/README.md](../../frontend/README.md):68–90 y [components.md](../../frontend/docs/components.md):35–50 | Árbol/provider chain e inventarios incompletos respecto de recuperación/eliminación de cuenta y capa visual. `app/providers.tsx` monta Theme/Auth/Currency/Toast. | Actualizar la navegación documental y el mapa, conservando las reglas de separación de proyectos. |
| Media | [Prompt mini PC](../infra/PROMPT-mini-pc-cloudflare.md):3–7 | Su cabecera ya retira topes TCGCSV, pero el checkpoint siguiente aún instruye TCGdex horario y cuotas antiguas. No incorpora el esquema diario priorizado del 18–20/10. | Mantenerlo para ejecución al final; consolidar sus instrucciones operativas antes de usarlo en hardware. No marcar una instalación real como realizada. |
| Media | [scanner-improvements.md](../plans/scanner-improvements.md):3–5,37–65 | Mantiene un roadmap «vigente 6/10» y referencia al antiguo master. Existen corrección y contraste posteriores con límites nuevos. | Conservar el roadmap abierto de precisión/corpus/dispositivos; enlazar la evidencia del 20/10 y separar su historial extenso. |

### Evidencia de código usada en el contraste

- [Cron TCGdex](../../backend/src/jobs/price-sync-daily.service.ts):42–48 y [TCGCSV](../../backend/src/jobs/tcgcsv/tcgcsv.service.ts):35–53.
- [Reconexión Redis](../../backend/src/redis/redis.service.ts):83–116 y [gate persistente](../../backend/src/jobs/provider-rate.gate.ts), modelo `ProviderRateLimit` en [schema](../../backend/prisma/schema.prisma):406.
- [Entrada DINOv2 autenticada](../../backend/src/modules/cards/visual-identify.controller.ts):16–27. Las fotos no se persisten.
- [Búsqueda/orden](../../frontend/components/search/search-controls.tsx):75–98, [intercambio server-side](../../frontend/components/collections/collection-detail.tsx):176,720 y [API de colecciones](../../frontend/lib/api/collections.ts):26.
- [Default visual](../../frontend/components/visual-preview/navigation.ts):1–14 y [providers raíz](../../frontend/app/providers.tsx).
- [Estado de precios del 20/10](../plans/precios-diarios-priorizados-2026-10-18-estado.md):7–22 y [contraste DINOv2](../evaluations/scanner-baseline-contrast-2026-10-20.md).

## Nueve candidatos concretos a archivo histórico

Los cinco primeros contradicen el flujo vigente o describen decisiones exploratorias sustituidas; los cuatro últimos son planes de ejecución ya registrados como terminados, aunque antes de moverlos deben rescatarse sus pendientes todavía válidos.

1. [docs/files/00-README.md](../files/00-README.md).
2. [docs/files/01-CONTRACTS.md](../files/01-CONTRACTS.md).
3. [docs/files/02-EMBEDDINGS-spike.md](../files/02-EMBEDDINGS-spike.md).
4. [docs/files/07-INTEGRACION-Y-RIESGOS.md](../files/07-INTEGRACION-Y-RIESGOS.md).
5. [docs/files/08-VERSION-DISAMBIGUATION.md](../files/08-VERSION-DISAMBIGUATION.md).
6. [frontend/docs/frontend-improve.md](../../frontend/docs/frontend-improve.md).
7. [frontend/docs/redesign-2026.md](../../frontend/docs/redesign-2026.md).
8. [docs/plans/01-frontend-product.md](../plans/01-frontend-product.md).
9. [docs/plans/02-backend-production.md](../plans/02-backend-production.md).

«Archivo» no significa borrado. La ejecución propuesta debe mantener rutas de entrada o enlaces de redirección, actualizar referencias y proteger las copias de evidencia. Por ejemplo, AGENTS.md y las guías actuales todavía enlazan el plan de rediseño para explicar decisiones deliberadas; moverlo sin mantener esos accesos rompería esa trazabilidad.

## Qué conviene conservar

- **Mini PC y runbooks de operación:** preparación entregada, ejecución real pendiente. No son trabajo abandonado.
- **Beta, RES/UX, copy y contratos aceptados:** varios siguen siendo la entrada para trabajo humano o decisiones abiertas. Un entregable puede seguir vigente aunque esté dentro de RESULTADOS.
- **Evaluaciones del escáner:** tanto el 5/5 histórico como sus límites y los contrastes posteriores. Borrarlos impediría investigar precisamente qué resultado se reprodujo y cuál no.
- **Anexos, recibos, fallos y hashes:** son evidencia, no instrucciones nuevas. No corregir o deduplicar su contenido en sitio.
- **Guías técnicas actuales:** API, DB, precios, escáner, sesión, diseño, pruebas y gotchas. Tienen secciones útiles; las contradicciones no justifican archivar el documento entero.
- **Obsidian y manuales de herramientas:** los primeros son enlaces; la falta de uso en una sesión de Codex no demuestra que sus destinos/manuales sean prescindibles.

## Duplicación y enlaces

- Los seis centrales (`CONTEXTO-PART2`, `11-orquestacion`, `10-decisiones-y-contratos`, `REGISTRO-TAREAS`, `STATUS-CHECKLIST` y `ORQUESTACION-ESTADO`) suman **482.037 bytes**. Hay **46 bloques largos repetidos en al menos cuatro archivos**, con unos **248.236 bytes de repetición adicional**. El problema principal de lectura está aquí.
- Se encontraron **118 grupos de contenido idéntico, 292 archivos**. Predominan copias de fuentes/recibos dentro de evidencias: no es una lista de borrado.
- El recorrido detectó **2.141 enlaces locales**, **198 candidatos a rutas ausentes** y **31 enlaces a rutas de máquina**. **Ninguno de los candidatos ausentes está en las guías operativas principales** con las categorías de este inventario.
- De esos 198, **191** están en copias de evidencia, donde los enlaces relativos conservaron el contexto del archivo original. Se preservan; se puede agregar un índice exterior para resolverlos sin editar el snapshot.
- Los siete restantes: seis referencias temporales ya ausentes en `FE-03-implementacion.md:15` y `FE-03-review.md:19,40`; una ruta histórica de `opengraph-image.tsx` en `FE-07-SEO-03-implementacion.md:15`, movida luego a `frontend/app/`. Son limitaciones de portabilidad de reportes históricos, no motivo para reconstruir evidencias ni sustituir sus hashes.
- El parser no valida anchors ni demuestra falta de uso: los resultados completos están en el inventario. No se puede concluir «nadie usa este documento» sólo porque no reciba enlaces Markdown.

## Orden de limpieza propuesto

1. **Corregir instrucciones y entradas:** AGENTS, README, jobs, fuentes/arquitectura, índices API/frontend. Son los errores que más pueden inducir trabajo equivocado.
2. **Consolidar coordinación:** un estado actual corto; mantener decisiones/contratos y checklist por ID; llevar checkpoints repetidos a bitácora fechada sin perderlos. Conservar las entradas humanas y las preferencias vigentes.
3. **Archivar los nueve candidatos:** cabecera de histórico y reemplazo explícito, manteniendo sus enlaces y pendientes rescatados.
4. **Separar navegación de evidencia:** índice actual de operación/investigación y otro de resultados fechados. Los anexos pueden permanecer donde están para no invalidar rutas y hashes.
5. **Verificar documentación:** enlaces, referencias y diff. No requiere apagar la instancia ni repetir las suites del producto mientras no cambie código.

**No realizado en esta revisión:** borrados, movimientos, cierre de tareas, cambios de producto, DB/Redis, pruebas, builds, cambios de automatización, commit o push. Sólo se agregan este informe y el inventario.
