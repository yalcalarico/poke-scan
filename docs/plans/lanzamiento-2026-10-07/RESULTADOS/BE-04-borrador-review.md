# BE-04 — Revisión/corrección del borrador

Fecha: 8/10/2026. Revisor: Sol HIGH. Ejecutora del borrador inicial: Luna.

**Resultado: ACEPTADO como entrada documental para UX-03.** BE-04 implementación, FE-03 consumidor y gate integrado del lote valores continúan pendientes. No hay bloqueo técnico ni dato humano necesario para comenzar la especificación.

## Correcciones documentales realizadas

- Campos y ubicaciones cerrados por DTO/endpoint. Metadata de precio top-level; valuation aditivo para agregados; reference en top cards; campos legacy y formas priceArs por endpoint preservados.
- Separación de consulta y upstream: fresh local no acredita feed reciente; upstream null implica unknown explícito, y fecha verificable antigua permanece stale aunque se consulte hoy.
- Regla total de freshness: unknown+fresh, unknown+stale y los tres estados son mixed. Contadores por copias cotizadas, cero válido, null distinto de cero, fechas futuras/inválidas desconocidas y reloj de evaluación común.
- Cobertura histórica derivada exactamente de totalCards/unpricedCards ya persistidos. Sin nueva columna/snapshot redundante ni reconstrucción desde inventario actual; recency/evaluatedAt histórico null porque esa evidencia temporal no está guardada.
- Persistencia mínima resuelta: sin migración para upstream siempre null. Una captura futura verificable no bloquea UX-03; nunca backfill de fetchedAt/rawJson de otro proveedor.
- Diferencias actuales registradas: colección privada totalValueUsd:number/COALESCE0 frente a público/portfolio nullable; priceArs frontend numérico frente a ficha backend objeto; historia sin variant puede alternar mejor variante diaria; contadores privados de cartas vs públicos de grupos.
- Fallback preciso: ficha solo si ninguna fila activa para carta, un proveedor fallback; agregados/items solo activo. La caché negativa puede contener fallback según implementación real; comentarios/docs anteriores no sustituyen lectura de código.
- Compatibilidad de allowlist/cache/vigencia: adiciones proyectadas explícitamente, campos legacy tolerados como desconocidos, evaluatedAt conservado en cache hit, vigencia antes de caché/no-store/noindex/lista500/totales completos preservados.
- Copy base y matriz de fixtures fijados para UX-03; no precio argentino realizable, ajuste por condición, ROI ni FX histórico ficticio.

## Evidencia documental

Leídos AGENTS.md, REGISTRO-TAREAS.md, DEC-03 y demás contratos, 02-backend.md, 11-orquestacion.md, ORQUESTACION-ESTADO.md y borrador completo. Contrastados adapter/interfaz/fixtures TCGdex, módulo providers, sync-prices, SQL latest-price, servicios cards/collections/share/portfolio, schema Prisma, tipos/parsers y consumidores frontend relevantes. Las referencias concretas están en el borrador revisado.

Verificación documental: existencia y rangos de las referencias locales; lectura de filtros/selección reales; fórmulas y ejemplos cero/null/parcial/mixtos contrastados; ausencia de whitespace final/conflict markers. Esto **no es prueba ejecutada de implementación**. No se ejecutaron pnpm check, servicios, suites, DB/Redis ni solicitudes de red; el gate global corresponde al final del lote BE-04+FE-03.

La evidencia local no confirma un timestamp upstream utilizable en TCGdex: el mínimo correcto es null/unknown. Tampoco acredita comprensión con participantes, lector de pantalla, dispositivos o mercado local.

## Reserva y siguiente paso

**Liberadas ambas reservas documentales:** BE-04-contrato-borrador.md y BE-04-borrador-review.md. Ningún writer, servicio o suite propios quedan activos. Cambios locales anteriores preservados; no se modificaron código/schema/tests/planes/registro.

Habilitar UX-03 fase especificación con Luna; después BE-04 implementación y FE-03 consumidor, revisión Sol HIGH y gate integrado del lote. Coordinación es único escritor de estados/planes.
