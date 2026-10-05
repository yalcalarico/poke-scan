# Descarga voluntaria del recorte — 4 de octubre de 2026

Se agregó «¿No coincidió? Guardá el recorte» después de una consulta de cámara o galería. «Descargar recorte» conserva los bytes y formato exactos enviados a la API: decodifica el data URL sin canvas, nueva compresión ni otra petición. «Descargar diagnóstico» crea un JSON con nombre de imagen, origen, fecha, corrida, resultado visual completo y error si corresponde. El ID esperado queda null para que el usuario lo confirme; no se deduce de la predicción.

Sólo hay una revisión temporal en memoria del navegador. No integra sessionStorage/localStorage, backend ni colección; reemplazar la captura, descartarla, recargar o salir elimina la revisión. Abrirla en cámara pausa captura automática hasta cerrar el panel y deshabilita la captura manual para no reemplazar lo revisado. Si no llegó a prepararse una imagen no se ofrece descarga.

## Evidencia

- `pnpm run stop` antes de tests. Check completo exit 0: lint sin warnings del cambio, tipos, 303 backend, 6 scripts, 6 API, 322 frontend y ambos builds.
- Una corrida final previa tuvo un timeout de 5 s en el test existente `PriceBackfillService > respeta el límite de la corrida`. Repetición sin modificar el test ni su timeout: verde. Log `/tmp/scanner-capture-review-final-check-retry.log`.
- Tests nuevos comprueban bytes exactos, vínculo imagen/JSON, ID esperado vacío y ausencia de imagen duplicada en diagnóstico; integración de galería verifica descarga bajo demanda, error posterior al envío, preparación fallida y captura más reciente ante respuesta obsoleta.
- Web real autenticada: IMG_4987 → Umbreon `me55-92`. Se abrieron las opciones y descargaron ambos archivos mediante sus botones. En Descargas se verificaron `pokescan-2026-10-04T03-38-42-531Z-2.png` y `.json`; el JSON apunta al mismo PNG, origen gallery, 20.670 referencias, primer ID `me55-92`, sin foto embebida ni ID esperado inventado. No se guardó en colección.
- Recargar conserva la carta de la sesión pero no la revisión/foto (verificación UI posterior).
- Cámara física y descarga en Safari/PWA no se probaron. El control usa tokens existentes y no agrega animaciones. No se certifican temas/viewport móvil en dispositivo por esta prueba de escritorio.

Los archivos descargados son una acción manual autorizada para verificar esta función; las capturas de consulta no se guardan automáticamente. No hubo cambios en contratos ni backend ni índice.
