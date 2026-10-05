> Estado vigente desde el 5 de octubre: ORB fue retirado por decisión del usuario.
> Este informe conserva evidencia anterior; ver [DINOv2 puro](dinov2-only-2026-10-05.md).

# Recuperación adaptativa y rechazo de lecturas sin evidencia

Implementado el 5 de octubre de 2026. DINOv2 sigue siendo el único motor de
recuperación; no se agregan OCR, requests externos ni almacenamiento de consultas.

El worker verifica los primeros 64 candidatos con ORB/RANSAC. Si no encuentra un
dibujo corroborado, continúa por tandas de 64 hasta 512. Se detiene al encontrar
evidencia o al superar 24 segundos entre tandas. El límite total del service
sigue siendo 30 segundos. La respuesta informa cuántos candidatos se evaluaron y
conserva sus posiciones DINOv2 originales. No hay IDs de estas muestras en la
lógica de producción ni cambios en los umbrales geométricos.

El cliente conserva el diagnóstico pero no pide precios ni suma una entrada si
el primero no tiene geometría corroborada o el verificador no está disponible.
Muestra instrucciones para reintentar o buscar manualmente. La descarga exacta
voluntaria sigue disponible en ese caso.

## Recortes del teléfono

Prueba del worker real con los mismos JPEG, sin volver a recortar ni recodificar:

| Muestra | Antes | Después | Posición original | Evaluados | Tiempo API del worker |
|---|---|---|---:|---:|---:|
| N’s Darmanitan | Flaaffy sin corroborar | N’s Darmanitan sv9-27, 53/60 puntos | 392 | 448 | 25,28 s |
| Carkol ASC 119/217 | Alolan Dugtrio sin corroborar | Carkol me2pt5-119, 41/44 puntos | 143 | 192 | 10,41 s |

Darmanitan tiene **dibujo corroborado, edición sin confirmar**: el recorte no
muestra el pie y hay reimpresiones con el mismo dibujo. No contar este caso como
acierto de edición. Ver datos en `camera-recovery-2026-10-05.json`.

## Regresión y límites

Las cinco fotos originales de la evaluación anterior devolvieron el ID esperado
(antes 4/5, ahora 5/5 en esta pasada). Cuatro necesitaron sólo 64 candidatos;
Umbreon necesitó 448 y 27,99 s. Son entradas directas al motor, **no una medición
de precisión de galería ni cámara**. Datos en
`camera-recovery-regression-2026-10-05.json`.

La recuperación difícil sigue siendo lenta y cercana al timeout. Esta mejora
acotada no prueba precisión general ni calibra rechazo: faltan negativos,
reimpresiones y más fotos etiquetadas. La corroboración del dibujo no garantiza
edición o acabado. Los tests cubren ampliación, límite de 512, conservación del
ranking, rechazo sin evidencia/verificador y descarga después del rechazo.

`pnpm run check` pasó: lint, types, 304 tests backend, 7 tests de scripts,
6 de API, 324 frontend y ambos builds, incluyendo la prueba de pantalla
de rechazo sin entrada y conservación de la descarga.

El endpoint autenticado por HTTPS/LAN también devolvió 200 para ambos recortes,
con los mismos IDs y geometría: 25,10 s y 10,48 s de API. Se usó el JPEG exacto,
sin consultar precios ni guardar entradas en colecciones.
