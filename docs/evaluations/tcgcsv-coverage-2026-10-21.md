# TCGCSV: cobertura y optimización — 21/10/2026

> Continuación del 22/10: las causas de fallo y la reanudación se corrigieron en
> [recuperación de grupos](tcgcsv-groups-recovery-2026-10-22.md). Este informe
> conserva el corte y los límites de su entrega original.

## Entrega

Implementación local de las etapas 1–4 y evaluación/diseño de la etapa 5 del
[plan](../plans/tcgcsv-cobertura-optimizacion-2026-10-21.md). La validación operativa
de un ciclo completo y el ahorro entre ciclos reales permanecen separados de la
entrega de código. No se declara completo un set por haberlo asociado o encolado.

| Medida local | Antes | Tras conciliación |
|---|---:|---:|
| Sets / cartas del catálogo | 176 / 20.670 | 176 / 20.670 |
| Sets asociados | 149 | 173 |
| Grupos únicos | 149 | 171 |
| Sets habilitados diarios | 18 | 173 |
| Cartas con referencia de mercado conocida | 14.283 | 14.283 antes de procesar |

Se agregaron 24 sets mediante 22 grupos, incluidos promos, McDonald’s y dos
Trainer Kits compartidos. Las identidades de grupo provienen del catálogo
almacenado; cada producto sigue validando idioma, nombre, número, grupo y
variante. No se asigna por similitud de nombres. La prueba real del worker incrementó la cobertura a **15.336 cartas conocidas**
(+1.053) al corte de **22/10 22:13:49 UTC**; no implica que todas estén frescas.
API y web respondieron 200. No había grupos listos ni en proceso: 147 grupos
completados, 14 esperando y 10 fallidos. Por set: 127 parciales, 22 completos,
22 esperando feed y dos en cooldown. El estado operativo conserva el corte.

## Cambios y garantías

- Tabla aditiva `tcgcsv_set_groups` y vista que conserva compatibilidad con
  `card_set_external_ids`; no se aflojó la unicidad de otros proveedores.
- Cola deduplicada por grupo; matching conjunto rechaza productos ambiguos entre
  sets. Publicación única y atómica con resultados, cooldown y errores por set.
- Caché PostgreSQL de productos con JSON, SHA256, bytes, ETag/Last-Modified y fechas
  de recepción/validación distintas. `304` requiere una copia íntegra. Cuerpos
  corruptos o parciales no reemplazan caché ni precios; precios no se cachean.
- Telemetría por petición: archivo, grupo, bytes de cuerpo, duración, estado,
  reutilización y pausa `429`. No incluye datos privados ni cuerpos del feed.
- Registro automático de identidades validadas con prioridad 200, conservando
  prioridades existentes y deshabilitaciones. Ingesta apagada no amplía el registro.
- `prices:coverage` informa cobertura por set y variante observada, antigüedad,
  conflicto y tráfico. `prices:reconcile -- --apply` concilia el catálogo ya
  almacenado sin red. Segunda aplicación: cero altas nuevas.

Se mantienen ejecución serial, validación de publicación antes/después, reservas
persistentes de 24 h, leases, pausas del proveedor y fuente activa única. No se
alteraron inventarios ni observaciones TCGdex. No hubo commit ni despliegue.

## Evidencia

- [Snapshot previo](tcgcsv-coverage-2026-10-21-evidence/before-coverage.json) y
  [registro previo](tcgcsv-coverage-2026-10-21-evidence/before-mappings.json).
- [Snapshot tras conciliación](tcgcsv-coverage-2026-10-21-evidence/after-coverage.json).
- [Gate estándar](tcgcsv-coverage-2026-10-21-evidence/check.json): **1.348 pruebas**,
  lint, tipos y ambos builds, exit 0. Se ejecutó `stop` antes de las suites.
- [Flujo HTTP aislado](tcgcsv-coverage-2026-10-21-evidence/flow.json): AppModule real,
  PostgreSQL de tests, feed HTTP local, publicación y lectura pública 200 de USD
  1,25; `304` al recrear cliente conserva recepción y recibe cero bytes de cuerpo.
  El worker no repite la descarga dentro de 24 h. Fixtures propios eliminados.
  No prueba disponibilidad ni ahorro real del proveedor.
- [Estado operativo real](tcgcsv-coverage-2026-10-21-evidence/live-status.json):
  API local con ciclo ampliado solicitado mediante la CLI existente; contiene
  estados por set, cobertura, tráfico y pausas con fecha de corte. Las fechas UTC
  cruzaron al 22/10 durante la sesión del 21/10 en Argentina.

El primer gate pasó; la revisión posterior corrigió duplicación de bytes y
clasificación de conflictos en el informe. El ciclo real detectó padding distinto
entre título y Number, promos con denominador y títulos con sólo numerador:
se corrigieron con regresiones que preservan el rechazo de denominadores/ediciones
incorrectos y gates completos. Gate final aceptado el 22/10: 1.348 pruebas.
Un intento fue rechazado antes de suites porque el watcher volvió a levantar API;
se detuvo el padre identificado y se repitió con los puertos libres. Los fallos de verificación se corrigieron con evidencia:
fixtures de discovery actualizados al registro nuevo y contrato HTTP del smoke
(`prices[].provider`). Un diagnóstico adicional `tsc --noEmit` backend detectó
errores en specs ajenos al lote; el build estándar de producción pasó.

## Pendientes que requieren evidencia posterior

1. El trabajo disponible del ciclo real se agotó al corte; quedan 14 grupos en
   espera y 10 fallidos, sin forzar reservas. Observar su recuperación y un ciclo
   posterior con productos sin cambios. La medición anterior a la ingesta no tenía telemetría
   por archivo, por lo que no se inventa una reducción porcentual retrospectiva.
2. Los tres sets sin asociación validada siguen explícitos: `ru1`, `sve`, `fut20`.
   El catálogo contiene candidatos nominales `Rumble` (1433) y `SVE: Scarlet &
   Violet Energies` (24382), pero este lote no acreditó su equivalencia de edición
   y productos. Futsal no tiene un grupo independiente exacto en ese catálogo.
   No se fuerza una asociación ni se presenta ausencia como precio cero.
3. Conservar las dos comprobaciones de manifest por grupo: no se agruparon sin
   evidencia suficiente para conservar garantías ante un cambio durante descarga.
4. Los diagnósticos de los diez grupos fallidos están en
   [fallos](tcgcsv-coverage-2026-10-21-evidence/failures.json). Hay casos de
   numeradores/denominadores prefijados (`SV1/SV94`, `TG01/TG30`, `GG01/GG70`)
   que el matcher actual no equipara al total numérico local, y Celebrations
   Classic conserva denominadores de impresiones originales distintos del total
   del subset. Se conservó el rechazo, sin relajar identidad a ciegas. `pop4`
   exige revisar cobertura del archivo recibido; no se atribuye su fallo a una
   causa sin el recibo de precios. Best of Game reproduce siete identidades con
   la corrección final, pero su publicación espera la reserva existente.
   Esta cobertura pendiente impide dar por cerrado el plan completo.
5. Historial: [evaluación y diseño](tcgcsv-history-evaluation-2026-10-21.md).
   Backfill diferido; no hay fechas ni inventario pasados inventados.

Orquestación: cuatro encargos consumidos (exploración, caché, dos revisiones),
sin subdelegación y una implementación activa. Root integró y verificó las
correcciones. Automatización existente PAUSED y cadencia de dos horas intactas.
