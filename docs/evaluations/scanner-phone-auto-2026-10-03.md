> Nota de vigencia (2026-10-03): este documento conserva evidencia histórica. La lectura de texto y el comparador fueron retirados; el flujo actual usa únicamente DINOv2. Consultá [scanner.md](../../frontend/docs/scanner.md).

# Cámara sólo en teléfonos y DINOv2 automático

Escritorio: se retiran los botones de cámara OCR y DINOv2. Se mantienen carga de
fotos para OCR, DINOv2 y comparación, búsqueda manual y organización de sesión.
La detección de teléfono usa el navegador, no el ancho de una ventana; evita
habilitar webcams al achicar el escritorio. SSR oculta la cámara hasta hidratar.

Teléfonos: la cámara DINOv2 permanece abierta y sondea el encuadre local cada
350 ms. Marco rojo mientras busca; verde tras detectar una carta centrada y
estable al menos 900 ms. Ese verde expresa encuadre, no certeza de identidad.
Captura automática sin pulsar obturador; primera predicción superpuesta sobre
el video. Al cerrar, quedan los candidatos y métricas completos. Obturador
manual disponible como alternativa. No se guardan cartas automáticamente.

Protecciones: pausa mínima 2,5 s; ninguna captura automática en vuelo mientras
el motor está ocupado; no repite carta quieta; retiro de al menos 1 s permite
releer. El sondeo no manda frames a la API. Sólo la captura estable se envía a
DINOv2. Una captura ya encuadrada no se recorta ni gira otra vez (OCR tampoco).

Validación: tests de estabilidad, movimiento, pausa, retiro, repetición,
encuadre sintético, integración automática sin OCR y conservación de píxeles
sin detector para cámara. Sonda local con la foto real de Vulpix encuadrada:
positiva. No se verificó captura real ni enfoque en un iPhone físico.

`pnpm run check` completo aprobado: 338 backend, 6 API, 430 frontend
(2 omitidos, 1 pendiente), 6 lector/verificador. Lint, tipos y ambos builds.

Comprobación real en navegador de escritorio: no hay botones de cámara OCR ni
DINOv2 después de hidratar. Carga de foto DINOv2 funcional: Vulpix me55-9 en
primer lugar, 47/53 puntos, rotación 0°, 20.670 referencias. Captura de evidencia:
scanner-desktop-no-camera-2026-10-03.png. App levantada para la prueba en celular.
