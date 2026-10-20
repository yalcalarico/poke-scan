# INF-02 — Preflight de empaquetado local

Fecha: 2026-10-07 · Responsable: GPT-6 Luna · Revisión/correcciones: GPT-6.1 Sol HIGH · Estado: **preflight revisado; construcción y runtime todavía no ejecutados**. Ver [INF-02-review](INF-02-review.md).

## Propósito y límites

Este informe prepara la imagen aislada de DINOv2, identifica el contenido mínimo y define un smoke local. No modifica Dockerfiles, Compose, código, paquetes, artefactos ni documentación fuera de esta reserva. No creó una imagen ni arrancó, detuvo, descargó o borró contenedores. No corrió tests, migraciones, consultas DB/Redis, indexación, inferencia ni benchmarks.

La decisión comercial de INF-01 sigue pendiente; esta fase no elige hosting. La revisión técnica INF-01 está aceptada en [INF-01-review](INF-01-review.md), y el contrato de infraestructura de [BE-03-review](BE-03-review.md) está resuelto. BE-03 implementación está activa; este preflight define lo que INF-02 debe entregar y no afirma que la implementación o una imagen ya funcionen. La preparación local de construcción requiere su reserva de fase.

## Inventario de solo lectura

| Dato | Observación | Alcance |
|---|---|---|
| Docker | Cliente 29.8.2, servidor 29.8.2; daemon Linux/aarch64 | Consultado mediante comandos de metadatos aprobados. No se inspeccionaron variables de entorno ni secretos. |
| Contenedores activos | pokemon-scanner-db (postgres:16-alpine) y pokemon-scanner-redis (redis:7-alpine), ambos healthy; host ports 55432 y 6379 ligados a loopback | Ya estaban levantados. Quedan intactos y fuera del smoke de INF-02. No se encontró contenedor PokéScan API/web. |
| Imágenes Docker | Hay node:22-alpine, Postgres y Redis; no hay imágenes pokemon-scanner-backend o pokemon-scanner-frontend | Inventario por nombre/tamaño. No se inspeccionó filesystem interno de imágenes. |
| Runtime local | Node 22.20.0, pnpm 10.17.1, Mac Apple M1 Pro ARM64, 16 GiB RAM | Evidencia del host de desarrollo, no del contenedor Linux. El engine Docker informado es linux/aarch64; el primer build local debería probar ARM64 nativo. |
| Dependencias nativas backend | onnxruntime-node 1.30.0 y sharp 0.35.5 instalados localmente | Leídos de los manifests instalados. No se cargaron módulos desde una imagen Linux ni se validó ONNX. |
| Artefactos locales | Modelo ONNX 24,446,700 bytes; modelo + 175 JSONL + 175 meta.json ≈187.84 MiB. El índice completo ocupa 14.18 GiB porque incluye 20,670 imágenes | Conteos y tamaños revalidados en INF-01. No se abrió ninguna imagen. El worker no necesita esas imágenes. |

El build context actual de backend no es seguro para esta carpeta local: backend/.dockerignore no excluye .scanner-index ni .scanner-models, y el Dockerfile usa COPY del contexto completo en el builder. Puede enviar al daemon 14.18 GiB que incluyen imágenes/cache de referencia. A su vez, la etapa runner no copia scripts/, el modelo ni el índice. No se construyó para confirmar el tamaño transferido; esto se deduce de los patrones actuales.

## Hunks propuestos para la fase de construcción

### 1. Reducir el contexto antes de copiarlo

En backend/.dockerignore, excluir explícitamente .scanner-index/, .scanner-models/ y cualquier directorio temporal de capturas/referencias reconocido por el repositorio. Docker usa su propio ignore file: no confiar en .gitignore. Mantener excepciones solo para archivos que el build realmente necesita. Evitar reglas globales indiscriminadas sobre extensiones .png o .jpg; excluir las raíces conocidas que concentran las imágenes.

En frontend/.dockerignore, no agregar artefactos del backend ni ampliar el contexto a la raíz. El contexto del Dockerfile frontend ya es ./frontend; preservar assets web requeridos por Next/PWA y revisar rutas de fixtures/capturas antes de excluirlas.

### 2. Fijar Node y pnpm sin actualizar dependencias

- Fijar Node en 22.20.0 en cada stage de ambos Dockerfiles; evitar el tag móvil node:22-alpine. Para backend, probar primero el candidato fijado node:22.20.0-alpine en ARM64, incluidos ONNX/Sharp/Argon2/Prisma y sus bibliotecas en el runner final. Recién ante fallo reproducible o razón funcional concreta documentada evaluar node:22.20.0-bookworm-slim (glibc); la ausencia de evidencia Alpine por sí sola no autoriza reemplazar la base. Si el target productivo termina siendo x86_64, construir y probar también linux/amd64. Un build linux/arm64 no prueba el target x64. Registrar versión, arquitectura, libc y digest de cada imagen base. Debian/glibc es candidato, no afirmación de que ya funciona.
- Backend ya fija PNPM_VERSION=10.17.1 y corepack prepare en builder/prod-deps. Conservarlo idéntico en todos los stages que instalan paquetes.
- Frontend hoy solo ejecuta corepack enable; su contexto ./frontend no declara packageManager ni engines, así que el Dockerfile no expresa una versión fija de pnpm. Agregar el mismo PNPM_VERSION=10.17.1 y preparar esa versión en deps/builder. El runner Next standalone no necesita pnpm.
- Mantener los pnpm-lock.yaml actuales y --frozen-lockfile. No cambiar Node, pnpm, Next, Prisma, onnxruntime-node ni sharp por esta preparación.

### 3. Incluir los imports de runtime que faltan

VisualIdentifyService hace fork(resolve('scripts/scanner-visual-worker.mjs')) desde /app, así que la ruta requerida es /app/scripts/scanner-visual-worker.mjs. Copiar explícitamente desde builder al runner:

- backend/scripts/scanner-visual-worker.mjs: entry del child.
- backend/scripts/scanner-visual-engine.mjs: preprocesado y Tensor; importa sharp y onnxruntime-node.
- backend/scripts/scanner-visual-index.mjs: metadata, parseo y validación de vectores; usa módulos built-in de Node.

No copiar por comodidad los scripts de indexación/evaluación. La imagen prod-deps debe conservar onnxruntime-node y sharp. Los imports son ESM .mjs; el paquete declara type module. La etapa final debe ejecutar como usuario no-root, con WORKDIR /app, y conservar el child en /app/scripts para que el fork actual lo encuentre. Build limpio y carga enfocada en el runner final deben comprobar que addons/bibliotecas coincidan; instalar o importar JavaScript por sí solo no demuestra compatibilidad nativa. Corregir además las fases Prisma descritas en INF-02-review: generate antes de build y grafo de producción con cliente generado, sin ejecutar una CLI dev ausente ni generar sin schema.

## Bundle separado y manifiesto compacto

Separar la imagen de aplicación de los artefactos de inferencia. Montar un directorio por versión, inmutable mientras vive ese proceso y en solo lectura:

    /opt/pokescan/artifacts/<artifactId>/model/dinov2-small-int8.onnx
    /opt/pokescan/artifacts/<artifactId>/index/<colección>/meta.json
    /opt/pokescan/artifacts/<artifactId>/index/<colección>/dinov2-<revision>-int8.jsonl

Definir SCANNER_MODEL=/opt/pokescan/artifacts/<artifactId>/model/dinov2-small-int8.onnx y SCANNER_VISUAL_INDEX_DIR=/opt/pokescan/artifacts/<artifactId>/index; montar ambos volúmenes como read-only. El indexador no corre dentro de la API ni modifica ese mount. Una actualización publica un directorio nuevo y reinicia/cambia el servicio a un par compatible modelo+índice; no reemplaza archivos bajo el proceso activo. El Dockerfile no copia el modelo/índice del checkout: se entregan como artefacto aparte.

El loader necesita los meta.json y dinov2-<revision>-int8.jsonl de las carpetas con metadata. No necesita distribuir index-summary.json, .DS_Store, index.lock ni archivos .image. Un manifiesto para la fase siguiente podría tener estos campos:

    schemaVersion: 1
    artifactId: dinov2-small-int8-<revision>-<treeDigest12>
    runtime: node 22.20.0; onnxruntime-node 1.30.0; sharp 0.35.5
    target: linux; arch arm64 o x64; libc glibc o musl; baseImageDigest
    model: ruta, bytes 24446700, sha256 c179f8f7f592449c4c1bca4cd124a7538021428c5ffb89afde9503935b197efb
    index: revision 8b1f705a3a7f6f062f6bdd21986c1583d3ef105d
           precision int8; dimensions 384
           modelHash c179f8f7f592449c4c1bca4cd124a7538021428c5ffb89afde9503935b197efb
           preprocessingHash 8170121eafd1c4dd3122475255b0c6bb811cc598d38abcaf34ac9dd5ca483708
           collections 175; expectedEntries 20670; treeSha256

Los conteos describen la copia local observada el 7/10; expectedEntries cambia con cada versión y no es un límite fijo. Calcular el digest del árbol determinísticamente sobre rutas relativas ordenadas y SHA-256 del contenido de cada meta.json/JSONL. Calcular el digest de publicación sobre el manifiesto canónico y guardarlo separado; no incluir su propio hash dentro de los bytes que se hashean. ExpectedEntries proviene luego de validar vectores/referencias efectivas, no sólo de summaries. No derivar los digests de tamaño/mtime solamente.

El manifiesto identifica el artefacto; no reemplaza el warm-up BE-03. El contrato aceptado requiere que el mismo child IPC cargue ONNX y ejecute refreshIndex() fuera de probes, y quede ready solo tras el ack de esa generación. No llama embedding, no usa imagen sintética, no hace inferencia ni descarga. La probe solo lee estado cacheado; /api/health conserva liveness y /api/ready aplica el contrato revisado. Scanner habilitado en initializing/unavailable/incompatible da readiness 503; busy no la cambia; Redis degradado es informativo. La implementación BE-03 sigue en curso.

## Compose aislado y smoke futuro

La fase de construcción debe usar un Compose temporal, no el docker-compose.yml compartido. Usar un project name único (-p inf02-<id>), sin container_name, sin mounts/nombres de volumen de desarrollo y sin publicar puertos PostgreSQL/Redis. App, DB y Redis van en red privada; exponer únicamente el gateway local en 127.0.0.1:<puerto libre>. El gateway consulta readiness cada 10 s con timeout 5 s; tres fallos seguidos sacan el backend y un éxito lo reincorpora. Esos checks no cierran solos el gate frío: un init-gate independiente, acotado y sobre la API interna debe obtener database=ready y scanner=ready antes de iniciar/publicar gateway. No admitir tráfico hasta ese primer ready; disabled no habilita el smoke del scanner. Verificar proyecto/labels antes del cleanup y borrar solo volúmenes con ese project name. No usar down -v contra el compose de desarrollo ni detener los dos servicios que ya se observaron activos.

En el entorno temporal, configurar SCANNER_VISUAL_ENABLED=1 y rutas a los artefactos read-only; además PRICE_QUEUE_ENABLED=false, ENABLE_CATALOG_SYNC_CRON=false, ENABLE_PRICE_BACKFILL_CRON=false y ENABLE_RETENTION_CRON=false. Usar una DB/usuario de test propios. No llamar proveedores de precios/catálogo, no sincronizar, indexar ni descargar modelo.

El gateway local entrega un origen HTTPS de prueba explícito, por ejemplo https://localhost:<puerto-libre>, ligado a loopback: /api/* a Nest conservando prefijo y resto a Next. NEXT_PUBLIC_API_URL=/api se fija como build arg, no sólo env de runtime. Hoy rompe SSR en producción: getApiBaseUrl() devuelve la base relativa fuera de development. Antes del build reservar un handoff frontend mínimo para API_INTERNAL_URL=http://backend:3001/api, sólo server, conservando /api en browser y fallback existente de desarrollo. No editar frontend desde este preflight. FRONTEND_URL/CORS_ORIGINS usan el origin HTTPS exacto, sin /api ni slash final. TLS local usa CA/certificado del proyecto y confianza acotada del cliente; no DNS público, ACME, trust del sistema ni bypass TLS global. Login/refresh/logout verifican cookie HttpOnly/Secure/SameSite=Lax/Path=/api/auth y ausencia de Domain (host-only); identify autentica por Bearer accessToken, no por esa cookie. La cookie no se manda a /api/cards. Ver contrato y verificación en INF-02-review.

Separar dos escenarios aislados y serializados, con artefactos/manifiestos propios: A) bundle completo, warmup IPC/readiness/reinicio, sin foto ni inferencia; contar referencias efectivas y comparar el manifiesto de esa versión, sin asumir 20,670 por summaries. B) bundle de integración de una referencia, con metadata compatible y un vector validado, DB/set/carta sintéticos, e imagen sintética en memoria; hacer HTTP 401 sin sesión y 200 con Bearer, references=1 y candidate.card.id del fixture. B sí hace inferencia desde el POST autenticado, nunca desde un probe; demuestra integración de módulos/HTTP/auth/DB, no accuracy. La instancia de A no puede contestar references=1 ni compartir mounts/DB con B por accidente. Nunca correr ambos a la vez para el smoke. Mantener la fixture sintética prevista: no se necesita reutilizar fotos locales de usuario ni artefactos de investigación para este smoke. Fotos de precisión/cámara quedan en su fase propia.

En cada escenario recrear sólo app/gateway del proyecto correspondiente, conservando su DB y artefacto temporales, y comprobar mounts/manifiesto/warmup. Reiniciar el gate inicial junto con el gateway: service_completed_successfully anterior no prueba readiness de una generación nueva. Missing/incompatible y recuperación se prueban en una instancia de fallo propia sin editar mounts activos. El endpoint no debe persistir la imagen ni imprimir su contenido en logs. Usar solo una DB recién creada, migraciones aplicadas a esa DB y fixtures sintéticos; descartar luego DB/volúmenes etiquetados con el project name temporal. La base de desarrollo queda intacta.

## Puntos de handoff para BE-03

El diagnóstico y contrato de [BE-03-review](BE-03-review.md) y la revisión técnica de [INF-01-review](INF-01-review.md) están aceptados; BE-03 implementación está activa. Los siguientes puntos son criterios de aceptación entre esa implementación y el empaquetado INF-02, no evidencia de que ya estén implementados:

1. /api/health conserva payload/status 200 como liveness. /api/ready es pública, no-store, responde 200 solo con DB ready y scanner ready o disabled; otros estados dan 503. Si crea ReadinessResponse, espejar el tipo en frontend/types/api.ts según AGENTS §1.
2. DB readiness usa Prisma 6 dedicado/singleton y SELECT 1; límites driver/servidor, single-flight/cache y timeout siguen la propuesta BE-03-review, sin modificar el pool de negocio. DB caída antes del listener sigue fail-fast con restart/gracia de infraestructura.
3. Warm-up IPC único por generación reutiliza child, ONNX y refreshIndex; sin embedding/inferencia ni foto. Lifecycle inicia y recupera fuera del probe; READY solo llega del ack de la generación viva; busy no hace fallar readiness.
4. Exportar el único VisualIdentifyService desde CardsModule; no registrar una segunda instancia. El controller lee estado barato y no expone paths, errores ni secretos.
5. INF-02 entrega scripts requeridos y artefactos modelo/índice versionados, inmutables y read-only. El warm-up real, no solo el manifiesto, decide compatibilidad.
6. Pruebas enfocadas cubren probes sin fork/hash/JSONL, initializing→ready sin tráfico, muerte/reintento, generaciones atrasadas, shutdown, busy, DB timeout/recuperación y payload 200/503. No se ejecutan en este preflight.

Hasta aceptar esos puntos no se modifican handlers ni readiness. Este informe no cambia DTO, manifiesto, flags ni Dockerfiles.

## Aceptación de la fase posterior

- Imagen reproducible con Node 22.20.0, pnpm 10.17.1, arquitectura/libc probada después de intento Alpine o razón funcional documentada, ejecución non-root, Prisma generado correctamente, scripts requeridos y contexto sin artefactos/fotos innecesarios.
- Bundle full-index con manifiesto/digests verificados y mounts read-only. Warm-up determina readiness y sobrevive al reinicio de contenedores.
- Escenarios A full-bundle y B fixture separados. B: HTTPS autenticado, Bearer/refresh cookie seguro, resultado no vacío sin precisión atribuida ni imagen persistida. SSR share/carta usan URL absoluta de servidor. Falta/metadata incompatible del índice produce readiness 503 y gate cerrado.
- Red, volúmenes, cuentas y registros pertenecen exclusivamente al proyecto temporal; flags de jobs externos apagados; sin llamadas a proveedores; cleanup elimina solo recursos con su project name.

## Qué no se comprobó

Se leyó código, Dockerfiles, ignores, dependencias instaladas y contratos. La interacción Docker se limitó a versiones/arquitectura y listados: daemon linux/aarch64; Postgres/Redis de desarrollo ya estaban activos. No hubo build, pull, create, start, exec, stop, remove ni acceso a sus bases. No se cargó ONNX, no se copiaron ni abrieron fotos, no se montaron volúmenes, no se probaron cookies/TLS ni se envió request al scanner. No se afirma que node:22.20.0-bookworm-slim, ARM64, x64 o addons nativos funcionen.

La fase termina aquí. La siguiente fase requiere terminar/revisar BE-03, su reserva Dockerfiles/ignores/Compose y el handoff frontend API_INTERNAL_URL acotado; luego construir con base fijada y ejecutar sólo los smokes aislados descritos. No construir durante el escritor backend activo. El coordinador reserva y serializa; INF-02-review detalla archivos y evidencia requerida.
