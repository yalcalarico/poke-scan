# FE-02 — Preflight de trabajo restante

Fecha: 2026-10-07 · Estado: handoff de implementación; FE-02 sigue parcial.

## Alcance de este handoff

El consumidor público BE-01 ya está integrado y no se reabre en esta tarea: parser dedicado y allowlist, grilla por grupos, resumen completo, etiquetas para truncamiento/precios, `generateMetadata`, `cache: 'no-store'` y exclusión del service worker están implementados. El gate backend y smoke integrado de la entrega cerrada están documentados en [LOTE-BACKEND-validacion.md](LOTE-BACKEND-validacion.md). Este preflight cubre solamente la UI privada del dueño, la preview antes de crear, el copy de visibilidad/vigencia y el comportamiento entendible de activar/desactivar/vencimiento/revocación.

No se implementó ni se verificó la UI en navegador en este trabajo. FE-02 permanece sin marcar como completo.

## Diferencias verificadas en el código actual

| Archivo | Ya existe | Falta o contradice UX-02 |
|---|---|---|
| `frontend/components/share/share-link-creator.tsx` | `Sheet`, selector de alcance, opciones nunca/7/30/90/365 días, carga/error/reintento, creación, copiar link y caso sin colecciones. | No hay preview antes de confirmar. El subtítulo dice que cualquiera puede ver la colección, pero no enumera campos ni separa lo público de lo privado. La selección nunca no explica que el link sigue activo hasta apagarlo/revocarlo; las otras opciones no muestran fecha concreta antes de crear. No hay fila representativa ni estado de colección vacía. Hint actual contiene “lasts” en inglés. El mensaje de éxito promete que se puede revocar “cuando quieras” sin aclarar el límite de retractación. |
| `frontend/components/share/share-link-card.tsx` | Muestra alcance, URL copiable, estado, creación, vistas, vencimiento con `formatDate`, y acciones disponibles según status. | La confirmación de revocar afirma “no se puede recuperar” y “ya no funciona para nadie”; el toast también afirma que “ya no funciona para nadie”. Eso no corresponde al modelo ni a UX-02: `DELETE` y `PATCH isActive:false` terminan en `isActive=false`, y el link desactivado puede reactivarse. La confirmación no explica que contenido ya descargado/capturado no se borra. No hay acción para editar/extender un vencimiento desde una tarjeta vencida; no agregarla sin contrato/alcance nuevo. |
| `frontend/components/share/share-links-section.tsx` | Lista, empty/error/loading, contador y controles; ofrece contexto general de apagar/revocar. | El texto de sección dice “revocar del todo” y el aviso inferior dice que revocar lo “mata para siempre” y exige crear otro. Es una promesa terminal que backend no distingue ni persiste. El aviso no explica la imposibilidad de retractar copias existentes. |
| `frontend/components/share/share-link-status.ts` | Deriva activo, desactivado, vencido y revocado local; reconoce fecha vencida y permite activar un desactivado. | `revoked` solo existe en `revokedIds` de la sesión actual; tras recargar no se puede distinguir del desactivado. El estado local revocado bloquea activar/copiar y lo rotula terminal aunque el mismo slug puede activarse por PATCH. Corregir presentación y acciones para no prometer irreversibilidad; no inventar `revokedAt` ni otro campo DTO. `expired` se calcula con `expiresAt`; inválido no se considera expirado. |
| `frontend/lib/api/share.ts`, `frontend/types/api.ts` | El cliente ya refleja `ShareLinkDto`, `expiresAt`/`collectionName` del listado/creación y las mutaciones existentes; `createShareLink` usa `collectionId` opcional + `expiresInDays` opcional. | No se necesita cambio de contrato para el scope previsto. No añadir descripciones, modo “solo intercambio”, nueva distinción terminal ni campos privados. El preview debe usar datos permitidos existentes; si se necesita una muestra real, resolverla por la API de colección ya existente y tratar carga/error/vacío sin bloquear ni cambiar el contrato público. |

### Semántica confirmada para la UI

- `collectionId` omitido significa todas las colecciones. El alcance global es dinámico: futuras altas quedan reflejadas al abrir el enlace. La UI debe decirlo en el caso sin colecciones: hoy no hay cartas y el link puede reflejar contenido agregado después.
- La vista pública permite título derivado, `displayName`, carta/edición, variante, condición, cantidad y referencia USD de mercado con proveedor/fecha si está disponible. No incluir notas, email, estado de intercambio ni IDs internos de inventario/colección/usuario. El resumen de la preview no debe hacer pasar una carta representativa por inventario completo.
- `expiresInDays` admite las opciones actuales; “Nunca” omite el campo. Antes de crear, mostrar claramente “Sin vencimiento” o la fecha local exacta resultante. Un link activo no vence por default.
- Activar/desactivar es reversible. El backend actual tampoco mantiene una marca terminal para revocación: el dueño no debe recibir copy que prometa que el slug no se puede reactivar. Mantener los controles existentes compatibles con la respuesta del servidor y rotular las consecuencias observables con honestidad.
- Desactivar/revocar evita nuevas consultas elegibles según la vigencia de servidor y cachés ya verificadas. No borra una página ya abierta ni una copia, captura o preview que otra persona guardó. Incluir esta aclaración antes de confirmar la acción que apaga el link.
- El visitante sigue viendo un único estado genérico no disponible para slug ausente, inactivo o vencido; no filtrar la causa. Esa vista pública ya está adaptada y queda fuera de los cambios de FE-02 restante.

## Handoff concreto de implementación

1. **`frontend/components/share/share-link-creator.tsx`**: conservar el flujo y controles existentes; insertar tras alcance/vencimiento una preview en el mismo `Sheet`, antes del botón “Crear enlace”. Mostrar título derivado (“Todas las colecciones” o nombre elegido), la visibilidad “Cualquiera con el enlace puede verlo”, una fila representativa con carta/edición, variante, condición, cantidad y precio o “Sin referencia”, y dos bloques legibles “Se comparte” / “No se comparte”. El segundo debe decir de forma explícita “Tus notas privadas no se comparten”; enumerar que no se publican email ni datos privados de gestión. Para scope vacío indicar “Esta colección todavía no tiene cartas”; si son todas sin colecciones, explicar el alcance dinámico documentado. Si los datos de muestra no están disponibles, conservar preview de alcance/campos y explicar que hoy no hay una fila para mostrar, sin fallar creación.
2. En la misma preview, expresar vigencia según selector: fecha exacta local para 7/30/90/365 días (derivada del vencimiento que devuelve el servicio si esa respuesta se usa), o “Sin vencimiento: el enlace sigue activo hasta que lo desactives o revoques”. No presentar fecha de cliente como garantía contractual distinta del `expiresAt` real. Si la fecha final depende de servidor, mostrar el valor devuelto al éxito y mantener el aviso de intención previo.
3. **`frontend/components/share/share-link-card.tsx` y `share-link-status.ts`**: preservar fechas exactas y estados activo/desactivado/vencido; ajustar status y acciones para que un `DELETE` no se anuncie como terminal ni inhabilite la activación durable del mismo slug. La diferencia revocado/desactivado no puede sobrevivir recarga con el contrato presente. En el diálogo de apagado incluir el copy de no retractación aceptado. Copy de éxito describe que el enlace deja de abrirse para nuevas solicitudes elegibles, sin “para siempre” ni afirmación de borrado de contenido ya visto.
4. **`frontend/components/share/share-links-section.tsx`**: alinear descripción y aviso final con la semántica reversible que sí soporta el backend; explicar con texto que desactivar apaga y puede reactivarse, que el vencimiento lo vuelve no disponible al llegar la fecha y que una acción de baja no elimina copias ya guardadas. Evitar “revocar del todo”, “lo mata para siempre” y cualquier afirmación equivalente.
5. Mantener `frontend/app/(app)/ajustes/page.tsx` como punto de entrada autenticado y `/share/[slug]` como ruta pública `PlainShell`. No tocar el consumidor público salvo que la implementación de preview descubra una contradicción real del contrato; en ese caso, registrar primero el hallazgo y no expandir alcance silenciosamente.

## Primitivas y patrones existentes

Usar imports desde `@/components/ui`: `Sheet` con `footer`, `Field`, `Select`, `Alert`, `Button`, `Surface`, `Badge`, `Stat`/`StatGrid`, `Skeleton`, `EmptyState`, `ErrorState` y `useFieldA11y`. Ya se usan en las pantallas de compartir y no hace falta introducir primitiva nueva. La `Sheet` ya implementa portal, inert, focus trap, Escape, lock de scroll, devolución de foco y footer separado; en mobile es bottom sheet y en desktop diálogo. `Field`/`useFieldA11y` da nombre y descripción accesibles al `Select` propio. Reusar tokens semánticos, sin colores crudos, y `formatDate` para fecha local. Datos de muestra de catálogo deben seguir los componentes de `cards/` y el `next/image` existente; no inventar una tarjeta no accesible con markup paralelo.

## Checklist pendiente de implementación y evidencia

- [ ] Preview previa fiel para scope global/individual, título derivado, fila representativa y campos compartidos explícitos.
- [ ] Aclaración visible de notas privadas no compartidas, sin exponer email/IDs internos/estado de intercambio en la preview.
- [ ] Estados vacíos de la preview, incluida semántica dinámica “todas” cuando hoy no hay colecciones.
- [ ] Vencimiento legible antes de confirmar, fecha local exacta o sin vencimiento; opción “Nunca” explica que el enlace queda activo hasta una acción del dueño.
- [ ] Copy de activar/desactivar/vencido compatible con la mutabilidad real del contrato; revocar no se presenta como terminal durable.
- [ ] Aclaración antes de apagar el enlace sobre copias, capturas y páginas externas que no pueden retractarse.
- [ ] Errores de cargar muestra/colecciones, crear, actualizar estado y revocar quedan junto al control/formulario relevante, con recuperación disponible; loading se anuncia y no duplica envíos.
- [ ] Revisión de teclado de abrir/cerrar sheet, orden de tab, selector, botón primario/secundario, confirmación, Escape y devolución de foco; foco siempre visible.
- [ ] Revisión a 390×844: cuerpo desplazable dentro del Sheet, footer y acciones sin taparse, sin overflow horizontal y objetivos de 44 px.
- [ ] Revisión desktop, con el mismo orden y ancho legible; tema claro y oscuro en ambos tamaños.
- [ ] Revisar lector de pantalla para nombre de diálogo, descripción de privacidad/vigencia y estados de carga/error; no depender solo del color.
- [ ] Revisar metadata/HTML de `/share/[slug]` únicamente como regresión de privacidad: una muestra privada centinela no aparece. El smoke ya acreditado por coordinación cubre cachés calientes/API/HTML para backend y consumidor; la UI privada todavía necesita su revisión visual interactiva.

## Archivos, colisiones y límites de la inspección

Los cambios previstos se limitan a `frontend/components/share/share-link-creator.tsx`, `share-link-card.tsx`, `share-links-section.tsx`, `share-link-status.ts` y, si se agregan regresiones enfocadas, tests de `frontend/components/share/`. No hay solapamiento previsto con FE-01, que trabaja en el flujo del escáner/drafts y colecciones. En el estado local observado, `app/share/[slug]/page.tsx`, `components/share/public-card-grid.tsx`, `public-collection-view.tsx`, `lib/api/share.ts`, `lib/api/schema.ts`, `types/api.ts` y `public/sw.js` aparecen modificados por el lote público integrado; preservarlos y no revertir sus cambios.

El frontend ya tiene cambios concurrentes extensos en el worktree. Este preflight no los atribuye a FE-02 restante ni los modifica. No se ejecutaron pruebas, servidores ni acciones de UI. Las afirmaciones de validación del lote backend/public provienen de sus informes escritos, no de una repetición en este preflight.
