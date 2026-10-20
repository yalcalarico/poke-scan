# A1 — Rectificación de perspectiva de galería

Implementado el 6 de octubre de 2026. No cambia el modelo, índice, API o UI.

## Comportamiento

El detector anterior buscaba un rectángulo paralelo a los ejes; no conservaba
cuatro esquinas ni corregía perspectiva. Ahora se buscan líneas inclinadas
en una miniatura con lado mayor de 180 px, se intersectan cuatro lados y se
validan convexidad, tamaño, proporción, cobertura y soporte de borde en todos
los lados. La búsqueda está acotada a diez líneas por orientación.

Un cuadrilátero válido se transforma proyectivamente al rectángulo de carta,
63/88, con interpolación bilineal por canal y lado mayor de hasta 1400 px.
El resultado horizontal se rota a vertical. No se utiliza interpolación de
esquinas como sustituto de la homografía.

Si no hay cuatro lados confiables, el warp es inválido o la foto ya está
alineada, se conserva el camino previo de detección/recorte. Si ese detector
tampoco encuentra una carta, se conserva la imagen limitada de tamaño.
La cámara ya encuadrada no ejecuta este detector. No se agregó una indicación
visual; el especialista UI corresponde al siguiente bloque de calidad de captura.

Los umbrales son heurísticos. Cuatro bordes fuertes no garantizan que sean el
borde exterior de la carta: fundas, marcos interiores y fondos requieren corpus
amplio. No se declara resuelta la perspectiva de cámara ni inclinaciones extremas.

## Verificación

Seis pruebas nuevas cubren transformación proyectiva (centro distinto del
promedio de esquinas), canales y esquinas, detección inclinada, orientación
horizontal, respaldo para carta alineada, fondos uniformes/carta cortada y
rechazo de geometría cruzada, degenerada, fuera de imagen o no finita.

```sh
pnpm --dir frontend exec vitest run lib/scanner/__tests__/perspective.test.ts lib/scanner/__tests__/preprocess-canvas.test.ts lib/scanner/__tests__/visual-photo.test.ts
```

Las 24 pruebas focalizadas pasaron. Check completo verde: **681 pruebas**,
315 backend, 7 scripts, 6 e2e y 353 frontend; lint, tipos y ambos builds.
No hay errores de `git diff --check`. Stack restaurado al terminar.

## Comparación con fotos existentes

Se decodificaron los cinco originales del manifiesto de desarrollo con sharp,
orientación automática y ancho máximo 1280, y se ejecutó la preparación
frontend anterior (`HEAD`) y actual. Son entradas comparables entre sí;
no reproducen exactamente la decodificación de un navegador ni el baseline
de originales enviados directamente sin preparación.

| ID esperado | Puesto anterior | Puesto con perspectiva |
|---|---:|---:|
| me55c-106 | 2 | 1 |
| me55-23 | 4 | 1 |
| me55-92 | Fuera del top-8 | 1 |
| me55-137 | 1 | 1 |
| me55-145 | 1 | 1 |

Top-1 **2/5 → 5/5**, top-8 **4/5 → 5/5**, usando el mismo worker DINOv2 real
aislado y el índice local. Las cinco preparaciones activaron rectificación;
se inspeccionó visualmente el recorte resultante de Umbreon. Tiempo de
preparación observado en Node: 39–67 ms, no benchmark de teléfono.

Evidencia: [geometría/tamaños](scanner-perspective-originals-2026-10-06.json)
y [rankings completos](scanner-perspective-ranking-2026-10-06.json).
Es una muestra de desarrollo de cinco fotos conocidas: no certifica precisión
general, negativos, fondos difíciles ni reconocimiento desde cámara.

Pendiente en B2: reproducir galería en navegador y ampliar la comparación con
fotos nuevas, condiciones difíciles y una partición reservada.
