# Resultado 03 — REV-04

Fecha: 26/10/2026. Encargo 3/4. Estado: **implementación y pruebas focales aprobadas; falta QA físico en Safari/iPhone y gate integral del encargo 4**.

## Criterios

| Criterio | Estado y evidencia |
|---|---|
| Galería/Descartar laterales y leyenda junto a Continuar | Hecho. La fila ahora alinea obturador manual y Continuar; el estado operacional queda anunciado con `role=status`, el progreso continúa visible mientras se procesa. La galería permanece en «Subir una foto» desde reposo. Test de ActionBar verifica la fila, ausencia de los botones y anuncio accesible. |
| Errores, progreso y respaldo manual | Hecho por código: progreso tiene barra accesible, los errores se anuncian dentro de la cámara o vuelven al aviso de cámara de la pantalla; obturador manual sigue activo cuando no hay captura/consulta/pausa en curso. El test de página conserva la captura manual. |
| Autocaptura serial y rearmado | Corregido en lógica y probado en el gate: el único sondeo permanece activo durante `busy` y pausas para notar retirada; el bloqueo sólo impide disparar. Una retirada de al menos 1 s rearma incluso durante una consulta. La firma centra luminancia para tolerar cambios globales de exposición; tests comprueban que un cambio estructural reinicia los 900 ms. Una captura manual marca su muestra y no deja que el mismo cuadro genere enseguida una copia automática adicional. Una carta inmóvil no vuelve a disparar; una reintroducida sí puede hacerlo. |
| Sonido de monedas | Hecho por código y probado en página: intenta desbloquear audio desde el toque que abre cámara; su fallo no altera captura. Suena una vez por `runId` visible con un precio numérico, incluido cero; espera el resultado con precio demorado y excluye ausencia de precio, error y re-render. |
| Prueba física Safari/iPhone | Pendiente. No se tuvo cámara ni audio físicos de Safari; los resultados de Vitest no demuestran encuadre real, playback autorizado o UX instalada. |

## Hallazgo de autocaptura

**Causa confirmada en código para un caso concreto:** el efecto limpiaba su intervalo cuando `busy` o una pausa pasaban a true, así que no observaba que la carta se retirara durante ese lapso. Al reintroducir la misma carta antes de reanudar el sondeo, su firma seguía marcada como capturada y no avanzaba. La observación ahora continúa, pero `busy`/pausa siguen bloqueando disparos.

**Hipótesis, no causa confirmada del reporte general:** el gate medía diferencias absolutas de luminancia; variación global de exposición podía reiniciar estabilidad aunque la geometría no cambiara. Se normaliza restando la luminancia media y se conservan umbrales y requisitos de encuadre/estabilidad. Pruebas sintéticas respaldan esta mejora, pero sólo cámara física puede confirmar su efecto en el síntoma del usuario. No se encontró evidencia de un límite de sesión: sigue sin tope de lecturas, mantiene runId, cadencia 2,5 s y requests seriales.

## Archivos REV-04

- Flujo y controles: `frontend/components/scanner/action-bar.tsx`, `frontend/components/scanner/camera-view.tsx`, `frontend/app/(app)/escanear/page.tsx`.
- Autocaptura/audio: `frontend/lib/scanner/auto-visual.ts`, `frontend/lib/scanner/coin-sound.ts`.
- Regresiones: `frontend/lib/scanner/__tests__/auto-visual.test.ts`, `frontend/components/scanner/__tests__/action-bar.test.tsx`, `frontend/components/scanner/__tests__/camera-viewport.test.tsx`, `frontend/components/scanner/__tests__/scan-page-camera.test.tsx`.
- Operación: `frontend/docs/scanner.md`.

## Comandos y resultados

- `pnpm run stop` — ejecutado antes de la suite; liberó puertos 3000/3001.
- `pnpm --dir frontend exec vitest run --no-file-parallelism --reporter=dot lib/scanner/__tests__/auto-visual.test.ts lib/scanner/__tests__/camera-crop.test.ts lib/scanner/__tests__/camera-visual.test.ts lib/scanner/__tests__/card-frame.test.ts components/scanner/__tests__/scan-page-camera.test.tsx components/scanner/__tests__/action-bar.test.tsx components/scanner/__tests__/camera-viewport.test.tsx` — **7 archivos, 32/32 tests aprobados**. Advertencias de fixture con `src=""` preexistentes en `scan-page-camera.test.tsx`.
- `pnpm --dir frontend run lint` — **exit 0**; guard de colores y URLs aprobados. Un warning preexistente de `<img>` en `components/cards/__tests__/card-tilt.test.tsx`.
- `pnpm run typecheck` — **exit 0**.
- No se ejecutaron `pnpm run check`, build, stack/API ni Safari físico; quedan para QA integral.

## Receta para QA final

En iPhone con Safari y una cuenta/catálogo de prueba, validar permisos de cámara y audio al tocar «Escanear carta»; apuntar a una carta quieta y confirmar una sola lectura con precio y aviso audible. Dejar la carta quieta después del resultado y comprobar que no se agrega otra; retirarla por más de 1 s, reintroducirla y confirmar una nueva lectura de la misma identidad. Repetir tapando/cambiando la carta mientras la lectura anterior sigue ocupada. Probar también obturador manual, revisión/corrección y pausa, precio cero, carta sin precio, error de red y audio denegado; verificar que el frame guía no capture fondo y que el foco/controles no choquen con safe areas. Luego correr `pnpm run check` y el flujo real aislado. No crear datos reales; usar y limpiar sólo cuenta/colección descartables.
