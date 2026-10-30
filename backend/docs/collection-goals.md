# Objetivos por colección

Los objetivos son textos privados elegidos por el dueño de una colección. No
representan compras, progreso ni metas cumplidas. Requieren sesión vigente.

## API

Rutas relativas al prefijo `/api`:

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | `/collections/:collectionId/goals` | 200, lista por `createdAt ASC, id ASC` |
| POST | `/collections/:collectionId/goals` | 201, objetivo creado |
| PATCH | `/collections/:collectionId/goals/:goalId` | 200, título actualizado |
| PATCH | `/collections/:collectionId/goals/:goalId/next` | 200, objetivo elegido como próximo |

POST y PATCH de título reciben `{ "title": "Mi próximo hallazgo" }`. Se recortan
espacios externos; el título debe tener de 1 a 120 caracteres. Un título inválido
responde 400 sin escrituras. Los IDs inexistentes, ajenos o de otra colección
responden 404. La validación global puede rechazar el cuerpo antes del ownership.

Cada objetivo devuelve `id`, `collectionId`, `title`, `isNext`, `createdAt` y
`updatedAt` (fechas ISO). Una colección vacía devuelve `[]`, no 404.

## Consistencia y montaje

`CollectionGoalsModule` expone el controlador y servicio; debe importarse desde
el módulo de aplicación. Reutiliza Prisma y el guard de sesión existentes.
Cada operación toma el lock de la colección con ownership dentro de una
transacción. La primera alta sin próximo elige el objetivo creado; altas
posteriores conservan la elección. Editar no reordena. Elegir próximo valida
que el objetivo pertenece a esa misma colección antes de cambiar el puntero.
La lectura captura lista y puntero consistentemente. No hay descargas externas.

La prueba `collection-goals.http.spec.ts` usa HTTP, PostgreSQL de tests y usuarios
sintéticos propios, con limpieza acotada. Cubre validación, aislamiento, altas
concurrentes, edición y selección. El guard se reemplaza sólo en la prueba.

El límite de título se cuenta en codepoints Unicode en backend, editor y lector de respuestas. No se usa maxlength HTML de 120 unidades UTF-16: truncaría emojis válidos. Los títulos de 121 codepoints se rechazan sin modificar objetivo ni próximo.
