# REV-03 — Reducir texto de valuación en las colecciones

Estado: implementación ampliada a web/PWA, validada en frontend y Safari de
escritorio. Gate integral actual pendiente por timeouts backend.
[Implementación](../RESULTADO-01.md) · [QA](../RESULTADO-04.md). Rol: frontend.
Seguimiento 26/10: el usuario reportó el mismo exceso en otras vistas. Se amplió
la corrección a los componentes compartidos; frontend validado, gate integral
actual pendiente por timeouts backend. [Resultado actualizado](../RESULTADO-05-textos-y-periodos.md).
Origen: [E03](../README.md#e03--demasiado-texto-en-la-colección).

## Qué revisar

- `frontend/components/collections/collection-card.tsx`: incluye `ValuationEvidence`.
- `frontend/components/prices/price-evidence.tsx` y `valuation-metadata.tsx`:
  componen fechas, cobertura, antigüedad y aclaraciones extensas.
- Usos compartidos en `CollectionSummary`, `PortfolioOverview` y colección pública
  antes de alterar una primitiva. La captura corresponde a `CollectionCard`.

## Qué arreglar y cómo

Propuesta de contenido para esta tarea: en la tarjeta dejar nombre, principal,
cantidad/duplicados, valor y acciones; en vacío, un solo mensaje breve y Sumar
cartas. Quitar de la vista principal timestamps UTC con milisegundos, frases
repetidas y detalles técnicos de fuente/API.

Si hay cartas sin precio o cobertura parcial, conservar un aviso breve y veraz
(por ejemplo «Subtotal de cartas con precio»); no reemplazar desconocido por cero.
Ofrecer el detalle de valuación bajo una acción secundaria solo si hace falta,
sin desplegarlo por defecto. No cambiar cálculos ni quitar metadata de la API.

Propietario inicial: `collection-card.tsx`; preferir controlar la presentación ahí.
Si se crea variante compacta compartida, revisar expresamente todos sus usos.
  El alcance inicial excluía el texto técnico de cada ítem. El reporte posterior
  del usuario habilitó expresamente incluirlo junto con los resúmenes compartidos.

## Aceptación y validación

- Colección vacía muestra 0 cartas y $0 sin párrafos técnicos.
- Colecciones con cobertura completa, parcial o nula conservan valores y estados
  correctos con copy breve; cero real sigue siendo precio conocido.
- Acciones y distinción principal siguen disponibles en ambos temas y mobile.
- Ajustar pruebas focales de presentación para esos estados si hay cobertura
  existente; no testear strings internos sin comportamiento. Gate del [lote](../TAREAS.md#reglas-para-delegar).
