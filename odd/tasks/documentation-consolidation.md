# Consolidación documental de PokéScan
Limpieza y reestructuración documental verificadas; revisión resuelta por candidato, con dos excepciones explícitas. Sin producto ni servicios.
Rama: `docs/documentation-review-slices`; respaldo íntegro: `backup/documentation-consolidation-513e248`. Base recuperable: `51332f2d9408b41e2e64175bde35cfcd6d7866e3`.

## Specs

- S1: «Dejar una documentación mínima, vigente, confiable y fácil de recuperar». «Priorizá menos contexto y menos mantenimiento, no menos archivos a cualquier costo.»
- S2: «Retirar del árbol actual los históricos y duplicados innecesarios cuando Git ya los conserve, sin perder conocimiento vigente, pendientes ni material útil.»
- S3: «No borres archivos no versionados, fotos únicas, parches pendientes o evidencia irrecuperable sin consultarme.» «Conservá los fixtures, manifiestos y helpers que todavía se usan.»
- S4: «ODD: autoridad de tareas y continuidad; no varios backlogs paralelos.» «Engram: decisiones y descubrimientos seleccionados, no un volcado de Markdown.»
- S5: «Verificá enlaces, anchors, referencias y rutas de comandos.» «No detengas servicios ni corras suites/builds de producto innecesarios.»
- S6: «Usá ODD proporcionalmente y commits locales por unidades coherentes en una rama de documentación.» «No hagas push, PR, merge ni cierres issues sin un pedido posterior.» Publicación posteriormente autorizada en S8; merge y cierre de issues siguen sin autorización.
- S7: «Authorize restructuring the changes into smaller reviewable candidates, potentially replacing the three\n    local commits.»
- S8: «cuando termines subes los cambios creando un PR contra master, no hace falta crear un issue para esto, ni esperar que terminen los CI ni nada»
- S9: «Dejar sólo este retiro sin revisión nativa». Elección humana de la opción que identifica exclusivamente el retiro del inventario en `7fec85d` contra `ee29770`, después de su fallo de presupuesto; no amplía otras excepciones ni desactiva RDD.

## Tasks

- T1 [S1-S3,S5-S6] worker + bajas inline — done — nueve originales contrastados con Git y retirados; foco, E2E incierto y alcances diferidos preservados; 83 destinos locales válidos y diff check verde; commit: `00ba4ae`.
- T2 [S1-S4,S6] inline — done — 16 históricos contrastados/retirados, índice y estado consolidados; cierre ODD histórico reconciliado, sin permisos externos heredados; commit: `95669dd`.
- T3 [S3-S6] inline — done — enlaces/anchors operativos, 38 comandos, recuperación Git, 1.653 evidencias y 38 IDs comprobados; RDD reviewDue=false; evidencia: `95669dd`, cierre en la última unidad documental de esta rama.

- T4 [S6-S7] inline — done — 16 unidades reconstruidas, 48 rutas originales cubiertas una vez; contenido final idéntico al respaldo salvo continuidad ODD. Commits: `0fa991f` a `7fec85d`.
- T5 [S3,S5-S7,S9] native review — done — unidades 1, 3–15, 17 y 18 aprobadas/reconocidas (16); 2 sin revisión por rechazo de consentimiento y 16 sin revisión por decisión humana explícita. Equivalencia final y diff check verdes; cierre pasivo bajo evaluación proporcional, sin otra ronda de revisión por defecto.
- T6 [S6,S8] delivery — in_progress — push y PR contra master autorizados, sin issue ni esperar CI; resultado de entrega en el PR y continuidad Engram, sin afirmar publicación antes de observarla.

## Log

### L1 — Pedido original

Quiero simplificar y consolidar la documentación de PokéScan para trabajar con
   Gentle Shell, ODD y Engram, apoyándonos en Git para recuperar historia.

   Ejecutá una limpieza documental incremental y reversible. No quiero solamente
   un informe, ni otra capa de archivos que duplique lo existente.

   ## Objetivo

   Dejar una documentación mínima, vigente, confiable y fácil de recuperar:
   - Qué necesita saber alguien para desarrollar y operar la aplicación.
   - Qué decisiones y restricciones siguen vigentes.
   - Qué tareas están realmente pendientes.
   - Qué evidencia mínima permite reproducir problemas importantes.

   Retirar del árbol actual los históricos y duplicados innecesarios cuando Git
   ya los conserve, sin perder conocimiento vigente, pendientes ni material útil.

   ## Alcance

   Revisá:
   - docs/ y todas sus subcarpetas.
   - frontend/docs/ y backend/docs/, incluidas sus subcarpetas.
   - README.md, AGENTS.md y otras entradas documentales que los referencien.
   - odd/ para reconciliar autoridad de tareas, sin ejecutar pendientes de producto.
   - Referencias desde código, scripts, tests y comandos documentados hacia los
     archivos que propongas mover o retirar.

   No recorras configuraciones globales fuera del proyecto. No abras secretos,
   credenciales, .env, sesiones o bases de memoria.

   ## Criterio de trabajo

   Primero comprobá el estado actual de Git y las instrucciones del proyecto.
   No asumas que documentos fechados describen el código o runtime actuales.

   Hacé un inventario acotado: rutas, tamaños, estado en Git, propósito,
   referencias y consumidores. Usá índices, encabezados y búsquedas antes de leer
   archivos enteros. No cargues toda la documentación en el contexto.

   Clasificá cada grupo o archivo:
   1. MANTENER: fuente vigente y necesaria.
   2. CONSOLIDAR: contenido útil duplicado o disperso.
   3. REUBICAR: contenido vigente en una ubicación equivocada.
   4. RETIRAR DEL ÁRBOL: histórico sustituido, terminado o redundante, conservado
      en Git.
   5. PROTEGER/INVESTIGAR: pendiente, evidencia única, consumidor no aclarado o
      archivo no versionado.

   No decidas sólo por nombre, antigüedad, tamaño o ausencia de imports.

   ## Organización deseada

   - docs/: arquitectura y operación transversal, decisiones y entradas generales.
   - frontend/docs/: contratos y procedimientos específicos del frontend.
   - backend/docs/: contratos y procedimientos específicos del backend.
   - ODD: autoridad de tareas y continuidad; no varios backlogs paralelos.
   - AGENTS.md: instrucciones particulares del proyecto y referencias mínimas.
     No copiar roles, prompts o mecanismos que ya aporta el harness.
   - Engram: decisiones y descubrimientos seleccionados, no un volcado de Markdown.

   No centralices todo si la separación por capa es útil. Tampoco crees documentos
   para explicar otros documentos que ya explican lo mismo.

   ## Limpieza autorizada y límites

   Podés editar, consolidar, mover y retirar documentación versionada,
   actualizando sus referencias y preservando el conocimiento vigente.

   Antes de retirar un archivo:
   - Confirmá que está efectivamente conservado en Git.
   - Extraé decisiones, restricciones y pendientes todavía válidos.
   - Comprobá consumidores, enlaces y referencias.
   - Identificá desde qué commit puede recuperarse.

   No vacíes una carpeta completa por conveniencia.
   No muevas todo a archive/ para conservar el mismo desorden.
   No reescribas la historia Git ni prometas reducir el tamaño histórico del repo.

   No borres archivos no versionados, fotos únicas, parches pendientes o evidencia
   irrecuperable sin consultarme. Comprobá los pendientes contra el código:
   un informe antiguo no demuestra que sigan abiertos ni que ya estén resueltos.

   Conservá los fixtures, manifiestos y helpers que todavía se usan.
   Si retirarlos exige cambios de producto, tests o herramientas ejecutables,
   conservá la superficie y señalá esa dependencia fuera de esta limpieza.

   Revisá symlinks circulares sin seguirlos recursivamente.

   ## Ejecución y verificación

   Presentá una síntesis breve de lo indispensable, lo redundante y los riesgos.
   Después ejecutá las decisiones claras sin pedirme aprobación por cada archivo.
   Preguntá sólo ante una pérdida potencial o una decisión de alcance real.

   Usá ODD proporcionalmente y commits locales por unidades coherentes en una rama
   de documentación. No agregues informes, manifiestos o checklists redundantes.

   Para cambios exclusivamente documentales:
   - Verificá enlaces, anchors, referencias y rutas de comandos.
   - Comprobá que no se perdieron pendientes o restricciones.
   - Revisá el diff y que no haya cambios de producto accidentales.
   - No detengas servicios ni corras suites/builds de producto innecesarios.

   Respetá el RDD configurado y sus consentimientos. No conviertas fallos generales
   de CI ajenos al diff documental en una tarea nueva de reparación, ni los marques
   como aprobados.

   No hagas push, PR, merge ni cierres issues sin un pedido posterior.

   ## Entrega

   Dejá:
   - Un índice principal corto y coherente.
   - Guías técnicas vigentes, sin duplicaciones evitables.
   - Una autoridad inequívoca de pendientes.
   - Historia recuperable desde Git, sin un depósito permanente de reportes.
   - Un resumen final breve: conservado, consolidado, retirado, protegido,
     verificaciones realizadas y limitaciones.

   Priorizá menos contexto y menos mantenimiento, no menos archivos a cualquier costo.

### L2 — Inventario acotado y disposición

Git limpio en master; base 51332f2. Inventario por os.walk sin seguir symlinks: docs/archive 15 archivos/550.734 bytes; audits 5/723.267; files 5/57.999; evaluations 220/25.073.524 (18 no versionados); plans 1.741/28.333.695 (270 no versionados); frontend/docs 12/415.202; backend/docs 9/269.336. Tamaños incluyen ignorados presentes, no equivalen al alcance versionado.
MANTENER: guías técnicas por capa, decisiones, operación, protocolos beta y roadmaps abiertos. CONSOLIDAR: entradas y continuidad. RETIRAR: nueve planes explícitamente sustituidos y snapshots redundantes de coordinación/auditoría, después de resolver consumidores. PROTEGER: resultados consumidos por scripts INF-02/03, snapshot de seguridad del proxy, parches NM, fotos/corpus y archivos no versionados. REUBICAR: no hay traslado necesario demostrado; se conserva separación por capa.
Symlinks locales autorreferenciales beta/beta, infra/infra, evaluations/evaluations, plans/plans y files/files: no versionados, no seguidos ni retirados. No se leen configuraciones externas, secretos ni bases de memoria. No se crean informes/manifiestos nuevos de inventario.


### L3 — Unidades reversibles y evidencia de consolidación

- T1: `00ba4ae`, nueve planes sustituidos, 83 destinos locales comprobados. ASSESS
  passive/reviewDue=false; sin captura ni consentimiento nativo requeridos.
- Límite de slices: las bajas históricas son voluminosas (3.614 líneas en T1;
  el inventario JSON retirado en T2 tenía 17.975 líneas). No se reescriben esos
  cuerpos; cada familia va con sus sucesores/referencias en una unidad reversible.
  La prosa nueva y de consolidación de cada unidad se mantiene acotada; no hay PR.
- T2: dieciséis originales idénticos a `51332f2`, 1.277.088 bytes retirados.
  Snapshots de coordinación, auditoría completada, manifiestos redundantes y
  prompt Codex sustituidos por recuperación Git. Snapshot/manifiesto de seguridad,
  rollback externo único, resultados y corpus protegidos.
- La tarea de migración en master estaba desactualizada respecto de `5be3478`,
  presente en otra rama local. Se reconcilió su cierre histórico, no configuración
  externa ni estado remoto actual. Sus fallos de CI siguen siendo fallos.
- Enlaces/anchors estáticos: 2.276 referencias locales en base, 2.153 en candidato;
  311 incidencias previas y 309 actuales. Ninguna rotura operativa nueva. Un enlace
  nuevo ausente pertenece al informe histórico MKT-01-copy → redesign-2026; sus
  bytes se preservan y la guía de historia indica el commit de recuperación.
- Preservación: 1.653 archivos de evaluaciones/resultados/seguridad idénticos por
  hash Git, salvo el acceso navegacional ORQUESTACION-ESTADO actualizado. Los 38
  IDs y filas de estado de lanzamiento son idénticos; 18 abiertos en ODD.
- Dos intentos del comprobador auxiliar fallaron por su selección de archivos:
  omitía la feature agregada al índice y contaba un snapshot autorizado a retirar
  como evidencia protegida. Se corrigió el alcance del comprobador; no se alteró
  evidencia para obtener verde. Comprobaciones posteriores de enlaces operativos,
  preservación e IDs terminaron 0. No fueron tests de producto.

- Cierre de referencias: 38 menciones `pnpm run` en documentos modificados tienen
  script en los manifests raíz/frontend/backend. Las menciones a planes retirados
  en código son tres comentarios históricos, no consumidores ejecutables.
- Contraste NM: collections.service.ts conserva `dto.condition ?? 'NM'` al añadir
  y `dto.condition ?? existing.condition` al editar; la migración
  `20261026020000_collection_nm_only` sólo está en el parche protegido, no en el
  árbol de migraciones. No se certifica el estado de una base sin inspeccionarla.
- Excepción TDD: sólo documentación, sin comportamiento ejecutable que permita
  RED/GREEN significativo. No se detuvieron servicios, corrieron suites/builds,
  abrieron secretos/configuraciones externas/bases de memoria ni usaron cuentas.


### L4 — Cierre y límites

Unidades: T1 `00ba4ae`; T2 y evidencia de T3 `95669dd`; última unidad sólo registra
el cierre. RDD se mantuvo on: primera unidad passive/reviewDue=false; segunda
medium/reviewDue=false (under_budget). Se siguió la autoverificación indicada,
sin iniciar una revisión nativa ni inventar consentimiento o aprobación.

Los fallos iniciales de ASSESS por alcance no versionado se resolvieron al
normalizar el candidato en el índice; no constituyeron revisión ni aprobación.
Las comprobaciones auxiliares fallidas y sus correcciones están en L3. Los
311 hallazgos estáticos previos eran limitaciones históricas, no se convirtieron
en reparación de producto. No se verificaron enlaces externos, clientes globales,
estado de DB/runtime, CI remota ni dispositivos físicos. No hubo push/PR/merge,
cierre de issues, instalaciones ni suites/builds. Risk: none (sin cambios de
producto ni consumidores ejecutables; evidencia protegida y recuperación Git).


### L5 — Revisión solicitada y bloqueo del candidato acumulado

Target `sha256:5353c96f067f3854898a1924b82c071da7fd41e3d654695e8df9ba7687e186a9`:
INSPECT ofreció START; no había decisión humana de dejarlo sin revisión. START
terminó en preflight `lens_context_budget_exceeded`, mutation not_started/none.
No se creó autoridad, revisión ni aprobación. No repetir ese candidato ni
abandonar/reparar una autoridad inexistente. Este resultado complementa, no borra,
las evaluaciones por unidad ni las comprobaciones documentales anteriores.

### L6 — Autorización de reestructuración y límites

Authorize restructuring the changes into smaller reviewable candidates, potentially replacing the three
    local commits.

Se conserva `513e248399a30976c751724d45f33cf0ba441068` mediante la rama local
`backup/documentation-consolidation-513e248`; la rama anterior también permanece.
Una sola pasada de slicing: continuidad ODD; navegación general; correcciones
frontend por guía; planes frontend retirados por documento; planes de escáner y
backend; referencias de lanzamiento agrupadas por tamaño; snapshots de
coordinación por documento/familia; metadatos sustituidos; inventario histórico
indivisible al final. Cada revisión usa el padre exacto del commit como base,
no el diff acumulado. No se crean PRs, manifiestos ni stubs.

El inventario JSON retirado mide 699.202 bytes / 17.975 líneas. Se aísla completo:
no partir sus registros ni reescribirlo en estados artificiales para eludir el
presupuesto. Los demás documentos voluminosos también se mantienen atómicos.
Si una unidad indivisible no cabe, conservar el mejor split y reportar el bloqueo;
no repetir START con el mismo target ni declarar ese target revisado.

Equivalencia requerida: árbol final de producto, guías y evidencias idéntico al
respaldo; sólo este documento ODD puede sumar autorización/estado de revisión.
No detener servicios ni repetir suites/builds o pruebas documentales intactas.


### L7 — Reconstrucción observada

Dieciséis commits `0fa991f..7fec85d` sobre `51332f2`, enumerables con
`git log --reverse --oneline 51332f2..7fec85d`. Las 48 rutas del diff original se
asignaron exactamente una vez; diff entre respaldo y nuevo tip: sólo este
archivo ODD. Árbol de trabajo limpio; `git diff --cached --check` terminó 0 en
cada unidad. No se modificaron evidencias no versionadas ni se repitieron suites.
Esta reconstrucción y su comprobación no equivalen a revisión nativa aprobada.
La revisión se hará con HEAD en cada commit y baseRef en su padre completo;
este registro de reconstrucción constituye una unidad documental final separada.


### L8 — Publicación autorizada, sin issue ni espera de CI

cuando termines subes los cambios creando un PR contra master, no hace falta crear un issue para esto, ni esperar que terminen los CI ni nada

La autorización cubre push y un PR contra master en el origin identificado
`https://github.com/yalcalarico/poke-scan.git`; no cubre merge ni omitir RDD o
consentimientos. No se publicaron cambios mientras la revisión sigue bloqueada.

### L9 — Revisión acotada observada y bloqueo indivisible

- Unidades 1 y 3–13: doce cierres nativos approved con acknowledgement consumido.
  Unidades 9, 11, 12 y 13 incluyeron capturas de modelo; las otras ocho siguieron
  la ruta nativa low sin lentes. No confundir ambas clases de evidencia.
- Unidad 2 (`a09bd8f` contra `0fa991f`): el host devolvió
  consent-declined-this-candidate para
  `sha256:aaa80d1f38c7c264e6fbc9a4cce0204be7e84e60c9ca48c8a178a24918722b62`.
  No hubo autoridad ni revisión. La decisión no se aplica a otros targets.
- Unidad 16 (`7fec85d` contra `ee29770`): sólo retiro de
  `docs/audits/documentation-inventory-2026-10-20.json`, 699.202 bytes y 17.975
  líneas. ASSESS medium; START terminó lens_context_budget_exceeded en preflight,
  mutation none/not_started, sin autoridad. No se repite ni se trunca evidencia.
- Se comprobó la unidad 16 antes de pagar las capturas 14/15. Las unidades 14,
  15 y 17 quedan sin revisar, no aprobadas; publicación sin iniciar. El split
  único ya está completo y no se vuelve a fragmentar artificialmente el JSON.
- Se volvió a la rama `docs/documentation-review-slices`, no a HEAD detached.
  La decisión humana pendiente es conservar ese retiro exacto sin revisión o
  conservar el inventario en el árbol y retirar esa baja del alcance.

### L10 — Decisión humana para el candidato indivisible

Dejar sólo este retiro sin revisión nativa

Respuesta humana a la elección cerrada que nombra explícitamente el retiro de
`docs/audits/documentation-inventory-2026-10-20.json` en `7fec85d` contra
`ee29770`. Se conserva ese retiro exacto sin revisión nativa. No es una aprobación,
no crea autoridad y no desactiva RDD. Se retoman las revisiones restantes y la
publicación autorizada en S8; no se repite el START del candidato fallido.


### L11 — Cierre de revisiones por unidad

Unidades 1, 3–15, 17 (`5bec48f`) y 18 (`96e0ed2`): 16 aprobaciones nativas con
acknowledgement consumido. Capturas reales de modelo: 9, 11, 12, 13, 14 y 15;
las otras diez fueron cierres low sin lentes. Las excepciones 2 y 16 permanecen
sin revisión, no aprobadas, según L9/L10. No existe aprobación del diff acumulado.

Cierres adicionales observados: unidad 12 `review-8aacde15911c65f5`,
13 `review-09d71decef86a572`, 14 `review-8b8b4c34957f00ab`,
15 `review-7996d1f477c40d7f`, 17 `review-9b24c8bf01a1c87b` y
18 `review-25581cf5478c1961`; todos con authority burned en acknowledgement.

Comparación final contra `backup/documentation-consolidation-513e248`: sólo
cambia este documento de continuidad. `git diff --check 51332f2..HEAD` limpio,
árbol limpio antes de esta anotación. El producto, las evidencias y los retiros
originales no cambiaron durante la revisión. No se ejecutaron suites/builds ni
se detuvieron servicios: sólo documentación. Publicación en curso por S8;
no se espera CI ni se realiza merge.
