# Recuperación TCGCSV — 25/10/2026

## Diagnóstico

La cola inicial tenía 167 grupos completados, tres esperando y uno fallido.
Los pendientes eran `bwp` (1407), `bw11` (1409), `pop8` (1450) y el grupo
compartido de `tk2a`/`tk2b` (1542). Son distintos de los sets sin asociación.

La telemetría registra respuestas ausentes (`status: null`, cero bytes) en
productos de 1407, precios de 1450 y manifest. El registro local `pmset -g log`
confirma suspensiones durante esas peticiones: 25/10 10:36:43 ARG inicia un
sueño de 983 segundos y el manifest queda interrumpido durante 981.221 ms.
El intento de precios de 1450 coincide con ciclos de DarkWake/suspensión y
termina a las 10:24:11 ARG. No hay evidencia de un fallo del parser en ese grupo.

Los cachés de productos de los cuatro grupos pasan el replay de identidad:
1407: 63/101; 1409: 93/140; 1450: 17/17; 1542: 18/24 cartas.
Esto no acredita una publicación nueva ni cotizaciones para todas las cartas.
No se borraron reservas, precios previos, errores históricos ni pausas 429.

## Nuevas asociaciones verificadas

Se revisaron una sola vez los productos de dos grupos candidatos presentes
en el catálogo persistido, con manifest estable de 24/10 20:05:44 UTC,
reserva durable de 24 horas y telemetría HTTP. No se descargaron precios en
esta revisión ni se publicaron observaciones ficticias.

| Set | Grupo | Identidad comprobada | SHA256 de productos |
|---|---|---|---|
| `ru1` Pokémon Rumble | 1433 Rumble | 16/16 cartas: nombre, número 1–16 e idioma inglés | `12066e3d69d1ffe7d92189c59bbe0c5b3f5f0df44d32c70cb9c4c7f07b2e0a1b` |
| `sve` Scarlet & Violet Energies | 24382 SVE: Scarlet & Violet Energies | 16/16 cartas: nombre, número 001–016 e idioma inglés | `68f10f57127be0c092876f008062923a3190d9d9f28984e06eace574da5d95f1` |

`REVIEWED_SETS` incorpora las equivalencias exactas y el número sin denominador.
El matcher conserva el número individual: no confunde las energías 1–8 con
9–16 y no elimina anotaciones Cosmos Holo/Cracked Ice Holo. Esas impresiones
distintas y las energías 17–24 quedan fuera de las 16 cartas locales.

`fut20` sigue sin asociación: no hay grupo dedicado en el catálogo ni productos
con identidad Futsal en los cachés revisados. El grupo 2545 pertenece a `swshp`
y contiene otras impresiones; no se reutiliza para las cinco cartas on the Ball.

## Condiciones operativas

El backend debe permanecer activo y la Mac despierta con conexión a internet.
Para desarrollo local, `caffeinate -i -s pnpm run dev:lan`, ejecutado en el panel
inferior izquierdo de Herdr, evita la suspensión por inactividad mientras dura
el proceso; no evita cerrar la tapa ni apagar la computadora. Mantener la tapa
abierta y, preferiblemente, la alimentación conectada.

Las ventanas de archivos ya reservados se mantienen. El ciclo diario sigue a
las 21:00 UTC (18:00 ARG); la reanudación cada 15 minutos recupera pendientes
elegibles antes de esa hora. Las nuevas asociaciones no significan precios
ya publicados y su primera ingesta respeta la reserva de los productos revisados.

## Validación y estado operativo

- `pnpm run stop` antes de tests; `pnpm run check` terminó con exit 0:
  backend 539, e2e 6, frontend 630 y scripts 105: **1.280 pruebas**.
  Lint, tipos y builds de ambos proyectos aprobados. La suite también incluye
  los cambios del escáner ya presentes en el árbol, que esta tarea no modificó.
- Nuevos tests comprueban los grupos exactos y el rechazo de idioma distinto,
  productos duplicados, otras numeraciones e impresiones Cosmos/Cracked Ice.
- Flujo real: el backend arrancó con 175 sets asociados y uno sin asociación.
  `prices:reconcile -- --apply` habilitó dos sets nuevos a prioridad 200, sin
  modificar bajas manuales. La vista durable confirma `ru1`→1433 y `sve`→24382.
- Replay compilado sobre cachés reales: **16/16 Rumble y 16/16 SVE**.
  Los endpoints HTTP de precios de `ru1-1` y `sve-1` devolvieron 200, sin
  observaciones inventadas y con los dos grupos encolados localmente. Cada
  archivo de productos tiene una sola petición registrada y no se descargaron
  precios durante el smoke. Se habilitan el **26/10 11:31 ARG**.
- API `/api/health` 200 y frontend LAN HTTPS `/inicio` 200. Procesos activos en
  Herdr `w2:p7`, con `caffeinate -i -s pnpm run dev:lan`; `pmset -g assertions`
  confirma la inhibición de suspensión por inactividad ligada a pnpm.
- Las reservas de 1407/1409/1450 permanecen hasta el **26/10 10:10–10:24 ARG**.
  El cron conserva la recuperación automática; no se adelantaron esas ventanas.
- El grupo 1542 se recuperó automáticamente el **25/10 11:36:46 ARG**:
  publicó el feed 24/10 20:05:44 UTC y limpió el error de ambos Trainer Kits.
  Cobertura parcial legítima en ambos sets. Corte final 11:37 ARG: **168 grupos
  completados, cinco esperando y cero fallidos**, con heartbeat reciente y sin
  pausas del proveedor. Los cinco esperando son 1407/1409/1450 más los dos nuevos;
  sus publicaciones reales siguen pendientes de las ventanas de mañana.
