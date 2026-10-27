# REV-05 — Quitar el límite de 30 lecturas por sesión

Estado: implementada; pruebas focales, flujo real aislado y gate integral
aprobados. [Implementación](../RESULTADO-02.md) · [QA](../RESULTADO-04.md).
Rol: frontend; backend solo si se modifica contrato.
Origen: [E05](../README.md#e05--quitar-el-máximo-de-30-cartas).

## Qué revisar

- `frontend/components/scanner/session-storage.ts`: append recorta a 30.
- `frontend/app/(app)/escanear/page.tsx`: bloqueos de captura, pausas y mensajes
  relacionados con `MAX_SESSION_ENTRIES`; localizar todas sus referencias.
- Persistencia en `session-draft.ts`, caché de recortes para revisión y restauración.
- Distinguir límite ordinario de los topes diagnósticos de 30 lecturas/64 MiB.
  El DTO de identificación limita cada imagen a 6 MiB; no es límite de sesión.

## Qué arreglar y cómo

Eliminar el tope funcional y los recortes que pierden entradas de la sesión normal,
incluida su restauración. No sustituir 30 por otro máximo de producto ni introducir
planes FREE. Mantener límites independientes de imagen, diagnóstico, concurrencia,
cadencia y seguridad.

Separar crecimiento de entradas de memoria de fotos: caché de recortes acotada y
sin fotos persistidas. Medir cuotas de almacenamiento y render de listas grandes;
si falla persistencia, conservar lecturas en memoria e informar recuperación,
sin truncarlas silenciosamente. Evaluar almacenamiento de metadata por partes o
virtualización solo si la medición lo necesita.

Propietario: session-storage, página, persistencia de sesión y sus tests.
Coordinar `session-draft.ts` con REV-06; más de 999 copias debe poder guardarse
con el particionado idempotente definido ahí, no solo capturarse.

## Aceptación y validación

- Lecturas 31, 100 y superiores no deshabilitan captura ni pierden las anteriores.
- Una sesión larga se restaura y puede continuar/revisarse/guardarse; probar
  metadata de más de 999 copias sin efectuar miles de llamadas de reconocimiento.
- Cuota excedida no borra entradas; caché de fotos no crece sin control.
- Diagnóstico mantiene sus límites propios y requests siguen seriales.
- Actualizar `session-storage.test.ts`, `scan-page-camera.test.tsx` y pruebas de
  draft/restauración según sus rutas vigentes; flujo real aislado de guardado y
  gate del [lote](../TAREAS.md#reglas-para-delegar). No prometer memoria física infinita.
