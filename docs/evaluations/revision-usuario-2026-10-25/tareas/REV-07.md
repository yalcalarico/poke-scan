# REV-07 — Recuperar desplazamiento con zoom mínimo

Estado: revisada; bloqueo no reproducido, sin corrección aplicada. Pendiente de
Safari físico/video. [Resultado](../RESULTADO-01.md). Rol: frontend.
Origen: [E07](../README.md#e07--el-zoom-bloquea-el-desplazamiento).

## Qué revisar

- Safari iPhone, Portafolio con contenido largo: alejar al máximo y arrastrar
  arriba/abajo; contrastar con acercar ligeramente. Registrar versión y escala real.
- `frontend/app/globals.css`: `touch-action: manipulation` y
  `overscroll-behavior-y: contain`; son candidatos de investigación, no causas probadas.
- `frontend/app/layout.tsx`: permite zoom hasta 5×.
- Shell, screen-container y ruta de colecciones: scrollers anidados, altura y overflow.
- `frontend/components/ui/sheet.tsx`: usa pila para bloquear/restaurar overflow
  de body, panel limitado por dvh y zona scroll; verificar limpieza tras cerrar
  Revisar escaneos y otras hojas. No afirmar que ese mecanismo falla sin evidencia.

## Qué arreglar y cómo

Obtener reproducción y medir `scrollTop`, `scrollHeight`, `clientHeight`, estilos de
html/body/contenedor y viewport visual antes/después del gesto y del cierre de hojas.
Separar bloqueo de gestos, scroll lock residual y problema de dimensiones.

Corregir la causa localizada: restauración de bloqueo, contenedor de scroll o
reglas de gestos/altura según lo medido. Conservar pinch-to-zoom accesible y el
bloqueo legítimo mientras hay una hoja abierta; no usar `user-scalable=no` ni
desactivar todos los gestos para ocultar el fallo.

Propietario inicial: investigación del shell móvil. Autorizar cambios solo en
archivos identificados como causales; coordinar layout/CSS/nav con REV-02.
El video mencionado está pendiente; investigar con la secuencia relatada mientras tanto.

## Aceptación y validación

- Se puede llegar al inicio y final de una lista larga al mínimo zoom permitido,
  sin acercar para desbloquear; repetir con barra Safari expandida y contraída.
- Abrir/cerrar revisión y otros sheets no deja el documento bloqueado; con sheet
  abierto su contenido se desplaza y el fondo conserva el bloqueo esperado.
- Pinch-to-zoom, orientación, navegación inferior y foco no regresan.
- Si cambia gestión de locks, agregar regresión significativa de aperturas/cierres
  y restauración. Un test DOM no valida por sí solo gestos Safari reales.
- Validación física textual y gate del [lote](../TAREAS.md#reglas-para-delegar).
  Sin reproducción, entregar diagnóstico pendiente y no marcar arreglado.
