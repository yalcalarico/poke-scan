# INF-02: runtime local aislado

Este Compose es un ensayo local de empaquetado, con una DB vacía y fixtures sintéticas. Publica solamente HTTPS loopback, usa redes/volúmenes propios y desactiva cola de precios y crons. No es un despliegue productivo ni un backup. Conservá el Compose de desarrollo, PostgreSQL 55432 y Redis 6379.

## Variante opt-in con custodia INF-03

El Compose base conserva el target `runner` y no contiene ni configura la custodia. Para construir una variante, empaquetá únicamente los tres módulos runtime permitidos en una ruta nueva, verificá el resultado y pasalo como contexto nombrado al overlay:

```sh
custodyPackage="/private/tmp/inf02-custody-$inf02Id"
pnpm exec node scripts/infra/inf02-custody-package.mjs "$custodyPackage"
pnpm exec node scripts/infra/inf02-custody-package.mjs --verify "$custodyPackage"
```

El manifest registra nombre, ruta absoluta de runtime, tamaño y SHA-256 de cada módulo. El árbol publicado es inmutable (directorios 0555, archivos 0444); no incluye `.env`, modelo, fotos, `.git` ni el resto del repositorio. Usá el overlay sólo al habilitar explícitamente la variante:

```sh
CUSTODY_BACKEND_IMAGE="inf02-custody:$inf02Id" \
CUSTODY_PACKAGE_DIR="$custodyPackage" \
CUSTODY_RUNTIME_ENV_FILE="/ruta/privada/custody-runtime.env" \
INF03_CUSTODY_STORE_HOST="/ruta/propia/custody-store" \
INF03_CUSTODY_ANCHOR_HOST="/ruta/propia/custody-anchor" \
INF03_BACKUP_REPOSITORY_HOST="/ruta/propia/backup-repository" \
INF03_BACKUP_INVENTORY_HOST="/ruta/propia/backup-inventory" \
INF03_BACKUP_CHECKPOINT_HOST="/ruta/propia/backup-checkpoint" \
INF03_SUPPRESSION_JOURNAL_HOST="/ruta/propia/suppression-journal" \
INF03_SUPPRESSION_CHECKPOINT_HOST="/ruta/propia/suppression-checkpoint" \
docker compose -p "$project" --env-file "$envFile" \
  -f infra/inf02/compose.yaml -f infra/inf02/compose.custody.yaml build backend
```

El archivo `CUSTODY_RUNTIME_ENV_FILE` debe ser privado y contener los tres secretos de runtime `ACCOUNT_DELETION_CUSTODY_HMAC_KEY`, `ACCOUNT_DELETION_INVENTORY_HMAC_KEY` y `ACCOUNT_DELETION_HMAC_KEY`. No guardes esas claves en este repo, en el paquete ni en el archivo de entorno de interpolación de Compose. Los siete directorios host deben ser directorios propios, preexistentes, canónicos, sin symlinks, y con propietario UID 1001 y modo 0700 para el usuario del contenedor. La raíz del sistema de archivos del backend queda de sólo lectura; `/tmp` es temporal, y esos directorios bind son los únicos destinos persistentes escribibles.

La imagen `custody-runner` instala los módulos bajo `/scripts`, ruta resuelta por el worker compilado en `/app/dist`. Usa un tag propio `CUSTODY_BACKEND_IMAGE`; no reemplaza `inf02-backend:local`. La verificación de hashes protege integridad del paquete, no constituye firma de procedencia del código: compará los tres hashes con el repo aprobado antes del build. Ante una interrupción, el empaquetador conserva los parciales; no hace chmod ni limpieza recursiva automática sobre rutas inciertas.

Las cinco autoridades originales viven bajo `/var/lib/pokescan-host`, y store/anchor bajo `/var/lib/pokescan-custody`, fuera del árbol lógico original. Los binds no crean carpetas automáticamente. **Markers y snapshots firman rutas absolutas**: montar una autoridad del host con otro namespace no la convierte en válida. Para fixtures nuevas, provisioná explícitamente con UID1001 desde el namespace final del contenedor, usando las bibliotecas normales y journal genuino; nunca durante startup. Para autoridad existente, preservá su namespace firmado o adaptá previamente el montaje sin re-firmar/resetear inventario ni journal. Recovery offline necesita padres propios0700 y los cinco destinos ausentes; usá un contenedor de operación separado con el árbol lógico raíz montado, manteniendo iguales rutas, y tráfico cerrado. El overlay de la app monta autoridades ya recuperadas, no ejecuta recovery.

Guardá en el mismo env privado de interpolación los campos públicos `INF02_CUSTODY_PROFILE=local-simulated`, `CUSTODY_BACKEND_IMAGE`, `CUSTODY_PACKAGE_DIR`, `CUSTODY_RUNTIME_ENV_FILE` y las siete rutas `INF03_*_HOST`; las tres claves van únicamente en el runtime env separado0600. Conservá ese perfil en todos los arranques/recreates. **Los helpers base inf02-start/recreate bloquean esta variante** por perfil o por backend opt-in existente: no pueden recrearla sin overlay y perder replay. El cleanup base sólo retira recursos verificados y conserva los binds de autoridad; no borra su estado.

Con el perfil completo, para arrancar/recrear mantené el overlay en todos los comandos y ejecutá gate frío antes de ingreso, sin imprimir config ni claves:

```sh
docker compose -p "$project" --env-file "$envFile" -f infra/inf02/compose.yaml -f infra/inf02/compose.custody.yaml stop gateway frontend
docker compose -p "$project" --env-file "$envFile" -f infra/inf02/compose.yaml -f infra/inf02/compose.custody.yaml rm -sf gate
docker compose -p "$project" --env-file "$envFile" -f infra/inf02/compose.yaml -f infra/inf02/compose.custody.yaml up -d --force-recreate backend
docker compose -p "$project" --env-file "$envFile" -f infra/inf02/compose.yaml -f infra/inf02/compose.custody.yaml up --no-deps --abort-on-container-exit --exit-code-from gate gate
docker compose -p "$project" --env-file "$envFile" -f infra/inf02/compose.yaml -f infra/inf02/compose.custody.yaml up -d frontend gateway
```

Si cualquier paso falla, no avances al siguiente ni abras frontend/gateway. No uses los helpers de la variante base para saltar ese fallo. No acredita copia off-host, mini PC real ni recuperación de producción; no activa cuentas ni bajas reales.

## Preparar y construir

Corré desde la raíz con Node 22.20.0, pnpm 10.17.1 y Docker. El backend usa Bookworm/glibc + OpenSSL: ONNX ARM64 falló realmente en Alpine. El frontend usa Alpine y su bundle público recibe `/api`; SSR recibe `API_INTERNAL_URL=http://backend:3001/api` al arrancar. Los Dockerfiles fijan versiones y usan lockfiles; registrá también los IDs/digests de imágenes de cada build, porque los tags de las bases pueden cambiar.

Elegí un ID nuevo, un puerto loopback libre y rutas que todavía no existan:

```sh
inf02Id=$(pnpm exec node -e 'console.log(require("node:crypto").randomBytes(8).toString("hex"))')
project="inf02-local-$inf02Id"
privateDir="/private/tmp/inf02-private-$inf02Id"
fullBundle="/private/tmp/inf02-full-$inf02Id"
fixtureBundle="/private/tmp/inf02-one-$inf02Id"
envFile="$privateDir/runtime.env"
caFile="$privateDir/ca.pem"
mkdir -m 700 "$privateDir"

INF02_TARGET_ARCH=arm64 pnpm exec node scripts/infra/inf02-bundle.mjs \
  "$PWD/backend/.scanner-index" "$PWD/backend/.scanner-models/dinov2-small-int8.onnx" "$fullBundle"
INF02_TARGET_ARCH=arm64 pnpm exec node scripts/infra/inf02-bundle.mjs \
  "$PWD/backend/.scanner-index" "$PWD/backend/.scanner-models/dinov2-small-int8.onnx" "$fixtureBundle" --single-reference
pnpm exec node scripts/infra/inf02-bundle-verify.mjs "$fullBundle"
pnpm exec node scripts/infra/inf02-bundle-verify.mjs "$fixtureBundle"
pnpm exec node scripts/infra/inf02-env.mjs "$project" "$fixtureBundle" 35443 "$envFile" 180000
docker compose -p "$project" --env-file "$envFile" -f infra/inf02/compose.yaml build migrate backend frontend
docker image inspect inf02-backend:local inf02-frontend:local --format '{{.Id}} {{.Architecture}} {{.Config.User}}'
```

`arm64` es la plataforma probada; para otra arquitectura seleccioná explícitamente `INF02_TARGET_ARCH=x64` y verificá su ABI antes de atribuir compatibilidad. El manifiesto distingue el host que construyó el bundle de su destino Linux. El modelo aceptado en esta revisión tiene 24.446.700 bytes y SHA-256 `c179f8f7f592449c4c1bca4cd124a7538021428c5ffb89afde9503935b197efb`, revisión DINOv2 `8b1f705a3a7f6f062f6bdd21986c1583d3ef105d`, int8/384 dimensiones. El verificador comprueba hashes, metadata, vectores normalizados, IDs únicos y árbol allowlist sin symlinks ni archivos extra. El digest canónico del manifiesto se calcula sin su propio campo `manifestSha256`; no equivale al hash del archivo final con ese campo agregado.

El empaquetador nunca pisa un destino existente. Publica directorios 0555 y archivos 0444, con marker hermano privado que vincula inode/dispositivo y fuentes. El bundle A completo tiene 175 pares y 20.670 vectores; B tiene exactamente un vector físico para validar el cableado HTTP. No copies referencias, fotos de consulta, `.env`, claves ni sesiones al contexto Docker. Las fotos sintéticas del smoke se generan en memoria.

## Arranque, gate y HTTPS

```sh
pnpm exec node scripts/infra/inf02-start.mjs "$project" "$envFile"
gatewayId=$(docker compose -p "$project" --env-file "$envFile" -f infra/inf02/compose.yaml ps -q gateway)
docker cp "$gatewayId:/data/caddy/pki/authorities/local/root.crt" "$caFile"
curl --cacert "$caFile" --max-time 15 "https://localhost:35443/api/ready"
```

El arranque verifica env privado 0600, identidad de proyecto, recursos existentes, bundle y arquitectura. Ejecuta migraciones solamente sobre la DB nueva del proyecto; crea la fixture, inicia backend y exige que el gate termine con exit 0 antes de abrir frontend/gateway. Liveness `/api/health` no sustituye readiness `/api/ready`: el piloto exige DB y scanner `ready`, incluso si `disabled` sería válido para otra configuración. Redis degradado conserva readiness 200; scanner ausente/incompatible devuelve 503 y el ingreso queda cerrado.

El gate usa un plazo total de 180 s y pedidos de hasta 5 s, incluyendo lectura de body; cada comando Docker tiene un plazo de 240 s. Caddy puede tardar en abrir su listener después de `compose up`; el smoke espera readiness HTTPS durante un máximo de 15 s. `skip_install_trust` evita instalar la CA en el sistema. Pasá la CA explícita a curl/smokes y conservá verificación TLS. No uses `-k`.

Para ejecutar auth + SSR sin imprimir ni interpretar el env como código de shell:

```sh
pnpm exec node --input-type=module -e '
import {readFile} from "node:fs/promises";
import {execFileSync} from "node:child_process";
const [file,ca]=process.argv.slice(1);
const values=Object.fromEntries((await readFile(file,"utf8")).trim().split("\n").map(line=>{const pos=line.indexOf("=");return [line.slice(0,pos),line.slice(pos+1)];}));
const manifest=JSON.parse(await readFile(values.ARTIFACT_DIR+"/manifest.json","utf8"));
for(const name of ["inf02-auth-smoke.mjs","inf02-ssr-smoke.mjs"]){
  execFileSync(process.execPath,["scripts/infra/"+name],{env:{...process.env,...values,INF02_CA_FILE:ca,EXPECTED_CARD_ID:manifest.index.fixtureCardId},stdio:"inherit",timeout:90000});
}' "$envFile" "$caFile"
```

Auth prueba registro, refresh con rotación, cookie host-only Secure/HttpOnly/Lax/Path `/api/auth`, 401 sin Bearer y 200 autenticado con `references=1`. SSR prueba título/datos de fixture, share `noindex` y ausencia del hostname privado en HTML. B no mide accuracy.

## Recrear, actualizar y volver atrás

```sh
pnpm exec node scripts/infra/inf02-recreate.mjs "$project" "$envFile"
curl --cacert "$caFile" --max-time 15 "https://localhost:35443/api/ready"
```

Recreate verifica ownership y artefactos antes de mutar, cierra gateway/frontend, elimina el gate anterior, recrea backend y ejecuta un gate nuevo. No abre el ingreso si falla. El cambio de generación y gate exit 0 fueron ensayados. Redis de esta fixture usa `/data` tmpfs y pierde su caché al recrearse; no guarda inventario.

Para actualizar artefactos, construí y verificá un destino nuevo e inmutable, conservá el bundle anterior y sus hashes, y cambiá sólo `ARTIFACT_DIR` en el mismo env privado 0600. Conservá project, credenciales y el resto de la configuración. Ejecutá recreate y los smokes. Para rollback, restaurá esa ruta anterior y ejecutá el mismo recreate: también debe pasar un gate nuevo. No uses una carpeta parcialmente copiada ni reescribas el bundle montado. El procedimiento de selección/rollback entre versiones está documentado; no se acredita un rollback de modelo distinto probado en esta entrega.

Si un arranque falla, el env y artefactos quedan disponibles para diagnóstico y retiro explícito. No imprimas `docker compose config`, el env completo, DSN, tokens o fotos. Los smokes sólo guardan evidencia anónima.

## Regresiones y limpieza

```sh
pnpm run stop
pnpm exec node --test scripts/infra/inf02-runtime.test.mjs
pnpm exec node scripts/infra/inf02-review-smoke.mjs
```

El último comando crea un proyecto/scratch aleatorios, verifica el bundle completo y su warmup offline, corre HTTPS/auth/SSR/native/privacy/recreate y retira recursos en `finally`. Persiste resultados, fallos y el intento anterior en `RESULTADOS/INF-02-review-evidencia.json`. `--resume <id-16hex>` permite recuperar únicamente un stack anterior que pase ownership; no fabrica markers ni continúa si no existen contenedores propios. Si cleanup del proyecto falla, conserva mounts/env/CA y registra el error para recuperación. Cada smoke y subprocess tiene deadline finito.

Para el ensayo manual:

```sh
pnpm exec node scripts/infra/inf02-cleanup.mjs "$project" "$envFile"
pnpm exec node scripts/infra/inf02-scratch-cleanup.mjs "$fixtureBundle"
pnpm exec node scripts/infra/inf02-scratch-cleanup.mjs "$fullBundle"
rm "$caFile"
rmdir "$privateDir"
```

Cleanup valida labels de contenedores, redes y volúmenes y consumidores de la red privada antes de `down --volumes`. Verifica ausencia antes de borrar el env y **conserva ARTIFACT_DIR**. Admite únicamente el legado Redis `/data` con identidad Docker anónima, nombre 64hex, sin etiquetas ajenas y consumidor exclusivo; después de down revalida ausencia de consumidores antes de retirar ese volumen exacto. Scratch-cleanup exige ruta directa `/private/tmp/inf02-*`, marker original, ownership y árbol sin symlinks antes de cambiar permisos o borrar. Si un bundle es del operador, omití scratch-cleanup y conservá su marker. Nunca borres genéricamente ARTIFACT_DIR ni las fuentes `.scanner-index`/`.scanner-models`.

La revisión enfocada habilita INF-03. `pnpm run check` integrado se ejecuta al cierre del lote operativo, después de stop y con scanner apagado en suites generales; el runtime real scanner=1 se verifica aparte. No se acredita hosting, x64, cámara en teléfonos ni precisión de reconocimiento por estos smokes.
