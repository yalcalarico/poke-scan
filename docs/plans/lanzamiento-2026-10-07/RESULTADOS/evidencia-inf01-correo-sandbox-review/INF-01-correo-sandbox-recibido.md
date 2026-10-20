# INF-01 — Propuesta de sandbox local para correo de recuperación

Fecha: 2026-10-09 · Responsable: GPT-6 Luna · Estado: **propuesta preparatoria para revisión; implementación y
ensayo pendientes**. No acredita sandbox funcional, entrega SMTP ni cierre de INF-01/BE-05/UX-04. No altera el
contrato BE-05 ni la plantilla UX-04.

## Decisión preparatoria

Se propone que el primer entorno de prueba de BE-05 use un **adaptador local en proceso**, sin dependencia de
correo, cuenta, credenciales, DNS, red ni servicio externo. Su único destino es un receptor harness sintético,
aislado de usuarios. El adaptador no es un producto de correo, no añade hosting ni estima TCO. El puerto
mantiene el contrato futuro ya aceptado: la emisión de recuperación no espera la entrega para contestar y el
adaptador sólo recibe trabajo luego de la admisión común.

Mailtrap Email Sandbox aparece en INF-01-entorno como propuesta anterior para inspeccionar mensajes, con
precios/límites consultados entonces. Esa propuesta no creó una cuenta, configuró SMTP ni demostró retención,
aislamiento o funcionamiento. No se la considera configurada ni requisito de esta preparación. Un servicio
externo sólo podrá evaluarse en una fase posterior con análisis explícito de credenciales, destinatarios,
retención, límites, acceso y borrado; este texto no revalida precios ni propone proveedor productivo.

## Habilitación y límites del modo

El modo requiere una opción de configuración de test/local explícita, opt-in y de nombre inequívoco, habilitada
sólo por el harness de pruebas propio. El nombre sugerido para el futuro diseño es `RECOVERY_DELIVERY_MODE=local-harness`; **no existe
hoy ni se deben tratar como actuales variables, archivos o valores de entorno**. El arranque debe rechazar
cualquier combinación que habilite el adaptador con entorno productivo, usuarios reales, host público o una
configuración de entrega externa. Si falta la habilitación, el entorno no es de test/local aislado o el
adaptador no está disponible, falla cerrado antes de procesar recuperación; no deriva a SMTP ni registra el
mensaje.

No crear endpoint público de administración/lectura, API de debug, bandeja web, cola durable, outbox, fichero de
captura ni ruta de fallback. El harness recibe mensajes por una interfaz privada de proceso, sólo desde el test
propietario que los espera. La prueba futura debe usar base propia desechable, usuario/correo sintéticos en
`example.test`, proceso dedicado y recursos bajo ownership de ese ensayo; nunca cuentas, datos o base
compartidos del usuario. La verificación estática de esta propuesta no inspeccionó ni limpió bases, servicios o
procesos.

## Sobre de entrega y tratamiento de secretos

El adaptador recibe un sobre privado efímero mínimo: destinatario sintético, secreto/link de recuperación,
marcas de tiempo estrictamente necesarias y un identificador opaco aleatorio de correlación de prueba. El
destino y el secreto sólo viven en memoria mientras haya entrega pendiente o lectura autorizada por el harness.
No serializar el sobre, el mensaje renderizado ni el token a JSON de API, logs, argumentos de herramientas,
variables de entorno, reporter, snapshots, screenshots, trazas, dumps, archivos o evidencia Git. El email no
aparece en respuesta API ni en telemetría.

El receptor entrega el link/token al test propietario mediante un canal privado en memoria, no lo imprime ni lo
devuelve en el resultado del test. El test lo usa directamente para el flujo de cambio y no construye una URL de
navegación en logs. Al terminar cada caso y ante `finally`, shutdown, deadline o cancelación, descarta
referencias pendientes y resultados del buzón; cierra/reinicia el harness entre casos. Reset incrementa una
generación: las entregas tardías de generaciones anteriores se ignoran y descartan. No prometer zeroización de
strings ni recolección inmediata por GC; el límite es eliminar referencias controlables y no copiarlas a sinks
persistentes.

## Admisión, respuesta y capacidad

La autoridad de admisión futura sigue siendo el contrato BE-05: controles compartidos/atómicos por IP,
identificador con HMAC y global, aplicados antes de buscar User y con comportamiento fail-closed si el limitador
requerido no está disponible. La memoria del adaptador no reemplaza el limitador, no evita carreras entre
instancias y no puede ser la fuente de cuota. Capacidad y deadline también se aplican antes de cualquier lookup
que pueda revelar existencia; un rechazo interno de capacidad no cambia status, cuerpo ni cabeceras genéricas
`202` de la solicitud admitida por el contrato, y nunca expone cuenta, cuota o estado de correo.

Valores iniciales **propuestos para ensayo**, no medidos ni productivos: una cola FIFO en memoria de hasta 32
entregas pendientes por proceso, un consumidor, deadline de entrega de 2 segundos y cierre con descarte al
llegar al deadline o apagarse el harness. Sin reintento durable ni retry automático. Rechazo/saturación debe
degradar a descarte genérico sin bloquear la respuesta `202`; debe cubrirse también el camino sin
cuenta para que la capacidad no sirva como señal de existencia. El límite por proceso no se presenta como
protección global ni como capacidad de beta.

Un nuevo pedido que supere admisión y cuotas puede emitir un secreto nuevo. Si el proceso cae después del commit
del hash y antes del handoff, el secreto no se recupera ni se reenvía; un pedido futuro admitido, sujeto otra
vez a cuotas/capacidad, crea otro secreto y no invalida por evicción al anterior. Se mantiene el mínimo de
espera/manualidad aceptado en UX-04/BE-05; 60 segundos no garantiza emisión. No se promete entrega, retención
por 60 segundos, durabilidad ni reenvío del mismo secreto.

## Modos de prueba internos

La inyección es dependencia/configuración privada del harness, fija al crear el caso y jamás controlable desde
body, query, header o endpoint público. Nombres sugeridos para la interfaz futura: `synthetic-success`,
`drop`, `reject`, `delay`, `never-resolve`, `fail-after-hash-commit`, `late-after-reset`, `capacity-full` y
`shutdown-pending`. No son valores de configuración existentes. El modo `fail-after-hash-commit` sólo simula pérdida del
handoff después de commit; no guarda el secreto recuperable. `delay` y `never-resolve` deben respetar el
deadline. `late-after-reset` comprueba la generación del harness. `capacity-full` y `shutdown-pending` verifican
descarte seguro. No ofrecer modos de inyección en producción.

## Criterios de implementación y ensayo futuro

1. El arranque permite el adaptador únicamente con opt-in local explícito, proceso/base propios y fixtures sintéticas; combinaciones productivas, públicas, ambiguas o externas fallan cerradas. Mismo lockfile, versiones fijadas y gateway/contrato de BE-05; no reescribir endpoints, DTOs ni respuestas.
2. Solicitud con usuario presente/ausente, cuotas y capacidad produce respuesta contractual indistinguible. La admisión compartida precede al lookup; revisar política y evidencia sin afirmar igualdad matemática de latencia. Confirmar que no hay `await` de entrega que haga depender la respuesta de la cuenta.
3. Entrega sintética exitosa alcanza sólo el harness privado. `drop`/`reject`, demora con deadline, no resolución, caída tras commit, reset con entrega tardía, saturación, cancelación y shutdown no filtran secreto ni convierten pérdida en éxito durable.
4. El caso completo emisión → recepción → consumo verifica token correcto/una vez, expirado/revocado, contraseña inválida, login y refresh/sesión según BE-05; sólo con usuarios propios y base desechable. No capturar navegación, screenshots o traces que contengan fragmento/link.
5. Revisar código y sinks del test runner: reporter, aserciones fallidas, snapshots, logs HTTP, excepciones, fixtures serializadas, argumentos y trazas. Evidencia permitida: conteos agregados, códigos/estado, duración agrupada, hash de artefactos no secretos y resultados pass/fail sin cuerpo, destinatario o token. Los IDs sólo se cierran después de revisión y gates autorizados; no por cumplir una matriz en papel.
6. La limpieza futura acredita únicamente recursos propios del ensayo: cerrar harness, esperar/cancelar tareas con deadline, borrar fixtures de la DB descartable y confirmar ownership del proceso/puerto antes de retirarlo. No prometer borrado físico ni limpieza de un servicio externo.

Separar expresamente el checklist documental de hoy del ensayo funcional: hoy sólo se cotejaron fuentes y
alcance; ningún criterio anterior se ejecutó. La plantilla UX-04 ya define copy, fragmento, privacidad, 202 y
reintento; FE-04 debe consumirla sin duplicar sus pantallas o estados.

## Pendientes fuera de esta propuesta

El adaptador local no acredita correo SMTP, remitente, dominio, reputación, entregabilidad, recepción en
proveedor, operación, retención ni eliminación externa. Si una fase posterior evalúa una bandeja externa, deberá
demostrar qué datos retiene y durante cuánto tiempo, quién accede, qué tokens o links son recuperables, control
de credenciales y procedimiento de borrado antes de hacerla compatible con este contrato. Mantener sin uso
cualquier servicio externo mientras ese análisis no exista.

BE-07 conserva su gate fallido. Este trabajo es sólo documental y focal: no habilita una suite, una captura
diagnóstica nueva ni la siguiente implementación, y no modifica aceptación/registro/planes centrales. No se
hicieron preguntas nuevas ni reintentos.

## Fuentes y límites de la comprobación

Fuentes locales selectivas: [INF-01-entorno](INF-01-entorno.md) y [su revisión](INF-01-review.md); [contrato BE-05](BE-05-contrato-borrador.md), [revisión BE-05](BE-05-borrador-review.md) y [aceptación root del borrador](BE-05-borrador-aceptacion-root.json);
[UX-04](UX-04-cuenta.md), [revisión UX-04](UX-04-review.md) y [aceptación root](UX-04-aceptacion-root.json); [NEG-03 requisitos](NEG-03-cuenta-requisitos.md). Hashes selectivos y chequeo local de enlaces
están en [baseline y verificación selectiva](evidencia-inf01-correo-sandbox/baseline.json) / [chequeo de enlaces](evidencia-inf01-correo-sandbox/verificacion.json). Los documentos previos se leyeron como fuentes y permanecen intactos.

El coordinador reportó una búsqueda estática acotada en `backend/src`, `backend/package.json`, `infra` y
`docs/security.md` para SMTP/Nodemailer/Mailtrap/password recovery/mail transport: sin coincidencias en esas raíces.
No se extrapola fuera de ellas. No hay adaptador/configuración de correo acreditados por esa comprobación;
tampoco se leyeron `.env` ni credenciales. La prueba en memoria futura no verificará SMTP ni proveedor.

La evidencia distingue existencia de archivo/enlace de soporte semántico y de comportamiento ejecutado. Se
preserva el estado ajeno del checkout; no se hizo auditoría exhaustiva ni snapshot global. No se tocó código,
tests, configuración, paquetes, Docker, schema, DTOs, BE-05/UX-04, informes INF-01 anteriores, centrales o
planes. No se ejecutaron suites, `pnpm run check`, build, pruebas BE-05, suite 405, DB/Redis/API, procesos de app,
browser, red, correo, SMTP, cuentas o contactos. Sin implementación, configuración real ni ensayo: la propuesta
queda pendiente de revisión Sol HIGH.
