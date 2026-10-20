# INF-01 — Propuesta de sandbox local para correo de recuperación

Fecha: 2026-10-09 · Autoría inicial: GPT-6 Luna · Revisión: Sol HIGH · Estado: **propuesta preparatoria corregida y aceptada documentalmente; implementación y ensayo pendientes**. No acredita sandbox funcional, entrega SMTP ni cierre de INF-01/BE-05/UX-04. No altera contrato BE-05 ni plantilla UX-04.

## Decisión preparatoria

Se propone que el primer entorno de prueba de BE-05 use un **adaptador local en proceso**, sin dependencia de SMTP, cuenta, credenciales de correo ni red de entrega. Su único destino es un receptor harness sintético,
aislado de usuarios. El adaptador no es un producto de correo, no añade hosting ni estima TCO. El puerto
mantiene el contrato futuro ya aceptado: la emisión de recuperación no espera la entrega para contestar y el
adaptador sólo recibe trabajo luego de la admisión común. El futuro runner puede usar HTTP loopback por IP
literal para probar API; eso no es entrega de correo externa ni autoriza red/SMTP en esta fase.

Mailtrap Email Sandbox aparece en INF-01-entorno como propuesta anterior para inspeccionar mensajes, con
precios/límites consultados entonces. Esa propuesta no creó una cuenta, configuró SMTP ni demostró retención,
aislamiento o funcionamiento. No se la considera configurada ni requisito de esta preparación. Un servicio
externo sólo podrá evaluarse en una fase posterior con análisis explícito de credenciales, destinatarios,
retención, límites, acceso y borrado; este texto no revalida precios ni propone proveedor productivo.

## Habilitación y límites del modo

La futura habilitación será opt-in explícita mediante inyección de dependencia **sólo por el harness propio**;
`RECOVERY_DELIVERY_MODE=local-harness` es un nombre ilustrativo que no existe hoy. No basta un enum de entorno,
`NODE_ENV` o un email terminado en `example.test` para acreditar aislamiento. Antes de crear un sobre/secreto,
el harness debe acreditar proceso propio no productivo, listeners ligados sólo a IP loopback sin ingress
público/túnel, base desechable de nombre único y **owner-marker aleatorio exacto** creado por ese run, conexión/rol
esperados y fixtures de usuario/identificador en allowlist exacta de ese caso. Verificar ausencia de usuarios
ajenos en la base antes de habilitar; ni prefix de DB ni sufijo de email bastan. El runner sólo admite esos
identificadores y bindings de User esperados, incluido un identificador fixture ausente. No generar payload ni
hacer requests con cuentas reales; guardas fallidas se prueban como pass/fail sin enviar datos ajenos al API.

Modos futuros separados: si el runner pide `local-harness` y falta/contradice cualquier guarda o dependencia,
**rechazar arranque antes del listener**, con código interno seguro. Si un servicio futuro habilita recuperación
pero el puerto no está disponible, devolver el `503 RECOVERY_UNAVAILABLE` general de BE-05 **antes de lookup**
para ambos identificadores. Configuración externa/productiva no puede seleccionar este adaptador. No fallback
SMTP, credenciales de correo ni opciones públicas que permitan elegir modo. Nada de esto está configurado hoy.

No crear endpoint de administración/captura/lectura, API debug, bandeja web, outbox, fichero o cola durable.
El test propietario recibe por DI privada en proceso; no se usa API para extraer el secreto. Base/proceso y recursos son desechables, propios y aislados, nunca dev/test compartidos. Ownership/listeners/marcador/allowlist
son guardas a implementar y ensayar, no comprobaciones operativas de este documento.

## Sobre de entrega y tratamiento de secretos

El sobre efímero mínimo contiene destinatario fixture autorizado, secreto/link, tiempos necesarios y correlación opaca interna de caso. Sólo en memoria controlada; no JSON de respuesta/captura, env, logs,
argumentos de herramientas, reporter, snapshots, screenshots, trazas, dump, archivos o evidencia Git. El token
sí debe viajar en el body JSON del POST legítimo de consumo, directamente desde memoria; body/log HTTP de
request/response están excluidos del reporter. Email nunca en respuesta/telemetría.

El receptor tiene una **lease propia de lectura/uso**, distinta del deadline de entrega: inicial propuesto
**120 s desde captura**, o hasta consumo terminado/cancelación/cierre del caso, lo que ocurra primero; nunca
renovación automática. Esa lease no extiende TTL de token BE-05. Cap propuesto del buzón: 32 sobres capturados;
al vencer/rechazar, descartar referencias y prohibir nueva lectura/uso de esa lease. El test debe terminar el
uso HTTP y limpiar sus copias controlables en `finally`, con cancelación/drain acotados; no dejar promesas
sin deadline reteniendo raw secreto. Si ya se inició consumo al vencer lease, cancelar/esperar su cierre y
tratar resultado incierto como BE-05, sin repetir POST. Si no se acredita cierre, caso fallido y recursos
propios en cuarentena para cleanup; no publicar secretos ni declarar limpieza completa.

Deadline de entrega propuesto **2 s desde reserva común**; al alcanzarlo, cerrar pendientes y quitar sobre de
cola. Es distinto de retención: un receptor que ya capturó token debe aplicar su lease, no asumir que 2 s lo
borraron. Callbacks tardíos sólo conservan handles controlables; tras deadline/lease/cancelación no recuperan
payload ni escriben buzón. Limpiar colas/buzón/handles en `finally` y shutdown; no prometer zeroización de
strings, desaparición de copias del runtime o GC inmediato. Se elimina acceso/referencias controlables.

`caseGeneration` es generación local del harness: **teardown/reinicio de caso**, no reset de contraseña, la
incrementan. Callback de generación vieja se descarta. Mantener la misma generación durante la prueba de reset
real BE-05: un enlace emitido y pendiente antes del commit de reset puede llegar después y debe ser rechazado
al consumir por hash/estado/`authVersion` en Postgres. La supresión previa al envío puede optimizar; el adaptador
y la generación del harness nunca son autoridad de revocación. No modificar locks/versión/atomicidad de BE-05.

## Admisión, respuesta y capacidad

La autoridad sigue siendo la admisión compartida/atómica IP, HMAC de identificador y global de BE-05 antes del lookup de User, fail-closed si falta su soporte. Memoria de adaptador no reemplaza ese limitador ni es cuota
global. Valores iniciales **propuestos, no medidos**: FIFO en memoria de hasta 32 pendientes, un consumidor y
deadline de 2 s. Buzón/lease separados arriba; no capacidad de beta ni durabilidad/retry automático.

Mecanismo común propuesto: después de admisión contractual y **antes del lookup**, reservar un ticket sin
identidad para cada pedido fixture admitido, exista o no User. Pool local máximo 32 tickets por proceso; cada
ticket usa la misma fecha de reserva y plazo fijo `reservedAt + 2 s`, con liberación por reloj/cierre de caso,
nunca anticipada por “cuenta ausente” o “entrega completada”. Camino ausente conserva ticket vacío hasta ese
plazo y no crea secreto. Saturación del pool silencia emisión/lookup para ambos y devuelve el mismo `202`, sin
nuevo code/header/cupo de cuenta. Es backpressure interno, no `429` ni estado de correo visible.

Con ticket vigente y User presente, el issuer sigue la transacción BE-05; no la decide el adaptador. Comprobar
ticket/guardas antes de crear sobre y antes de handoff posterior a commit. Si expiró/se cerró entre emisión y
handoff, descartar secreto, aun si hash ya hizo commit; no entregar tarde ni recuperar raw. Cupo de FIFO o buzón
agotado también silencia entrega con `202`. Liberar referencias de todo trabajo al deadline/teardown; ticket
común no permite que una rama reserve/libere antes según existencia. Medir caminos y tiempos en ensayo futuro;
este mecanismo no prueba ausencia de señal de cuenta ni igualdad matemática de latencias.

`202` no espera entrega, no indica existencia/aceptación del receptor ni garantiza correo. Fallos de handoff,
buzón o cuenta no alteran status/cuerpo/headers contractuales. Pedido nuevo admitido, sujeto nuevamente a cuotas,
tickets y cap de tokens BE-05, puede crear otro secreto sin evicción del anterior. Caída commit→handoff pierde
el secreto; no reenvío recuperable/durable. Espera 60 s/manualidad UX-04 no garantiza emisión ni retención.

## Modos de prueba internos

Inyección privada por DI, fija al crear caso, nunca body/query/header ni endpoint público; los nombres
sugeridos **no existen** como opciones hoy. Adapter: `synthetic-success`, `drop`, `reject`, `delay`,
`never-resolve`, `capacity-full`, `shutdown-pending`, `late-after-case-teardown`; todos acotados por deadlines,
leases y ownership. `late-after-case-teardown` sólo comprueba `caseGeneration`, no contraseña/PG.

Hooks del **issuer/harness**, distintos del adapter: `fail-after-hash-commit` interrumpe handoff después del
commit real de emisión; no decide ni simula transacción desde el transporte. `delivery-after-password-reset`
retiene un enlace pendiente y ejecuta reset en la misma generación con otro token fixture **ya preparado/válido antes de abrir el ticket pendiente**, respetando cuotas BE-05; esperas de preparación quedan fuera del deadline.
Permite recepción tardía y exige rechazo por PG; no emitir/reemitir para conseguir reset dentro de los 2 s,
saltar cuotas ni extender timeout sin ensayo. Prueba de emisión/cuotas separada; hooks/pasos son propuestos:
hoy no hay recovery issuer/endpoints/modelo acreditados ni estas configuraciones. Delay/never-resolve serán
stubs cooperativos: señal de cancelación, cierre del trabajo pendiente y desreferenciación de handles/envelope
en finally. `Promise.race` con timeout por sí sola no cancela ni acredita limpieza; ninguna promise/closure
huérfana debe retener raw secreto. Deadline y drain acotados siguen siendo propuestas, no zeroización ni GC
medidos; si la cancelación no cierra, falla cleanup sin afirmar éxito durable.

## Criterios de implementación y ensayo futuro

1. Acreditar opt-in DI, binding loopback/base-marcador/allowlist exacta/ownership antes de payload; negativos no arrancan ni envían. Dependencia general ausente responde 503 previo a lookup según modo, sin fallback/SMTP.
2. Presente/ausente comparten limitador y ticket/reserva/plazo/liberación antes de lookup; saturación/entrega fallida no crean code/señal de cuenta. 202 no await entrega; evaluar side effects/tiempos sin afirmar igualdad medida.
3. Entrega sólo al receptor propietario: drop/reject/delay/never-resolve/deadlines/lease/cancelación/teardown/cap/shutdown descartan referencias controlables, rechazan callbacks tardíos y no reportan secretos. Diferenciar caseGeneration de reset real PG.
4. Emisión→recepción→consumo: token correcto/una vez/expirado/revocado, DTO inválido, login/refresh/sesión BE-05 y entrega posterior a reset en la misma generación. Hooks de commit pertenecen issuer; no crear API/admin de captura ni navegación/capturas con link.
5. Aserciones internas entregan sólo **booleans/códigos seguros**, conteos/tiempos agregados y hashes de artefactos **no secretos**. No `expect(rawToken/email/body)` ni reporter con actual/expected, objeto excepción, diff automático o snapshot de raw. Comparar dentro de función privada y devolver pass/fail seguro; registrar fallo por código fijo, no interpolar contenido. El harness usa token por canal en memoria y POST legítimo, nunca argumentos de tools, filesystem, trace, screenshots o endpoint de inspección.
6. Fixtures/buzón/handles/casos limitados y limpieza en finally: cancelar/drain con deadline, comprobar owner-marker/labels/listeners de recursos exactos antes de retirar sólo los propios. Borrar fixtures/base propia descartable; no dev/test ni servicios externos. Sin cierre acreditado, reportar cleanup fallido sin datos privados ni prometer borrado físico.

Todos son criterios **pendientes de implementación/ensayo**. Hoy sólo se contrastó documentación; ninguno fue
ejecutado. UX-04 ya define copy/fragmento/estados; no duplicar sus pantallas ni contratos BE-05. El adaptador no
se declara listo operativo por tener este checklist y no se cierra INF-01/BE-05 ni gate/IDs.

## Pendientes fuera de esta propuesta

El adaptador local no acredita correo SMTP, remitente, dominio, reputación, entregabilidad, recepción en
proveedor, operación, retención ni eliminación externa. Si una fase posterior evalúa una bandeja externa, deberá
demostrar qué datos retiene y durante cuánto tiempo, quién accede, qué tokens o links son recuperables, control
de credenciales y procedimiento de borrado. Si retiene secreto/link recuperable, exige **nuevo contrato de
amenaza/retención**, no se lo declara compatible automáticamente con “sólo hash” de BE-05. Mantener sin uso
cualquier servicio externo mientras ese análisis no exista.

BE-07 conserva su gate fallido. Este trabajo es sólo documental y focal: no habilita una suite, una captura
diagnóstica nueva ni la siguiente implementación, y no modifica aceptación/registro/planes centrales. No se
hicieron preguntas nuevas ni reintentos.

## Fuentes y límites de la comprobación

Fuentes locales selectivas: [INF-01-entorno](INF-01-entorno.md) y [su revisión](INF-01-review.md); [contrato BE-05](BE-05-contrato-borrador.md), [revisión BE-05](BE-05-borrador-review.md) y [aceptación root del borrador](BE-05-borrador-aceptacion-root.json);
[UX-04](UX-04-cuenta.md), [revisión UX-04](UX-04-review.md) y [aceptación root](UX-04-aceptacion-root.json); [NEG-03 requisitos](NEG-03-cuenta-requisitos.md). Hashes selectivos y chequeo local de enlaces
están en [baseline y verificación selectiva](evidencia-inf01-correo-sandbox/baseline.json) / [chequeo de enlaces](evidencia-inf01-correo-sandbox/verificacion.json). Los documentos previos se leyeron como fuentes y permanecen intactos.

El [baseline de revisión](evidencia-inf01-correo-sandbox-review/baseline-review.json) conserva documento y dos
JSON Luna originales; sus 9 fuentes/11 enlaces son históricos. [Informe Sol HIGH](INF-01-correo-sandbox-review.md)
y [verificación final](evidencia-inf01-correo-sandbox-review/verificacion.json) separan preservación/enlaces
de soporte semántico e invariantes propuestos.

El coordinador reportó una búsqueda estática acotada en `backend/src`, `backend/package.json`, `infra` y
`docs/security.md` para SMTP/Nodemailer/Mailtrap/password recovery/mail transport: sin coincidencias en esas raíces.
No se extrapola fuera de ellas. No hay adaptador/configuración de correo acreditados por esa comprobación;
tampoco se leyeron `.env` ni credenciales. La prueba en memoria futura no verificará SMTP ni proveedor.

La evidencia distingue existencia de archivo/enlace de soporte semántico y de comportamiento ejecutado. Se
preserva el estado ajeno del checkout; no se hizo auditoría exhaustiva ni snapshot global. No se tocó código,
tests, configuración, paquetes, Docker, schema, DTOs, BE-05/UX-04, informes INF-01 anteriores, centrales o
planes. No se ejecutaron suites, `pnpm run check`, build, pruebas BE-05, suite 405, DB/Redis/API, procesos de app,
browser, red, correo, SMTP, cuentas o contactos. Sin implementación, configuración real ni ensayo: la propuesta
queda aceptada sólo como entrada documental, no sandbox configurado/funcional.
