# REV-02 — Mantener visible la navegación en Safari

Estado: revisada sin causa concluyente; sin corrección aplicada. Pendiente de
reproducción Safari físico. [Resultado](../RESULTADO-01.md). Rol: frontend.
Origen: [E02](../README.md#e02--menú-inferior-oculto-por-safari).

## Qué revisar

- `frontend/components/layout/bottom-nav.tsx`: nav fija con `bottom-0` e inset inferior.
- `frontend/components/layout/screen-container.tsx`: espacio reservado para nav.
- `frontend/app/layout.tsx`: `viewportFit: "cover"`.
- `frontend/app/globals.css` y contenedores del shell: alturas, overflow y posibles
  ancestros que alteren posicionamiento fijo.
- Safari iPhone: scroll en ambas direcciones, barra expandida/contraída y rotación;
  registrar viewport de layout y visual, offsets, escala y rectángulo de la nav.

La reserva de safe area ya existe. La evidencia no demuestra que agregar más
padding resuelva la barra dinámica del navegador.

## Qué arreglar y cómo

Reproducir primero. Ajustar el anclaje de la nav al área visible y el espacio del
contenido con una única regla coherente. Priorizar CSS soportado y, si la medición
justifica usar `visualViewport`, limpiar listeners y distinguir zoom/teclado de la
barra del navegador. Evitar offsets fijos para un único iPhone o compensaciones dobles.

Propietario inicial: `bottom-nav.tsx` y `screen-container.tsx`. Cambios en layout,
CSS global o shell requieren coordinar con REV-07 y revisar consumidores.

## Aceptación y validación

- Las cinco pestañas quedan visibles y tocables al subir/bajar con Safari abierto
  y con ambas posiciones de su barra; el último resultado no queda inaccesible.
- Sin saltos persistentes al terminar el gesto ni regresión en zoom, teclado,
  orientación, PWA instalada, Android o desktop.
- Validación manual en Safari real; pruebas geométricas o listeners solo si se
  agrega lógica que las justifique. Gate común del [lote](../TAREAS.md#reglas-para-delegar).
- Si REV-07 modifica el mismo shell, volver a comprobar ambos escenarios después
  de integrar, sin declarar automáticamente uno resuelto por el otro.
