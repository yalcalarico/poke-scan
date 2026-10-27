# REV-01 — Ocultar el indicador N

Estado: implementada; gate integral aprobado. Sin comprobación visual física.
[Implementación](../RESULTADO-01.md) · [QA](../RESULTADO-04.md).
Rol: frontend. Origen: [E01](../README.md#e01--quitar-el-ícono-n).

## Qué revisar

- `frontend/next.config.ts`: no configura `devIndicators`.
- Guía instalada `frontend/node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/devIndicators.md`.
- Confirmar en desarrollo que el elemento es el Dev Indicator de Next. El símbolo
  y su posición coinciden; no se inspeccionó el DOM de la captura original.

## Qué arreglar y cómo

Declarar `devIndicators: false` en la configuración Next usando la opción soportada
por la versión instalada. No ocultarlo con selectores CSS internos ni moverlo.
Conservar los diagnósticos de compilación y ejecución.

Propietario: `frontend/next.config.ts`. No requiere backend ni cambios de datos.

## Aceptación y validación

- En desarrollo, Buscar, Inicio y Portafolio no muestran el ícono N.
- Todos los destinos de navegación quedan visibles y tocables.
- La configuración es válida; los errores siguen disponibles por sus mecanismos normales.
- Comprobación manual y gate común del [lote](../TAREAS.md#reglas-para-delegar).
  No agregar tests que solo comparen una propiedad de configuración.
