> Estado vigente desde el 5 de octubre: ORB fue retirado por decisión del usuario.
> Este informe conserva evidencia anterior; ver [DINOv2 puro](dinov2-only-2026-10-05.md).

# Validación y preparación del escáner — 3 de octubre de 2026

**Actualizado el 4 de octubre de 2026:** el usuario autorizó las credenciales y se reprodujo
IMG_4987 mediante la galería vigente: Umbreon ex `me55-92`, puesto DINOv2 2,
puesto final 1. El 4/5 que sigue mide originales enviados directamente al motor,
sin preparación cliente; no representa precisión de la galería. También se
verificaron restauración de sesión, guardado explícito de dos copias en una
colección de prueba y render del enlace existente sin sesión.
Ver [evidencia del flujo real](scanner-gallery-current.md). El bloqueo inicial
de login quedó resuelto con esa autorización.

Se revisó `master` con implementación DINOv2 integrada y se preservó la edición local previa del roadmap. No se reindexó, cambió la política de aceptación, descargó referencias ni publicaron cambios.

## Check del checkout

`pnpm run stop` antes de `pnpm run check`. La primera corrida bajo sandbox pasó lint/tipos, pero no pudo acceder a PostgreSQL en `localhost:55432`; no se atribuyen sus fallos DB al código. La corrida con acceso a infraestructura local terminó con exit 0:

- Lint backend/frontend, guard de colores y typecheck.
- 303 tests backend; 6 tests Node de índice/geometría.
- 6 pruebas API.
- 319 tests frontend.
- Builds backend y frontend.

Los conteos actuales difieren de informes históricos; estos son los observados en este checkout. Log local: `/tmp/scanner-check-unrestricted-2026-10-03.log`. El nuevo runner pasó sintaxis, oxlint, ayuda y diez consultas reales (dos pasadas), reutilizando los módulos vigentes.

## Evaluación local reproducible

Runner: `backend/scripts/scanner-evaluate-current.mjs`. Manifiesto existente con cinco fotos **originales sin preparación de galería**. Índice validado por el lector vigente: 20.670 referencias en 175 carpetas; modelo/metadata y hashes en [el reporte JSON](visual-current-2026-10-03.json). No se guardaron fotos nuevas; sólo se leyeron archivos existentes.

| Foto | ID esperado | Puesto DINOv2 completo | Puesto final top-64 |
|---|---|---:|---:|
| IMG_4985 | me55c-106 | 1 | 1 |
| IMG_4986 | me55-23 | 2 | 1 |
| IMG_4987 | me55-92 | 418 | fuera de recuperación |
| IMG_4988 | me55-137 | 1 | 1 |
| IMG_4989 | me55-145 | 1 | 1 |

Resultado: 4/5 top-1 en originales, estable en ambas pasadas. Para Umbreon ex (`me55-92`), #1 fue `pop5-10`. La referencia correcta existe, pero no llega a ORB. Esto no contradice el 5/5 de [recortes preparados](visual-geometry-2026-10-03.md), ni demuestra un fallo de la galería actual: este runner no ejecuta su preparación. La prueba siguiente debe comparar original y salida real de `prepareVisualPhoto` sobre el mismo corpus. No aumentar top-64 ni ajustar umbrales por este único caso sin medir costos y generalización.

Una consulta fría: total local 5,34 s, coordinador 5,71 s. Nueve calientes: total local p50 3,70 s, p95/p99 4,57 s; verificación p50 3,45 s. No son tiempos de cámara/galería ni incluyen HTTP/precio. La secuencia de cartas excede capacidad útil del caché de descriptores; no se reproduce el caso de repetir inmediatamente una misma carta. Una sola consulta fría y cinco identidades no caracterizan distribución ni precisión general.

Negativos: **cero muestras**. No hay evidencia nueva de tasa de falsas aceptaciones ni de edición/acabado. `falseSessionAcceptances: 0` con denominador cero no significa rechazo correcto. No se agregó ninguna regla de aceptación.

## UI y tareas que siguen abiertas

Con el stack real levantado, búsqueda pública `/buscar?sort=price&direction=desc` mostró 20.670 cartas y controles Precio/Descendente seleccionados; se observó carga de resultados adicionales. Consultas públicas de páginas 1 y 2, 24 cartas por página, coincidieron con el orden visible: Lugia `ecard2-149` primero, límite de página `neo1-9` → `neo4-6`. Ascendente respondió desde `me2pt5-28`, límite `me2pt5-177` → `me2pt5-173`.

La búsqueda devuelve cartas sin valores de precio en su payload. Por tanto, esta inspección verifica selección del criterio y coherencia de IDs/paginación, pero no completa la comprobación visual numérica del orden ni de las cartas sin precio. La ordenación global tiene pruebas backend verdes; sigue pendiente cerrar su protocolo UI.

La revisión automática rechazó inicialmente el login UI con la cuenta de desarrollo `test@test.com`. Después de la autorización explícita del usuario se verificaron galería con IMG_4987, restauración de una entrada al recargar, cierre de Organizar sin guardar y guardado explícito de dos copias en una colección nueva de prueba. Al cerrar sesión, el enlace público existente renderizó cantidades y duplicados en sólo lectura. El bloqueo de credenciales está resuelto; estos casos ya no están pendientes. La hoja Organizar no ofrece selector de variante.

Siguen pendientes ampliar la evaluación por la preparación real de galería a las cinco fotos, cancelación/reconexión en UI, límite real de sesión, precio lento y comprobación numérica del orden. Cámara física iPhone/Android, PWA y offline no fueron probados. Los detalles y datos locales creados están en [el informe de galería](scanner-gallery-current.md).

**Próximo bloque:** medir las cinco fotos por el flujo real de galería, incluyendo preparación y tiempos de extremo a extremo. En paralelo, probar cámara/PWA en teléfono y reunir el corpus etiquetado con negativos. Calibración de rechazo/edición depende de ese corpus; SIGINT/reanudación y fallos/reinicio del worker pueden verificarse sin esperar fotos nuevas. No rehacer reconocimiento ni reindexar el catálogo para estos pasos.

Se preparó [el protocolo de pruebas y corpus](scanner-validation-protocol.md): dispositivo/HTTPS/LAN, fotos etiquetadas y negativos, métricas locales y extremo a extremo. SIGINT real/reanudación, presión concurrente y estabilidad prolongada siguen pendientes. No se certifica eliminado el abort nativo anterior.
