# SEO-01 — Revisión documental Sol HIGH

2026-10-08 · GPT-6.1 Sol HIGH. **Fase documental aceptada después de correcciones mínimas. SEO-01 completo sigue abierto.** No hay medición nueva del stack ni dominio productivo confirmado; la aceptación del plan requiere ambos.

Se revisaron AGENTS raíz/frontend, índice, plan SEO y DEC-02/DEC-06, la auditoría de Luna, fuentes de todas las familias de rutas y Next instalado **16.3.6**. Se contrastaron fuentes primarias actuales Google Search Central y Next oficial el 8/10. [Baseline](SEO-01-review-baseline.json): HEAD `5a2fe2f557b677b2c6e38749a1932d24a21b25c5`, árbol dirty antes de corregir, auditoría SHA-256 `15151787f3e86da08ef4a969581f553f6e72068deeee08b4102ce601b815a64f`; cambios ajenos preservados.

## Hallazgos corregidos

| Hallazgo documental | Corrección aplicada | Resultado |
|---|---|---|
| Head inicial podía tomarse como inventario final de metadata dinámica. | Protocolo distingue head inicial, documento completo/etiquetas anexadas al body y DOM renderizado, por user-agent. | Resuelto; no se falsea metadata ausente ni se modifica streaming. |
| Matriz share no incluía error y dejaba implícita la aceptación de SSR200 genérica. | Se documentan no-ok/error, API404/410 vs HTML Next, no-store, noindex y ausencia de datos/metadata protegidos; DEC-02 acepta streaming200. | Resuelto; FE-02/BE-01 conservan propiedad de vigencia/cachés/metadata sensible. |
| Noindex se presentaba como control positivo de privacidad y `/inicio` como ruta privada homogénea. | Se distingue indexación de auth/ownership; `(app)` no tiene auth/noindex global, `/inicio` incluye contenido público y las reglas pertenecen a páginas/layouts específicos. | Resuelto sin afirmar seguridad desde metadata. |
| Ausencia/búsqueda se apoyaban en formulación general y la raíz not-found tenía confirmación pendiente. | Se verificaron fuente cliente de resultados, archivos loading reales, not-found raíz/share y DTO inválido200 vs API5xx de ficha. | Resuelto; status sigue sin medir. |
| Handoff e historia del gate carecían de precisión por frontera. | Matriz de dueño/archivo/aceptación; links concretos a evidencia histórica sintética fechada, sin reconstruir status/head ni atribuir `.next` histórico al presente. | Resuelto; no se amplía scope. |

El sitemap de fuente contiene solo `/`, `/buscar` y `/faq`; no cuenta/auth/share. Canonicals propios de landing/FAQ/buscar y ficha válida no incluyen consultas ni `returnTo`; ficha inválida no declara canonical específico. Robots de app/cuenta/auth y share coinciden con la auditoría corregida. El fallback `https://pokescan.app` se conserva como hecho del código, sin atribuirlo a producción ni sustituirlo por un dominio supuesto.

[Google explica que noindex requiere acceso del crawler](https://developers.google.com/search/docs/crawling-indexing/block-indexing); no acredita autorización de datos. [Canonical es una señal](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), y sitemap no confirma rastreo/indexación. [Google describe soft404 como error de contenido servido con200](https://developers.google.com/search/docs/crawling-indexing/troubleshoot-crawling-errors); esto no permite diagnosticar un despliegue sin respuesta medida. [Next documenta status200/404 según streaming](https://nextjs.org/docs/app/api-reference/file-conventions/not-found) y [metadata dinámica en el documento completo](https://nextjs.org/docs/app/api-reference/functions/generate-metadata#streaming-metadata). La referencia instalada determina el comportamiento esperado de esta versión; la documentación web no acredita el runtime local.

## Aceptación y pendientes

| Criterio SEO-01 del plan | Esta fase |
|---|---|
| Matriz URL/status/canonical/robots/HTML probado | Matriz de fuente aceptada; HTTP/HTML completo/DOM pendiente, sin resultados inventados. |
| Privadas/share fuera del sitemap | Verificado estáticamente; salida servida pendiente. |
| Dominio placeholder fuera del canonical productivo | Abierto: INF-01/operación y dueño deben aportar dominio/valor de despliegue; no basta leer el fallback. |
| Inexistente con señal válida y status documentado | Fuente `notFound()`/noindex y contrato DEC-02 documentados; carta/share/desconocida requieren status/metadata observados por caso. |
| Solución mínima y dueño si excede SEO | Handoff aceptado: exports SEO rutinarios vs render/búsqueda/auth/ownership/vigencia/proxy. No hay defecto runtime confirmado que exija código. |

La auditoría no habilita SEO-02 ni cierre del ID por sí sola. La próxima fase de matriz HTTP/SSR/DOM **local puede avanzar sin INF-01 ni decisión humana de dominio**, con host sintético autorizado, ventana runtime aislada acordada con coordinación y fixtures propias vigentes. Debe registrar base/origen local, salida sanitizada por UA, HTML inicial/completo/DOM y status API/Next diferenciados, sin atribuir producción. La verificación posterior de canonicals/sitemap **en producción** sí necesita dominio aprobado y configuración efectiva del despliegue; ambos pendientes se mantienen separados. No hace falta volver a ejecutar el gate histórico de valores para validar este documento.

**Ajuste antes de consolidación:** se retiró la condición de dominio productivo para toda medición HTTP local; el plan permite auditoría local sin dependencia INF-01. No se ejecutó runtime en esta corrección.

## Verificación y liberación

Se verificaron hashes de fuente/documentación instalada, existencia de enlaces locales y correspondencia de afirmaciones con fuentes. [Evidencia](SEO-01-review-evidencia.json) conserva hashes finales, lista de consultas primarias, límites y comprobación de preservación. No se ejecutaron tests, `pnpm run check`, build, servidor, HTTP de app, DB, Redis, browser ni se leyó/modificó `.next`; validación documental conforme al scope recibido y plan. El diagnóstico estándar y futuras suites pertenecen a la reserva independiente del coordinador.

Únicos archivos escritos: auditoría SEO-01, este review y sus dos JSON de evidencia. Sin código/exports/config/producto ni planes/registro; sin proveedores de precios ni fuentes privadas. **Reserva documental liberada; ningún servicio, suite, proceso o dato propio creado.** Root conserva la actualización de estados/registro y decisión de apertura de fase posterior.
