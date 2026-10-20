# Mapa estático de rutas y selectores para QA local

Fecha de preparación: 2026-10-10. Derivado de `frontend/docs/routes.md`, `frontend/docs/api-client.md`, `frontend/docs/scanner.md` y selectores presentes en los componentes; todavía no hay requests ni observación de navegador.

## Destinos y controles observables

| Flujo | Ruta | Selectores / notas estáticas |
|---|---|---|
| Landing | `/` | main; enlaces de catálogo y escáner. Copy/CTA se contrasta con la matriz aceptada durante la ejecución autorizada. |
| FAQ | `/faq` | main; anclas internas, incluida `#faq-planes`. |
| Registro | `/registro` | labels `Nombre`, `Usuario`, `Email`, `Contraseña`, `Confirmar contraseña`; botón `Crear cuenta`. No capturar pantalla mientras el formulario tenga datos. |
| Login/logout | `/login` | labels `Email`, `Contraseña`; botón `Entrar`. Login mantiene el refresh en cookie HttpOnly. No exportar valores de formulario/cookies. |
| Recuperación | `/recuperar` | formulario `Email`, botón `Pedir enlace`; la API requiere HTTP 202, que indica recepción, no entrega de correo. No se enviará correo externo. |
| Inicio | `/inicio` | main; CTA de búsqueda, escáner y reanudación si existe un borrador sintético. |
| Buscar | `/buscar` | `form[role=search][aria-label="Buscar cartas"]`, searchbox con label `Buscar cartas por …`, botón `Filtros`; sheet con `Campo de búsqueda`, `Todos los sets`, `Filtros por rareza`, `Ordenar resultados por`. |
| Detalle carta | `/carta/[id]` | main, datos de set/número/rareza/artista y sección de precios. Usar solo ID de fixture/catalogo elegido para QA, no inventar existencia. |
| Escáner | `/escanear` | `button[aria-label="Tomar foto de la carta"]`, file input `aria-label="Elegir una foto de la carta"`, vista cámara `aria-label="Vista de la cámara"`; cámara en móvil únicamente. Captura/galería solo con fixture local y DINOv2 real habilitado por root. |
| Colecciones | `/colecciones` | acción `Nueva colección`; sheet con label `Nombre`, placeholder `Mi colección`; usar alias QA, no inventario real. |
| Detalle de colección | `/colecciones/[id]` | acción `Compartir`; editar ítem usa `Cantidad`, `Variante`, `Condición`, toggle `Disponible para intercambio`; evitar notas personales. |
| Progreso | `/colecciones/[id]/sets` | enlace accesible de progreso por set desde tarjeta de colección. |
| Compartida | `/share/[slug]` | solo lectura; slug se considera secreto local de prueba: no escribir URL completa/log ni capturar si los datos no son fixture sintético. |

## Secuencia visual mínima posterior a autorización

- Landing y FAQ: 390×844 claro y 1440×1000 oscuro, luego revisar el tema complementario de forma selectiva si hay diferencias.
- Flujos autenticados exitosos: capturar únicamente pantallas posteriores al submit, con alias sintético; omitir login/registro y cualquier error que incluya datos.
- Búsqueda, detalle, colección y compartir: usar fixture/catálogo y una colección creada para QA. Nunca capturar datos del dueño real.
- Recuperación: comprobar únicamente el resultado HTTP local y la respuesta UI. Si el servicio de correo está ausente, marcarlo como bloqueado por configuración; no presentar un correo enviado como éxito.
- Escáner: solo fixture local y backend real habilitado. Verde de encuadre no se interpreta como identidad confirmada; no OCR ni persistencia de fotos.

## Límites del helper

El helper `/private/tmp/local-app-qa-20261010/qa-local-app.mjs` exige `QA_STACK_READY=1` y `QA_ROOT_AUTHORIZED=1`, solo acepta `localhost`, `127.0.0.1` o `::1`, inicia perfil persistente aislado temporal, no usa profile del usuario, y omite headers, bodies, query strings, cookies y credenciales del log. No se ejecutó como preparación. La automatización está limitada a vistas públicas (`--public`) y login (`--auth`); las demás pruebas serán interacciones guiadas según los IDs/selectores que provea el stack/fix local.
