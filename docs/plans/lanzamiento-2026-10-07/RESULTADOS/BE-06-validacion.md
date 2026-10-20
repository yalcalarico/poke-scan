# BE-06 — Métricas operativas implementadas y validadas localmente

11/10/2026 · Usuario autorizó este paso mediante «Si» tras la propuesta BE-06. **Completada localmente:19/38 completos,19pendientes (15locales+4documentales).** Ejecutor Luna medio, revisión/correcciones y gate root;2encargos delegados/4, sin subdelegación ni escalada. Automatización PAUSED/dos horas preservada, sin modificarla. El próximo paso requiere otra respuesta humana.

## Producto entregado

`GET /api/ops/metrics` protegido por secreto de servidor independiente del JWT de usuarios. Sin secreto válido responde404; credencial ausente/incorrecta401; `no-store`. Sin eventos personales, almacenamiento persistente, dependencias o migraciones nuevas. [Contrato y manual](../../../../backend/docs/metrics.md), DTO backend y espejo frontend actualizados.

| Señal | Unidad y alcance |
|---|---|
| HTTP del escáner | POST de ruta fija, incluyendo guardas y DTO; clases/status400/401/503 y desconexiones separados, finish/close deduplicados. Sin etiquetas de rutas dinámicas o bodies. |
| Inferencias | Admitidas/iniciadas/completadas/fallidas, rechazos ocupado/indisponible/cancelado/deshabilitado/inválido. Busy se cuenta desde la admisión, no se adivina del503. |
| Duraciones | HTTP y ciclo worker separados de inference/index/model reportados por worker; warmup mide preparación inicial, no sólo carga ONNX. Modelo frío sólo si worker declara cold; no atribuirlo al warmup. |
| Histogramas | Buckets fijos, conteo/suma; sin muestras individuales ni percentiles. Ventana desde arranque del recorder, reset al reiniciar. |
| Cola | Pending/processing, edad desde createdAt al sampledAt y suma max(attempts−1,0) de filas activas. Gauge actual, no total histórico. Query agregado/pool independiente, statement750ms/socket y conexión1s; cache1s, respuesta2s, singleflight hasta settle y copia defensiva. Falla devuelve unavailable sin detalles. |
| Redis | Estado/configuración/degradedSince/lastErrorAt existentes; sin URL o mensajes privados. |

La observación del escáner captura excepciones para conservar su comportamiento; no cambia worker, timeouts de reconocimiento, DINOv2, proveedor de precios ni ritmo de cola. Memoria de cardinalidad fija; no fotos, emails, IDs, notas ni tokens serializados.

## Verificación real

- Focales finales **45/45**, seis archivos: métricas y regresiones del escáner. Primera corrida44/45 falló por fixture nueva que acusaba generación2 en un servicio recién creado de generación1. Corregida sólo esa fixture; log original conservado.
- Primer stop/check estándar:996pruebas pasaron, pero build Nest falló TS7053 por `Object.entries` perdiendo el tipo de nombre de histograma. Root corrigió iteración sobre nombres fijos tipados, sin any/cast y sin debilitar tests. Primer entorno retirado por ownership antes de crear otro desde la misma fuente estándar intacta; no se atribuye el fallo a datos.
- **Check estándar final exacto:996/996,0skips** =428Vitest backend+13scripts+6HTTP e2e+549frontend; lint, typecheck frontend, Nest y Next16.3.6Turbopack verdes. Logs/resultados completos adjuntos. Warnings no bloqueantes de herramientas/lint conservados.
- Comando exploratorio `pnpm --dir backend exec tsc --noEmit` también incluyó specs/test y encontró diagnósticos ajenos preexistentes de mocks/interfaces/supertest; no es el gate configurado. No se modificaron esos archivos. La compilación fuente Nest del gate final sí pasó.
- **22/22 controles integrados** con Nest compilado, PostgreSQL y Redis propios: endpoint anónimo/JWT rechazados, token de operación válido/no-store, warmup una vez, cuenta sintética, guard401/DTO400, cinco POST concurrentes con **1×200+4×503 ocupado**, separación HTTP/inferencia y duraciones reales, no secretos en payload, cola2filas con edades/retries precisos y corte/recuperación Redis sin reiniciar API. Imagen sintética generada sólo en memoria; no evalúa precisión física ni éxito de negocio.
- Primer harness runtime omitió displayName obligatorio en RegisterDto y se detuvo antes de inferir. Se preservó el fallo privado, se añadió campo y se ejecutó consumidor corregido; **sin cambio de producto ni otro check verde**. Los22controles son distintos de la fase final, no suma de intentos.
- **1957fuentes/outputs intactos durante runtime**; baselines de implementación son escalonados porque root y ejecutor iniciaron captura/edición en paralelo, no una instantánea única anterior a todo cambio. Delta de fuentes limitado al alcance autorizado.

## Cleanup e instancia del usuario

Ambos clones estándar `_test` y Redis temporales retirados por marker/owner/fullIDs y conexionesSQL0. Dev13migraciones/22usuarios/22colecciones/69items/13shares/20670cartas/5GIN y TEST11migraciones/2usuarios/3colecciones/2items/1share/20670cartas/7cotizadas/5GIN conservados; Redis compartido sano e identidad intacta. No FLUSHDB ni fixtures en inventario dev.

La instancia solicitada quedó **intencionalmente viva [localhost:3000](http://localhost:3000)** con API compilada y Next standalone actuales. [Recibo de instancia](BE-06-evidencia/final-instance.json): login200, health200, ready200; opsmetrics404 sin secreto por defecto. Jobs/crons y fetch externo de proveedores siguen bloqueados. [Captura del login vacío](BE-06-evidencia/login-instancia-restaurada.jpg) acredita render/disponibilidad, no una nueva autenticación con cuenta real. Tabs temporales cerradas. Recursos QA vivos:0.

BE-06 queda aceptada localmente. INF-04 puede consumir las señales; monitoreo externo/HTTPS, hardware objetivo, alertas y operador/presupuesto siguen para su paso. FE-05 diferida, investigación manual/participantes/custodio/retención, eliminación BE-05 y demás gates humanos se conservan. Los fallos históricos de socket/backfill siguen sin causa o fix demostrados. No deploy/commit/upgrades/contacto externo.

**Próximo propuesto:** INF-04, monitoreo y alertas locales con estas señales y pruebas de interrupción en sandbox; el ID conserva sus entradas de host/operación externos. Esperar respuesta antes de reservar o iniciar.
