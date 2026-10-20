# Plan de SEO

Fecha: 2026-10-07 · Estado: SEO-01 documental y matriz local revisadas; clasificación puntual anónima resuelta; dominio/salida productivos pendientes · IA objetivo: Especialista SEO técnico / Codex para cambios SEO.

## Objetivo

Aprovechar rutas públicas existentes sin indexar datos privados ni crear un catálogo de páginas pobres.

## Alcance y fronteras

**Incluye:** Política de indexación, metadata, canonical, sitemap/robots, OG públicos y correcciones SEO de status/rutas. Puede editar exports SEO de layouts/páginas acordadas; no lógica de producto. Implementación de nuevas páginas de contenido va a frontend con brief.

**Fuera de alcance:** Indexar share/colecciones/cuenta, generar precios locales no verificados, refactor de búsqueda como feature, backend, campañas/publicaciones, schema de ofertas/reviews inventados y compra de herramientas.

Leé [el índice](README.md), [las decisiones](10-decisiones-y-contratos.md) y AGENTS.md antes de ejecutar. Elegí una sola tarea por entrega; los gates no se satisfacen por pasar el tiempo.

## Evidencia de partida

- [frontend/app/robots.ts](../../../frontend/app/robots.ts)

- [frontend/app/sitemap.ts](../../../frontend/app/sitemap.ts)

- [frontend/app/layout.tsx](../../../frontend/app/layout.tsx)

- [frontend/app/(marketing)/page.tsx](../../../frontend/app/(marketing)/page.tsx)

- [frontend/app/(marketing)/faq/page.tsx](../../../frontend/app/(marketing)/faq/page.tsx)

- [frontend/app/(app)/buscar/page.tsx](../../../frontend/app/(app)/buscar/page.tsx)

- [frontend/app/(app)/carta/[id]/page.tsx](../../../frontend/app/(app)/carta/[id]/page.tsx)

- [frontend/app/share/[slug]/page.tsx](../../../frontend/app/share/[slug]/page.tsx)

- [frontend/docs/routes.md](../../../frontend/docs/routes.md)


La evidencia es estática al 7/10 o documentada con su fecha. Revalidá código y cambios locales antes de actuar; no atribuyas a esta planificación tests, mediciones o entrevistas nuevas.

## Tareas delegables


### SEO-01 — Auditar indexación y soft 404 con casos reales

Estado: Fases documental y matriz local aceptadas Luna/Sol HIGH; clasificación puntual de privacidad y dominio productivo pendientes · Prioridad: P1 · Estimación orientativa: 4–8 h.

**Dependencias/entradas:** INF-01 dominio; sin dependencia para auditoría local.

**Trabajo:** Inventariar HTML/status/head de landing/FAQ/buscar/carta válida e inválida y páginas privadas/share. Preservar noindex existente; revisar canonical de filtros/queries, sitemap y dominio por defecto vs dominio real. Verificar streaming/notFound antes de asumir 404 real. Definir solución mínima y dueño si necesita lógica no SEO.

**Aceptación:** Matriz URL/status/canonical/robots/HTML probado; rutas privadas y shares fuera del sitemap. Dominio placeholder no termina en canonical de producción. Inexistente tiene señal SEO válida y status documentado; no afirmar que una pantalla 404 responde 404 sin medir.

**Entregable:** RESULTADOS/SEO-01-auditoria.md y cambios SEO acotados si procede.

**Fase documental aceptada, 8/10:** [auditoría](RESULTADOS/SEO-01-auditoria.md)/[revisión Sol HIGH](RESULTADOS/SEO-01-review.md). Fuentes/metadata/sitemap/robots y handoffs verificados; protocolo diferencia head inicial, HTML completo y DOM por user-agent, streaming y status API/Next. Coordinación verificó3 hashes de artefactos,42 entradas invariantes de baseline y9 enlaces. Sin código ni HTTP nuevo. La matriz HTTP local con host/fixtures propios puede avanzar sin INF-01, en ventana runtime coordinada; canonicals/sitemap de producción requieren dominio aprobado y salida desplegada. Noindex no prueba auth/privacidad. ID completo sigue pendiente.


**Matriz local aceptada, 9/10 UTC (8/10 local):** [reporte](RESULTADOS/SEO-01-runtime.md)/[revisión Sol HIGH](RESULTADOS/SEO-01-runtime-review.md). 22 casos × 3 UA más503controlado sólo normal:67 respuestas; seis API backend y una proxy, tres DOM. Status API/Next separados, canonical sin returnTo, noindex/sitemap y señales de ausencia documentados. Root verificó20 hashes/16fuentes/siete enlaces; Sol realizó18 comprobaciones de evidencia y corroboró recursos propios ausentes. Output webpack existente explícito; sin build nuevo ni gate estándar verde. Ventanas, extracción y guard Node acotados; no crawl real ni producción. Un probe agregado de colección anónima no permite clasificar ID de ruta/Flight vs valores protegidos: captura futura enfocada pendiente, sin fuga confirmada ni privacidad/auth aprobada por noindex. ID completo sigue abierto por ese punto y dominio/salida productivos. No repetir la matriz completa ni modificar producto desde este reporte.


**Clasificación focal resuelta, gate nuevo:** [captura API/SSR y QA root](RESULTADOS/LOTE-VALORES-cierre.md): ID aportado en ruta sólo en Flight, nombres de campos compatibles; valores de usuarios/ítems/email/nota/nombre/contraseña y dos access/dos refresh tokens ausentes. API dueño200/anónima401/ajena404; DOM anónimo genérico. Noindex no se usa como prueba de autorización. No repetir67 registros; dominio/salida productivos siguen pendientes.

### SEO-02 — Descubrimiento acotado de fichas públicas

Estado: Pendiente · Prioridad: P2 · Estimación orientativa: 6–12 h.

**Dependencias/entradas:** SEO-01; INF-02 entorno; MKT-03 brief de intención.

**Trabajo:** Evaluar incluir fichas en sitemap usando IDs locales publicados y válidos, con tamaño/paginación y caché controlados; no recorrer proveedor ni pedir precio. Verificar enlaces HTML descubribles: /buscar carga resultados en cliente, por lo que no presupone crawlabilidad suficiente. Priorizar muestra útil antes de 20k páginas; si requiere nueva UI, emitir tarea frontend separada.

**Aceptación:** Sitemap generado solo con rutas públicas válidas, URLs absolutas y política lastModified honesta. No incluye slugs de usuario ni infinitas combinaciones de filtros. Costo/latencia medidos; evidencia de crawl/indexación solo si hay acceso real a Search Console.

**Entregable:** Sitemap/metadata/enlaces SEO si bastan; brief frontend si se necesita navegación nueva.


### SEO-03 — Preview público y brief de contenido útil

Estado: Fases documental y preview local aceptadas · [cierre adquisición](RESULTADOS/LOTE-ADQUISICION-cierre.md); dominio/salida productivos pendientes, ID parcial · Prioridad: P2 · Estimación orientativa: 4–8 h.

**Dependencias/entradas:** MKT-01 copy; SEO-01; RES-04 referencias.

**Trabajo:** Revisar OG/Twitter existentes; completar imagen genérica de landing/FAQ si falta usando assets actuales, con URL absoluta verificada. No modificar OG de share para añadir privacidad/caché: eso es FE-02. Preparar 2–3 briefs de intención concreta (duplicados, variantes, referencia USD/ARS) con fuentes y rutas; consultar documentación oficial para recomendaciones técnicas vigentes.

**Aceptación:** Preview de rutas de adquisición muestra título/imagen correctos; sin precio local fabricado ni producto Pro inexistente. Brief explica consulta, evidencia, CTA y medición; no publica páginas automáticas ni FAQ schema por costumbre.

**Entregable:** RESULTADOS/SEO-03-contenido.md, metadata pública y entrega de implementación a frontend cuando haga falta.


**Fase documental aceptada, 8/10 local:** [tres briefs y handoff OG](RESULTADOS/SEO-03-contenido.md)/[revisión](RESULTADOS/SEO-03-review.md). Intenciones hipotéticas, CTA existentes y medición manual RES-03; auditoría OG/Twitter estática con reglas de herencia y propuesta de imagen1200×630 desde assets actuales. Root verificó12 artefactos,35 fuentes y35 enlaces/anchors antes de actualizar centrales; [recibo](RESULTADOS/RONDA-20261008-cierre-documental-root.json). No imagen/export/metadata/editoriales implementados, preview servido ni producción; ID completo permanece abierto.


## Prompt refinado con Lyra

Modo BÁSICO: contexto preservado, scope cerrado, dependencias y aceptación explícitos. No se requiere una segunda optimización para comenzar. Sustituí únicamente el ID; los demás insumos están en los documentos.

```text

Actuá como especialista de SEO para PokéScan. Ejecutá solamente [ID_DE_TAREA] del archivo docs/plans/lanzamiento-2026-10-07/06-seo.md.

Leé primero README.md y 10-decisiones-y-contratos.md de esa carpeta, AGENTS.md raíz y las instrucciones de la carpeta que vas a tocar. Inspeccioná el estado real y los cambios locales: no sobrescribas trabajo ajeno ni reimplementes funcionalidades existentes.

Tu alcance es: Política de indexación, metadata, canonical, sitemap/robots, OG públicos y correcciones SEO de status/rutas. Puede editar exports SEO de layouts/páginas acordadas; no lógica de producto. Implementación de nuevas páginas de contenido va a frontend con brief.
No incluye: Indexar share/colecciones/cuenta, generar precios locales no verificados, refactor de búsqueda como feature, backend, campañas/publicaciones, schema de ofertas/reviews inventados y compra de herramientas.

Comprobá las dependencias del ID. Si falta una, hacé solo preparación independiente, documentá la entrada faltante y dejá la tarea pendiente; no inventes contratos/resultados ni expandas scope. Una decisión comercial/externa no se reemplaza por tiempo transcurrido.

Respetá versiones/pnpm, DINOv2 exclusivo, fotos de consulta no persistidas y límites/cola/caché de fuentes. No reveles secretos ni datos personales. No mandes mensajes, publiques, cobres o contrates servicios salvo autorización humana explícita aplicable a esa acción.

Entregá los cambios/artefactos concretos del ID, referencias, criterio de aceptación verificado, pruebas/mediciones realmente ejecutadas y límites pendientes. Por corrección explícita del usuario, cada tarea requiere pruebas enfocadas y revisión/corrección Sol HIGH, con pnpm run stop antes de tests. Al finalizar el lote asignado por 11-orquestacion.md se ejecutan pnpm run check global y flujo real aislado/limpieza cuando afecta datos; no repetir global por tarea. Investigación/diseño sin código validan fuentes/enlaces/estados y no afirman check verde. Entregá artefacto/evidencia al coordinador, único escritor de REGISTRO-TAREAS.md y estados de los planes. No cierres tareas de otras áreas ni avances un lote con gate pendiente/fallido.

```


**Qué refinó Lyra:** separó responsabilidades, transformó mejoras generales en entregables observables, distinguió hipótesis de hechos y agregó gates para evitar construir Pro o marketplace sin evidencia.


**Consejo de uso:** delegá el ID y su plan completo; no copies solamente el título. Entregá dependencias resueltas y registrá cualquier cambio de contrato antes de implementar.
