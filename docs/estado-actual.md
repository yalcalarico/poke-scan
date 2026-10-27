# Estado actual de PokéScan

Revisión documental: **26/10/2026**. Entrada única para continuar el proyecto.
Este archivo resume entregas aceptadas; no verifica procesos vivos, ejecución de
cronjobs ni estado de servicios por el mero paso del tiempo.

## Cómo continuar

[AGENTS](../AGENTS.md) define las reglas técnicas; [Gentle Shell / ODD](agent-workflow.md)
aporta el proceso. La continuidad se consulta en el [índice ODD](../odd/README.md). El [backlog ODD](../odd/backlog.md) concilia los pendientes; el
[registro por ID](plans/lanzamiento-2026-10-07/REGISTRO-TAREAS.md) y el
[checklist](plans/lanzamiento-2026-10-07/STATUS-CHECKLIST.md) conservan sus cierres
como snapshots. No recalcular avance a partir de capturas o documentos preparatorios.
El pedido humano actual determina el trabajo; no retomar automáticamente una
reserva antigua. Una entrega nueva actualiza este resumen y su propio informe,
sin copiar la bitácora en los seis registros.

## Hitos recientes y evidencia

| Área | Resultado aceptado | Límites y evidencia |
|---|---|---|
| Variantes, NM y refresco de colección | Frontend usa precio de la variante elegida, no pide condición y aplica la edición confirmada a la lista | [Resultado y parche pendiente](evaluations/revision-usuario-2026-10-25/RESULTADO-06-variantes-nm-refresco.md): candidato aislado con check salida 0 y flujo HTTP aprobados. Backend NM y conversión histórica **sin aplicar**, por restricción de no reiniciar durante jobs. El servidor principal se encontró luego apagado y no se arrancó. |
| Textos y períodos — seguimiento móvil/web | Portafolio, cabecera e ítems pliegan metadata técnica; el eje temporal cubre la ventana elegida aunque haya poco historial | [Resultado actualizado](evaluations/revision-usuario-2026-10-25/RESULTADO-05-textos-y-periodos.md): comprobación Safari escritorio. Gate global del 26/10 aprobado con 1.301 pruebas, incluidas 634 frontend, y ambos builds; ver [cierre vigente](evaluations/tcgcsv-batch-completion-2026-10-26.md). Web/API dejadas activas. |
| Revisión de uso móvil | REV-01/03/04/05/06 implementadas por GPT-6 Luna: indicador N, textos compactos, cámara/sonido, sesión sin tope de 30 y guardado automático | [Estado y reportes](evaluations/revision-usuario-2026-10-25/TAREAS.md), [QA integral](evaluations/revision-usuario-2026-10-25/RESULTADO-04.md): check salida 0, flujo aislado 1002 copias con replay idempotente y pendientes conservados. REV-02/07 siguen sin corrección por falta de reproducción Safari físico; cámara/audio físicos también pendientes. |
| Cuenta | Recuperación, sesiones y consumidor FE-04; eliminación autoservicio BE-05 y restore local | [CUENTA](plans/lanzamiento-2026-10-07/RESULTADOS/LOTE-CUENTA-validacion.md), [baja local](plans/lanzamiento-2026-10-07/RESULTADOS/BE-05-eliminacion-validacion.md). Correo/custodia/operación externos separados. |
| Redis | Recuperación tras arranque sin Redis y corte sostenido, mismo PID de API | [Gate BE-07](plans/lanzamiento-2026-10-07/RESULTADOS/LOTE-REDIS-revalidacion-global.md). El socket hang up histórico sigue sin causa/fix demostrados. |
| QA local | Login 500 reparado con migraciones existentes y QA de flujos reales; adquisición y preview locales aceptados | [QA](plans/lanzamiento-2026-10-07/RESULTADOS/LOCAL-APP-QA-validacion.md), [adquisición](plans/lanzamiento-2026-10-07/RESULTADOS/LOTE-ADQUISICION-cierre.md). No acredita producción ni dispositivos físicos. |
| Precios y gráficas | TCGCSV como única fuente activa para precios y totales; historial de una fuente | [Política](../backend/docs/pricing.md), [guía](../frontend/docs/comparison.md). TCGdex retirado del arranque; historia previa conservada y excluida. |
| Limpieza backend | Retirado el circuito ejecutable TCGdex, la cola por carta y los scripts obsoletos; sin cambios de esquema | [Alcance y validación](evaluations/backend-dead-code-cleanup-2026-10-24.md). Lecturas, colecciones y portafolio conservan la ingesta TCGCSV por grupo. |
| Referencias en colección | Ficha, tarjeta y resumen usan la misma referencia TCGCSV | [Fuente única](evaluations/tcgcsv-single-source-2026-10-20.md). Dos copias de USD 1,09 suman USD 2,18; sin fallback ni mezcla de fuentes. |
| Ciclos diarios | Sets habilitados/curados y de colecciones, prioridad y reanudación; migración local y flujo aislado aceptados | [Cierre 18–20/10](plans/precios-diarios-priorizados-2026-10-18-estado.md). TCGCSV 21:00 UTC; reanudación cada 15 min. El ciclo TCGdex del cierre histórico está retirado. API y flags deben estar activos. |
| Apariencia | Una sola apariencia, sin selector Clásica/Actual, cinco destinos de navegación | [Limpieza](evaluations/dead-code-cleanup-2026-10-24.md). `/buscar-v2` sigue compatible; los parámetros `visual` antiguos se ignoran. |
| Recorte de galería | Evita elegir arte interior cuando hay marco exterior; número usa total impreso | [Corrección](evaluations/scanner-crop-fix-2026-10-20.md): gate estándar 1.322 pruebas, cero skips, lint/tipos/builds; flujo aislado real y cleanup. Umbreon del recorte pasa del puesto 563 al 3; Luxray sigue primero. |
| Contraste DINOv2 | Cinco originales con decoder nativo actual: 3/5 top-1 y 5/5 top-8 antes y después del último parche | [Contraste](evaluations/scanner-baseline-contrast-2026-10-20.md). No reproduce exactamente el pipeline del 5/5 histórico; causa de la diferencia no demostrada. |

Los contadores de pruebas pertenecen a sus recibos y snapshots. No repetir gates
verdes intactos ni atribuir al último parche la corrección de fallos históricos
sin causa localizada. El [roadmap del escáner](plans/scanner-improvements.md)
conserva corpus, precisión, duración y dispositivos todavía pendientes.

## Corrección posterior del PR #7

Limpieza documental consolidada en `e8c835b`; después se corrigieron el coste de
comparación de píxeles de un test y el destino del proxy QA señalado por CodeQL.
[Validación](evaluations/pr7-ci-fix-2026-10-20.md): gate estándar local aislado
1.327 pruebas, sin omisiones, sin cambio de algoritmo o timeout. La confirmación
remota corresponde a los checks del nuevo commit en GitHub.

## Decisiones humanas y trabajo pendiente

- **TCGCSV — tanda común con cierre completo:** las 18 ARG abren el alcance
  diario completo; el consumo serial continúa después de medianoche UTC hasta
  resultados terminales, respetando reservas de 24 h. El lote del 26/10 cerró
  a las 22:42 ARG: 166 grupos completos, 4 fallidos, 3 exceptuados por autorización,
  cero pendientes/en proceso; 27.089 observaciones del feed del 26. Los 175 sets
  siguen habilitados para el 27/10, incluidos fallidos y excepciones de transición.
  La recuperación nocturna puede demorar descargas de mañana hasta las 22:45 ARG
  por las reservas. Gate global de 1.301 pruebas y flujo HTTP aislado verdes;
  24 migraciones aplicadas, datos e índices preservados, web/API activas con 200.
  La Mac debe permanecer despierta y con tapa abierta para ejecutar el lote local.
  [Entrega, evidencia y límites](evaluations/tcgcsv-batch-completion-2026-10-26.md).
- **TCGCSV — cobertura y descargas diarias:** el 25/10 se verificaron productos
  de Rumble y SVE y se incorporaron equivalencias
  exactas para sus 32 cartas; Futsal sigue sin asociación. Los errores de transporte
  del ciclo del domingo coinciden con suspensiones de la Mac: para operación local
  debe permanecer despierta, con la tapa abierta. Las reservas de 24 h se conservan.
  [Diagnóstico y condiciones](evaluations/tcgcsv-recovery-2026-10-25.md).
  Antecedente: implementación local entregada el
  21/10: 173 sets asociados / 171 grupos / 173 habilitados; caché condicional de
  productos, telemetría, grupos compartidos e informe operativo. Corrección del
  22/10: prefijos SV/TG/GG, Classic, promos revisadas, cobertura parcial y cruce
  de medianoche. Gate de 1.355 pruebas y flujo HTTP aislado aceptados.
  Replay válido en los 25 grupos afectados. Tras reinicio: 146 grupos completados,
  25 esperando las reservas, cero fallidos en cola; scheduler con heartbeat
  reciente, API y web 200. Reencolar no acredita una publicación nueva: verificar
  tras las ventanas 22/10 23:24–23/10 19:13 ARG. Recuperación productiva y ahorro
  entre ciclos siguen abiertos, además de tres sets sin identidad validada.
  Historial evaluado, backfill diferido.
  [Recuperación y evidencia](evaluations/tcgcsv-groups-recovery-2026-10-22.md) ·
  [Entrega y evidencia](evaluations/tcgcsv-coverage-2026-10-21.md) ·
  [Plan](plans/tcgcsv-cobertura-optimizacion-2026-10-21.md).

- **Beta y corpus:** el dueño gestiona encuestas y cartas con identidad exacta.
  [Interfaz HTML y guía](beta/README.md); protocolos RES y feedback no equivalen
  a participantes o resultados obtenidos. La primera ronda usa medición manual.
- **Mini PC:** modalidad propia + Cloudflare Tunnel elegida; todavía pendiente
  el equipo. Preparación completada, instalación/validación real al final.
  [Prompt futuro](infra/PROMPT-mini-pc-cloudflare.md).
- **Correo y backups:** Resend Free previsto; Backblaze B2 previsto; dueño
  custodio de la identidad privada age; retención de copias hasta 30 días desde
  creación original y registro independiente de bajas antes de reabrir tráfico.
  Adaptadores/ensayos locales entregados; cuentas, dominio, custodia/off-host,
  timer y operación reales pendientes. [Decisiones](plans/lanzamiento-2026-10-07/10-decisiones-y-contratos.md#dec-06--hosting-artefactos-y-dominio).
- **Publicación y negocio:** dominio/HTTPS/servicios, presupuesto/licencias,
  participantes, contenido dependiente de evidencia y GO comercial conservan
  gates propios. Pro/pagos son condicionales. No inventar resultados ni volver
  a preguntar elecciones ya registradas.

## Recursos y coordinación

La instancia de desarrollo fue dejada viva por pedido del usuario. Para conocer
su estado real, inspeccionar procesos y ownership actuales antes de intervenir;
los PIDs/puertos de un recibo fechado no prueban actividad presente. No detenerla
por una tarea sólo documental. No usar inventario real como fixture.

Automatización Codex: conservar **PAUSED**, cadencia de dos horas, sin duplicar ni
reactivar. Comunicación breve, pruebas pertinentes al cierre de implementación,
sin nuevas capturas/traces/videos. Preservar evidencias históricas y cambios
locales; las autorizaciones vigentes rigen acciones de commit, publicación o servicios.

## Historia y navegación

[Índice documental](README.md) · [archivo y resultados](archive/README.md) ·
[snapshots anteriores de coordinación](archive/orchestration-2026-10-20/README.md) ·
[auditoría que motivó la limpieza](audits/documentation-review-2026-10-20.md).
