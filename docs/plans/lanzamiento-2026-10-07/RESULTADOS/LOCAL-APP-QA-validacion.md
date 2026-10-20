# Validación de la instancia local — 11/10/2026

Prioridad humana: reproducir y reparar el Internal Server Error de login, levantar la app y probar flujos con capturas reales. Root retomó la QA después de la interrupción del ejecutor por límite de uso; no se duplicó el encargo.

## Reparaciones concretas

- **Login500:** la base local tenía11migraciones y carecía de `users.authVersion` y `refresh_tokens.issuedAuthVersion`. Un login de cuenta sintética inexistente produjo500 y PrismaP2022. Se creó backup privado, se ensayaron las dos migraciones aditivas existentes en un clon marcado y se aplicaron después a dev. Quedaron13migraciones;22usuarios,22colecciones,69items,13shares,20670cartas y5índicesGIN intactos. No se probó la contraseña de ningún usuario real.
- **Imagen OG404:** el generador estaba dentro del routegroup marketing y Next añadía un sufijo de ruta incompatible con la URL fija de metadata. Se movió sin cambiar su contenido a `frontend/app/opengraph-image.tsx`. La ruta pasó a200,image/png,1200×630.

## Flujos observados

La QA con escrituras usó exclusivamente un clon de PostgreSQL y Redis propios. No añadió fixtures al inventario dev. Las credenciales sintéticas permanecieron sólo en memoria. Jobs y peticiones externas de proveedores estuvieron bloqueados; precios y cotizaciones son referencias ya cacheadas con sus fechas conservadas.

- Landing390, FAQ con8acordeones, catálogo, registro, login, recarga de sesión, tema claro/oscuro y moneda USD/ARS observados durante la fase previa; capturas conservadas. Parte de los intentos privados anteriores falló por selectores, hidratación o mezcla de hostnames; no se atribuyen esos errores al producto.
- Alta y edición manual de Pikachu:3copias,Holofoil,LP,para intercambio. Ver captura `edicion-3-copias.jpg`; estado contrastado por agregación SQL del clon.
- **Galería/DINOv2 real:** entrada controlada desde una referencia pública del catálogo ya presente en el índice, Base#58. Primera candidata BaseSet2#87; Base#58 también estaba entre las alternativas. Se eligió y confirmó Base#58 explícitamente,Normal,NM,1copia, y se guardó en Mi colección. La coincidencia inicial NO acertó la edición. Esto verifica integración y corrección manual; no precisión sobre fotos físicas.
- CSV descargado:2filas, encabezado y una carta, con `base1-58`,Pikachu,Normal,NM. Resultado en `export-safe.json`.
- Enlace de colección creado: vista pública de sólo lectura con1copia; después de revocar, una nueva navegación mostró «Este enlace no está disponible». No se muestran URLs privadas en evidencias.
- Progreso por set:1/102,101faltantes. Cerrar sesión→login nuevo→misma carta guardada. Móvil390×844,body/document390sin desborde.

## Límites

La instancia común usa `UnavailableRecoveryMailPort`: no hay proveedor de correo externo configurado. La recuperación con correo DI en memoria ya fue aceptada en loteCUENTA; eso no habilita entrega externa en esta instancia. No se acreditan cámara física/teléfono real, correo externo, HTTPS productivo ni lectores de pantalla. No se persisten fotos de consulta; la única entrada de galería fue una referencia pública existente y las capturas guardadas muestran catálogo/resultado confirmado.

## Check y recursos

Stop y check estándar exacto iniciados una vez el11/10 sobre el clon/Redis propios, después del cambio real OG. Primera corrida: lint/tipos verdes, backend412/414. Falló la precondición de catálogo cotizado menoral10% (16940vs2067) y venció a5000ms el recorrido completo de ese tramo. El runner usó por error el clon de QA visual desde dev. Comparación sólo lectura acreditó que la fuente estándar `pokemon_cards_test` tiene7cotizadas/20670cartas. Root retiró el clon/Redis de QA por marker/fullIDs/SQL0 e inició una única revalidación contextual sobre clon fresco de esa fuente estándar con las migraciones existentes aplicadas sólo al clon. Tests, timeouts y producto intactos durante esta corrección del runner; primera corrida preservada. **Segundo check estándar completo exit0:**414backend+13scripts+6e2e+549frontend=982pruebas, cero skips, lint/tipos y builds Nest/Next16.3.6Turbopack verdes. Corrida11/10 14:15:08→14:16:31UTC. No se atribuye ningún fix a los timeouts/socket históricos de otros lotes. Sin flags debilitantes ni sustitución de Turbopack. El cierre y los recursos finales se agregarán después de observar el resultado.

Capturas y recibos seguros: [LOCAL-APP-QA-evidencia](LOCAL-APP-QA-evidencia/). Backup, ownership y helpers privados permanecen fuera del repositorio. Las capturas prueban estados locales con datos sintéticos, no un despliegue ni un GO comercial.


## Cierre y acceso

La API compilada y Next standalone compilado quedaron intencionalmente vivos en http://localhost:3000, usando la base dev habitual migrada y Redis habitual. API health/ready200:DB,scanner,Redisready. HTML landing/login/buscar,manifest,SW yOG200; OG1200×630. Petición de login con encabezado de sesión correcto y cuenta inexistente:401«Credenciales inválidas»,sin500. Una petición manual previa sin ese encabezado dio403de seguridad, esperado; se corrigió el helper, no el producto. En navegador real sobre este stack final, buscarPikachu devolvió235resultados con imágenes renderizadas; captura `catalogo-final-compilado.jpg`.

Los dos clones y sus Redis fueron retirados por marker/owner/fullIDs ySQL0. Dev conserva22usuarios/22colecciones/69items/13shares/20670cartas/GIN5/13migraciones. Fuente estándar TEST intacta:2usuarios/3colecciones/2items/1share/20670cartas/7cotizadas/GIN5/11migraciones. Redis habitual healthy. Baseline previo a HTTP/navegador y comparación posterior:1270archivos de fuentes/outputs/recursos,1270intactos,0deltas. No es un manifiesto exhaustivo de todo el repositorio.

PIDs y recursos que se dejan vivos constan en `final-instance.json`:APIparent47336/pnpm47337,webparent47400. El runtime local usa cookies de desarrollo HTTP y tiene worker/crons y fetch externo de proveedores deshabilitados durante esta revisión; precios son datos existentes. No equivale a operación productiva ni a tener correo configurado. Al usar scripts dev normales, su configuración vuelve a depender de las env del proyecto.

Automatización existente PAUSED,intervalo2horas,conservados. Plan17/38sin nuevos IDs cerrados por estas capturas. Adquisición mantiene su evaluación específica y dominio externo pendientes; históricos fallidos preservados. No quedan agentes ejecutando ni recursos de QA; sólo la instancia local solicitada permanece viva.

## Capturas

- [Registro y catálogo móvil](LOCAL-APP-QA-evidencia/registro-catalogo-movil.png).
- [Sesión después de recargar](LOCAL-APP-QA-evidencia/sesion-recargada-movil.png).
- [Tema oscuro y ARS oficial](LOCAL-APP-QA-evidencia/ajustes-ars-oscuro.png).
- [Alta y edición de3copias,Holofoil,LP,intercambio](LOCAL-APP-QA-evidencia/edicion-3-copias.jpg).
- [Escaneo corregido antes de guardar](LOCAL-APP-QA-evidencia/escaner-carta-revisada.jpg).
- [Carta escaneada guardada](LOCAL-APP-QA-evidencia/coleccion-escaneada.jpg).
- [Colección compartida de sólo lectura](LOCAL-APP-QA-evidencia/compartida-activa.jpg).
- [Enlace revocado](LOCAL-APP-QA-evidencia/compartida-revocada.jpg).
- [Progreso por set](LOCAL-APP-QA-evidencia/progreso-set.jpg).
- [Nuevo login e inventario móvil](LOCAL-APP-QA-evidencia/login-inventario-movil.jpg).
- [Catálogo en instancia final compilada](LOCAL-APP-QA-evidencia/catalogo-final-compilado.jpg).
