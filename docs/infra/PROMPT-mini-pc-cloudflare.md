# Prompt futuro — validar y configurar PokéScan en mini PC

Revisión: **20/10/2026**. **Preparación COMPLETADA; ejecución real diferida al final.**
El usuario todavía no tiene el equipo. Este documento no inicia instalación,
publicación ni cuentas, y no cierra INF-01/03/04 o SEO por preparación documental.

- [x] Prompt, decisiones y preparación local entregados.
- [x] Packaging, backups/restore, custodia, transferencia y calendario ensayados localmente.
- [ ] Equipo real, compatibilidad/DINOv2, instalación, consumo y recuperación medidos.
- [ ] Dominio/Tunnel/HTTPS, Resend/B2, custodia, monitoreo y operación reales.

## Configuración de referencia al retomar

| Tema | Decisión/implementación que debe conservarse |
|---|---|
| Hosting | Mini PC propia + Cloudflare Tunnel. El túnel no ejecuta DINOv2 ni asegura uptime del equipo. |
| Correo | Resend Free previsto; adaptador simulado aceptado. Cuenta, dominio/remitente y envíos reales al final. [Guía](resend-recovery.md). |
| Backups | Backblaze B2 previsto; identidad privada age en bóveda del dueño y recuperación cifrada separada. Máximo 30 días desde creación original. No renovar fecha al copiar/restaurar. |
| Bajas/restore | Registro independiente de bajas; comprobar/aplicar antes de tráfico restaurado y fallar cerrado sin cobertura. Conservarlo hasta comprobar que no hay copias restaurables afectadas. |
| TCGdex | Ciclo diario **03:15 UTC**, resumidor cada 15 min y recuperación al arrancar después del corte; cola y gate durable 2,3 s. `ENABLE_PRICE_BACKFILL_CRON` + `PRICE_QUEUE_ENABLED`. |
| TCGCSV | Ciclo diario **21:00 UTC**, resumidor cada 15 min y discovery cada 10 min. `ENABLE_TCGCSV_INGESTION=true` tras el gate/autorización propios. Validar `last-updated.txt`/build y una descarga por archivo de precios cada 24 h. Sin antiguos topes 40 grupos/500 requests/lotes de diez; mantener serialización, leases, identidad segura y pausas 429. |
| Alcance diario | `price_sync_sets`: semilla curada + sets de colecciones, prioridad/habilitación explícitas. No barrido horario del catálogo entero. |
| Históricos | Migrar observaciones, controles diarios, señales, leases, cuotas por archivo, mappings y registro sin resetear fechas. No inventar días ausentes ni mezclar referencia activa y comparación. |
| Comandos | Con API encendida: `pnpm run prices:sync`, `pnpm run prices:status --watch`, `pnpm run prices:sets`. Ctrl+C cierra la vista, no los jobs. |

Aplicar las migraciones existentes según el repositorio del momento, con respaldo
y ensayo propios; no fijar un número histórico de migraciones. El calendario,
correo, bajas y demás jobs conservan sus flags y gates: copiar configuración de
desarrollo no autoriza activar operación real.

## Entregas locales para reutilizar

- [Runtime/packaging](../plans/lanzamiento-2026-10-07/RESULTADOS/INF-02-runtime-review.md),
  [gate operación](../plans/lanzamiento-2026-10-07/RESULTADOS/LOTE-OPERACION-validacion.md)
  y [paquete de custodia](../plans/lanzamiento-2026-10-07/RESULTADOS/INF-02-custodia-paquete-validacion.md).
- [Retención](../plans/lanzamiento-2026-10-07/RESULTADOS/INF-03-retencion-validacion.md),
  [custodia](../plans/lanzamiento-2026-10-07/RESULTADOS/INF-03-custodia-validacion.md),
  [ack de bajas](../plans/lanzamiento-2026-10-07/RESULTADOS/INF-03-bajas-custodia-validacion.md),
  [transferencia](../plans/lanzamiento-2026-10-07/RESULTADOS/INF-03-transferencia-validacion.md)
  y [calendario](../plans/lanzamiento-2026-10-07/RESULTADOS/INF-03-calendario-validacion.md).
- [Runbooks y scripts INF-03](../../infra/inf03/README.md),
  [calendario](../../infra/inf03/SCHEDULE.md) y
  [cierre de precios diarios](../plans/precios-diarios-priorizados-2026-10-18-estado.md).

Los ensayos de Linux/ARM64 y dependencias cacheadas no acreditan full build frío
desde cero, ABI del equipo final, B2/off-host, pérdida eléctrica ni uptime.
No copiar claves, helpers privados ni recursos efímeros del Mac. El monitor local
loopback no equivale a monitor externo. Las versiones anteriores del prompt se
[recuperan desde Git](../archive/README.md).

## Prompt para usar cuando exista el equipo

Actuá como responsable de infraestructura y QA de PokéScan. Ya elegí mini PC propia + Cloudflare Tunnel. Quiero validar el equipo real y preparar su configuración conservando la arquitectura del proyecto. Avanzá por etapas: completá la etapa autorizada, entregá evidencia, decime cuál sigue y preguntame si quiero continuar. Al activar este prompt empezá solamente por la etapa 1.

Datos disponibles al retomar (completar lo conocido; no pegar secretos):

- Mini PC: [marca/modelo, CPU/arquitectura, RAM, almacenamiento y espacio libre].
- Sistema operativo: [distribución/versión o sistema actual].
- Acceso autorizado al equipo: [local o mecanismo remoto disponible].
- Red y operación: [conectividad, horario esperado, cortes/UPS y responsable].
- Dominio y cuenta Cloudflare: [disponibles / pendientes].
- Presupuesto, cuenta B2 y medios de custodia fuera del equipo: [disponibles / pendientes]. El destino B2 y el custodio (dueño) ya fueron elegidos.

Leé primero AGENTS.md, docs/agent-workflow.md, docs/estado-actual.md y el registro/checklist/decisiones de docs/plans/lanzamiento-2026-10-07/. Los checkpoints anteriores están archivados y no son órdenes vigentes. Reutilizá INF-01-entorno.md, INF-02-runtime-review.md, LOTE-OPERACION-validacion.md, INF-03-local-review.md e INF-04-operacion.md en RESULTADOS/. Verificá las rutas y scripts vigentes; no des por existentes helpers temporales ni uses PIDs de recibos antiguos sin comprobarlos. Los hechos y permisos del momento mandan sobre este prompt.

1. **Diagnóstico del equipo.** Inspeccioná sólo el equipo identificado y autorizado; no confundas la Mac de desarrollo con la mini PC. Comprobá CPU/arquitectura, RAM, disco, sistema/libc, runtime nativo y conectividad. Sin acceso, solicitá únicamente los datos imprescindibles. No instales, formatees ni publiques en esta etapa. Entregá compatibilidad probable, carencias y plan de validación; los tamaños históricos son hipótesis, no mínimos demostrados. Antes de continuar preguntame por la etapa 2.

2. **Preparación y validación local, cuando la autorice.** Reutilizá el packaging INF-02 y los scripts existentes, adaptando sólo lo necesario al equipo. Conservá Next/Nest/Prisma/PostgreSQL/Redis y DINOv2 local; verificá versiones en los manifiestos, pnpm y dependencias nativas reales. Modelo/índice compatibles, versionados y read-only; fotos de consulta sin persistencia. Usá datos sintéticos y recursos propios identificados, separados de dev/TEST/Redis compartidos. Medí warmup, inferencia, latencia y consumo del conjunto, incluido el worker; no extrapoles los resultados de la Mac. Probá API/SSR, registro/login, colecciones/compartir y reinicio/recuperación. Entregá resultados de las pruebas pertinentes y sus límites, sin tomar ni enviar capturas de pantalla. Si cambia producto, focales y stop/check estándar del proyecto al cierre del lote, en entorno aislado y serial; no repitas suites verdes intactas para obtener otro recibo. Verificá identidad antes de detener procesos y conservá/restaurá la instancia del usuario según su instrucción vigente. Limpieza por ownership.

3. **Preparación de publicación, cuando la autorice.** Consultá documentación oficial actual de Cloudflare. Prepará configuración revisable: un origen HTTPS, gateway con /api hacia Nest y resto hacia Next; cookies Secure/HttpOnly, orígenes exactos, PostgreSQL/Redis internos y métricas privadas. Secretos fuera de Git y evidencias. Definí inicio tras reinicio, actualización/rollback, monitoreo y backup cifrado fuera del equipo con ensayo de restore aislado. INF-04 actual observa loopback: no lo presentes como monitor externo; indicá la cobertura adicional necesaria. No inventes dominio, proveedor de correo, retención, presupuesto, uptime ni GO comercial. Mostrame la configuración y pedí autorización concreta antes de crear recursos externos, cambiar DNS o activar el túnel público; respetá autorizaciones explícitas ya recibidas.

4. **Publicación y aceptación, sólo con autorización aplicable.** Aplicá la configuración aprobada, verificá HTTPS y flujos reales desde fuera de la red, con datos de prueba propios. Comprobá límites, sesiones, recuperación, privacidad, caída/reinicio y rollback. Correo externo sólo si está configurado y autorizado. Identificá fallos, cleanup y recursos intencionalmente vivos. Cerrá únicamente las partes de INF-01/INF-03/INF-04 y dominio efectivamente acreditadas.

Durante todas las etapas: preservá dirty tree y evidencias; sin reset/stash/commit, upgrades, DB reset, FLUSHDB compartido ni migraciones destructivas. No actives proveedores/sync para probar: respetá cola, cachés y límites. No generes capturas, trazas ni videos para evidencias; no guardes credenciales, enlaces de recuperación, fotos ni datos personales en logs. Conservá DTO espejo, ESM .js, índices GIN, ownership404 y DINOv2 exclusivo. Delegación proporcional según la política vigente, recursos y escritores serializados; no cambies la automatización PAUSED/dos horas. No repitas diagnósticos históricos sin evidencia nueva.

Al terminar cada etapa entregá: resultado, evidencia, cambios, pendientes y próximo paso. Preguntame si avanzamos y esperá mi respuesta.
