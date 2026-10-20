# BE-05 — revisión y corrección de implementación

10 de octubre de 2026 UTC. Sol6.1 HIGH; reserva serial de backend y verificaciones focales. El recibo de Luna y sus cifras se conservaron como declaraciones del productor. Esta revisión aporta logs propios. No ejecutó validación global ni build estándar; BE07 previamente cerrado no se repitió.

La implementación corregida sirve de entrada backend al consumidor FE04. No acredita todavía UI, correo operativo, política de eliminación/backups ni cierre del ID: consolidación y gates posteriores corresponden a root.

## Correcciones y juicio contractual

| Área | Resultado revisado |
|---|---|
| Admisión | `202` espera sólo la cuota PG, no lookup/crypto/entrega. Ticket común previo al lookup, capacidad 32 y plazo fijo 2 s con reloj monotónico. Jobs detenidos también cuentan para limitar crecimiento. Ausencia, cuota de identidad, saturación y transporte incierto conservan respuesta genérica; no se acredita igualdad matemática de latencias. |
| Cuotas | Locks consultivos y reloj PG después del lock; 429 IP/global sin agregar hits, identidad silenciada sin extender el gap. Configuración/puerto general cerrado producen 503 antes del lookup. Configuración predeterminada no habilita SMTP. |
| Emisión y consumo | Usuario primero; relectura de versión, token y reloj dentro de la transacción. Tres enlaces activos sin evicción. Fallo de transporte conserva el commit porque no demuestra ausencia de recepción. Consumir un enlace recibido depende PG/HMAC/crypto, no de que el correo siga disponible. |
| Sesión | Login relee hash/versión bajo lock antes de emitir. Refresh comprueba vencimiento con reloj PG después del lock; versión antigua no revoca sesiones posteriores al reset. Copy corregido a “inválido o no vigente”. Reutilización de la versión actual conserva revocación. Guard por request consulta PG, rechaza payload no objeto con 401, falla PG con 503 y entrega contexto allowlisted. |
| HTTP/DTO | Normalización trim/lowercase antes de validar email; contraseña sin trim. Guard local JSON-only. JSON malformado se clasifica como INPUT_INVALID, sin confundir el texto del parser con validación de token. Códigos/campos seguros, no-store en errores, aliases slash final, cookie clear sólo tras commit; rutas ajenas delegan al filtro anterior. |
| Shutdown | Transacciones de admisión/emisión/handoff acotadas y timeouts SQL locales; no consultas de handoff libres fuera de esa cota. Abort y finally desreferencian secreto. Drain máximo 2100 ms señala deadline/cuarentena si quedan jobs: no finge cancelación del driver ni zeroización de strings. Runner exige settle real y cero conexiones antes de retirar DB. |
| Receptor privado | Factory reutilizable con URL exacta loopback, rol/owner, comentario/marcador único, fixtures exactas y listener 127.0.0.1 antes de payload. Sin constructor habilitado exportado ni endpoint de captura. Leases/maps, gates y never-resolve son cooperativos; copia negativa tardía opt-in con lease propio. caseGeneration cambia por teardown, nunca por reset de contraseña. |

Fuentes del contrato: [BE-05](BE-05-contrato-borrador.md), [revisión documental](BE-05-borrador-review.md), [UX-04](UX-04-cuenta.md), [sandbox](INF-01-correo-sandbox.md) y [cuenta NEG-03](NEG-03-cuenta-requisitos.md). Las dos migraciones nuevas, schema y espejo frontend recibidos quedaron intactos en esta corrección; las migraciones históricas tampoco cambiaron. No se amplió a salidas users ni frontend UI.

## Verificaciones observadas

| Ejecución | Resultado y límite |
|---|---|
| [recovery-final](BE-05-implementacion-review-anexos/recovery-final.log) | 24/24, cero skips en la matriz completa. HTTP, cuotas, dos tokens/mismo token, vencimiento esperando lock, rollback real por trigger propio, login/refresh/emisión durante reset, SQL bloqueado, entrega/reject/drop/never-resolve, leases/cancelación y shutdown real. |
| [guard/auth](BE-05-implementacion-review-anexos/focused-final.log) | 16/16 de guard y AuthService pasaron dentro de una corrida total 17/18; el caso unitario restante falló por verificar antes de settle/finally. Se conserva ese fallo y su corrección focal. |
| [drain corregido](BE-05-implementacion-review-anexos/drain-corrected.log) y [monotónico](BE-05-implementacion-review-anexos/monotonic-final.log) | 2/2 y luego 3/3 del archivo modificado. Doble de driver detenido acredita cuarentena; salto de Date.now no vence ticket monotónico. No acredita cancelación de un driver arbitrario. |
| [alias corregido](BE-05-implementacion-review-anexos/aliases-corrected.log) | Un caso focal con 400/403/JSON malformado/no-store en variantes slash final. [Intento previo](BE-05-implementacion-review-anexos/aliases-final.log) esperaba 403 con DTO inválido: ValidationPipe produjo correctamente 400 antes del handler. Fixture corregida, sin cambio de producto por ese fallo. |
| [transporte posterior](BE-05-implementacion-review-anexos/transport-after-final.log) | Un caso nuevo focal: error después del handoff conserva enlace recibido y éste consume con 200. Los tests excluidos por `-t` figuran skipped en estos logs; no son omisiones de la matriz completa ni se suman como pruebas. |
| [sesión loopback](BE-05-implementacion-review-anexos/session-loopback-final.log) | 2/2; listener explícito privado antes de payload. Preservada también ejecución anterior de esos dos casos. |
| [lint](BE-05-implementacion-review-anexos/lint-delivery-final.log), [sesión lint](BE-05-implementacion-review-anexos/lint-session-final.log), [schema](BE-05-implementacion-review-anexos/schema-final.log) | Exit 0; lint type-aware focal, Prisma validate. Generate y migrate deploy sólo en clon propio también exit 0. |
| [typecheck](BE-05-implementacion-review-anexos/types-delivery-final.log) | Exit 2: siete diagnósticos en archivos ajenos, mismos que al inicio; sin diagnósticos BE05. No se acredita typecheck completo verde ni ejecución del baseline histórico. |

Son 46 casos distintos acreditados por ejecuciones focales (16 guard/auth + 3 admisión/drain + 2 sesión + 25 recuperación), no una única corrida global. La matriz de 24 precede al delta monotónico y al caso posterior al handoff; éstos se verificaron específicamente sin repetir verdes sin cambio. El control alias amplía un caso existente y no agrega al conteo.

El caso de entrega tardía conserva el mismo caseGeneration, prepara primero un enlace válido, espera 60,1 s reales para el segundo pedido y resetea con el primero mientras el segundo handoff está pendiente. PostgreSQL rechaza el enlace tardío. Otras fixtures SQL de tokens/cuota/expiry están declaradas en el test y no acreditan emisión por sí solas. Los asserts de secretos usan booleanos; no se guardaron tokens, JWT, contraseñas o cuerpos runtime en logs/reportes.

## Preservación y limpieza

[Manifest recibido](BE-05-implementacion-review-anexos/received-sha256.json): 33 copias previas a correcciones, con SHA-256; los 24 hashes publicados por Luna coincidían. Copias originales intactas en `/private/tmp/be05-review-2af1fb6f7757/received/`, también trasladadas al anexo. El [manifest 501](BE-05-implementacion-review-anexos/source501-received.json) se reconstruyó después de las primeras correcciones superponiendo hashes recibidos sobre los paths originales: no es una captura completa anterior al primer edit. El baseline histórico `/private/tmp/be05-baseline-20261009` y recibo root permanecen intactos. No se atribuye un diff histórico a las cuatro docs sin copias en aquel baseline.

[Ownership](BE-05-implementacion-review-anexos/ownership.json): clon único `be05_review_2af1fb6f7757_test`, marker/comment exactos y rol pokemon. Migrate deploy aplicó únicamente las dos migraciones aditivas propias; 13 migraciones y cinco GIN en el clon. Cleanup verificó ID completo de PG, owner/marcador y cero conexiones antes del DROP exacto. `liveResources=[]`, marker retirado; no se creó Redis.

[Runtime final](BE-05-implementacion-review-anexos/recovery-final-runtime.json): jobs/tickets/maps/leases/esperas cero, sin cuarentena ni deadline excedido; SQL activo/idle-in-transaction cero y fixtures auth/hits cero. [Control de cleanup](BE-05-implementacion-review-anexos/cleanup-observed.json): cuatro PIDs privados ausentes, puertos 3000/3001 libres. Conteos acotados dev/TEST e IDs/health PG/Redis iguales antes/después; cinco identidades GIN compartidas iguales inmediatamente antes/después de retirar el clon. Esto no equivale a snapshot de todas las filas.

El [JSON de revisión](BE-05-implementacion-review-evidencia.json) enlaza hashes finales, diff contra recepción, controles de scope, logs y scripts. Persisten las limitaciones operativas: correo real no configurado, runtime FE04 pendiente, full typecheck con errores ajenos y global/build no ejecutados en esta fase. TTL configurable conserva fechas persistidas; no se midió máximo histórico de JWT. Eliminación, restauración/backups y retención no reciben aquí una política inventada.
