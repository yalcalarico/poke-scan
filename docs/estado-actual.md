# Estado de PokéScan

Síntesis de entregas registradas, no diagnóstico de procesos ni de datos actuales.
Las guías técnicas describen contratos; el [backlog ODD](../odd/backlog.md) es la
entrada de pendientes. No recalcular avance con checkboxes o contadores de recibos.

## Entregas y límites que importan para continuar

| Área | Base conservada | Evidencia o límite |
|---|---|---|
| Precios | TCGCSV es la única fuente activa; PostgreSQL sirve lecturas y totales. Historia TCGdex excluida, sin fallback. | [Política](../backend/docs/pricing.md), [jobs](../backend/docs/jobs.md). Tanda común 21:00 UTC, continúa tras medianoche, reservas 24 h. API/flag y máquina despierta requeridos. |
| Cobertura TCGCSV | Equivalencias Rumble/SVE entregadas; Futsal sin asociación validada. | [Recuperación](evaluations/tcgcsv-recovery-2026-10-25.md), [cierre de tanda](evaluations/tcgcsv-batch-completion-2026-10-26.md). Los grupos completos/fallidos y ventanas fechadas no representan la cola actual. |
| Colección y NM | Frontend de variante, edición y refresco entregado. Política de escrituras NM backend implementada en `d8fba3d`; conversión histórica **sin aplicar**. | [Unidad NM y comprobaciones](../odd/tasks/collection-nm-policy.md): tests/check, diferencial y verificación independiente aprobados; unidad cerrada sin revisión nativa por decisión humana explícita, sin lineage ni recibo. [Parche histórico](evaluations/revision-usuario-2026-10-25/RESULTADO-06-variantes-nm-refresco.md) no se aplica entero ni convierte datos reales sin autorización operativa. |
| Uso móvil | REV-01/03/04/05/06 registradas como implementadas; REV-02/07 sin corrección aplicada. | [Registro](evaluations/revision-usuario-2026-10-25/TAREAS.md). Reproducción Safari/iPhone físico, cámara/audio/encuadre físicos pendientes; emulación no acredita esos casos. |
| Textos y períodos | Metadata plegable y eje temporal con ventana completa entregados. | [Resultado](evaluations/revision-usuario-2026-10-25/RESULTADO-05-textos-y-periodos.md), [gate posterior](evaluations/tcgcsv-batch-completion-2026-10-26.md). El timeout previo no es el resultado posterior; no heredar su verde a cambios nuevos. |
| Escáner | Sólo DINOv2, autenticado; sin OCR ni fotos de consulta persistidas. Recorte exterior corregido. | [Guía](../frontend/docs/scanner.md), [recorte](evaluations/scanner-crop-fix-2026-10-20.md). Contraste de cinco originales: 3/5 top-1 y 5/5 top-8; el 5/5 anterior no se reprodujo con pipeline idéntico ni acredita precisión general. |
| Apariencia | Una sola aplicación; `/buscar-v2` compatible, parámetros `visual` antiguos ignorados. | [Rutas](../frontend/docs/routes.md), [decisiones](decisions.md). No restaurar selector ni código retirados. |
| Cuenta, Redis y QA | Recuperación/baja de cuenta, restore local y recuperación Redis tienen entregas aceptadas. | [Cuenta](plans/lanzamiento-2026-10-07/RESULTADOS/LOTE-CUENTA-validacion.md), [baja](plans/lanzamiento-2026-10-07/RESULTADOS/BE-05-eliminacion-validacion.md), [Redis](plans/lanzamiento-2026-10-07/RESULTADOS/LOTE-REDIS-revalidacion-global.md). El socket hang up histórico sigue sin causa/fix demostrados; investigar sólo si se reproduce, no es una caída activa acreditada. Ensayos locales no acreditan producción. |

Las métricas de tests, PIDs y respuestas HTTP pertenecen a sus recibos. Consultar
una evidencia por problema, no cargar ni repetir todos los ensayos verdes.

## Decisiones vigentes para el trabajo local

Beta/corpus requieren participantes voluntarios, consentimiento e identidad
exacta; primera ronda de medición manual. Pro/pagos mantienen sus decisiones de
validación comercial. El análisis local de costes, licencias y presupuesto sigue
vigente y no depende de disponer de otro equipo. No volver a preguntar elecciones
ya registradas ni fabricar evidencia para completar sus entradas.

El [plan por fases](../odd/plan-pendientes.md) recomienda comenzar por el preflight
NM sin modificar datos reales. La [infra diferida](../odd/infra-diferida.md) queda
dormida hasta pedido explícito de configurar la mini PC, fuera del plan activo.

## Continuidad y operación segura

Gentle Shell aporta ODD; [cada feature](../odd/README.md) guarda su propia tarea.
El cierre posterior de la migración quedó registrado en otra rama local; la
[reconciliación](../odd/tasks/gentle-context-migration.md) distingue esa entrega
histórica de cualquier validación externa actual. No autoriza tocar otros clientes.

No detener servicios para documentación. Antes de intervenir procesos, comprobar
ownership actual; no usar inventario real como fixture ni PIDs históricos como
prueba. Conservar automatización Codex **PAUSED**, cadencia de dos horas, sin
reactivar ni duplicar. Sin nuevas capturas/traces/videos salvo pedido.

[Guías](README.md) · [Pendientes](../odd/backlog.md) ·
[Historia recuperable y evidencia protegida](archive/README.md).
