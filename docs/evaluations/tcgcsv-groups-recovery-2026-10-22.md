# TCGCSV: recuperación de grupos — 22/10/2026

Pedido: investigar y corregir grupos fallidos y en espera, con el objetivo de que
todos los grupos habilitados puedan procesarse correctamente.

## Resultado y límite actual

Se corrigieron las causas reproducibles de identidad, cobertura parcial y
reanudación. **Los 25 grupos afectados tienen coincidencias válidas al ejecutar
el matcher final sobre sus productos ya almacenados**, con checksum verificado.
Ninguno queda con cero coincidencias. Esto valida identidad; no acredita una
cotización nueva ni una publicación real después del parche.

Tras reiniciar la aplicación, el scheduler reencoló los ocho grupos fallidos sin
adelantar ninguna reserva. Corte: **2026-10-22T23:44:05.080Z**.

| Estado operativo | Grupos |
|---|---:|
| Lotes previamente completados | 146 |
| Pendientes esperando reserva/backoff | 25 |
| Fallidos en la cola tras reencolar | 0 |
| Pendientes sin identidad de productos en replay | 0 |

**No están todos republicados todavía.** Los archivos de estos grupos ya se
habían descargado durante las 24 h anteriores. La primera disponibilidad es
23/10 02:24:45 UTC (**22/10 23:24 en Argentina**); la última, 23/10 22:13:35 UTC
(**23/10 19:13 en Argentina**). Son ventanas de elegibilidad, no promesas de
publicación: las pausas del proveedor, un build sin cambios o un nuevo error
pueden demorar el resultado. No se cambió una fecha para volver a descargar.

## Causas corregidas

1. **Prefijos del denominador.** El catálogo da `SV1` y total `94`, mientras el
   producto usa `SV1/SV94`. Lo mismo ocurre con TG/GG. Se admite el denominador
   con el mismo prefijo del numerador y el total exacto, manteniendo rechazo de
   otro prefijo, total, idioma, edición o identidad duplicada.
2. **Celebrations Classic.** Las 25 reimpresiones conservan numeraciones originales
   como `4/102`, aunque el subset tenga 25 cartas. Se revisaron IDs de carta y
   producto, nombres locales/remotos y número completo contra el grupo 2931
   guardado. Los alias son específicos; no se ignoran los denominadores. Replay:
   **25/25**.
3. **Nintendo Promos.** Nombres con distribución, por ejemplo el tin de Articuno
   ex, no equivalían al nombre corto. Se agregaron **27 identidades exactas**,
   conservando sin asociar las versiones ambiguas, estampas/roles o entradas no
   revisadas. No se eliminan paréntesis o sufijos de todos los productos.
4. **Supreme Victors.** El grupo 1384 publica números sin denominador. Se admite
   ese formato sólo para `pl3`, ese grupo y el total revisado 147. Replay:
   **144/153**; las nueve cartas restantes no se asignan por aproximación.
5. **Cobertura de precios dispersa.** Un archivo de precios completo y válido
   puede no incluir un producto asociado. Esa ausencia ya tiene representación
   `no_quote`; no debe rechazar todas las observaciones válidas del grupo.
   Se mantiene validación de estructura, tamaño, productos, moneda, variantes,
   build estable y transacción atómica. Un lote sin ninguna cotización compatible
   sigue fallando; un subtipo desconocido nunca se convierte en normal.
   La ausencia no crea precios cero/null artificiales ni renueva la fecha de un
   precio anterior. El formato de productos y precios se describe por separado
   en la [documentación oficial](https://tcgcsv.com/docs).
6. **Cruce de medianoche.** Antes, un job diario del día anterior dejaba de ser
   elegible antes del cron de las 21 UTC. El resumidor ahora crea objetivos del
   día actual para grupos diarios que ya estaban pendientes/fallidos. No adelanta
   el ciclo de sets nuevos, no reconstruye precios de ayer ni borra reservas,
   prioridades o deshabilitaciones.
7. **Diagnóstico insuficiente.** Los fallos nuevos conservan una fase fija y
   sanitizada (`products`, `prices`, `product_identity`, `compatible_quotes`,
   `publication`, etc.). No se guarda el mensaje arbitrario del proveedor/DB.
   `prices:diagnose` muestra fase previa, reserva, coincidencias y verificación
   pendiente mediante consultas locales consistentes y por lote. Normaliza
   `externalId: null` igual que el worker para evitar falsos negativos.

## Verificación

- `pnpm run stop` antes de suites; [gate completo](tcgcsv-groups-recovery-2026-10-22-evidence/check.json):
  **1.355 pruebas, lint, tipos y ambos builds**, exit 0.
- Regresiones de identidad positivas/negativas, publicación parcial con precio
  anterior intacto y reanudación antes de las 21 UTC tras medianoche.
- [Flujo HTTP aislado](tcgcsv-groups-recovery-2026-10-22-evidence/flow.json):
  AppModule real, PostgreSQL de tests y feed HTTP local. Publicó un número TG,
  devolvió USD 1,25 por HTTP 200, marcó el set parcial y la carta omitida como
  `no_quote`, conservando precio/fecha anteriores. El segundo intento no hizo
  requests ni cambió el presupuesto. Fixtures propios eliminados; crons del
  harness detenidos para no drenar otras colas.
- [Antes de reiniciar](tcgcsv-groups-recovery-2026-10-22-evidence/before-restart.json)
  y [después](tcgcsv-groups-recovery-2026-10-22-evidence/after-restart.json):
  las 25 fechas de descarga son idénticas; ninguna disponibilidad se adelantó.
  API y web respondieron 200, heartbeat reciente y scheduler/worker configurados
  habilitados. No hubo descargas de contenido para saltar esas esperas.

## Operación y siguiente comprobación

```bash
pnpm run prices:diagnose
pnpm run prices:status
```

Requieren API encendida para ejecutar jobs; el diagnóstico sólo necesita build
backend actualizado y PostgreSQL. `prices:diagnose` no descarga, encola ni modifica
datos. La aplicación fue dejada viva, separada de la sesión del comando; PID
inicial del supervisor `pnpm dev`: 7053, log en
`/tmp/tcgcsv-groups-recovery-20261022-dev.log`. Es un recibo: verificar procesos
actuales antes de detener o atribuir actividad; no usar ese PID como prueba futura.

Próxima aceptación productiva: comprobar cada grupo después de su ventana y
confirmar publicación/ausencia legítima con el build y recepción reales. Los
precios de los intentos fallidos anteriores no estaban retenidos como archivos;
la caché actual es sólo de productos, por lo que no se pueden republicar esos
precios localmente sin recibir nuevamente el archivo cuando corresponda.

Un grupo completado puede tener cobertura parcial. No equivale a precio para
todas sus cartas ni variantes. Los tres sets sin asociación, el backfill
histórico y la medición de ahorro entre ciclos permanecen en su plan propio.
No hubo commit, despliegue, cambio de proveedor, modificación del inventario ni
reactivación de la automatización Codex PAUSED. No se delegaron encargos nuevos;
se conservaron los límites acumulados de la tarea anterior.
