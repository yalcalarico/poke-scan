# Interrupción y recuperación del worker — 6 de octubre de 2026

## Cambio implementado

El service visual escucha salida/error/desconexión durante toda la vida de su
proceso, también entre consultas. Un canal interrumpido libera la referencia y
termina el proceso; el siguiente intento crea otro worker. Durante una consulta,
la desconexión produce el error de interrupción inmediatamente, sin esperar el
timeout. Eventos tardíos de un proceso anterior no invalidan el reemplazo.

Se conserva el timeout de 30 s y la cancelación: terminan el worker, liberan el
estado ocupado y permiten reintentar. No hay reintento automático de la misma
foto. Modelo, ranking, índice, autenticación y contrato permanecen iguales.

## Regresiones

Ocho casos del ciclo de vida cubren salida, error, desconexión en curso,
error/desconexión en reposo, timeout, cancelación con respuesta tardía y fallo
al enviar IPC. Se comprueba recuperación posterior y que una salida tardía no
borre un worker nuevo. Son procesos simulados; no certifican estabilidad nativa.

## Comprobación nativa reproducible

Después del build, desde backend:

```sh
node --env-file-if-exists=.env scripts/scanner-stability-smoke.mjs /tmp/cards-1200/IMG_4985.png /tmp/scanner-stability-report.json
```

El script usa el service compilado y DINOv2 reales, lee el índice sin cambiarlo,
y provoca fallos sólo en sus propios procesos hijos. No usa API pública, DB,
fotos nuevas ni colecciones. Incluye SIGKILL en consulta y reposo, cancelación,
SIGSTOP con timeout real de 30 s y reconocimiento posterior a cada fallo.
Comprueba que el ranking se conserva y termina su worker al finalizar.
No sobrescribe reportes. La imagen debe respetar el límite de 6 MiB del service.

La primera ejecución con el original de 11 MiB fue rechazada por ese límite,
sin arrancar ONNX. Se usó la versión existente de 1,4 MiB en `cards-1200` para
la comprobación de ciclo de vida; no se considera una evaluación de precisión.

## Límites y próximos bloques

No demuestra estabilidad prolongada ni bajo concurrencia, ni recuperación del
proceso completo de Nest. SIGINT/reanudación del indexador es otro pendiente.
Cancelación desde HTTP y cámara física son pruebas distintas; esta corrida
verifica el AbortSignal del service. Las mediciones durante los checks no se
usan como benchmark ni para certificar percentiles de producción.

Corpus amplio y calibración siguen pendientes de fotos. El próximo bloque
independiente requiere GO: concurrencia controlada, límites y medición de carga.

## Resultado verificado

Todos los escenarios nativos pasaron con 20.670 referencias. Timeout real:
30.002,5 ms; consulta posterior exitosa y reutilizacion caliente.
Ver [reporte](scanner-stability-2026-10-06.json).

Check completo final exit 0: lint, tipos, 314 backend, 7 scripts, 6 e2e y
347 frontend (**674 pruebas**) y ambos builds. Log local:
`/tmp/scanner-stability-2026-10-06-check-final.log`.

El primer intento de specs se nego a correr porque un watcher propio reinicio
la API tras stop. Se detuvieron los watchers propios y el check final corrio
con el puerto libre. Se restaura un solo stack al terminar. Sin push.
