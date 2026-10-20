# Imágenes del catálogo — reparación local

13/10/2026. Causa reproducida: el arranque de Next heredaba `no-provider-fetch.mjs`, un helper de QA que bloqueaba todo fetch externo. El optimizador `/_next/image` devolvía 500 para el arte público de las cartas.

Se corrigió exclusivamente el helper de arranque local de Next: GET HTTPS a los cuatro orígenes/rutas de imágenes ya admitidos en `frontend/next.config.ts`, sin credenciales, cookies, query ni redirecciones automáticas. Loopback conserva el acceso habitual. API, cola de precios, correo, base de datos, fuentes de producto y outputs compilados no cambiaron. No se repitió el check global por este ajuste exclusivo del arranque de QA.

Validación: misma imagen Latias & Latios-GX 500→200; Charizard, Lugia ex y AZ’s Tranquility 200 image/png con dimensiones válidas, incluyendo ambos hosts activos. Seis cartas del orden por precio de la captura cargadas en navegador con dimensiones naturales positivas. Quince controles de allowlist sin red verificaron imágenes permitidas y bloqueo de API de precios, TCGCSV y Resend desde Next, POST, credenciales, HTTP y dominios falsos. Ocho controles de salud/API y parentesco de procesos correctos; API original PID19441 intacta. Next reiniciado PID20262, pnpm20251, padre20250; vivo en localhost3000. TCGCSV continúa programado 14/10 20:30UTC; sin nuevas consultas de precios.

[Evidencia HTTP](LOCAL-imagenes-evidencia/validacion.json), [navegador sin capturas](LOCAL-imagenes-evidencia/browser.json), [instancia viva](LOCAL-imagenes-evidencia/final-instance.json) y [hashes](LOCAL-imagenes-evidencia/sha256.json). La aceptación de precios anterior y sus recibos se conservan sin sobrescribir. Estado20/38; este arreglo no cierra otro ID.
