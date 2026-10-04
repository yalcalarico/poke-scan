> Nota de vigencia (2026-10-03): este documento conserva evidencia histórica. La lectura de texto y el comparador fueron retirados; el flujo actual usa únicamente DINOv2. Consultá [scanner.md](../../frontend/docs/scanner.md).

# Cámara principal unificada

La captura del usuario pertenecía al camino OCR, que aún pedía selección y
mostraba flash/infinito. La cámara principal ahora usa DINOv2 automáticamente
cuando la bandera visual está activa; mantiene detección y precio de la sesión.
El panel experimental queda sólo para archivos, evitando dos botones de cámara.

Foto IMG_5020: primera predicción visual `me55-59`, Toxtricity 30th Celebration
#59. Recuperación original puesto 3, coseno 0,636; verificación geométrica 76/77,
cobertura 28 %. No se agregó una preferencia global por 30th ni por nombre.
Evidencia: toxtricity-visual-2026-10-03.json. Foto orientada sin giro (0°).

El primer candidato se suma por defecto a la sesión, incluida galería OCR.
No hay confirmación previa de edición. “Organizar” conserva el guardado en la
colección elegida. Se puede descartar una predicción incorrecta. Se retiran
flash/infinito; permanece obturador como alternativa manual.

Tests cubren conservación del ID/set del primer candidato aunque otro tenga
coseno mayor, consulta de precio sólo para el ID seleccionado y tolerancia a
precio ausente. La identidad visual no se modifica por datos OCR ni por precios.
La captura/enfoque físicos en iPhone requieren validación del usuario.

Verificación final: `pnpm run check` aprobado completo (338 backend, 6 API,
433 frontend, 6 lector/verificador; lint, tipos y ambos builds). Se actualizaron
los tests de organización para la selección por defecto: permite guardar copias
sin elegir candidato, respeta correcciones ya autorizadas y no aprende de una
selección automática. Test de página: la cámara principal recibe captura
estable, reconoce, conserva carta/precio y no abre coincidencias.

Sonda adicional de encuadre sobre la foto Toxtricity con margen de cámara:
detección positiva, rectángulo 767 × 1040 px. Esto no sustituye la prueba de
video, enfoque y movimiento reales en iPhone.

Docker Desktop perdió temporalmente los puertos de la Mac; se recuperaron los
puertos normales antes del check final. No quedó puente alternativo activo.

API real restaurada: Toxtricity `me55-59`, set “30th Celebration”, número 59,
primera opción, 76/77 correspondencias, 20.670 referencias. Endpoint de precio
respondió sin cotizaciones para esta carta (`prices: []`); se conserva la
identidad y la barra muestra “Sin precio”. Evidencia:
scanner-unified-toxtricity-api-2026-10-03.json. App activa en 3000/3001.
