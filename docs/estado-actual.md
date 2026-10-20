# Estado actual de PokéScan

Revisión documental: **20/10/2026**. Entrada única para continuar el proyecto.
Este archivo resume entregas aceptadas; no verifica procesos vivos, ejecución de
cronjobs ni estado de servicios por el mero paso del tiempo.

## Cómo continuar

[AGENTS](../AGENTS.md) y [política de trabajo](orquestacion-codex.md) definen las
reglas. El [registro por ID](plans/lanzamiento-2026-10-07/REGISTRO-TAREAS.md) y el
[checklist](plans/lanzamiento-2026-10-07/STATUS-CHECKLIST.md) mantienen cierres y
cantidades; no recalcular avance a partir de capturas o documentos preparatorios.
El pedido humano actual determina el trabajo; no retomar automáticamente una
reserva antigua. Una entrega nueva actualiza este resumen y su propio informe,
sin copiar la bitácora en los seis registros.

## Hitos recientes y evidencia

| Área | Resultado aceptado | Límites y evidencia |
|---|---|---|
| Cuenta | Recuperación, sesiones y consumidor FE-04; eliminación autoservicio BE-05 y restore local | [CUENTA](plans/lanzamiento-2026-10-07/RESULTADOS/LOTE-CUENTA-validacion.md), [baja local](plans/lanzamiento-2026-10-07/RESULTADOS/BE-05-eliminacion-validacion.md). Correo/custodia/operación externos separados. |
| Redis | Recuperación tras arranque sin Redis y corte sostenido, mismo PID de API | [Gate BE-07](plans/lanzamiento-2026-10-07/RESULTADOS/LOTE-REDIS-revalidacion-global.md). El socket hang up histórico sigue sin causa/fix demostrados. |
| QA local | Login 500 reparado con migraciones existentes y QA de flujos reales; adquisición y preview locales aceptados | [QA](plans/lanzamiento-2026-10-07/RESULTADOS/LOCAL-APP-QA-validacion.md), [adquisición](plans/lanzamiento-2026-10-07/RESULTADOS/LOTE-ADQUISICION-cierre.md). No acredita producción ni dispositivos físicos. |
| Precios y gráficas | TCGdex activo y comparación TCGCSV separada; observaciones persistentes, fechas/cobertura/huecos | [Comparación](plans/lanzamiento-2026-10-07/RESULTADOS/PRECIOS-comparacion-validacion.md), [guía](../frontend/docs/comparison.md). Sin promedio de fuentes ni histórico inventado. |
| Ciclos diarios | Sets habilitados/curados y de colecciones, prioridad y reanudación; migración local y flujo aislado aceptados | [Cierre 18–20/10](plans/precios-diarios-priorizados-2026-10-18-estado.md). TCGdex 03:15 UTC; TCGCSV 21:00 UTC; reanudación cada 15 min. API y flags deben estar activos. |
| Apariencia | V2 predeterminada, Clásica explícita, cinco destinos de navegación | [Entrega](evaluations/visual-v2-default-2026-10-20.md). `/buscar-v2` y `visual=v2` siguen compatibles; un mismo catálogo y sesión. |
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
