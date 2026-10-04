> Nota de vigencia (2026-10-03): este documento conserva evidencia histórica. La lectura de texto y el comparador fueron retirados; el flujo actual usa únicamente DINOv2. Consultá [scanner.md](../../frontend/docs/scanner.md).

# Rotación de Vulpix y marco móvil

Foto aportada IMG_5018.HEIC, convertida localmente a JPEG para reproducir la
entrada sin depender del soporte HEIC del navegador. Antes: el detector elegía
el dibujo, recorte 874 × 533 px, giro 90°. Después: carta 874 × 1100 px, giro 0°.
DINOv2 prioriza me55-9 (Vulpix, 30th Celebration), coseno 0,748, geometría 47/53,
cobertura 28,7 %. OCR encuentra Vulpix pero no confirma edición (lee número 3).

Verificación de pantalla móvil: ancho del documento y contenido ambos 375 px;
no hay desborde horizontal. Cámara: marco centrado reducido 28 %, controles
visibles. No se comprobó enfoque ni captura real en iPhone: el navegador de
prueba no suministró video de cámara. La transformación del recorte comparte
la geometría de la guía y conserva los tests de mapeo de object-cover.

Regresión sintética: carta vertical pequeña sobre mucho fondo con dibujo
apaisado, y proporción/tamaño móvil. Frontend 421 tests aprobados. Las cinco
fotos anteriores conservan recortes verticales con rotación 0°.

Capturas: vulpix-mobile-2026-10-03.png, camera-mobile-frame-2026-10-03.png.

`pnpm run check` completo aprobado: lint, tipos, 338 tests backend, 6 API,
421 frontend, 6 lector/verificador, y ambos builds. App restaurada después.
