# TCGCSV: tanda común de las 18:00 Argentina

> La restricción de terminar a medianoche UTC fue reemplazada por el pedido
> posterior de [cerrar todos los grupos con resultado explícito](tcgcsv-batch-completion-2026-10-26.md).
> Este recibo conserva la evidencia de la primera entrega; no es la política de cierre vigente.

Fecha: **26/10/2026**. Estado: **implementado, validado y habilitado en desarrollo**.
La ejecución productiva programada para las 18:00 todavía no ocurrió al corte.

## Decisión del usuario

- Un único lote diario a las **18:00 Argentina (21:00 UTC)** para todos los sets
  habilitados, con peticiones seriales y reservas de 24 h por archivo.
- Transición del 26/10: ejecutar el lote de esta tarde excepto los tres grupos
  que ya se importaron por la mañana (`bw11`, `bwp`, `pop8`). Se incorporan a los
  objetivos nuevos del 27/10; conservar sus precios, fechas y reservas de hoy.
- Una consulta de carta, una edición o una señal manual no debe disparar una
  recuperación aislada durante la mañana.

## Qué cambió

- `tcgcsv_daily_batches` fija el alcance habilitado de cada fecha UTC al abrir
  la tanda. Funciona aunque todos los objetivos ya existieran antes de las 18
  o sus sets se deshabiliten después. Una demanda nueva espera el siguiente lote.
- Planificador, señal durable y consumidor automático esperan la ventana de
  admisión de 21:00 hasta medianoche UTC. Se elimina el rescate matinal de
  pendientes anteriores introducido el 22/10.
- El claim automático exige origen diario, fecha vigente y objetivos pendientes.
  Una lectura conserva el origen de un job diario pendiente; no lo adelanta como
  interactivo ni vuelve a descargar un grupo terminado de la tanda.
- La tanda espera una publicación del día antes de bajar productos/precios.
  Permanecen validación de identidad, confirmación de build, publicación por grupo,
  reservas, leases, caché y pausas 429. No se mezclan proveedores.
- `runOne(groupId)` conserva la unidad interna de ingesta para harnesses aislados.
  No tiene endpoint. El consumidor automático entra por `poll()`/`runOne()` sin ID
  y aplica las restricciones del lote; el arnés de flujo verifica ese camino.

## Límites operativos

Las 18:00 son el inicio de la tanda. Las peticiones suceden en secuencia y pueden
esperar una reserva o Retry-After; no se promete que todas terminen en el mismo
segundo ni que cada carta tenga precio. Un grupo ya reclamado puede terminar
después del cierre para conservar su publicación atómica. Nuevos claims y
objetivos pendientes esperan la siguiente ventana; no se reanudan aislados al
cruzar medianoche. Si la PC suspende durante toda la ventana, ese ciclo se pierde.

No se cambiaron los valores históricos para aparentar una sincronización completa.
La ejecución productiva del 26/10 a las 18:00 todavía debe observarse; preparar
el código y abrir un lote no acredita nuevas observaciones.

## Por qué se importó el feed del 24 el día 25

La consulta local mostró 168 grupos con feed `2026-10-24T20:05:44Z`, importados
el 25/10 entre 06:03 y 11:36 Argentina, antes de la siguiente publicación.
Otros tres grupos recibieron el feed del 25 durante la mañana del 26.

TCGCSV anuncia publicación diaria alrededor de **20:00 UTC / 17:00 Argentina**.
Su FAQ describe una copia de la API de TCGplayer que puede tener unas 24 horas
de antigüedad; no ofrece un contrato fijo T-1 ni la hora de cada venta.
`feedPublishedAt` y `fetchedAt` conservan esas dos fechas distintas.
Fuentes: [publicación](https://tcgcsv.com/),
[reglas de sincronización](https://tcgcsv.com/docs) y
[procedencia](https://tcgcsv.com/faq).

## Verificación y evidencia

- [Focal inicial](tcgcsv-common-batch-2026-10-26-evidence/focal.log): 33 pruebas
  verdes; [cohorte inicial](tcgcsv-common-batch-2026-10-26-evidence/cohort.log):
  cuatro pruebas verdes. Resultados anteriores al marcador durable final.
- [Check inicial](tcgcsv-common-batch-2026-10-26-evidence/check.log): exit 0,
  lint/tipos, suites y ambos builds; también anterior al marcador durable final.
- [Flujo HTTP](tcgcsv-common-batch-2026-10-26-evidence/flow.mjs): AppModule real,
  PostgreSQL de tests y feed HTTP local; cero red externa. Verificar nuevamente
  después de la migración del marcador durable, sin inventario real como fixture.
- [Focales con apertura durable](tcgcsv-common-batch-2026-10-26-evidence/focal-durable-final.log):
  20 pruebas verdes antes de agregar el caso adicional de feed anterior.
- [Gate final](tcgcsv-common-batch-2026-10-26-evidence/check-final.log): exit 0,
  lint/tipos y ambos builds; **546 backend + 6 API + 625 frontend + 105 scripts =
  1.282 pruebas**, todas aprobadas. Incluye el caso adicional: feed de ayer no
  descarga contenido ni consume una reserva de archivo.
- [Flujo HTTP final](tcgcsv-common-batch-2026-10-26-evidence/flow-final.log) y
  [resultado](tcgcsv-common-batch-2026-10-26-evidence/flow.json): cero peticiones
  matinales, dos grupos del lote, ocho peticiones al feed local, lectura pública
  HTTP 200 de USD 1,25 y USD 2,25. Repetir lecturas no descarga otra vez.
- [Migración en desarrollo](tcgcsv-common-batch-2026-10-26-evidence/migrate-development.log):
  sólo se agregó `tcgcsv_daily_batches`, mediante `migrate deploy`; veinte
  migraciones aplicadas. Respaldo privado previo de 19 MB, modo 600, catálogo
  verificable con `pg_restore --list`: `/tmp/tcgcsv-common-batch-before-20261026.WD9cKD`,
  SHA256 `f7c6fc01f4916198f26f673ecf9db434160a4dabd2b8186d5358ceb018c783b1`.
- [Estado vivo al corte](tcgcsv-common-batch-2026-10-26-evidence/live-status.json):
  26/10 11:50 Argentina, API y web HTTP 200, panel inferior izquierdo `w2:p7`,
  runtime normal con planificador/worker habilitados y heartbeat reciente.
  Señal durable pendiente para las 21:00 UTC; no se abrió una tanda matinal.
  Los tres grupos importados hoy siguen siendo exactamente `bw11`, `bwp`, `pop8`.
  175 sets habilitados; 20.670 cartas, 176 sets, cinco GIN y 170.726 observaciones
  TCGCSV conservadas. Conteos de cuentas, colecciones, ítems y copias iguales al
  respaldo previo, sin alterar inventarios para el ensayo.

El primer intento de repetir focales fue bloqueado por el guard de backend vivo:
otra ejecución levantó el servidor con `.env.qa` durante la validación. El usuario
autorizó pausarlo y dejar la app normal al terminar. Se detuvo el watcher observado,
se ejecutó `pnpm run stop` y recién entonces continuaron las suites. No hubo commit,
despliegue ni reactivación de la automatización Codex.

Política actualizada en [precios](../../backend/docs/pricing.md),
[jobs](../../backend/docs/jobs.md) y [AGENTS](../../AGENTS.md).
