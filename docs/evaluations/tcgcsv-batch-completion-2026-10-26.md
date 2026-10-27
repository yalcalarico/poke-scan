# Cierre completo de la tanda TCGCSV — 26/10/2026

Pedido del usuario del 26/10 por la noche: todos los grupos deben terminar con
éxito o fallo explícito; corregir los fallos y volver a incluir todo el alcance
en la tanda siguiente. Esta decisión reemplaza el corte de admisión a medianoche
UTC de la entrega anterior. Las 18 ARG abren la tanda; una tanda abierta continúa
después de medianoche, con fecha y publicación estables.

## Diagnóstico comprobado

- Lote del 26: 175 sets / 173 grupos, tres exceptuados por el usuario al abrir;
  132 grupos publicados / 19.946 observaciones. Restaron 38 grupos: 34 sin
  descargar contenido en esta tanda y cuatro con descarga interrumpida/reservada.
- Seis peticiones fallaron sin respuesta HTTP: productos (1), precios (2),
  manifest (3). Duraron entre 60 y 868 segundos pese al timeout de 15 s.
- `pmset -g log` confirma suspensiones repetidas y DarkWake durante 18–21 ARG;
  el último despertar con tapa/actividad humana fue 21:47. Esto explica cortes
  y vencimientos de lease; no se atribuye un fallo de HTTP a falta de precios.
- El corte UTC que agregamos impidió continuar los 34 grupos restantes. El estado
  singleton de cola también podía decir failed mientras set/cartas seguían
  waiting_feed/pending. Ambos problemas de coordinación requieren corrección.

## Implementación entregada

- Migración aditiva `20261027010000_tcgcsv_batch_outcomes`: estado/publicación
  objetivo de cada tanda y resultados por grupo (`tcgcsv_batch_groups`). El
  backfill usa ingestas genuinas para reconocer los 132 éxitos y la excepción de
  tres grupos del 26. Las cuatro descargas consumidas quedan fallidas conservando
  su reserva, no se vuelven a pedir dentro de 24 h.
- `tcgcsv-batch.coordinator.ts` coordina lote activo, reintentos acotados antes de
  contenido, resultados terminales y siguiente tanda. El worker conserva la fecha
  del lote al cruzar medianoche, no reclama grupos interactivos sueltos y publica
  el resultado del grupo en la misma transacción de sus observaciones.
- La siguiente tanda captura de nuevo todo el alcance habilitado a las 18; no
  sobrescribe una fila de cola mientras la tanda anterior siga utilizándola.
- Si la publicación objetivo fue reemplazada, lo restante falla explícitamente;
  no se mezclan dos feeds ni se inventan precios o días históricos.
- Un lease global durable serializa el consumidor entre procesos. Los reintentos
  sin descarga tienen un máximo; una descarga consumida que falla termina como
  fallo del grupo, conserva sus precios anteriores y su reserva de 24 h.
- Las reservas toman el mayor reloj comprobable y el final real de la petición.
  Esto impide que una suspensión o un desfase transitorio de PostgreSQL adelante
  una segunda descarga. Los resultados de grupo, set y cartas quedan coherentes.
- `prices status` distingue resultados de la tanda de demanda global en cola;
  conserva la fecha original al cruzar medianoche e informa fallos y pendientes.

## Validación

- `pnpm run check`: **1.301 pruebas aprobadas**, lint, tipos y ambos builds verdes.
  Runtime detenido antes de tests. Incluye 555 pruebas backend, 6 API, 634 frontend
  y 106 de scripts operativos. [Recibo](tcgcsv-batch-completion-2026-10-26-evidence/check.json)
  y [log completo](tcgcsv-batch-completion-2026-10-26-evidence/check-release.log).
- La integración prueba continuación tras medianoche/reinicio, dos consumidores,
  reloj desfasado, errores de productos/precios/publicación, límite de reintentos,
  cambio de feed y alcance completo al abrir la tanda siguiente.
- [Flujo HTTP aislado](tcgcsv-batch-completion-2026-10-26-evidence/flow.json):
  AppModule real, PostgreSQL de tests y proveedor HTTP local. Dos grupos completos,
  uno fallido con HTTP 503, cero pendientes; 12 peticiones locales, ninguna externa.
  Confirma precios conservados, fecha de tanda estable y lecturas sin descargas.
- Respaldo privado de desarrollo validado antes de migrar (20 MB, modo 600), SHA256
  `036f93e6304d5b631e440868db4c1d4f982beb9ff2196566f73f8661cdac3775`.
  Las 24 migraciones están aplicadas en desarrollo y tests. El guard adicional
  restringe el backfill histórico a la única tanda comprobada, la del 26/10.
- [Verificación de migración](tcgcsv-batch-completion-2026-10-26-evidence/migrated.json):
  inventario preservado, 190.672 observaciones TCGCSV previas intactas y cinco
  índices GIN conservados. Cero reservas anteriores al mínimo de 24 h comprobado.

## Resultado real y operación siguiente

La tanda del **26/10 cerró a las 22:42:26 Argentina** (27/10 01:42:26 UTC):
**166 grupos completos, 4 fallidos, 3 exceptuados, 0 pendientes y 0 en proceso**.
Su estado global es `failed` porque contiene fallos; no significa que los 166
grupos publicados hayan fallado. Los 34 que antes quedaban pendientes terminaron
correctamente tras reanudar. La publicación sigue siendo `2026-10-26T20:05:56Z`:
27.089 observaciones para 15.927 cartas en ese feed.

Los cuatro fallos heredados son Aquapolis (`ecard2`, grupo 1397), EX Dragon
Frontiers (`ex15`, 1411), EX Hidden Legends (`ex5`, 1416) y Diamond & Pearl (`dp1`,
1430). No se volvieron a descargar sus archivos consumidos ni se borraron precios.
Los tres exceptuados siguen siendo `bwp`, `bw11` y `pop8`, autorizados sólo para
esta transición. [Estado terminal comprobado](tcgcsv-batch-completion-2026-10-26-evidence/live-status.json).

Los **175 sets habilitados** siguen en alcance para el **27/10 a las 18:00 ARG**,
incluidos los cuatro fallidos y los tres exceptuados. Se abre una sola tanda;
las descargas son seriales y cada archivo espera su reserva de 24 h cuando haga
falta. La recuperación nocturna desplaza algunas disponibilidades hasta alrededor
de las 22:45 ARG del 27/10: la tanda puede seguir abierta hasta entonces, sin corte
a medianoche UTC. Un grupo bloqueado por reserva queda visible hasta ser elegible.
La siguiente apertura diaria cierra como fallido cualquier remanente vencido.

Web y API quedaron activas mediante `pnpm run dev` en Herdr `w2:p7`, ambas con
HTTP 200. La Mac debe permanecer despierta, con tapa abierta, mientras ejecuta el
lote local; no se promete ejecución durante suspensión. No se modificaron ajustes
globales de energía. Se preservaron los cambios previos del frontend y se incluyen
en el commit general solicitado por el usuario, sin nuevas capturas de pantalla.
