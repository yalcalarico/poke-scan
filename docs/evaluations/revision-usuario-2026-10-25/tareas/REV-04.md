# REV-04 — Escanear sin pulsaciones repetidas y simplificar controles

Estado: implementada; 32 pruebas focales y gate integral aprobados; cámara/audio
físicos pendientes. [Implementación](../RESULTADO-03.md) · [QA](../RESULTADO-04.md).
Rol: frontend; ai-vision solo si hay fallo del detector.
Origen: [E04](../README.md#e04--simplificar-el-escáner-y-capturar-automáticamente).

## Qué revisar

- `frontend/components/scanner/action-bar.tsx`: Galería y Descartar laterales,
  obturador y fila inferior de estado/Continuar.
- `frontend/components/scanner/camera-view.tsx` y
  `frontend/app/(app)/escanear/page.tsx`: `autoVisual` ya está habilitado.
- `frontend/lib/scanner/auto-visual.ts` y guía `frontend/docs/scanner.md`:
  estabilidad, encuadre, pausas, revisión y cadencia; comprobar la ruta real del helper.
- Investigar por qué una carta encuadrada no avanza: geometría, estabilidad,
  consulta pendiente, revisión abierta, permisos o límite de sesión. No dar por
  demostrado que falta autocaptura ni duplicar el loop existente.

## Qué arreglar y cómo

1. Retirar los dos botones laterales y la leyenda inferior solicitados. Alinear
   Continuar y obturador en la misma fila, respetando safe areas y 44 px táctiles.
   Mantener obturador manual de respaldo. Conservar estados esenciales de error
   y progreso accesibles sin reintroducir párrafos permanentes.
2. Reparar la autocaptura existente para carta encuadrada y estable. Mantener
   requests seriales, pausas por revisión y cadencia; no persistir las fotos.
3. Rearmar captura cuando se retire/cambie la carta; una carta inmóvil no debe
   sumar infinitas copias. Reintroducir la misma carta o una captura manual
   intencional sí puede sumar otra copia (contrato con REV-06).
   La identidad propuesta queda aceptada automáticamente; abrir comparación y
   corregir sigue siendo opcional y pausa captura mientras esa revisión está abierta.
4. Sonido de monedas una vez por lectura aceptada cuando su resultado y precio
   estén visibles. Si el precio llega después, emitir al aparecer el precio.
   Cero es válido; ausencia, error, re-render o respuesta retirada no disparan sonido.
   Desbloquear audio desde el gesto de inicio en iOS; su fallo no bloquea escaneo.

Propietario: action-bar, camera-view y helper de audio si corresponde. Coordinar
escritura de la página con REV-05/REV-06. No crear ajustes de pago ni otro reconocedor.

## Aceptación y validación

- Varias cartas seguidas se capturan sin tocar el obturador; no hay duplicados
  por inmovilidad ni doble inserción por respuestas tardías/StrictMode.
- Captura manual, revisión/corrección, pausa y Continuar siguen funcionando.
- Sonido sincronizado una vez, incluidos precio demorado, cero y audio denegado.
- Pruebas focales: `auto-visual.test.ts`, `scan-page-camera.test.tsx` y cobertura
  del evento de audio. Localizar sus rutas vigentes antes de ejecutar.
- Prueba física Safari con cámara/audio y gate del [lote](../TAREAS.md#reglas-para-delegar).
