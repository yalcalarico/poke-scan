# SEO-03 · Brief de contenido y preview público

**Fecha:** 2026-10-08 (Argentina, UTC−03:00) · **Fase:** brief documental preparado; implementación/preview servido pendientes.  
**Alcance:** tres briefs de contenido útil, auditoría estática de Open Graph/Twitter y handoff a FE-07/MKT-03. No se editó producto ni se generó ningún asset.

## Criterio de contenido

La hipótesis de audiencia heredada de MKT-01 es gente que completa sets y organiza duplicadas. RES-01 no tiene entrevistas ni resultados, así que los términos y preguntas de abajo son **hipótesis de intención**, no demanda medida: no se asignan volúmenes, posiciones ni potencial de tráfico. Las piezas explican tareas que el producto ya permite; cada una deriva a una ruta existente y evita publicar datos de colecciones de usuarios.

### Brief 1 · Cómo ordenar duplicadas sin mezclar impresiones

**Intención hipotética:** alguien quiere saber qué cuenta como duplicada, cómo detectar copias del mismo set y cómo separar una carta igual por nombre pero distinta por impresión. Consultas exploratorias: “cómo organizar cartas Pokémon repetidas”, “cómo separar duplicadas Pokémon por set”. No se afirma que sean consultas frecuentes.

**Pregunta que resuelve:** ¿cómo armo un inventario que me permita encontrar copias y distinguir cartas que comparten nombre?

**Esqueleto útil:** empezar por set/impresión; mostrar una tabla o ejemplo textual de identidad de carta y cantidad; explicar cómo revisar variantes/condición en el registro sin inferir condición desde una foto; terminar con un método breve para revisar faltantes y duplicadas por set. No usar imágenes de cartas sin permiso documentado. Aclarar que la lista sirve para organizar la colección, no acredita precio de venta.

**Claims y evidencia:** organización por set, duplicadas y marcas “para intercambio” constan en el copy aceptado de MKT-01 y en las rutas/componentes locales de colecciones. Tratar completado de sets y organización de repetidas como hipótesis de utilidad (MKT-01; RES-01 pendiente), no como conducta observada. La condición registrada no modifica automáticamente la referencia de precio (UX-03/DEC-03).

**CTA existente:** “Explorá el catálogo” → [`/buscar`](../../../../frontend/app/%28app%29/buscar/page.tsx), ruta ya existente y pública según [`routes.md`](../../../../frontend/docs/routes.md). El guardado requiere cuenta; no presentar la visita al catálogo como colección ya creada. Un futuro CTA de escaneo puede apuntar a `/escanear`, sujeto a sesión y conexión, pero no es necesario para esta pieza.

**Medición RES-03, manual:** anotar por pieza y fecha el enlace compartido, visitas observables solo si el canal ya las muestra, clics reportados hacia `/buscar` y, durante una sesión consentida, si la persona llega a guardar y comprobar una carta/colección útil. Registrar conteo y denominador; no convertir visitas en activación ni atribuir usuarios únicos sin receptor aprobado. RES-03 propone observación manual sin analytics nuevo. No hay resultados de esta medición.

### Brief 2 · Cómo distinguir variantes antes de guardar

**Intención hipotética:** quien quiere organizar una carta con acabado distinto pregunta “qué variante de carta Pokémon tengo”, “carta reverse holo vs holo”, o cómo registrar dos copias que parecen iguales. Son ejemplos para explorar, sin volumen ni demanda comprobados.

**Pregunta que resuelve:** ¿qué dato tengo que mirar para no juntar copias con acabado distinto, y qué puede confirmar PokéScan?

**Esqueleto útil:** guiar la inspección manual de nombre, set/número e indicio visible de acabado; separar variante de condición; explicar que el reconocimiento visual propone una candidata que se revisa/corrige y puede fallar; mostrar que la variante elegida es la referencia relevante cuando hay datos. No prometer que cámara detecta acabado o condición, no dar exactitud porcentual y no autocompletar una identificación como certeza.

**Claims y evidencia:** MKT-01 describe DINOv2 con cuenta/conexión, revisión obligatoria y resultado potencialmente incorrecto o ausente; `frontend/docs/scanner.md` documenta el flujo visual. DEC-03 y UX-03 establecen variante como referencia de precio y condición sin ajuste automático. Compatibilidad física/cobertura general del reconocimiento no está validada por este brief.

**CTA existente:** “Buscá una carta por nombre, número o artista” → [`/buscar`](../../../../frontend/app/%28app%29/buscar/page.tsx). CTA secundario opcional “Probá el reconocimiento visual” → `/escanear`, ya enlazado desde landing, con cuenta, conexión, cámara compatible o foto y revisión manual. No enlazar a una ficha con ID inventado.

**Medición RES-03, manual:** en prueba consentida, pedir que la persona explique qué diferencia variante de condición y que encuentre la variante o corrija la sugerencia antes de guardar. Codificar por participante, tarea completada/ayuda/error, conforme al protocolo RES-03; la medición de comprensión del precio de UX-03 se mantiene aparte. No hubo participantes ni resultados en SEO-03.

### Brief 3 · Qué significa ver una referencia en USD o ARS

**Intención hipotética:** una persona ve un importe y pregunta “precio carta Pokémon USD a pesos”, “qué significa el valor en ARS” o si ese número es lo que puede cobrar localmente. Es una hipótesis derivada del contenido y las preguntas de MKT-01; no hay volúmenes de búsqueda ni observaciones de usuarios.

**Pregunta que resuelve:** ¿de qué mercado sale el dato, qué significa la conversión y qué límites tiene el total?

**Esqueleto útil:** separar moneda/fuente del mercado reportado; definir USD como referencia cuando la fuente aporta ese dato; explicar ARS como conversión al tipo de cambio actual elegido, no precio argentino realizable; distinguir fecha de consulta de fecha upstream; ilustrar que referencias faltantes hacen un total parcial y que condición no ajusta el importe. En historial, aclarar que las observaciones pueden cambiar por cantidades y referencias y que ARS histórico usa cambio actual: no es ganancia/ROI ni serie histórica de FX. Incluir una invitación a leer el detalle de fuente/variante cuando la app tenga datos.

**Claims y evidencia:** copy aceptado de MKT-01 §§ moneda/precios y RES-04/UX-03/DEC-03 sustentan todos estos límites. RES-04 no halló un par homogéneo que permita afirmar precio argentino o venta local verificable; no incluir ejemplos de precio actual ni sumar una cifra de mercado. Precio Pro, cuotas, alertas y seguimiento automático siguen sin oferta aprobada.

**CTA existente:** “Consultá el catálogo” → [`/buscar`](../../../../frontend/app/%28app%29/buscar/page.tsx). Una vez que la persona elige una carta, las fichas existentes usan `/carta/[id]`; el CTA editorial no debe inventar un ID ni sugerir que una referencia está siempre disponible. No dirigir a una colección ajena ni a `/share/[slug]`.

**Medición RES-03, manual:** usar la tarea neutral ya definida en [`RES-03-protocolo.md`](RES-03-protocolo.md#rúbrica-de-comprensión-del-precio) y la codificación de UX-03: referencia internacional/conversión y no venta local; cobertura parcial/desconocido frente a cero; condición sin ajuste. Reportar personas y denominador, espontáneo separado de respuesta posterior a pregunta neutral. No hay participantes ni resultados atribuidos aquí.

## Preview OG/Twitter actual y propuesta mínima

**Auditoría estática, 8/10:** [`app/layout.tsx`](../../../../frontend/app/layout.tsx) declara `metadataBase` a partir de `NEXT_PUBLIC_SITE_URL` con fallback literal `https://pokescan.app`, `openGraph` común (`type`, `siteName`, `locale`) y `twitter.card = summary_large_image`, pero ninguno define una imagen. La metadata de [`landing`](../../../../frontend/app/%28marketing%29/page.tsx) define title/description/OG y canonical, sin `openGraph.images` ni `twitter.images`. [`FAQ`](../../../../frontend/app/%28marketing%29/faq/page.tsx) define title/description/canonical y no agrega imagen propia. No existe `opengraph-image` ni `twitter-image` bajo `frontend/app` en el árbol inspeccionado.

En `frontend/public/icons/` sí hay iconos actuales: `icon-512.png` y `maskable-512.png` (512×512), `icon-192.png` (192×192) y `apple-touch-icon.png` (180×180). `icon-512.png` es una marca cuadrada con mucho margen; no es una composición panorámica de preview. No se observó navegador, unfurl remoto ni metadata servida: esto es solo una auditoría de fuentes/archivos, no una afirmación sobre previews actuales en producción.

**Propuesta futura, acotada:** para la landing y FAQ, agregar una imagen genérica común 1200×630 con el nombre PokéScan, una frase de producto ya aceptada por MKT-01 y el icono existente como elemento de marca. La variante de menor mantenimiento es una única convención de segmento en `frontend/app/(marketing)/opengraph-image.tsx` y `frontend/app/(marketing)/twitter-image.tsx` (o un solo archivo OG que ambas metadata referencien), reusando `frontend/public/icons/icon-512.png`; no necesita ilustraciones de cartas ni claims nuevos. Dejar la URL final relativa a `metadataBase`/`NEXT_PUBLIC_SITE_URL`; el valor absoluto desplegado queda **dependiente del dominio aprobado/configuración de INF-01**. No escribir `https://pokescan.app` como host productivo confirmado. Si el formato generado no resulta adecuado para clientes de preview, alternativa estática futura: `frontend/app/(marketing)/opengraph-image.png` y referencia de la misma URL desde Twitter.

La documentación local de Next 16.3.6 indica que las convenciones de archivo OG/Twitter agregan tags automáticamente, admiten imagen estática o generada y heredan por segmentos; `metadataBase` resuelve campos URL relativos. Fuentes consultadas: [`metadata and OG images`](../../../../frontend/node_modules/next/dist/docs/01-app/01-getting-started/14-metadata-and-og-images.md), [`generateMetadata`](../../../../frontend/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md), [`opengraph-image`](../../../../frontend/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/opengraph-image.md). La referencia oficial en línea consultada el 8/10/2026 confirma el contrato y límites actuales: [Next.js metadata files: opengraph-image and twitter-image](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image) y [generateMetadata / metadataBase](https://nextjs.org/docs/app/api-reference/functions/generate-metadata). No genera preview medido ni confirma compatibilidad de cada red.

**Límites de indexación/privacidad:** no sumar páginas de share, colección o cuenta al sitemap; no colocar slug, nombre de usuario, cifras privadas ni carta individual en una imagen genérica. Mantener noindex de share y el contrato FE-02/BE-01 de caché/privacidad. Una imagen OG no resuelve autenticación ni convierte una ruta en pública.

## Handoff

- **FE-07:** puede implementar el copy ya aceptado de MKT-01 en los componentes landing/FAQ existentes. Los briefs SEO-03 son piezas editoriales separadas y no alteran esas pantallas ni sus CTAs. Si se aprueba técnicamente el preview genérico, coordinar el archivo de metadata en la rama `app/(marketing)`; revisar tags efectivos después de implementación con dominio/configuración local explícitos.
- **MKT-03:** tomar estas tres piezas como backlog candidato, no calendario ni decisión de publicar. Antes de priorizar, incorporar resultados de RES-01/03; conservar intención como hipótesis hasta medirla. MKT decide redactar/canal/frecuencia; cualquier publicación externa requiere el gate operativo correspondiente.
- **CTA comprobados en fuentes locales:** `/buscar` existe y es público; `/escanear` existe y exige cuenta/conexión al ejecutar reconocimiento. `/faq` existe. No se proponen rutas editoriales nuevas como destino hasta que FE-07/MKT-03 las implementen.
- **Pendiente de aceptación completa SEO-03:** preview servido de landing/FAQ con imagen correcta aún no existe; el dominio productivo no está aprobado ni hay salida desplegada. El gate estándar `pnpm run check` permanece abierto por el EPERM de Turbopack documentado en otros artefactos; no se usó webpack como sustituto. El presente brief no amplía SEO-03 a resolver auth, streaming, privacidad runtime o gates de producto.

## Método, fuentes y preservación

Se leyeron AGENTS raíz/frontend, README/06-seo/10-decisiones, MKT-01-copy/review, RES-04-fuentes/review, SEO-01-review y SEO-01-runtime-review. Se revalidaron estáticamente metadata y rutas CTA indicadas, y se revisó localmente la guía de metadata de Next instalada. No se ejecutaron builds, tests, servidores, DB/Redis, browser ni requests de producto.

Hashes SHA-256 selectivos antes de escribir este documento:

| Archivo fuente | SHA-256 |
|---|---|
| `AGENTS.md` | `0a44196ce9194cafcd54094af02e90e73f0da0f693604d0876d97bf14ee30688` |
| `frontend/AGENTS.md` | `63f2c50380ed6303237cce215ce27af1d620d094c215e28d1b1538a3c070e3bb` |
| `docs/plans/lanzamiento-2026-10-07/README.md` | `24ec5dee918d19778b3a7bfd4187fecf1eff2e2f855ffdd2a26ed0843fc1eced` |
| `docs/plans/lanzamiento-2026-10-07/06-seo.md` | `61d6f363e53535c3cde75a3812d92d2f03b275c83762d0ed7fc68eed6435b2c3` |
| `docs/plans/lanzamiento-2026-10-07/10-decisiones-y-contratos.md` | `a1334c37eab2be2893cfdba65f2e294eaa8c2f5820950a9e572c999c50a71b3c` |
| `RESULTADOS/MKT-01-copy.md` | `d12287eb65d1feff484201f069f518018ad79e543d3832d440dc9bab55157f6d` |
| `RESULTADOS/MKT-01-review.md` | `905a34f980c40aa245d6019cc2936a9898ae491057d7032970145521aa828d4c` |
| `RESULTADOS/RES-04-fuentes.md` | `1d8d9db271f8a9c4691c5477c490a14e8a6e8a44b564798b00a57344625126a` |
| `RESULTADOS/RES-04-review.md` | `b71e33816357879a11ea108501653909697fb8021425db6bb95329250f7a81ef` |
| `RESULTADOS/SEO-01-review.md` | `f49435adcf79443b6c701fc4f2adfc574051e0bf5833dbea73eda4474121a2d0` |
| `RESULTADOS/SEO-01-runtime-review.md` | `01a1180f9d6a5b94d5776ca03763d342f2881dfbb09989ac22ee529c8f780f99` |
| `frontend/app/layout.tsx` | `4f142a61056cfb3819f0160f5d94b3459020bea37fff718944cfc5a33082ed8c` |
| `frontend/app/(marketing)/page.tsx` | `bbb661d27ae8d4fd7190162265260c1ef25701c6771716aa685bba3a3d06a0c6` |
| `frontend/app/(marketing)/faq/page.tsx` | `d2d96fb9009da52cb788b2ae39493287855b8f221265636228e44d1bedc9b9b5` |

El árbol ya estaba ampliamente dirty y la carpeta del plan figuraba sin trackear antes de empezar. El único archivo creado por esta ejecución es `RESULTADOS/SEO-03-contenido.md`; no se alteraron archivos previos. Reserva documental SEO-03 liberada al entregar; coordinación conserva estados/registro y queda pendiente revisión Sol HIGH separada.
