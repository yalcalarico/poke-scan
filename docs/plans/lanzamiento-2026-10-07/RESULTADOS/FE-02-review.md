# FE-02 — Revisión y correcciones

> Cierre del coordinador, 7/10: ID completado localmente; [gate frontend](LOTE-FRONTEND-validacion.md) aprobado con 815 pruebas/check, flujo real, QA y limpieza. La evidencia enfocada y límites del autor conservan su alcance original.

Fecha: 2026-10-07 · Revisor: GPT-6.1 Sol HIGH.

Estado: **aceptación enfocada aprobada; reserva de escritura y pruebas liberada**. Gate integral, stack real y validación visual a cargo del coordinador. Sin cambios fuera de los componentes privados de compartir, sus pruebas y estos informes.

## Hallazgos corregidos

1. **Muestra bajo otro título.** Al cambiar alcance, la muestra anterior seguía visible hasta que el efecto limpiaba el estado. Se vincula la muestra a su colección y se muestra carga cuando no coincide. Se abortan y descartan respuestas viejas al cambiar/cerrar. Reabrir inicia una instancia nueva; no consulta primero el alcance de la apertura anterior.
2. **Estado de otra cuenta.** La lista/overlays y formulario se reinician por cuenta autenticada. Una respuesta tardía del usuario anterior no entra en la lista ni llama `onCreated`. Sin sesión no se consultan enlaces privados ni se abre creación.
3. **Creación concurrente.** Un ref fija el envío antes de esperar React; los selectores y cierres quedan bloqueados durante el POST. El destino inicial inexistente tiene error visible y no se envía. El POST solo ocurre por acción del usuario; carga/error/vacío de la muestra no impiden crear un alcance válido.
4. **Vencimiento con la pantalla abierta.** La tarjeta y contador programan el próximo vencimiento con timeout local acotado. No hay polling ni solicitudes adicionales. Vencido prevalece sobre apagado y no permite activar; el toggle revalida la fecha en el momento de pulsarlo.
5. **Confirmación DELETE pendiente.** Guard compartido con PATCH, cierre bloqueado mientras se resuelve, error/reintento dentro del Sheet. DELETE devuelve void y aplica `isActive:false` sobre el overlay completo; no inventa revocación terminal. Crear → DELETE → activar conserva metadata, tarjeta y contador sin recargar.
6. **Precio y copy.** La referencia debe pertenecer a carta/variante exactas y ser USD finito; cero es conocido, condición no modifica valor. Se muestran fuente/proveedor y fecha con helpers comunes. Se explica el límite de retractación también junto al toggle, y una muestra vacía no afirma que todo el inventario esté vacío si solo faltó esa fila.

## Aceptación de privacidad y datos

El nombre público se toma de `displayName` y el título corresponde al alcance. Global incluye colecciones futuras. La fecha anterior al POST se etiqueta **estimada**; después se usa exclusivamente `expiresAt` de la respuesta del servidor, en hora local. “Nunca” expresa vigencia hasta desactivar/revocar.

La muestra usa el listado existente para elegir una colección y exactamente una consulta `listItems(id, {page:1,pageSize:1}, AbortSignal)` por muestra, con reintento explícito. Sin colección elegible no hace esa consulta. No hay búsqueda por carta, catálogo externo ni N+1. Es una muestra representativa; el resto de campos y explicación permanece durante carga, vacío y error.

La proyección guarda únicamente nombre/número/rareza/artista/imagen/edición, variante, condición, cantidad y referencia USD/fuente/fecha. No guarda ni renderiza notas, email, IDs de ítem/colección/usuario, fecha de alta ni marca privada de intercambio. Esos campos se excluyen aunque existan en el DTO privado; centinelas comprobados en modelo y DOM.

## Integración revisada sin editar otras áreas

**FE-01 / BE-02:** `addItem` sigue enviando el UUID como `Idempotency-Key` y el payload original. El draft conserva cuenta/destino/allocations/entries/operaciones juntos antes del POST; confirma y retira partes en un snapshot. Acredita el delta original, no la cantidad actual devuelta. Red/5xx/409 y cualquier error de un replay mantienen incertidumbre; 410 bloquea sin otra UUID automática. No hay POST al montar. El fixture de 20 lecturas/23 copias y sus resultados 15 confirmadas/3 errores seguros/3 inciertas +2 incompletas tienen la evidencia previa de 73 pruebas en [FE-01-review.md](FE-01-review.md). Esta revisión no reejecutó ni modificó FE-01.

**FE-02 / público / BE-01:** la API privada existente devuelve metadata de gestión y `expiresAt`; DELETE solo apaga y PATCH puede activar. El servidor público vuelve a comprobar activo/fecha, proyecta DTO público y conserva privacidad. La página pública sigue usando fetch `no-store`, deduplicación por render y parser allowlist, con `noindex`; sus errores/404 no se transforman en una promesa de borrado permanente. La muestra privada utiliza un subconjunto compatible del DTO público y no sustituye ni consulta ese consumidor. No se cambió el contrato, parser, páginas públicas, cache/service worker ni backend. Sin bloqueo cruzado detectado. La verificación real de invalidación y replay pertenece al smoke pendiente del coordinador.

## Evidencia ejecutada

- `pnpm run stop` antes de las pruebas, sin stack ni suites DB/Redis.
- `pnpm --dir frontend exec vitest run components/share lib/api/schema.share.test.ts`: **52 pruebas, 10 archivos, todo aprobado**. Incluye 16 casos del flujo propietario rendered con primitivas/Sheet reales: creación, fechas, allowlist, muestra acotada, error/vacío, carreras de scope, cancelación/reapertura, cambio de cuenta, serialización, ciclo DELETE/activación, expiración del contador y teclado. Tarjeta: error DELETE dentro de confirmación con retry, error PATCH en fila, concurrencia de mutaciones y vencido/inactivo. También se verifican overlay y consumidor/parser públicos existentes sin editarlos.
- `pnpm --dir frontend run lint`: aprobado, incluidos guards de colores y URLs.
- `pnpm --dir frontend exec tsc --noEmit`: aprobado después de las correcciones finales.
- `git diff --check` en archivos reservados: aprobado.

El aviso conocido de Vite sobre configLoader no cambia los resultados. Las expectativas del cierre animado Sheet se esperan hasta su desmontaje, sin sustituir la primitiva por un mock.

Los botones de acción/selección usan primitives de 44 px y tokens de ambos temas. Escape/cierre devuelve foco al disparador en jsdom; no acredita contraste/layout a 390/1280 ni teclado en navegador. No ejecuté check global, stack, smoke, navegador, lector de pantalla ni dispositivo físico. Esas limitaciones quedan explícitas para el gate del lote.

## Archivos reservados

`frontend/components/share/share-link-creator.tsx`, `share-link-card.tsx`, `share-links-section.tsx`, `share-link-status.ts`, `share-preview.ts`, `share-link-preview.tsx`, `share-links-state.ts`; pruebas privadas `share-owner-flow.test.tsx` (nuevo), `share-link-card.test.tsx`, `share-preview.test.ts`, `share-link-preview.test.tsx`; este informe y `FE-02-implementacion.md`. No planes, registro, paquetes, commits ni deploy.
