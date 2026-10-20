# FE-02 — Revisión del preflight

Fecha: 2026-10-07 · Revisión Sol Alto · Estado: aceptable como base; ajustes concretos necesarios antes de implementar.

## Alcance y método

Revisión documental y lectura de código de la UI privada de compartir. Se contrastaron `FE-02-preflight.md`, `UX-02-compartir.md`, FE-02 de `01-frontend.md`, DEC-02, AGENTS raíz/frontend y las guías locales de diseño, construcción, componentes, rutas, cliente HTTP y límites entre cuenta/vista pública. Se aplicó la skill `frontend-ios-elegante`.

No se modificó código, planes ni registro. No se ejecutaron tests, stack ni navegador. No se revisaron archivos del escáner en movimiento. La validación anterior del consumidor público/BE-01 se toma de los informes de coordinación; no se vuelve a certificar aquí.

## Lo aceptado

- El scope conserva el consumidor público cerrado y no introduce DTOs, backend, paquetes, descripción editable ni modo de intercambio.
- `DELETE /share/:id` escribe `isActive=false`, al igual que desactivar; el mismo slug puede reactivarse. Es correcto retirar el estado local terminal y las promesas de irreversibilidad. No hace falta `revokedAt`.
- Preview y campos visibles respetan la allowlist pública. La referencia debe ser USD, con fuente/fecha disponibles y ausencia explícita; no reutilizar valores privados de colección como si fueran los agregados públicos completos.
- La aclaración de no retractación, errores recuperables, teclado, foco, 390×844, desktop y ambos temas son criterios correctos. Todavía requieren evidencia durante implementación.

## Ajustes del handoff

1. **Cerrar el presupuesto de requests de muestra.** El preflight permite resolver la muestra con la API privada existente, pero no fija una estrategia para “todas”. Usar `listCollections()` ya necesario y, para una colección elegida o una colección no vacía elegida desde ese listado, una sola consulta `listItems(id, { page: 1, pageSize: 1 }, signal)`. Para “todas”, rotular que es una muestra de una de las colecciones incluidas; no recorrer todas las colecciones, paginar ni consultar ficha/precios por separado. Si el listado está desactualizado y la consulta devuelve vacío/error, conservar la preview estructural y un estado honesto con reintento. Cancelar/descartar muestras de una selección anterior. La creación no necesita depender de la muestra.
2. **Proyectar la muestra antes de renderizarla.** `listItems` devuelve `CollectionItemDto`, que contiene notas, IDs internos, alta e intercambio. Construir explícitamente el objeto de muestra con carta/edición, variante, condición, cantidad y referencia pública; no hacer spread del item ni guardar/loguear el DTO privado. Los IDs públicos del catálogo necesarios son válidos. La frontera es con el render/estado de preview, no con la respuesta autenticada privada que legítimamente recibe el dueño.
3. **Incluir el nombre público del dueño de forma explícita.** UX-02 lo exige y el preflight lo nombra en semántica, pero falta en el handoff concreto/checklist. Usar el `displayName` de la sesión existente, sin mostrar email ni otros datos del usuario.
4. **Unificar el lenguaje de vencimiento.** Antes de crear no existe todavía `expiresAt`; el servidor lo calcula con su reloj al recibir el POST. Mostrar una fecha estimada local junto a la duración y explicar que la fecha final se confirma al crear. En éxito, mostrar el `expiresAt` devuelto o “Sin vencimiento”. Evitar llamar exacta/garantizada a la estimación del cliente. `formatDate()` muestra día/mes/año; si se muestra hora de vencimiento, usar formato local coherente y no insinuar que vence a medianoche.

## Hallazgos actuales que la implementación debe cubrir

- **[P1] Las tarjetas recién creadas ignoran cambios posteriores.** `share-links-section.tsx:66` aplica `overlay.patched` solamente a `base`, mientras `overlay.prepended` se incorpora sin parches. Crear un enlace y desactivarlo/revocarlo puede dejar la tarjeta marcada como activa; activar otra vez usa el estado viejo. Aplicar el overlay también a los enlaces recién creados y conservar el último objeto actualizado al apagar. Regresión enfocada: crear → apagar → activar, sin recargar.
- **[P2] Un inactivo vencido ofrece activar y los vencidos se cuentan activos.** `share-link-status.ts` prioriza `!isActive` sobre `expiresAt`; `share-links-section.tsx:72` cuenta solamente `isActive`. Un PATCH true no renueva la fecha. La presentación/acciones deben reconocer vencimiento también cuando está inactivo, y el contador debe reflejar disponibilidad vigente. Probar las cuatro combinaciones de activo/inactivo y vigente/vencido. No agregar extensión de fecha como función nueva.
- **[P2] Error de revocar queda detrás del diálogo abierto.** `share-link-card.tsx` escribe `error` en el `Alert` exterior y conserva el `Sheet` abierto cuando falla DELETE. Ese contenido queda fuera del foco/inert mientras la confirmación está abierta. Renderizar el error de esa operación dentro de la confirmación, junto al control, con reintento; mantener el error de toggle junto a su botón.
- Los botones de la tarjeta usan `size="sm"` (32 px). UX-02 exige 44 px; cambiar esos objetivos a una variante conforme al design system durante FE-02. Evitar mutaciones simultáneas toggle/DELETE sobre la misma tarjeta mientras una está pendiente.

Estos ajustes son frontend dentro del scope reservado. No requieren escalar contratos ni reabrir BE-01. Las pruebas enfocadas y revisión interactiva se ejecutarán cuando coordinación reserve implementación/tests; el check global y flujo real aislado quedan para el cierre del lote.
