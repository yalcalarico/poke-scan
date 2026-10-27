# REV-06 — Automatizar variante, condición y acumulación de copias

Estado: implementada con decisiones confirmadas el 26/10/2026; pruebas focales,
flujo real aislado y gate integral aprobados.
[Implementación](../RESULTADO-02.md) · [QA](../RESULTADO-04.md).
Rol: frontend / backend. Origen: [E06](../README.md#e06--no-pedir-variante-condición-ni-copias).

## Qué revisar

- `frontend/lib/scanner/camera-visual.ts`: muestra una cotización de la lista
  (`prices[0]`), no una variante reconocida físicamente por DINOv2.
- `frontend/components/scanner/organize-sheet.tsx`: pide variante, condición,
  cantidad y confirmación de identidad; conservar corrección de carta propuesta.
- `frontend/components/scanner/session-draft.ts`: modelo de entradas, agrupación,
  allocations, operaciones, restauración y claves idempotentes.
- `backend/src/modules/collections/collections.service.ts`: upsert por colección,
  carta, variante y condición que acumula cantidad.
- Localizar `AddItemDto`: defaults normal/NM y máximo 999 por request; revisar
  validación equivalente del draft. Backend no limita el total del ítem a 999.
- Guía `backend/docs/pricing.md`: referencia exacta por variante; condición no
  ajusta precio. Identificación visual devuelve identidad/rank, no acabado.

## Qué arreglar y cómo

1. Quitar los tres campos del flujo de revisión. Asignar NM a nuevas lecturas;
   no reescribir condiciones históricas de inventario ajeno a esta sesión.
2. Seleccionar una referencia de precio de forma determinista y transportar su
   variante junto con cardId/cotización hasta el draft y guardado. Usar la misma
   pareja al mostrar y persistir; no volver a seleccionar otra variante al abrir
   revisión ni presentar el acabado como detectado por cámara.
3. Con varias cotizaciones, conservar la referencia que actualmente muestra el
   escáner (`prices[0]` al resolver esa lectura) y su variante; no elegir mayor
   precio ni normal por preferencia nueva. Reutilizar el resolver existente si
   existe. Esto es política de valuación automática, no detección de foil.
4. Sin precio: mostrar «Sin precio», conservar identidad y NM, y usar solo una
   variante válida acreditada por catálogo local. No inventar precio ni asumir
   `normal` si no está respaldada. Si no hay variante válida disponible, conservar
   la lectura pendiente con explicación breve y resolver el dato desde catálogo
   local; no reintroducir un selector obligatorio. Guardar las demás lecturas y
   conservar las pendientes para recuperación posterior, sin borrarlas al retirar
   las partes exitosas. No consultar proveedores externos para resolverlo.
5. Una captura intencional = una copia. Agrupar y sumar por destino/carta/variante/NM;
   no confundir re-render/retry con otra captura. Mantener comparación y corrección
   de identidad como acción opcional. La propuesta se acepta automáticamente:
   no exigir confirmar cada carta antes de guardar. Si se corrige, recalcular
   referencia, variante y agrupación para la identidad elegida.
6. Para más de 999 copias, enviar incrementos <=999 con operaciones idempotentes
   estables y confirmación/retiro por parte. No repetir partes exitosas al reintentar
   ni limitar el total del grupo. Mantener las garantías del draft canónico.

Propietario: camera-visual, organize-sheet, session-draft y sus tests. Backend y
`frontend/types/api.ts` solo si hace falta ajustar contrato, siempre en espejo.
Coordinar persistencia con REV-05 y eventos de captura con REV-04.

## Aceptación y validación

- Guardar no exige variante, condición, cantidad ni confirmar cada identidad;
  conserva destino válido y opción de corregir propuestas. Precio mostrado
  corresponde a variante guardada. Pendientes no bloquean lecturas guardables.
- Dos escaneos intencionales iguales suman dos; retry del mismo guardado suma cero
  adicional. Corrección de identidad actualiza referencia y agrupación coherentemente.
- Casos: varias variantes, sin precio, cero, referencia demorada, borrador viejo,
  restauración, cambio de destino, >999 copias y fallo parcial/reintento.
- Pruebas de organize-sheet, session-draft y session-draft-safety; servicios e HTTP
  de idempotencia de colecciones según el alcance real. Flujo real aislado y
  gate del [lote](../TAREAS.md#reglas-para-delegar).
