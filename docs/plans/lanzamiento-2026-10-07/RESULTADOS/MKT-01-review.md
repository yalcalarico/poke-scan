# MKT-01 — Revisión y correcciones Sol HIGH

Fecha: 2026-10-08 · Alcance: documental, exclusivamente `MKT-01-copy.md`, este informe y `evidencia-mkt01-review/`. No se editaron producto, configuración, AGENTS, planes ni registro.

## Dictamen

**Aceptación documental cumplida.** El copy y brief permiten implementar una promesa basada en capacidades locales y posicionamiento de sets/duplicadas explícitamente hipotético. Coordinación puede marcar MKT-01 **Completada en ese alcance**, sin afirmar versión validada con personas ni disponibilidad productiva. RES-01 sigue sin entrevistas; NEG-01/DEC-05 no tienen GO/oferta Pro. FE-07 y SEO-03 conservan implementación/verificación propias; BE-04/FE-03/build y el lanzamiento conservan sus gates.

El plan pide preparar copy “como hipótesis inicial” y exige tabla, clasificación y conservación de Free. La versión validada depende de RES-01, pero entrevistas, una oferta Pro, una implementación FE o autorización de campaña no son criterios adicionales de aceptación de este entregable documental.

## Correcciones verificadas

| Hallazgo del recibido | Corrección / evidencia |
|---|---|
| “Disponible” podía leerse como disponibilidad pública certificada | Leyenda y clasificación **Disponible local / Experimental / Futuro**, sin afirmar producción lista ni cobertura/precisión universal. |
| AGENTS §8 decía B1/B2/B6 pendientes, aunque el recibido afirmaba “ya existen” sin demostrar cliente | Se inspeccionaron `SearchControls` (`available: true`), envío de `searchBy/sort/direction` en catálogo, envío `forTradeOnly` en colección y §10.2 actual del rediseño. Se conservó búsqueda nombre/número/artista como capacidad local real; se documentó AGENTS stale sin editarlo. Número coincide por igualdad; con texto el orden es relevancia y no precio. No se convirtió soporte backend aislado en promesa UI. |
| CSV e historial eran rescatados, pero faltaba rescatar evolución básica del portafolio ya existente y separar los dos historiales | Free/FAQ/Pro explicitan observaciones de portafolio al consultar. `portfolio.md`, `PortfolioOverview` y service confirman gráfico existente; incluye composición/cantidades/precios, sin ROI, muestreo automático ni seguimiento en días sin consulta. CSV completo paginado ya existe y declara USD. Historial de cartas lee referencias de `card_prices` persistidas en refresh: visitar el historial no produce una observación nueva; snapshot del portafolio sí se forma al consultar resumen. |
| Privacidad incluía API autenticada/índice técnico en copy para usuarios y cámara sin acotar | Copy expresa cuenta/conexión, recorte enviado y foto de consulta no guardada, cámara en teléfonos compatibles o foto subida y revisión manual. Las pruebas de contrato siguen en evidencia técnica. No promete seguridad absoluta, procesamiento sólo en el teléfono ni cámaras/dispositivos validados. |
| “cuándo se consultó PokéScan” confundía el sujeto y simplificaba fechas upstream | Ahora dice cuándo PokéScan obtuvo la referencia; fecha de fuente separada si existe, sin rejuvenecer mercado con `fetchedAt`. ARS se mantiene conversión actual, sin venta local, ajuste por condición o cobertura garantizada. |
| CTA Pro sólo decía “ancla FAQ” | Href concreto existente `/faq#faq-planes`, generado por FAQ `id=planes`; se verificaron `/buscar`, `/escanear`, `/faq`, anchors producto/planes. No se inventó página, alta beta, cobro o calendario. |
| Se proponía retirar `$0` Gratis y faltaban algunas superficies del layout | Se conserva Gratis/$0/prestaciones existentes. Matriz incluye badge/preview/fallback, introducción producto, encabezado planes y FAQ. Franja mantiene cuatro slots con texto cualitativo y reconocimiento experimental; no conserva conteos como vigentes sin snapshot fechado. |
| Brief prohibía cualquier “beneficio Pro” incluso como hipótesis | Se acota a beneficio comprometido; permite investigar sin vender pack/oferta aprobados. No elimina funciones Free ni promete suscripción próxima. |
| Preflight original en futuro parecía describir la revisión | Se etiqueta como histórico de Luna; se conserva copia recibida y nuevo baseline/dirty antes de corrección. |

## Aceptación del plan

| Criterio `07-marketing.md` | Resultado |
|---|---|
| Copy por sección landing/FAQ reutilizando layout | Cumple: superficies de landing y los ocho ítems FAQ; destinatario FE-07, conservar layout/IDs. |
| Tabla actual/propuesto/evidencia/ruta/destinatario FE | Cumple; matriz y tabla de correspondencia de rutas. |
| Toda promesa disponible/experimental/futuro | Cumple; disponible local no significa despliegue/validación con personas. |
| Ninguna cifra de precisión o precio de mercado argentino sin fuente | Cumple; no cifras nuevas ni venta local/ROI; ARS convertido y condición sin ajuste. Conteos estáticos se sustituyen hasta tener fuente/fecha publicable. |
| Ningún beneficio Free desaparece por conveniencia comercial | Cumple: catálogo/búsqueda, reconocimiento con revisión, colecciones/duplicadas/intercambio, sets, referencias/historial, conversión, CSV y observaciones del portafolio conservados. |
| Seguimiento potencial, conexión, error de escaneo y Pro sin cobro activo | Cumple; cuenta/conexión y manual review, no precisión ni cámara general acreditada; automatización/alertas futuras sin cuotas, oferta, checkout o fecha. |
| Entregable y brief, sin publicación/código/metadata | Cumple; handoff FE-07 y SEO-03, sin cambios de implementación ni acciones externas. |

## Método y evidencia

Se capturó `git status --short`, hashes de entradas y copia del recibido antes de corregir. El SHA-256 recibido **coincidió** con el esperado `8d20ec317e15942dc3028c73b2b26f747fee56de2efc78ca7078cb2beb0bf465`.

- [Copia recibida](evidencia-mkt01-review/MKT-01-copy-recibido.md), [baseline](evidencia-mkt01-review/baseline.json) y [dirty previo](evidencia-mkt01-review/dirty-antes.txt).
- [Validación estática de enlaces/rutas/matriz](evidencia-mkt01-review/validacion.json), [fuentes y hashes](evidencia-mkt01-review/fuentes-verificadas.json), [diff exclusivo](evidencia-mkt01-review/correcciones.diff) y [hashes finales](evidencia-mkt01-review/hashes-finales.json).
- [Copy corregido y brief](MKT-01-copy.md), [plan MKT-01](../07-marketing.md), [RES-04](RES-04-fuentes.md), [UX-03](UX-03-valores.md) y [RES-01](RES-01-segmento.md).

Resultado verificable: 22 filas con seis columnas y clasificación, ocho ítems FAQ cubiertos y todos los enlaces locales/anchors comprobados. La primera sonda textual de `forTradeOnly` falló porque una regex terminaba en llaves dentro de un comentario; se verificó la llamada completa y se corrigió la sonda, sin cambio de producto.

La verificación fue lectura estática de fuentes locales, existencia de páginas/hrefs/anchors, cobertura de ítems FAQ, formato de matriz, hashes y enlaces. No se consultó web ni fuentes temporales nuevas; RES-04 revisado aporta la investigación documental ya fechada. No se ejecutó stack, HTTP, inferencia, tests, build, DB/Redis ni navegador; esta revisión no afirma `pnpm run check` verde. SEO conserva la reserva exclusiva de runtime y `.next`; MKT no adquirió recursos y queda liberado al entregar.

Límites: no entrevistas, validación de segmento/disposición a pagar, cámaras físicas, exactitud general, licencia comercial del ONNX/feed/arte ni despliegue. El gate de valores documentado sigue abierto por build estándar Turbopack `EPERM`; el diagnóstico existente es evidencia previa, no una nueva ejecución de este revisor. Esta entrega no cierra esos gates ni publica campañas.
