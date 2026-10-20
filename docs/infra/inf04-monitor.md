# INF-04 — monitor local manual

La fase local consulta secuencialmente `GET /api/health`, `/api/ready` y `/api/ops/metrics`; sólo el último recibe `X-Metrics-Token`. La URL base debe ser HTTP(S) loopback y no admite userinfo, ruta, query ni fragmento. No sigue redirects, aborta cada request al vencer el plazo y cancela cuerpos mayores a 256 KiB. SIGINT/SIGTERM cancela el fetch o la espera de intervalo en curso. La salida es JSONL con estados/agregados permitidos y eventos `{event:"triggered"|"recovered",code}`; nunca imprime URL de error, cuerpo crudo, headers, credenciales, IDs ni mensajes de respuesta.

Configuración: `OPS_API_URL=http://127.0.0.1:3001`, `OPS_METRICS_TOKEN` de 32–1024 caracteres y opcional `OPS_INTERVAL_MS` (default 5000). `--once` consulta una muestra; `--samples N` limita el monitoreo manual; sin ambos, sigue hasta Ctrl-C. `--timeout-ms` admite 100–30000 ms; `--debounce` determina muestras consecutivas (default 2). No se instala scheduler, servicio ni dependencia.

Las señales fijas son `api_unreachable`, `readiness_not_ready`, `database_unavailable`, `scanner_unavailable`, `redis_degraded`, `metrics_disabled`, `query_queue_unavailable`, `queue_depth`, `queue_age`, `busy_rate`, `error_rate`, `counter_window_reset`, `backup_failed` y `feed_failed`. Readiness ready con Redis degradado sigue alertando Redis sin marcar indisponible la API. Las señales ausentes/malformadas quedan `unknown` y no recuperan una alerta previa. Métricas 401/404 significan endpoint protegido/oculto; revisá token y configuración del backend. La cola no disponible puede ser un query lento o un fallo de DB; contrastá con readiness y logs locales.

Busy/error se calculan por delta de contadores dentro del mismo `processStartedAt` y `metrics.since`; el primer snapshot no produce tasas. Busy es `admission_busy / (admission_busy + admission_unavailable + admission_cancelled + admission_disabled + admission_invalid + inference_started)`. Error es `inference_failed / (inference_failed + inference_completed)`. Son proporciones de outcomes observados en esa ventana; started y completions pertenecen a etapas distintas, así que no representan cohortes exactas. Reinicio abre época nueva. Retroceso de cualquier contador o acumulado de histograma se informa y no genera deltas negativos ni tasas. Tras un período con métricas desconocidas, se compara contra la última muestra válida y se etiqueta `observationalWindow`; la duración cubre ese hueco y no implica observación continua. Sin nuevos outcomes una alerta previa no se marca recuperada. `--min-samples` (default 5) evita porcentajes con denominadores menores. No se aplican umbrales numéricos salvo que se pasen explícitamente: `--busy-rate`, `--error-rate`, `--max-queue-depth`, `--max-queue-age-ms` o sus `INF04_ALERT_*` locales. Esos valores son decisión del operador de la ejecución, no política de producción. `countersCumulative` y `histogramsCumulative` son acumulados desde inicio del proceso; `windowDelta` trae diferencias de conteo y suma, con media ponderada `delta sum / delta count`. No se extrapolan acumulados como tasa por minuto.

Memoria RSS/CPU sólo se consultan si se configura `INF04_API_PID` numérico: `ps -o rss=,%cpu= -p <pid>`. Son muestras del proceso elegido; en macOS `%CPU` de `ps` es el promedio desde que inició el proceso, no un valor instantáneo ni una serie ni una caracterización de hardware. No se consulta command line ni se descubren procesos automáticamente.

Feed y backup son opcionales con `INF04_FEED_STATUS_FILE` y `INF04_BACKUP_STATUS_FILE`, archivos locales de metadatos JSON `{ "checkedAt":"ISO-8601 UTC", "status":"ok"|"failed" }`, máximo 8 KiB y sin campos adicionales. Se rechaza fecha no UTC, inválida o futura; no se leen dumps ni secretos. Sin archivo o con datos inválidos se informa `unknown`: esta entrada no autentica el origen ni acredita que un backup/feed exista o sea recuperable.

| Código | Diagnóstico y acción manual |
|---|---|
| `api_unreachable` | Revisá si API responde en loopback, puerto y logs. |
| `readiness_not_ready` / `database_unavailable` | Revisá probe y conectividad DB; no reinicies automáticamente. |
| `scanner_unavailable` | Revisá estado del worker/modelo e incompatibilidad reportada. |
| `redis_degraded` | Revisá Redis; el health/readiness contractual permite degradación sin matar API. |
| `metrics_disabled` | Revisá `METRICS_TOKEN` del proceso y `OPS_METRICS_TOKEN`; no copies el valor a evidencia. |
| `query_queue_unavailable` | Revisá consulta de métricas/DB junto con readiness. |
| `queue_depth` / `queue_age` | Inspeccioná worker y jobs en la cola; profundidad suma pending + processing y edad toma el máximo de ambos estados; el umbral fue configurado localmente. |
| `busy_rate` / `error_rate` | Correlacioná admisiones y fallos del worker en la ventana de contadores del proceso. |
| `counter_window_reset` | El proceso reinició o el contador bajó; empezá una nueva observación. |
| `backup_failed` / `feed_failed` | Revisá el registro local de metadatos y el job correspondiente; este monitor no valida el artefacto ni su proveedor. |

El monitor sólo observa y emite eventos locales: no reinicia servicios, no contacta operadores, no registra alertas externas y no aplica presupuesto. No mide uptime externo, hosting, carga prolongada, costo ni RPO/RTO. La fase local está aceptada: 15 pruebas focales, check final 1011/1011 sin skips y 22 controles integrados distintos. Se observaron alertas y recuperaciones ante corte del proxy TCP exclusivo hacia el clon PostgreSQL, Redis propio, worker DINOv2 y reinicio del API compilado. El servidor PostgreSQL compartido no se detuvo. El estado `initializing` del worker conserva la alerta hasta `ready`; todas las fechas que se exportan requieren UTC ISO y calendario válidos. [Informe y evidencia](../plans/lanzamiento-2026-10-07/RESULTADOS/INF-04-operacion.md). INF-04 sigue parcial por uptime externo, carga prolongada y presupuesto en el host objetivo.


## Ejecutarlo localmente

Con la API configurada por el operador y el secreto de operaciones suministrado únicamente por entorno:

```sh
OPS_API_URL=http://127.0.0.1:3001 pnpm run ops:monitor --once
OPS_API_URL=http://127.0.0.1:3001 pnpm run ops:monitor --samples 12
pnpm run ops:monitor:test
```

`OPS_METRICS_TOKEN` debe contener el secreto que ese proceso API usa como `METRICS_TOKEN`; nunca lo pases por argumento, URL o archivo de evidencia. La instancia de usuario restaurada deja el endpoint oculto por defecto, por lo que el monitor informa `disabled` hasta que el operador configure operaciones. La primera muestra no produce deltas. Los ejemplos no configuran políticas numéricas ni publican el endpoint. Un evento transitorio, incluido `counter_window_reset`, también respeta el debounce configurado; la época y los deltas se reinicializan aunque ese evento no alcance el mínimo de muestras.
