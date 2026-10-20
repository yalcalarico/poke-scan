# FE-07 + SEO-03 — implementación local de adquisición

Fecha: 2026-10-10 · Implementación local Luna · entradas MKT-01 y briefs SEO-03 aceptados. Esta entrega implementa copy de landing/FAQ y metadata/imagen de adquisición. No modifica estados centrales.

## Cambios y trazabilidad

| Entrada aprobada | Implementación |
|---|---|
| MKT-01, hero e identidad | Título, bajada y badge actualizados en [landing-page.tsx](../../../../frontend/components/marketing/landing-page.tsx). CTA principal «Explorar el catálogo» → `/buscar`; secundario «Probar el escáner» → `/escanear`. La nota aclara cuenta y conexión. La tarjeta existente se conserva; el fallback dice «Buscá. Revisá. Coleccioná.» |
| MKT-01, métricas y beneficios | Se reemplazaron las cifras perecederas por los cuatro mensajes cualitativos aprobados. PRODUCT_POINTS describe búsqueda por nombre/número/artista, organización de colección e intercambio, y referencias condicionadas a disponibilidad con fuente/variante/fecha de consulta. |
| MKT-01, privacidad, moneda y resumen | El bloque de captura explica DINOv2, cuenta/conexión, foto/cámara compatible, recorte no persistido y revisión manual. La sección de valores conserva los calificadores de referencia internacional, conversión actual, fecha de consulta y condición sin ajuste. Las tarjetas muestran USD/ARS, «Por set» y «Un link» con sus frases aprobadas. |
| MKT-01, Gratis y Pro | Gratis conserva `$0` e incluye búsqueda, reconocimiento experimental con requisitos/revisión, colecciones, progreso, referencias/historial, observaciones por consulta y CSV. Pro queda «en evaluación», sin beneficios, precio, cuotas, fecha, checkout ni promesa de seguimiento; su CTA conserva `/faq#faq-planes`. |
| MKT-01, CTA final y ocho FAQ | El catálogo queda primero y el reconocimiento segundo. Se actualizaron los ocho answers en [faq-section.tsx](../../../../frontend/components/marketing/faq-section.tsx), conservando sus IDs y el encabezado/enlace existentes. Las respuestas explican límites de cámara/red/precios/ARS, funciones Free y ausencia de plan Pro activo. |
| SEO-03, landing y FAQ | Ambas páginas usan [acquisition-metadata.ts](../../../../frontend/lib/marketing/acquisition-metadata.ts): title, description, canonical relativo, `siteName`, locale `es_AR`, metadata OG y Twitter explícitas, URL relativa y alt compartido. La FAQ tiene título/descripción propios. Los objetos incluyen explícitamente campos que Next no hereda al reemplazar bloques OG/Twitter. |
| SEO-03, imagen compartida | [opengraph-image.tsx](../../../../frontend/app/(marketing)/opengraph-image.tsx) define generación PNG de 1200×630, usa el icono local existente y copy genérico aprobado. Ambas rutas referencian `/opengraph-image`; no contiene cartas, precios ni datos de colección. No se fijó un host: las URLs relativas usan el `metadataBase` configurado que ya existe en el layout raíz. |

## Verificación ejecutada

- `pnpm run stop`: exit 0 antes de la corrida focal; root había confirmado puertos 3000/3001 libres.
- Test focal FAQ + metadata: exit 0, 2 archivos y 6 tests; el log conserva el warning de configuración de Vitest y el resumen completo.
- `pnpm --dir frontend run lint`: exit 0; ESLint, guard de colores y guard de espacios en URLs finalizaron limpios.
- `pnpm --dir frontend exec tsc --noEmit`: exit 0, sin salida.
- `git diff --check`: exit 0, sin salida.

Los logs completos están en [logs](evidencia-adquisicion-implementacion/logs/). No se ejecutaron `pnpm run check`, build, servidor, navegador, API, DB ni Redis en esta fase.

## Preservación y límites

Antes de editar se guardaron `git status --short`, hashes y copias de los cuatro objetivos de producto y el icono usados; la prueba FAQ inicialmente limpia se conservó desde HEAD y su hash coincide con el inventario CUENTA. El árbol ya contenía muchos cambios previos, que permanecen fuera de esta entrega. La comparación del inventario aceptado CUENTA (`sources-final.json`, 507 fuentes) encontró 502 intactas, cinco cambios esperados en los dos componentes, las dos páginas y el test FAQ, cero faltantes y tres fuentes nuevas de adquisición. Los hashes y la comparación reproducible están en [source-hashes.json](evidencia-adquisicion-implementacion/source-hashes.json) y [cuenta-inventory-comparison.json](evidencia-adquisicion-implementacion/baseline/cuenta-inventory-comparison.json); las copias pre/post y el diff están preservados bajo esa carpeta.

No se generó captura ni se afirma que la imagen o el preview estén servidos/visualmente verificados. La generación OG/Twitter y el HTML efectivo por ruta/UA quedan para la revisión/gate posterior; el dominio productivo y la salida desplegada siguen pendientes según SEO-03. Esta entrega no declara SEO-03 completo ni cierra FE-07, SEO-03 u otros IDs centrales. Reserva local liberada al entregar; sin servidores ni recursos runtime propios.
