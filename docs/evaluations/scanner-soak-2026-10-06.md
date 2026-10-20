# Prueba de diez minutos del worker — 6 de octubre de 2026

## Protocolo

Service compilado y DINOv2 reales, índice local, cinco fotos existentes a 1200 px
alternadas. Cinco consultas por ciclo de unos cinco segundos, con pausas entre
ciclos. SIGKILL a mitad de la duración, comprobación del error esperado y nueva
consulta fría en un proceso diferente. Se exige un único PID por fase, ranking
reproducible por foto y listeners sin acumulación.

RSS del worker y coordinador observado al finalizar cada ciclo, no pico continuo.
Se presentan tiempos fríos/calientes, memoria por fase y tendencia lineal tras
el primer minuto de cada proceso. La tendencia de una corrida corta no prueba
presencia ni ausencia de fuga; RSS incluye memoria nativa, no sólo heap JS.

La API/web se detienen durante check y medición para reducir competencia local.
No se consulta el proveedor, no se modifica DB/índice ni se guardan fotos nuevas.
No certifica cámara, HTTP, otras máquinas, varias réplicas, precisión, carga
máxima o estabilidad durante horas/días.

## Reproducir

Después de `pnpm run check`, desde backend:

```sh
node --env-file-if-exists=.env scripts/scanner-soak-smoke.mjs ../docs/evaluations/manifest-scanner-soak.json /tmp/scanner-soak-report.json 10
```

El manifiesto contiene rutas absolutas de archivos disponibles localmente,
menores a 6 MiB. No contiene etiquetas de precisión ni fotos versionadas.
Duración configurable entre 1 y 30 minutos; default 10. Progreso cada 30 s,
reporte nuevo sin sobrescribir y cierre del worker propio al finalizar.
Ante un error inesperado, se conserva el reporte parcial con estado `failed`.

## Estado

Corrida completada: **600.131,6 ms**, exit 0, estado `passed`.
[Reporte reproducible](scanner-soak-2026-10-06.json).

- 602 consultas exitosas y una interrupcion deliberada; cero errores inesperados.
- 600 calientes: p50 110,8 / p95 129,8 / p99 134,9 ms.
- Dos arranques frios: 1.703,8 y 1.392,8 ms.
- SIGKILL al segundo 300,1; recuperacion al 301,5, en otro PID.
- Un PID por fase, ranking consistente para las cinco fotos y listeners estables.

| Fase | Muestras RSS | Inicio/final (MiB) | Min/max observado (MiB) | Tendencia tras primer minuto (MiB/min) |
|---|---:|---:|---:|---:|
| Antes de SIGKILL | 60 | 315,2 / 314,1 | 303,4 / 347,7 | +0,47 |
| Tras recuperar | 61 | 338,7 / 311,0 | 301,0 / 343,4 | +0,81 |

Las pendientes pequenas positivas son ajustes lineales sobre fluctuaciones,
no una demostracion de fuga ni de su ausencia. El tiempo total cubre dos
procesos de aproximadamente cinco minutos cada uno, no diez minutos continuos
de un mismo proceso. No se cierra estabilidad de horas/dias ni carga maxima.

Check previo a la medicion exit 0: lint, tipos, 315 backend, 7 scripts,
6 e2e y 347 frontend (**675 pruebas**) y ambos builds. Log local:
`/tmp/scanner-soak-2026-10-06-check.log`; progreso:
`/tmp/scanner-soak-2026-10-06-progress.log`.

API/web restauradas en un unico stack al terminar. No se cambio produccion
en este bloque: herramienta, manifiesto local y evidencia/documentacion.
Cambios locales sin commit/push.
