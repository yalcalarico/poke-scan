# Objetivos de colección

Desde una tarjeta de Colecciones o desde el panel «Tu próximo objetivo» del
detalle, abrí **Ver objetivos**. La ruta es
`/colecciones/[id]/objetivos`. Podés crear, editar y elegir el próximo objetivo;
los cambios se confirman con la API antes de refrescar la vista.

## Sugerencias y editor

Las sugerencias son editoriales generales: no analizan inventario ni recomiendan
compras. **Generar otra** reemplaza la idea sin guardar nada. **Usar sugerencia**
abre el editor para adaptarla; sólo **Guardar objetivo** persiste el texto.
Cancelar no escribe. El título admite de 1 a 120 caracteres después de recortar
espacios. Un fallo conserva el borrador y muestra el error, sin éxito ficticio.

La primera alta queda como próxima; las siguientes no reemplazan tu elección.
La lista mantiene su orden de creación, aunque elijas otro próximo o edites su
título. No se muestran contadores de progreso, precios ni metas cumplidas.

## Integración

`HomeGoalPanel` se exporta desde `components/goals/home-goal-panel.tsx`. El parent
lo monta en Inicio una sola vez; carga las colecciones propias, permite elegir
una y muestra su próximo objetivo real. No se integra en Inicio desde esta unidad.
`CollectionGoalPanel` recibe `collectionId` y está conectado al detalle existente.
Ambos distinguen carga, error, visitante y colección sin objetivos; el panel de
Inicio también distingue una cuenta sin colecciones. Cambiar de colección
remonta el panel para no mostrar objetivos de la selección anterior.

Se reutilizan useAuth/useAsync, apiFetch, Field/Input/Select, Surface y los tokens
vigentes. `data-vineta-goals` y `data-vineta-home-goal` son seams para el tratamiento
visual central. Esta unidad no añade animaciones ni otra aplicación.

El cliente llama a las cuatro rutas documentadas en
`../../backend/docs/collection-goals.md`; rechaza respuestas ilegibles y propaga
fallos. Las pruebas focales viven en `components/goals/goals.test.tsx` y
`lib/api/goals.test.ts`.

El límite de título se cuenta en codepoints Unicode en backend, editor y lector de respuestas. No se usa maxlength HTML de 120 unidades UTF-16: truncaría emojis válidos. Los títulos de 121 codepoints se rechazan sin modificar objetivo ni próximo.
