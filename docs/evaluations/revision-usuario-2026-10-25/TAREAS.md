# Tareas derivadas de la revisión del usuario

Fecha: 25/10/2026. Origen: [siete evidencias](README.md).
Estado al 26/10/2026: **cuatro encargos GPT-6 Luna terminados; cinco revisiones
implementadas, dos pendientes de reproducción Safari físico**.
Seguimiento de textos/períodos implementado y comprobado en Safari de escritorio.
El gate posterior del 26/10 fue aprobado: [cierre vigente](../tcgcsv-batch-completion-2026-10-26.md).
El timeout que se registra más abajo pertenece al intento anterior.
Continuidad desde el 27/10: [backlog ODD](../../../odd/backlog.md); este registro
conserva encargos y resultados históricos, no una lista paralela para actualizar.
Las imágenes respaldan la observación del usuario, no una causa técnica confirmada.
Root revisa reportes y mantiene este registro; los agentes implementan y verifican.

## Índice y orden sugerido

| Tarea | Resultado | Rol | Dependencias |
| --- | --- | --- | --- |
| [REV-01](tareas/REV-01.md) | Quitar el indicador N | frontend | Ninguna |
| [REV-02](tareas/REV-02.md) | Menú visible durante scroll en Safari | frontend | Coordinar archivos con REV-07 |
| [REV-03](tareas/REV-03.md) | Colecciones con menos texto | frontend | Ninguna |
| [REV-04](tareas/REV-04.md) | Escáner automático, controles simples y sonido | frontend / ai-vision si el detector falla | Coordinar página con REV-05 y REV-06 |
| [REV-05](tareas/REV-05.md) | Sesión sin máximo de 30 | frontend; backend si cambia contrato | Coordinar persistencia con REV-06 |
| [REV-06](tareas/REV-06.md) | Variante y condición automáticas, copias acumuladas | frontend / backend | Probar junto con REV-05 |
| [REV-07](tareas/REV-07.md) | Scroll funcional con zoom mínimo | frontend | Coordinar shell con REV-02 |

Orden sugerido: REV-01 → REV-03 → REV-02 → REV-07 → REV-05 → REV-06 → REV-04.
Las tareas tienen aceptación propia; la relación entre archivos impide tratarlas
como siete implementaciones concurrentes. Aplicar una implementación activa y un
propietario por archivo. REV-04 se integra al final para validar autocaptura,
duplicados, sonido y sesiones largas sobre el flujo definitivo.

## Reglas para delegar

- Cada archivo de tarea es un encargo: incluye revisión, propuesta, alcance y aceptación.
- El implementador verifica el código vigente; las rutas identificadas son puntos
  de entrada, no una autorización para modificar todos esos archivos.
- Conservar DINOv2 autenticado, TCGCSV único, lectura de precios local, ausencia de
  fotos persistidas, DTO espejo, ownership e idempotencia. No crear planes FREE.
- Mantener tokens, ambos temas, foco visible, controles táctiles y zoom accesible.
- Antes de tests: `pnpm run stop`. Pruebas focales durante implementación y
  `pnpm run check` al cerrar el lote de producto. No repetir gates verdes intactos.
- Si cambia guardado/datos, ejecutar flujo real aislado con stack y datos de prueba;
  no usar inventario real. Suites, DB, Redis, builds y runtime serializados.
- Safari: validación manual textual con dispositivo/versión/zoom/estado de barra;
  no crear capturas nuevas salvo pedido. Emulación no acredita un iPhone real.
- La falta del video E07 no bloquea investigar ni intentar reproducir. Si no se
  reproduce, documentar el límite y no marcar la corrección como validada.
- Entrega por tarea: archivos, comportamiento, comprobaciones y límites pendientes.
  Root integra resultados y actualiza los registros centrales.

## Hito de implementación autorizado — 26/10

| Encargo | Tareas y orden | Modelo | Reporte obligatorio |
| --- | --- | --- | --- |
| 1 | REV-01 → REV-03 → REV-02 → REV-07 | GPT-6 Luna | `RESULTADO-01.md` |
| 2 | REV-05 → REV-06 | GPT-6 Luna | `RESULTADO-02.md` |
| 3 | REV-04 | GPT-6 Luna | `RESULTADO-03.md` |
| 4 | Validación integral de las siete | GPT-6 Luna | `RESULTADO-04.md` |

Presupuesto del hito: cuatro encargos, sin subdelegación, una implementación activa.
Cada agente es dueño del código y documentación operativa de su paquete y de su
reporte en esta carpeta; root conserva README/TAREAS y los siete planes.
Cada reporte incluye estado por tarea, archivos, criterios de aceptación con
evidencia, comandos y resultado, límites y pendientes. No alcanza con «tests OK».
El agente aplica hasta dos correcciones con evidencia nueva dentro de su encargo;
si no alcanza, deja el trabajo y el diagnóstico explícitos, sin afirmar cierre.
El cuarto encargo puede resolver fallos concretos de integración encontrados al
validar; no amplía producto. Root no sustituye los reportes por revisión propia
del código ni declara validación física a partir de emulación.

Decisiones confirmadas: referencia de variante exactamente igual a la mostrada;
si faltan precio y variante respaldada, lectura pendiente sin bloquear otras;
identidad aceptada automáticamente con corrección opcional antes de guardar;
NM fijo para lecturas nuevas y cantidad automática. No se cambia inventario histórico.

## Seguimiento de ejecución

| Encargo | Estado | Resultado |
| --- | --- | --- |
| 1 — Navegación/presentación | REV-01/03 implementadas; REV-02/07 pendientes de reproducción | [Resultado 01](RESULTADO-01.md) |
| 2 — Sesión/guardado | REV-05/06 implementadas; 44 pruebas focales, lint y tipos aprobados | [Resultado 02](RESULTADO-02.md) |
| 3 — Cámara | REV-04 implementada; 32 pruebas focales, lint y tipos aprobados; iPhone pendiente | [Resultado 03](RESULTADO-03.md) |
| 4 — Validación integral | Gate salida 0 y flujo real aislado aprobados; limpieza verificada | [Resultado 04](RESULTADO-04.md) |

## Cierre del hito — 26/10

Root revisó los cuatro reportes de resultado; no implementó ni revisó directamente
el código de producto. Los agentes ejecutaron implementación, auto-revisión y QA.

- REV-01, REV-03, REV-04, REV-05 y REV-06 implementadas. Gate global
  `pnpm run check` con salida 0, ambos builds y 1.276 pruebas aprobadas según
  [Resultado 04](RESULTADO-04.md). Sin cambios backend ni de contrato público.
- Flujo real de helpers de borrador + API autenticada + Postgres aislado:
  999+3 copias, replay idempotente tras confirmación perdida, una fila con 1002,
  lectura sin precio conservada y restaurable. No acredita interacción física de cámara.
- REV-02 y REV-07 no tienen corrección aplicada: falta reproducción Safari/iPhone.
  Para REV-04 también queda pendiente comprobar encuadre y sonido en iPhone físico.
  No hay validación visual física del indicador ni de la nueva disposición.
- Cuenta/colección/base QA y `.env.qa` retiradas; API/web abajo, DB/Redis arriba.
  Runner reproducible enlazado en el informe. Sin commits, publicación ni
  reactivación de automatización. Los pendientes físicos no se marcan completos.
- Cuatro encargos consumidos en este hito; sin subdelegación ni nuevas tareas
  tras QA. La revisión documental de cierre no repite suites de producto.

## Decisiones y riesgos relevantes

### Seguimiento posterior: textos en otras vistas y períodos

El reporte posterior del usuario amplió REV-03 a portafolio, cabecera de colección
y detalle de ítem, y agregó E08 (escala temporal al cambiar período). Root corrigió
los componentes compartidos sin nuevas delegaciones. [Resultado de seguimiento](RESULTADO-05-textos-y-periodos.md):
631 pruebas frontend y build aprobados; el gate completo volvió a ejecutarse y
queda **pendiente** por timeouts variables de backend ajenos a estos archivos.
El verde de Resultado 04 es histórico y no acredita el estado actual del gate.
Web y API se dejaron activas en Herdr `w2:p7`, ambas con HTTP 200. Se comprobaron
los tres bloques de texto indicados por el usuario y el cambio de período en
Safari de escritorio, sin capturas ni cambios al inventario.

### Nuevo pedido: variantes, NM global y refresco

Pedido posterior del usuario: el editor de colección pierde el precio al cambiar
de normal a reverseHolofoil aunque ambas cotizaciones existen en la ficha;
quitar condiciones distintas de NM de los flujos activos y actualizar la vista
inmediatamente tras editar.

Encargo 1/4 de este nuevo pedido, GPT-6 Luna, interrumpido por límite de uso antes
de implementar. Root continuó directamente tras «sigue». No se reinicia el presupuesto consumido del
hito de las siete evidencias; este pedido añade política global de NM y fallos
concretos nuevos del editor. No hay otras implementaciones activas de este chat.

El usuario confirmó convertir también los registros anteriores a NM, conservando
cantidades. Verificar colisiones antes de aplicar; no truncar notas ni perder
copias/atributos. Ensayo y flujo real aislados antes de normalizar desarrollo.
[Resultado](RESULTADO-06-variantes-nm-refresco.md): frontend corregido, candidato
aislado con check salida 0 y flujo HTTP aprobados. Por pedido expreso de no
reiniciar mientras había jobs, backend/migración quedan en
[parche pendiente](backend-nm-pendiente.patch), sin cargar en la instancia.
El servidor principal se encontró posteriormente apagado y no se volvió a iniciar.

### Riesgos registrados del hito original

1. El ícono coincide con el indicador de desarrollo de Next; se propone ocultarlo,
   como pidió el usuario, sin sustituir el pedido por moverlo de esquina.
2. La autocaptura ya existe. Falta explicar por qué no respondió en la prueba;
   crear un segundo loop de captura no es la solución de partida.
3. DINOv2 devuelve candidatos de carta, no acabado/foil. La variante debe viajar
   con la cotización elegida y conservarse al guardar. REV-06 define el caso sin
   precio y evita tratar `prices[0]` como identificación física del acabado.
4. Sesión sin tope de 30 no significa requests paralelos ilimitados ni eliminar
   límites de imagen, diagnóstico o seguridad. Se conserva el procesamiento serial.
5. REV-02 y REV-07 son fallos distintos aunque puedan compartir una corrección
   de viewport. No atribuirlos a CSS concreto sin reproducción y medición.

## Registro de delegación del análisis

Se usaron cuatro encargos en este lote: dos consultas iniciales sobre E01 antes
de la pausa solicitada y dos revisiones posteriores de solo lectura (E01/E02/E03/E07
y E04/E05/E06). Sin subdelegación ni cambios de producto. Se reutilizaron los dos
agentes. No quedan encargos disponibles dentro del presupuesto de este lote de
análisis; las implementaciones aquí definidas son trabajo futuro.
