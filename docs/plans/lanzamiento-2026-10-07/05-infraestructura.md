# Plan de Infraestructura

Fecha: 2026-10-07 · Estado: preparación técnica revisada; packaging/backup/runtime pendientes · IA objetivo: Codex con criterio de operación.

## Objetivo

Preparar runtime, recuperación y observabilidad con el stack existente y costo medible.

## Alcance y fronteras

**Incluye:** Dockerfiles, .dockerignore, Compose, scripts operativos, configuración, backups, probes, despliegue controlado y documentación. Hosting/Cloudflare solo cuando el alcance esté autorizado.

**Fuera de alcance:** Handlers Nest, DTOs y schema Prisma, cambios de modelo DINOv2, Next framework migration, copy/SEO, compra de hardware/planes o publicación externa automática.

Leé [el índice](README.md), [las decisiones](10-decisiones-y-contratos.md) y AGENTS.md antes de ejecutar. Elegí una sola tarea por entrega; los gates no se satisfacen por pasar el tiempo.

## Evidencia de partida

- [backend/Dockerfile](../../../backend/Dockerfile)

- [backend/.dockerignore](../../../backend/.dockerignore)

- [frontend/Dockerfile](../../../frontend/Dockerfile)

- [docker-compose.yml](../../../docker-compose.yml)

- [.github/workflows/security-check.yml](../../../.github/workflows/security-check.yml)

- [docs/security.md](../../../docs/security.md)

- [backend/scripts/scanner-visual-worker.mjs](../../../backend/scripts/scanner-visual-worker.mjs)

- [backend/src/modules/cards/visual-identify.service.ts](../../../backend/src/modules/cards/visual-identify.service.ts)


La evidencia es estática al 7/10 o documentada con su fecha. Revalidá código y cambios locales antes de actuar; no atribuyas a esta planificación tests, mediciones o entrevistas nuevas.

## Tareas delegables


### INF-01 — Elegir entorno y presupuesto sin contratar

Estado: Propuesta técnica revisada; elección comercial/host pendiente · Prioridad: P0 · Estimación orientativa: 4–8 h.

**Dependencias/entradas:** RES-04 fuentes puede alimentar; DEC-06.

**Trabajo:** Comparar entorno gratuito, mini PC+Tunnel, plataforma administrada y VPS autogestionado. Inventariar host/hardware/conectividad/RAM actuales sin secretos. Cotizar fuente oficial y fecha; medir requisitos ONNX/Node, storage y red en entorno candidato. Elegir arquitectura mínima, mismo sitio HTTPS para cookies y presupuesto. Identificar proveedor de correo de prueba, sin enviar correo real.

**Aceptación:** ADR declara supuesto frente a medición, TCO (hardware/amortización/UPS/kWh/Internet/backups/horas), región y límites; no trata Tunnel como inferencia/uptime. Sin compra ni migración Next/Prisma. Si falta host, entregar comparación y DEC-06 sin fingir deploy probado.

**Entregable:** RESULTADOS/INF-01-entorno.md y configuración requerida para INF-02/BE-03.



**Fase técnica 7/10:** [INF-01 revisado](RESULTADOS/INF-01-review.md), comparación/TCO y handoff local aceptados Sol HIGH. No acredita host elegido, compra ni deployment.

**Correo local, preparación 9/10 aceptada:** [handoff sandbox](RESULTADOS/INF-01-correo-sandbox.md), [revisión Sol HIGH](RESULTADOS/INF-01-correo-sandbox-review.md) y [aceptación root](RESULTADOS/INF-01-correo-sandbox-aceptacion-root.json):12fuentes/20enlaces/9hashes corroborados antes de consolidar centrales. Adaptador en proceso/receptor fixture sin SMTP externo, memoria y cancelación acotadas, generación del harness separada de reset PG y guardas/admisión/evidencia segura. Es propuesta de implementación/ensayo BE-05 después del gate BE-07, no sandbox funcional ni correo configurado. Mailtrap previo queda como antecedente no activado; proveedor/remitente/dominio/retención externos y host/presupuesto siguen pendientes. ID INF-01 abierto.

### INF-02 — Empaquetar DINOv2 y probar imagen aislada

Estado: Completada localmente; packaging/runtime y [gate operación](RESULTADOS/LOTE-OPERACION-validacion.md) aprobados Luna/Sol HIGH · Prioridad: P0 · Estimación orientativa: 12–22 h.

**Dependencias/entradas:** INF-01; BE-03 para readiness final.

**Trabajo:** Copiar scripts runtime y módulos necesarios, fijar pnpm en ambos Dockerfiles, pasar flags/rutas y proveer modelo/índice versionados con checksum y permisos de lectura. Decidir imagen vs montaje read-only; excluir referencias, fotos y artefactos innecesarios del contexto Docker. Verificar ONNX nativo en base elegida; reemplazar base solo si evidencia. Conservar puertos/credenciales de desarrollo y no tocar stack existente para smoke.

**Aceptación:** Build limpio reproducible; imagen non-root arranca en servicios aislados y reconoce fixture autenticado sin precios ni descarga de modelo. Reinicio mantiene artefactos; falta de índice se observa en readiness. No incluir fotos, secretos ni directorio de referencias gigante. Config pública/privada HTTPS no rompe refresh cookie.

**Entregable:** Packaging, compose/config y reporte de build/runtime con arquitectura del host y checksums; runbook.



**Preparación 7/10:** [INF-02 preflight revisado](RESULTADOS/INF-02-review.md). BE-03 y FE-08 revisadas habilitan packaging serial. [Runtime final](RESULTADOS/INF-02-runtime-review.md) entregado/revisado/corregido: 43 suite +2 adicionales, DINOv2 completo y fixture/auth/SSR/gates/cleanup reales. Fase aceptada, sin cierre de ID/lote hasta gate integrado. Reserva y cleanup en [estado de coordinación](RESULTADOS/ORQUESTACION-ESTADO.md).

### INF-03 — Backup externo y restauración ensayada

Estado: Fase local y gate técnico aprobados Sol HIGH:backup/restore/16negativospreSQL/28checks APIweb/cleanup. Off-host/operación pendientes, ID parcial · Prioridad: P0 · Estimación orientativa: 6–12 h.

**Dependencias/entradas:** INF-01; entorno descartable.

**Trabajo:** Definir copia cifrada de DB y configuración recuperable; modelo/índice regenerables o versionados según costo. Elegir destino fuera del host y política de retención; no tratar volumen Docker como backup. Scripts con guardas para restore solo en DB de prueba nombrada explícitamente, secretos por env y red restringida.

**Aceptación:** Restaurar en entorno vacío conserva schema, pg_trgm, colecciones, cantidades y links de fixtures. Registrar tiempo y punto restaurado. Objetivos iniciales RPO ≤24h/RTO ≤4h son metas, no garantías hasta medir; alertar copia fallida. Nunca restaurar sobre dev/producción para validar.

**Entregable:** Runbook y scripts de backup/restore; evidencia anonimizada y resultados RPO/RTO.



**Preparación 7/10:** [INF-03 revisión](RESULTADOS/INF-03-review.md), aislamiento y verificación completa antes de SQL. Destino externo es una única pregunta pendiente registrada en el preflight; simulación local no acredita recuperación off-host.

**Revisión local parcial 8/10:** [informe Sol HIGH](RESULTADOS/INF-03-local-review.md), scripts/runbook corregidos;22 checks offline,11 migraciones/checksums y33 constraints public. Recursos propios retirados, stack dev intacto. Nuevos negativos age/recorrido integrado pendientes: consulta/descarga oficial bloqueada por auto-review y autorización humana solicitada. Sin check global ni cierre de ID.

**Actualización 8/10 tras autorización:** usuario autorizó descarga age oficial; [revisión final](RESULTADOS/INF-03-local-review.md) acepta runbeb6f1226ff2,1positivo/16negativospreSQL,0restoresprevalidación,2total (fallo SQLcontrolado+positivo),5chunks/EOF,11checksums/5GIN/33constraints public/fixtures ycleanup. El bloqueo previo se resolvió. Gate API/web restaurados y global en curso con reserva Sol HIGH separada; off-host sin configurar.

**Cierre local del lote, 8/10:** [gate operación](RESULTADOS/LOTE-OPERACION-validacion.md)
aprobado:854 pruebas globales,50 infra y28 comprobaciones API/web sobre datos
restaurados, con cleanup. INF-02 completada localmente; INF-01/INF-03 conservan
elección de host/off-host y operación pendientes. No despliegue ni RPO/RTO acreditados.

### INF-04 — Monitoreo y recuperación operativa

Estado: Fase local funcional aceptada root: [monitor/15focales/1011global/22integradas/cleanup](RESULTADOS/INF-04-operacion.md); ID parcial por uptime externo, carga/consumo/presupuesto en host objetivo · Prioridad: P1 · Estimación orientativa: 6–12 h.

**Dependencias/entradas:** BE-03, BE-06; INF-02/03.

**Trabajo:** Configurar probes/alertas usando contratos backend; proteger monitoreo. Observar uptime externo, readiness, memoria/CPU, ocupado/error, cola/edad, feed y backup. Probar interrupciones solo en sandbox: DB, Redis, worker y reinicio. Medir costo y latencia/RSS prolongados en host objetivo con carga acotada sin precios externos.

**Aceptación:** Alerta lleva a una acción documentada; sin credenciales/fotos/PII. Fallo de Redis no mata backend; readiness bloquea servicio no listo. Carga separa éxitos/rechazos, frío/caliente y HTTP; no extrapolar hardware dev a mini PC. Presupuesto revisado con consumo real.

**Entregable:** RESULTADOS/INF-04-operacion.md, dashboards/alertas o configuración reproducible; deployment público requiere autorización específica.


## Prompt refinado con Lyra

Modo BÁSICO: contexto preservado, scope cerrado, dependencias y aceptación explícitos. No se requiere una segunda optimización para comenzar. Sustituí únicamente el ID; los demás insumos están en los documentos.

```text

Actuá como especialista de Infraestructura para PokéScan. Ejecutá solamente [ID_DE_TAREA] del archivo docs/plans/lanzamiento-2026-10-07/05-infraestructura.md.

Leé primero README.md y 10-decisiones-y-contratos.md de esa carpeta, AGENTS.md raíz y las instrucciones de la carpeta que vas a tocar. Inspeccioná el estado real y los cambios locales: no sobrescribas trabajo ajeno ni reimplementes funcionalidades existentes.

Tu alcance es: Dockerfiles, .dockerignore, Compose, scripts operativos, configuración, backups, probes, despliegue controlado y documentación. Hosting/Cloudflare solo cuando el alcance esté autorizado.
No incluye: Handlers Nest, DTOs y schema Prisma, cambios de modelo DINOv2, Next framework migration, copy/SEO, compra de hardware/planes o publicación externa automática.

Comprobá las dependencias del ID. Si falta una, hacé solo preparación independiente, documentá la entrada faltante y dejá la tarea pendiente; no inventes contratos/resultados ni expandas scope. Una decisión comercial/externa no se reemplaza por tiempo transcurrido.

Respetá versiones/pnpm, DINOv2 exclusivo, fotos de consulta no persistidas y límites/cola/caché de fuentes. No reveles secretos ni datos personales. No mandes mensajes, publiques, cobres o contrates servicios salvo autorización humana explícita aplicable a esa acción.

Entregá los cambios/artefactos concretos del ID, referencias, criterio de aceptación verificado, pruebas/mediciones realmente ejecutadas y límites pendientes. Por corrección explícita del usuario, cada tarea requiere pruebas enfocadas y revisión/corrección Sol HIGH, con pnpm run stop antes de tests. Al finalizar el lote asignado por 11-orquestacion.md se ejecutan pnpm run check global y flujo real aislado/limpieza cuando afecta datos; no repetir global por tarea. Investigación/diseño sin código validan fuentes/enlaces/estados y no afirman check verde. Entregá artefacto/evidencia al coordinador, único escritor de REGISTRO-TAREAS.md y estados de los planes. No cierres tareas de otras áreas ni avances un lote con gate pendiente/fallido.

```


**Qué refinó Lyra:** separó responsabilidades, transformó mejoras generales en entregables observables, distinguió hipótesis de hechos y agregó gates para evitar construir Pro o marketplace sin evidencia.


**Consejo de uso:** delegá el ID y su plan completo; no copies solamente el título. Entregá dependencias resueltas y registrá cualquier cambio de contrato antes de implementar.
