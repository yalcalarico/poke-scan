# INF-01 — Revisión y resolución del handoff técnico

Fecha: 2026-10-07 · Revisor: GPT-6.1 Sol HIGH · Estado: **preparación revisada; contrato local resuelto para implementar**. Elección comercial, despliegue y gate integrado del lote pendientes.

Se acepta la comparación como preparación, con las correcciones aplicadas a [INF-01-entorno](INF-01-entorno.md). No hay host de producción elegido ni medición Linux nueva. El handoff alcanza para implementar BE-03 localmente y luego preparar INF-02; no exige esperar presupuesto, dominio o compra. Se revisaron documentos, fuentes primarias, código y cuentas de archivos; sin tests, stack, DB/Redis, inferencia, descarga ni benchmark.

## Correcciones verificadas

| Punto | Resultado de revisión |
|---|---|
| Docker | La denegación del socket ocurrió en la lectura de Luna. El coordinador confirmó posteriormente daemon `29.8.2` con `docker version --format '{{.Server.Version}}'` y lectura autorizada. Esta evidencia es del coordinador; este revisor no repitió la consulta. Habilita futuros tests aislados; no acredita imagen válida ni requiere dato humano adicional. |
| Bytes del índice | Revalidados por stat/lectura de summaries y metadata: 176 JSONL suman 172,481,778 bytes. El spike raíz de 8,072 bytes queda fuera del runtime cuando hay colecciones (`scanner-visual-index.mjs:47-48`). 175 JSONL efectivos + 175 metadata de 48,650 bytes suman **172,522,356 bytes = 164.5301 MiB**. Modelo + índice efectivo: **196,969,056 bytes = 187.8443 MiB**, sin scripts/librerías nativas. |
| Referencias cacheadas | Árbol completo: 21,209 archivos y 15,226,013,850 bytes = 14.1803 GiB. Las 20,670 referencias `.image` suman 15,053,276,655 bytes = 14.0195 GiB. Son imágenes del catálogo innecesarias para inferencia, no fotos privadas nuevas. Se leyeron nombres/tamaños, no imágenes. |
| Conteo/compatibilidad | Los 175 summaries suman `indexed=20,670`; las 175 metadata anuncian mismos revision/precision/dimensions/preprocessingHash/modelHash. Esto verifica campos declarados, **no** vectores, cobertura, duplicados ni número de referencias efectivas. El hash ONNX es evidencia de Luna; el revisor no lo recalculó/cargó. El conteo esperado debe quedar en un manifiesto por versión, sin fijar 20,670 como única versión admisible. |
| Memoria/rendimiento | Reportes del 6/10 respaldan RSS máximo observado 396.1 MiB, frío 1,712.4 ms y p95 caliente 112.5 ms. Siguen siendo Mac/M1 Pro y muestreo; no acreditan imagen Linux ni capacidad pública. 4 vCPU/16 GiB/160 GB es holgura para cotizar, no mínimo demostrado. GiB/MiB locales no equivalen a GB/MB anunciados por proveedores. |
| Warmup | Se eliminó la imagen sintética: inicialización IPC en el mismo worker, sin embedding, por generación y con recuperación fuera del probe. No agrega otra vía de reconocimiento. |
| Autorización de pruebas | Pruebas/mediciones locales aisladas ya autorizadas: avisar al coordinador para serializar, sin otra aprobación por benchmark local. Contratación, despliegue externo y compra siguen pendientes de autorización aplicable. |
| Mailtrap | Free 50 mensajes/mes, un sandbox y diez retenidos respaldados. «Sin sandbox email address» no equivale a «sin credenciales SMTP»; se corrigió la confusión y el link de marketing. Sin cuenta ni correo enviado. |

Las cuentas binarias usan divisor 1,048,576 para MiB y 1,073,741,824 para GiB. No se ejecutó validador de vectores ni se declaró manifiesto ya producido.

## Fuentes primarias revalidadas el 7/10/2026

**Hetzner:** la tabla efectiva 15/6 identifica CX43 a **USD 18.49/mes** sin IPv4/IVA; USD 22.99 corresponde a CPX22. `regular-performance` no enumera CX43; se cambió por `cost-optimized`, con 8 vCPU/16 GB/160 GB y 20 TB en EU. La página muestra disponibilidad pendiente de confirmación; no prometer stock, precio final o región argentina. [Tabla oficial](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/), [CX43](https://www.hetzner.com/cloud/cost-optimized/).

**Render:** planes/tamaños y suma revalidados: 25 + 7 + 135 + 40 + 10 + 10 × 0.25 = **USD 219.50/mes**. Es subtotal de los recursos elegidos, no TCO ni mínimo probado. Conservar variables para almacenamiento PostgreSQL adicional, egreso, backups, dominio y operación. La página abierta inicialmente omitió tablas dinámicas; búsqueda sobre el mismo dominio devolvió el listado oficial, contrastado con compute-plans y documentación workspace. Hobby actual: 5 GB de egreso incluido, luego USD 0.15/GB. [Precios](https://render.com/pricing), [compute-plans](https://render.com/docs/compute-plans), [workspace](https://render.com/docs/new-workspace-plans), [egreso](https://render.com/docs/outbound-bandwidth).

**Free/región:** filesystem efímero, suspensión, horas compartidas y vencimiento Postgres justifican descartar Free para continuidad. No se probó que 20,670 referencias por sí solas lo vuelvan incompatible con CPU/RAM. Regiones sin Argentina/Brasil. [Límites](https://render.com/docs/free), [regiones](https://render.com/docs/regions).

**Tunnel:** disponibilidad en todos los planes, egress TCP/UDP 7844 y cuatro conexiones a al menos dos centros. Es redundancia de cloudflared, no de host/energía/ISP/DINOv2. No asumir que Tunnel retira automáticamente un origen no listo. [Producto](https://developers.cloudflare.com/tunnel/), [configuración](https://developers.cloudflare.com/tunnel/configuration/).

**ONNX/Mailtrap:** CPU ONNX incluye Linux x64/arm64 sin certificar musl/Alpine/conjunto nativo actual. Mailtrap documenta credenciales SMTP para Sandbox y los límites Free. [ONNX Node](https://onnxruntime.ai/docs/get-started/with-javascript/node.html), [Mailtrap precios](https://mailtrap.io/pricing/), [SMTP Sandbox](https://docs.mailtrap.io/email-sandbox/setup/sandbox-smtp-integration).

## Contrato local resuelto para BE-03/INF-02

[BE-03-review](BE-03-review.md) prevalece sobre alternativas abiertas de preflights: health intacto; ready 200/503 con estados seguros; Redis informativo; cliente DB de salud con límites Prisma 6/servidor; scanner inicializa sin embedding y recupera automáticamente por generación. DTO público nuevo espejado mínimamente en `frontend/types/api.ts`, sin UI.

Una instancia local y gateway de una origin: `/api/*` a Nest preservando prefijo, resto a Next. No requiere proveedor/hostname definitivo. El piloto de escaneo exige `SCANNER_VISUAL_ENABLED=1` y artefactos válidos; disabled sólo acredita API general, no ese piloto.

Consumidor futuro: gateway consulta readiness internamente cada 10 s, timeout 5 s, tres fallos para retirar backend y un éxito para reincorporar. No configurar los 503 busy del POST como fallo global mediante chequeo pasivo. **Esperar un primer ready antes de admitir tráfico al iniciar gateway/despliegue**: chequeos periódicos solos no prueban gate frío. INF-02 comprueba retirada/reincorporación en stack aislado. Caddy soporta health_uri/interval/timeout/fails/passes; todavía no se implementó esa configuración. [Caddy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#active-health-checks).

Docker liveness conserva 30 s/5 s/20 s de gracia/tres fallos. Redis/busy no provocan restart. Prisma conserva fail-fast: sin listener nunca está ready; `unless-stopped` puede reiniciar un proceso que salió. Docker unhealthy por sí solo no significa restart automático. Inicialización visual no bloquea listener; el servicio no admite inferencia mientras esa generación inicializa. Crash/cancelación programa reemplazo sin request/probe.

INF-02 incluye modelo + pares JSONL/metadata **del manifiesto seleccionado**, inmutables/read-only durante la generación. No copiar referencias, backups históricos, summaries como certificados, locks, fotos o secretos. Cambiar versión/reiniciar/validar para actualizar. Probar arquitectura/libc y dependencias nativas en imagen aislada; Debian/glibc es candidato, no migración ya demostrada necesaria. Preservar Node/Prisma y versiones.

El coordinador puede reservar ahora **Luna para implementar BE-03**, con pruebas enfocadas serializadas y revisión/corrección Sol HIGH. Después INF-02 integra packaging/gateway/runtime aislado; INF-03 prueba backup/restore descartable. Check global sólo al cierre del lote. Hosting productivo y compra/despliegue continúan pendientes del dueño; no se afirma INF-01 o BE-03 completos.
