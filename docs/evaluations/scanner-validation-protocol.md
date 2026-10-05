# Validación siguiente del escáner — 3 de octubre de 2026

Estado actualizado el **4 de octubre de 2026**. Este archivo es el protocolo;
los resultados están en [el informe inicial](visual-current-2026-10-03.md) y
[la verificación de galería](scanner-gallery-current.md).

## Estado verificado y próximo bloque

- **Hecho:** check completo verde; IMG_4987 por galería identifica Umbreon ex
  `me55-92` (DINOv2 2 → ORB 1); identidad conservada sin precio.
- **Hecho en casos puntuales:** sesión restaurada al recargar, cierre de
  Organizar sin guardar, guardado explícito de dos copias en la colección
  «Prueba escáner · 4 octubre», y render de un enlace existente sin sesión.
- **Parcial:** selección de orden por precio e IDs entre páginas; falta comprobar
  valores numéricos y cartas sin precio. No se probó precio lento en UI ni el
  límite de 30 entradas mediante sesión real.
- **Pendiente:** cámara física, PWA/segundo plano, offline/reconexión y
  cancelación durante una consulta real. La hoja Organizar no ofrece variante.

El próximo paso es subir por «Subir una foto» en la web las otras cuatro fotos
(IMG_4985, IMG_4986, IMG_4988 e IMG_4989) y registrar el ID reconocido y los
tiempos de cada intento. IMG_4987 ya se probó por ese flujo y reconoció Umbreon
correctamente. La web ya ajusta el tamaño, detecta, recorta y orienta la carta
antes de enviarla al motor; no hay que implementar otra preparación.
No guardar fotos de consulta. El runner directo saltea esos pasos de la web:
sirve para diagnosticar el motor, pero sus resultados no miden por sí solos
la precisión de la app. Después, completá cancelación/reconexión y la
comprobación numérica del orden por precio.

En paralelo, el usuario puede probar cámara/PWA en un teléfono por HTTPS/LAN
y reunir fotos nuevas etiquetadas. Con ese corpus se evalúan negativos,
reimpresiones y rechazo/confirmación. Sin él no se calibran umbrales ni se
afirma precisión general. SIGINT/reanudación y fallos/reinicio del worker
pueden avanzarse sin esperar las fotos; optimizaciones y runtime alternativo
quedan después de medir los cuellos de botella.

## Orden de ejecución

1. Detené el stack con `pnpm run stop` y ejecutá `pnpm run check`. No confundas fallos de acceso a PostgreSQL/Redis con regresiones. No ejecutes tests DB mientras la API esté arriba.
2. Con los checks terminados, levantá `pnpm run dev` para galería y flujo de colección. Para cámara física usá [la guía HTTPS/LAN](../local-network.md): `pnpm run lan:cert`, instalá/confiá sólo el certificado público en el teléfono y ejecutá `pnpm run dev:lan`. No generes otra CA si ya tenés una vigente.
3. Registrá flujo UI y fotos nuevas. Luego medí el corpus visual con el runner actual. Recién con resultados separados de negativos y reimpresiones evaluá reglas de confirmar/rechazar.
4. Después: SIGINT/reanudación del indexador en un directorio de prueba, reinicio/cancelación/timeout del worker y carga concurrente. No reindexes el catálogo completo para estas pruebas.

## Qué necesitamos del usuario

Prueba en al menos un iPhone con Safari y un Android con Chrome, indicando modelo, OS, navegador, modo pestaña/PWA y conexión. Si sólo hay uno disponible, registrá ese alcance.

Aportá 50–100 fotos reales, con permiso de usarlas en evaluación local y sin datos personales en el fondo. Para cada foto positiva, confirmá ID exacto del catálogo mediante set y número; anotá acabado normal/holo/reverse aparte porque el ID no distingue necesariamente la variante. Incluí cartas distintas y condiciones variadas: funda, reflejo, desenfoque, perspectiva, full-art y pares de reimpresiones con el mismo dibujo. Una toma frontal clara y tomas difíciles de la misma carta permiten comparar sin inventar etiquetas. Reservá parte de las cartas para validación posterior; varias tomas de una carta no son muestras independientes de identidad.

Incluí negativos confirmados: fondo sin carta, dorso, otra clase de carta y cartas ausentes del catálogo. Usá `cardId: null` únicamente cuando se verificó que no corresponde aceptar ningún ID del índice; un ID desconocido pendiente de etiquetar no es un negativo. No fabriques imágenes ni ground truth para completar la cantidad.

Las fotos existentes son cinco casos de regresión. No permiten estimar precisión general, calibrar umbrales ni demostrar robustez de una categoría.

## Checklist UI — registrar observado, falló o pendiente

| Prueba | Resultado esperado | Evidencia a registrar |
|---|---|---|
| Galería, orientación vertical/apaisada | Recorte/orientación; #1 con nombre, set y número | Foto/ID confirmado, ID mostrado, diagnóstico |
| Precio ausente/lento | Conserva la identidad y muestra ausencia de precio | ID antes/después y petición sólo de ese ID |
| Restaurar sesión | Recargar la misma pestaña conserva entradas; máximo 30 | Cantidad antes/después; no confundir cerrar pestaña |
| Organizar | Elegir colección y cantidad; guardar explícitamente | Cantidades en colección antes/después; cancelar no guarda; la hoja actual no ofrece variante |
| Compartir | Abrir el link público sin sesión muestra cartas y cantidades | URL de prueba, pantalla, sin datos privados |
| Orden por precio | Recorrer más de una página y comparar orden global | Moneda, sentido, IDs/precios; ubicación de cartas sin precio |
| Cámara física | Permiso, cámara trasera, marco rojo→verde y captura estable | Dispositivo, luz/funda, retraso observado, ID real |
| Escena quieta | No repite automáticamente; retirar/cambiar permite otra captura | Conteo en sesión durante 10 s quietos y al cambiar |
| Cancelación/segundo intento | Respuesta anterior no reemplaza la captura nueva | Orden de acciones y entrada final |
| PWA segundo plano | Volver no pierde sesión ni deja cámara bloqueada | Pestaña/PWA, tiempo en segundo plano |
| Offline y reconexión | Reconocer requiere API; error recuperable y nuevo intento al volver | Estado de red y sesión; no afirmar reconocimiento offline |

Cámara verde significa encuadre estable. Sumar #1 a sesión no confirma edición o acabado. Persistir en colección sigue siendo explícito.

## Runner del método vigente

Desde la raíz, con API detenida o arriba (no usa DB ni precio):

```sh
pnpm --dir backend exec node --env-file-if-exists=.env scripts/scanner-evaluate-current.mjs ../docs/evaluations/manifest.json /tmp/visual-current-report.json 2
```

No descarga, reindexa ni almacena fotos de consulta. Lee archivos locales provistos voluntariamente y crea un reporte nuevo con hashes de fotos/manifiesto, metadata del modelo y versión del índice. No sobrescribe reportes existentes. Las rutas relativas de fotos se resuelven desde el manifiesto. Formato compatible con las cinco etiquetas existentes:

```json
[
  { "path": "/ruta/foto-preparada.jpg", "cardId": "ID-confirmado", "conditions": ["funda", "perspectiva"] },
  { "path": "/ruta/negativo-confirmado.jpg", "cardId": null, "conditions": ["dorso"] }
]
```

El runner reutiliza embedding, carga consistente del índice y reranking ORB del código actual en un proceso hijo. Evalúa DINOv2 contra todas las referencias antes de la recuperación adaptativa (64 inicialmente, hasta 512 si falta geometría corroborada), informa referencias ausentes y fallos de recuperación por separado, y conserva los ocho candidatos visibles con geometría. Usa el mismo fallback si ORB falla. El cliente actual rechaza la suma a sesión si el verificador no está disponible o el primero no está corroborado; el reporte distingue candidatos de aceptaciones de negativos. No es una validación del endpoint ni reproduce el recorte/orientación del frontend: proveé recortes preparados y documentá su origen. Pasar originales mide otro alcance.

Las métricas de identidad cuentan una vez cada foto (primera pasada); las repeticiones sólo amplían tiempos. `falseSessionAcceptances` cuenta negativos con candidato bajo la política actual de sumar #1, no escrituras en una colección ni una probabilidad calibrada. La falta de negativos se informa como cero muestras, nunca como tasa de falsos positivos cero.

Separa consulta fría inicial y consultas calientes y presenta n/p50/p95/p99 por fase y total local/coordinador. Una sola consulta fría no describe una distribución: reiniciá el runner y rotá el orden del corpus para medir arranques distintos. Caché ORB de 128 descriptores hace depender el tiempo de la secuencia. Con cinco fotos, p95/p99 se acercan al máximo observado y no son una garantía.

Para extremo a extremo, medí en navegador/dispositivo desde captura o selección hasta entrada en sesión, incluyendo preparación, HTTP y precio; guardá aparte los tiempos backend del diagnóstico. No sumes percentiles de fases para inventar un percentil total. Registrá concurrencia, fallos, memoria y cambios de dispositivo antes de optimizar.

## Registrar errores de cámara o galería bajo demanda

Después de reconocer, abrí «¿No coincidió? Guardá el recorte» y elegí «Descargar recorte» y «Descargar diagnóstico». El recorte contiene los bytes exactos enviados, sin otra compresión. El JSON comparte nombre base y deja `expectedCardId: null`: indicá el ID correcto confirmado al reportarlo. Para negativos confirmados mantenelo en null y anotá la condición.

No hay almacenamiento automático de fotos. La revisión sólo conserva la última captura en memoria hasta la siguiente lectura, descarte, recarga o salida de la pantalla. En cámara, abrirla pausa las capturas automáticas hasta cerrarla. No hace falta descargar cada intento: hacelo sólo cuando detectes un error o quieras aportar un caso al corpus. Ninguna descarga cambia una colección.

## Recuperación adaptativa vigente desde el 5 de octubre

Ver [evidencia del fix](camera-recovery-2026-10-05.md): dos recortes de teléfono
reproducidos por worker y endpoint HTTPS, más cinco entradas de regresión directa.
Registrar `retrievalLimit` junto con los tiempos: las consultas difíciles pueden
ampliar de 64 a 512 por tandas y tardar 10–28 segundos. No convertir dibujo
corroborado en edición/acabado confirmado. Este cambio no calibra precisión ni
rechazo general y no sustituye las pruebas físicas pendientes del protocolo.

## Vigencia: DINOv2 puro — 5 de octubre

Por decisión del usuario se retiró ORB, la ampliación hasta 512 y el rechazo
geométrico. Los bloques previos documentan la evaluación histórica. El runner
vigente devuelve top-8 DINOv2 sin acceder a imágenes de referencia; la UI vuelve
a sumar el primero, sin rechazo calibrado. Se conserva la descarga voluntaria.
