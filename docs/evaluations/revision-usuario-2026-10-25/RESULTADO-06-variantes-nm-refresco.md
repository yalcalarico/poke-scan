# Variantes, NM único y refresco después de editar

26/10/2026. Pedido nuevo del usuario. El encargo GPT-6 Luna 1/4 se interrumpió
por límite de uso antes de implementar. Root continuó por pedido «sigue»; no se
crearon más agentes ni se reinició el contador.

## Estado y restricción operativa

El usuario pidió expresamente **no reiniciar el servidor porque había jobs**.
No se ejecutó `pnpm run stop`, no se modificó el código del backend vigilado
por Nest y no se aplicó la conversión en la base de desarrollo.

| Parte | Resultado |
| --- | --- |
| Precio de la variante elegida | Implementado en frontend |
| Quitar selección/labels de condición | Implementado en alta, edición, selección de lote, ubicación, vistas compartidas y CSV |
| Refresco al guardar | La lista aplica la respuesta confirmada inmediatamente y revalida lista/resumen; lecturas privadas usan `no-store` |
| NM obligatorio en servidor | Preparado y probado en copia aislada; **sin aplicar al backend en uso** |
| Convertir registros anteriores | Autorizado por el usuario, migración ensayada; **sin aplicar a desarrollo** |

El parche pendiente está en [backend-nm-pendiente.patch](backend-nm-pendiente.patch).
`git apply --check` aprobó sobre el árbol actual. No aplicar con el watcher activo:
modificar esos archivos puede reiniciar Nest automáticamente.

## Causas y cambios

- El editor usaba exclusivamente `item.price` y ocultaba el precio al elegir una
  variante distinta de la guardada. `useCardVariants` ahora conserva las
  cotizaciones consultadas y el editor selecciona la referencia exacta de la
  variante elegida. No usa el precio de normal para reverseHolofoil, ni `mid`
  como sustituto. Cero sigue siendo un precio válido.
- Alta y edición mandan NM sin selector. Se retiraron también el selector de
  condición de la selección avanzada del escáner, los labels de ubicación y
  compartidos, los textos repetidos y la columna de condición del CSV.
- El callback anterior sólo recargaba por red. Ahora `useInfiniteList.updateItems`
  aplica el resultado confirmado, invalida/cancela una página anterior y conserva
  el cambio mientras revalida. Se retira la fila si deja de cumplir el filtro.
  El encabezado y la gráfica se revalidan por los callbacks existentes. No se
  usa `window.location.reload`. Al reabrir el editor se toman los atributos actuales.
- El backend preparado fija NM al persistir altas/ediciones. Conserva el campo
  legacy en los DTO y el hash original de idempotencia para recuperar operaciones
  ya enviadas con HP/LP. No se modifican sus claves ni se vuelven a sumar copias.

## Conversión histórica preparada

La migración agrupa por colección/carta/variante, conserva preferentemente el ID
NM, suma cantidades, combina notas sin truncarlas, conserva intercambio si
alguna fila lo tenía y mantiene la fecha más antigua. Antes de borrar filas
unificadas, remapea los resultados idempotentes al ID conservado sin tocar hashes.
Todo corre en una transacción. Si una unión excede cantidad o 500 caracteres de
notas, revierte todo y pide resolver el conflicto; no se descartan atributos.
No toca el historial de precios ni los índices `pg_trgm`.

La lectura inicial encontró un registro HP y 65 NM en desarrollo; fue sólo una
consulta agregada. Esos registros no se usaron como fixtures ni se normalizaron.

## Verificación aislada

Se copió el código a `/private/tmp/pokescan-nm-pvtZAM`, sin modificar el backend
principal. Se creó `pokemon_cards_nm_test` desde la base de tests y se usó Redis
índice 14, inicialmente vacío, con puertos QA 13300/13301. El guard de los specs
verificó puerto 13301 libre y base `_test`; no se deshabilitó. Las dos claves JWT
fueron exclusivas de QA. No se copió el `.env` real.

- Pruebas focales de precio/refresco/CSV: **17/17**.
- Colecciones e idempotencia backend: **68/68**.
- Migración real de fixture: NM 2 + HP 3 → una fila NM con 5; notas, intercambio,
  fecha, referencia idempotente y precios conservados. Caso de notas demasiado
  largas: rollback completo confirmado.
- `pnpm run check` en la copia aislada: **salida 0**, ambos builds, 17 páginas.
  Backend 546, E2E 6, frontend 634 y scripts Node 105: **1.291 pruebas aprobadas**.
- Las dos preparaciones previas detectaron falta de `JWT_SECRET` y después de
  `JWT_REFRESH_SECRET` en QA. Se corrigió configuración y se comprobaron auth y
  E2E focales antes del gate verde. No se alteraron timeouts ni se omitieron tests.
- El nuevo runner HTTP pasó lint por separado después de incorporarse; no cambió
  lógica de producto después del gate aislado.

Se levantó **sólo una API QA** en Herdr `w2:pE`, puerto 13301, cola/ingesta/crons
desactivados. El [runner HTTP](../../../frontend/scripts/qa/collection-variant-nm-smoke.mjs)
creó cuenta/colección y cotizaciones centinela exclusivamente en la base aislada:
normal 9876.54 y reverseHolofoil 1234.56 (no representan precios reales).
Verificó precio exacto al cambiar y volver, cantidad 3, notas/intercambio, lista y
stats actualizados y replay del payload HP sin incrementar otra vez. La API QA
persistió NM aun recibiendo HP/DM de un cliente anterior.

## Limpieza y estado de servicios

La cuenta, colección y cotizaciones QA se limpiaron. Se cerró únicamente la API
QA, se eliminó `pokemon_cards_nm_test` y se borró su `.env.qa`. Se verificó y limpió
sólo el índice Redis 14 (sin `FLUSHDB`); Redis de la instancia no se vació.
La copia temporal y el panel exclusivo de QA se retiraron; el backend preparado
y su prueba de migración quedan conservados en el parche del repositorio.

La API principal se verificó inicialmente con PID 14525. Al comprobar nuevamente,
el panel `w2:p7` mostraba «dev Apagando… / dev Listo» y 3000/3001 estaban libres.
No se determinó la causa de ese apagado; no se envió `stop` ni señales a ese panel
en este pedido y no se volvió a arrancar. Al cerrar también 13301 estaba libre.
El estado del panel no acredita finalización de jobs ni habilita reinicio automático.

## Aplicación pendiente

Cuando el usuario habilite una ventana para modificar/reiniciar el backend:

1. Coordinar cierre de jobs y detener el watcher antes de aplicar el parche.
2. Revisar `git apply --check` y el estado de migraciones para preservar cambios
   simultáneos. Aplicar `backend-nm-pendiente.patch`.
3. Ejecutar `prisma migrate deploy` con el entorno correcto, sin `migrate dev`
   ni reset. Verificar que no queden condiciones distintas de NM y que la suma
   de cantidades se conserve.
4. Arrancar mediante Herdr únicamente con autorización de reinicio y verificar
   salud y edición. No alterar pausas ni cronjobs para probar estos cambios.

Hasta entonces no se declara aplicada la política de servidor ni convertida la
fila HP anterior. El verde corresponde al candidato aislado probado, no a una
migración ejecutada en desarrollo.
