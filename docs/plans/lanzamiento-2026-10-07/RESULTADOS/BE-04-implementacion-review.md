# BE-04 — Revisión de implementación

8/10/2026 · Sol HIGH · Implementación inicial Luna.

**Aceptada para habilitar FE-03.** La revisión enfocada del contrato quedó aprobada después de las correcciones siguientes. El gate integrado BE-04 + FE-03, los IDs y el registro del lote siguen pendientes; pertenecen a coordinación.

## Correcciones comprobadas

- Fechas ISO UTC reales: se rechazan días sin hora, formatos locales y días inexistentes que JavaScript normaliza. Futuros/fechas ausentes o inválidas conservan `unknown`; upstream sigue `null`/`unknown`. Las fechas extremas de la valuación sólo incluyen contribuciones positivas y válidas.
- Un reloj para items y stats públicos; el cache hit conserva evaluación y estados del payload. Redis de precios conserva metadata válida y degrada bloques legacy/parciales/inválidos a desconocidos, usando un reloj común para todas las filas. `isStale` sigue disponible para el comportamiento legacy.
- Portfolio proyecta procedencia y consulta de la misma fila lateral que aporta el importe del ranking. El día UTC del snapshot procede de la evaluación de la respuesta. Cobertura histórica sale del snapshot, sin reconstruir inventario ni inventar recencia.
- Parsers/adaptadores mínimos de colecciones, alta/edición/listado de items, stats, portfolio, ficha e historia validan bloques nuevos presentes. Colecciones sin `valuation` siguen compatibles; referencias presentes del ranking requieren el bloque completo. Historia inválida y precios inválidos nuevos producen error de lectura, sin fingir ausencia de mercado. Se preservan metadata válida, `variant:null` del historial y las formas numérica/objeto de `priceArs` propias de los endpoints.
- El cleanup exacto agregado por Luna omitía dos fixtures secundarios: la repetición produjo dos colisiones de unicidad reales. Se completó la lista de direcciones propias en las dos suites afectadas. No se volvió a un filtro general de usuarios.
- La prueba unitaria de portfolio usa reloj fijo para seguir siendo válida después del día de implementación.

La inspección y las regresiones verifican selección activa exacta de variante/proveedor/mercado/moneda, última fila incluso con `market:null`, ausencia sin rescate desde `mid`, cero válido, cantidades y cobertura de copias. Recencia mixta incluye estados desconocidos; el límite exacto de 24 h es stale y un precio futuro puede contribuir al importe con edad unknown. Colecciones conservan sus números legacy; `valuation.amount` es el importe canónico. Share conserva allowlist, totales de todo el scope aunque muestre 500 grupos, vigencia antes del caché y HTTP `no-store`. No hay cambios de proveedor, cola, TTL, schema, migraciones, UI, escáner o autenticación.

## Evidencia ejecutada

[Evidencia central](BE-04-implementacion-review-evidencia.json) guarda comandos, conteos, hashes y cleanup sin URLs de conexión, secretos, IDs de usuarios ni datos privados.

- `pnpm run stop` antes de las suites; guard de TEST/puerto libre comprobado.
- Helpers/cache/portfolio: **10 pruebas**, 3 archivos, sin DB/Redis/proveedores reales.
- Parsers y adaptadores frontend + contrato público + idempotencia: **18 pruebas**, 3 archivos.
- Cards/collections/share contra PostgreSQL real: **144 pruebas**, 3 archivos seriales. Incluye regresión SQL de BE-04 con 22 copias, 15 cotizadas, 7 sin precio, subtotal USD 56, fresh8/stale3/unknown4; variante nula más reciente, precio cero, identidad exacta, snapshot propio, scope sin depender del filtro visible, upsert del mismo día y caché pública fechada. Las pruebas existentes cubren selección histórica diaria, variantes/fallback y scope público truncado.
- Lint acotado backend/frontend, `nest build`, typecheck frontend y diff check: aprobados.
- Typecheck backend: **8 errores**, iguales a los **8** reproducidos en una copia aislada del baseline con los archivos reservados iniciales restaurados sólo en `/private/tmp`. Se compararon diagnósticos normalizando ruta/línea: mocks de providers, dos tipos de fixtures de cards, dos parámetros de Redis y dos imports `supertest/types`. No hay errores nuevos de `CardPriceView`. No se arreglaron errores ajenos a esta reserva.

El primer intento DB de revisión falló por un import duplicado de la regresión nueva: corregido. El segundo reprodujo las dos colisiones de fixtures secundarios: corregidas. El tercero pasó las 144 pruebas. Una advertencia de variable no usada en la prueba frontend se corrigió antes del lint final. Una consulta read-only de inspección de cleanup usó inicialmente una columna inexistente; se corrigió antes de cualquier mutación.

## Aislamiento y limpieza

Las suites DB de esta revisión corrieron en `be04_review_20261008_sol_test`, copia descartable de `pokemon_cards_test`, con `DATABASE_URL_TEST` resuelta por el guard real, distinta de desarrollo. Redis público fue un doble en memoria y los proveedores estuvieron simulados. La propiedad de la base se verificó con un marcador, los fixtures de suites quedaron en cero y se hizo DROP de esa base exacta: **restantes 0**. No se lanzaron stacks, no se tocó Redis real ni se hicieron requests externos.

Después se verificaron en la fuente TEST los dos fixtures secundarios residuales de la ejecución Luna. Ambos coincidieron con email/username/atributos ficticios/defaults declarados en los specs y la ventana de creación de esa ejecución exitosa. Uno tenía sólo su colección `Suyo`/default vacía (sus cartas de fixture habían sido retiradas por el cleanup anterior); el otro no tenía colecciones. No tenían tokens, shares, snapshots, operaciones, jobs ni amistades. Una transacción SERIALIZABLE con guard de base TEST, identidad, count=2 y relaciones exactas retiró **2 usuarios y 1 colección**. Post-check: **usuarios residuales 0**. No se borraron otras filas ni se consultó/mutó desarrollo. Esta fuente sí recibió esa limpieza exacta posterior; las suites de revisión sólo usaron el clone.

No existe snapshot DB anterior a Luna: **no se acredita preservación del baseline completo de datos**. La verificación de propiedad y los conteos acotan la limpieza realizada, sin reconstruir ni afirmar el estado histórico de toda TEST.

Los **15 hashes iniciales** del baseline reconstruido coinciden con `baseline-hashes.txt` usando SHA-1 de objeto Git. Se preservan `preexisting.patch`, `own-reserved.diff` y el árbol `base`; `review-reserved.diff` adicional y logs antes/después quedan en `/private/tmp/be04-baseline` para el gate. Los cambios ajenos no se resetearon. La evidencia central contiene hashes SHA-256 del código revisado.

## Handoff y límites

**Writer, suites y base TEST descartable liberados.** No quedan recursos/stacks propios; puertos 3000/3001 libres. FE-03 puede consumir el contrato implementado con UX-03 aceptada. No se ejecutó `pnpm run check` global ni flujo completo API/web: corresponde al cierre integrado y sigue pendiente. Esta revisión no acredita comprensión con participantes, timestamps upstream atribuibles ni precio realizable local.
