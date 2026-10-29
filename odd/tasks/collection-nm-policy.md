# Política NM del servidor — primera unidad del plan
Objetivo: completar escrituras NM sin convertir inventario histórico. Rama: `feat/collection-nm-policy`; base: `ae9bfb7`.
Entrega: `ask-on-risk`, unidad prevista 200–350 líneas; sin push/PR. Tests: Vitest focal, flujo HTTP aislado y `pnpm run check` serial.

## Specs

- S1: «dale avancemos con estas cosas entonces». Referencia de alcance aceptada: [plan de pendientes, fase 1](../plan-pendientes.md#1-preflight-nm-y-dos-unidades-de-implementación): preflight y política NM del backend; conversión real no incluida en esta unidad.
- S2: «ok, genera un plan para comenzar a atacar todas las cosas pendientes, SACA del plan y dejalo a parte porque la infra la hare meses despues cuando tenga la miniPc asi que no quiero seguir recordandolo por ahora sino que cuando te diga que vamos a configurar la miniPC alli si leeremos lo que necesitemos.»

- S3: «dale si esta bien». Aprueba el reparto propuesto: subagente prepara tests/código y padre ejecuta pruebas, en orden RED → implementación → GREEN.

## Tasks

- T1 [S1] delegated/explore — done — contraste estático del parche y código; evidencia `mvr5h2lc-2-e8ht`; commit de implementación: `d8fba3d`.
- T2 [S1,S2,S3] delegated/worker + inline/tests — done — RED16 fallos/77pasos; GREEN93/93; check salida0; commit: `d8fba3d`.
- T3 [S1,S2,S3] delegated/verify + inline/cierre — done — diferencial8/8 base/candidato y verificador aprobados; usuario aceptó cerrar `d8fba3d` sin revisión nativa. Commit de producto: `d8fba3d`.

## Log

### L1 — Pedido actual literal

dale avancemos con estas cosas entonces

### L2 — Alcance, evidencia y límites

Se comienza por la fase 1 del plan aceptado, no por todas sus dependencias externas simultáneamente. La conversión histórica real necesita aprobación operativa separada: no consultar inventario real, aplicar migraciones ni abrir secretos. Cambios documentales del turno anterior permanecen en el árbol y no se incorporan incidentalmente al commit de producto.

El preflight estático encuentra altas/ediciones que todavía aceptan condiciones legacy, índice único por colección/carta/variante/condición y hashes idempotentes que incluyen el payload original. Conservar DTOs legacy, validación e idempotencia; normalizar nuevas escrituras NM sin reescribir hashes. Conservar límites actuales de cantidades (no introducir un tope agregado de999: el DTO limita cada operación). Si una edición legacy colisiona con una fila NM, rechazar sin modificar datos; no fusionar automáticamente inventario. Mantener historial y esquema intactos. El parche es referencia, no se aplica completo: contiene una conversión histórica que no debe entrar en `migrate deploy` de esta unidad.

Riesgo previsto: ítem1, edición de datos guardados; verificar no pérdida, colisiones y replay. La política solicitada no autoriza cambios de auth, ownership, cuotas, fuentes ni eliminación de condiciones del contrato legacy. La aceptación operativa es alta/edición NM, preservación de variantes/precios, replay legacy sin sumar otra vez, ownership y rechazo sin efectos laterales por interfaz pública. Fixtures sintéticos aislados; nunca inventario real.

Exploración: `mvr5h2lc-2-e8ht` (sólo lectura, sin resultados ejecutados). Runtime observado: Node22.20.0, pnpm10.17.1; puertos3000/3001 sin listeners; Docker escucha en55432/6379. No se leyó `.env`, no se detuvieron procesos. Rama creada desde `ae9bfb7`, preservando los cuatro documentos modificados/no versionados del plan.

Estimación advisory 200–350 líneas: mantener código/tests/docs juntos, sin minificar ni omitir pruebas para ajustar tamaño. Si supera el presupuesto de entrega, resolver estrategia antes del siguiente commit. No publicar ni convertir datos reales por esta autorización.

### L3 — Bloqueo de ejecución antes de RED

El padre ejecutó `pnpm run stop` con salida0, tras comprobar ausencia de listeners3000/3001. El worker `mvr5kpug-3-zjca` encontró los specs pero carece de `bash_background` para comandos de duración desconocida o mayor de30s. No ejecutó RED, GREEN, flujo HTTP ni `pnpm run check`; no modificó código, datos o servicios. No se reintentó ni se eludió la política de ejecución. T2/T3 quedan bloqueadas por capacidad del ejecutor, no por fallo de producto. Falta decidir habilitar el ejecutor delegado con jobs o autorizar un reparto explícito donde el padre ejecute las pruebas y el worker sólo edite. No hay commit, revisión ni política NM aplicada.

### L4 — Reparto de ejecución aprobado

Usuario: «dale si esta bien». Se reabre T2 con worker para edición y padre para ejecutar las pruebas largas; T3 vuelve a pending. Estado reconciliado: rama correcta, sólo documentos del plan/tracker modificados o nuevos; 3000/3001 sin listeners. No cambia el límite sobre inventario histórico ni permisos de publicación.

### L5 — Implementación y pruebas observadas

Worker `mvr5wadc-4-9z0n` preparó tests antes del código. Padre job1 RED salida1:16fallos/77pasos, DB `pokemon_cards_test`. Worker `mvr5zfy6-5-0tv9` normalizó persistencia en incrementItem/updateItem y evitó captura en replay conservando hash original; añadió contrato en API. Padre job2 GREEN salida0:93/93. Job3 `pnpm run check` salida0 (2m33s), lint/tipos/tests/builds completos. No se aplicaron migraciones ni se accedió al inventario real.

Verificador independiente `mvr62074-6-s4qd`: S1–S3 satisfechas, sin bloqueadores estáticos ni regresiones compartidas identificadas; no ejecutó tests durante el gate. ASSESS con escalación ítem1 pidió verificador, pero evaluación nativa no disponible por archivos nuevos sin declarar. RDD comprobado on, fuente global.

Diferencial job4: base salida1 por token Nest distinto en copia temporal; candidato salida0(8/8). No prueba regresión de producto. Diagnosticado y corregido únicamente el alias DI del harness temporal para job5, sin tocar candidato. Archivos temporales retirados mediante trap; no son tests comprometidos ni se consulta Git desde tests permanentes. Diff de producto:296altas/15bajas=311líneas, dentro de estimación de entrega.

### L6 — Diferencial incompleto y cambio externo de runtime

Job5 salida1: base no ejecutó casos porque el guard detectó API en3001; también informó archivo temporal no encontrado. Candidato pasó8/8, salida0. Esto NO es un diferencial aprobado. No se relajó el guard ni se repitieron suites. Comprobación posterior: PID42061 node escucha3001, cwd backend de este proyecto, PPID90877; no fue iniciado por esta unidad. No se detuvo ni reinició. Archivos temporales retirados, diff check salida0, mismos tres archivos de producto y documentos previos pendientes.

Necesita decisión: ventana explícita sin API/otros ejecutores para completar la comparación base/candidato, o aceptar formalmente que esa prueba falta. Tests focales93/93, gate completo y verificación estática están aprobados, pero no sustituyen el diferencial ausente. No se hizo commit ni revisión nativa final mientras esta prueba está incompleta. Inventario histórico intacto. Usuario pidió «continua» durante job5; no autoriza eludir el guard ni detener un runtime iniciado externamente sin coordinación.

### L7 — Ventana habilitada

Usuario: «ya lo detuve». Padre confirmó3000/3001libres y reabre T3. Aparecieron cambios ajenos en jobs/TCGCSV y su documentación; se preservan, no se incorporan al candidato NM ni se declara que el check anterior los cubra.

### L8 — Diferencial y commit; bloqueo nativo separado

Job6 salida0: base8/8 y candidato8/8, salidas0/0; ambas pasan las mismas aserciones HTTP de upsert, atributos, cantidades, variantes, ownership y validación sin escrituras rechazadas. No es comparación byte a byte del stdout de Vitest (varían duración y nombre temporal). El harness usa una copia de servicio base con token del controlador corregido, retirada por trap. No hubo cambio de producto posterior al gate completo.

Commit local `d8fba3d16f34aa9677cccd6d212f8c930fbdab7d`:311líneas, sólo servicio/tests/API. Otros cambios de TCGCSV y planificación quedan fuera. Sin push/PR, conversión ni migraciones.

RDD on. ASSESS del rango comprometido no pudo evaluar por inventario untracked; INSPECT pidió selección, se excluyeron sólo los archivos sin seguimiento, sin borrar/ignorar nada. START del rango `ae9bfb7da356134a2032be6ff99188ee4e82b568..d8fba3d16f34aa9677cccd6d212f8c930fbdab7d` devolvió `native-start-retained-selection-candidate-mismatch`, `mutation_performed:false`, `mutation_outcome:none`. No hay lineage ni recibo. No se reintentó START ni se revisaron cambios ajenos. T3 espera decisión: dejar este commit explícitamente sin revisión nativa, o resolver su aislamiento/selección por mantenimiento; checks funcionales y verificación independiente ya aprobados. El tracker permanece sin commit para no ampliar el candidato bloqueado.

### L9 — Cierre aceptado y continuidad

Usuario: «dale, ssi por ultimo, haz un fetch de lo ultimo de master y sigue». Aprueba explícitamente dejar sólo `d8fba3d` sin revisión nativa adicional. T3done: no hay recibo ni aprobación nativa; la excepción no cambia RDD global ni candidatos futuros. La política NM está implementada/verificada, sin convertir inventario histórico.

`git fetch origin master` job7 salida0: origin/master pasó97f5988→673c17b (PR17, logs TCGCSV). No se hizo merge/rebase ni push. HEAD conserva d8fba3d y los documentos locales. La diferencia remota de cuatro archivos TCGCSV se mantiene fuera de la unidad NM. Sigue fase2 del plan, comenzando por foco sobre foto; el baseline E2E de UI aún no dispone de runner instalado según exploración estática.
