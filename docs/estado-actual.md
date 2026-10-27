# Estado de PokéScan

Síntesis de entregas registradas, no diagnóstico de procesos ni de datos actuales.
Las guías técnicas describen contratos; el [backlog ODD](../odd/backlog.md) es la
entrada de pendientes. No recalcular avance con checkboxes o contadores de recibos.

## Entregas y límites que importan para continuar

| Área | Base conservada | Evidencia o límite |
|---|---|---|
| Precios | TCGCSV es la única fuente activa; PostgreSQL sirve lecturas y totales. Historia TCGdex excluida, sin fallback. | [Política](../backend/docs/pricing.md), [jobs](../backend/docs/jobs.md). Tanda común 21:00 UTC, continúa tras medianoche, reservas 24 h. API/flag y máquina despierta requeridos. |
| Cobertura TCGCSV | Equivalencias Rumble/SVE entregadas; Futsal sin asociación validada. | [Recuperación](evaluations/tcgcsv-recovery-2026-10-25.md), [cierre de tanda](evaluations/tcgcsv-batch-completion-2026-10-26.md). Los grupos completos/fallidos y ventanas fechadas no representan la cola actual. |
| Colección y NM | Frontend de variante, edición y refresco entregado. Backend NM y conversión histórica **sin aplicar**. | [Resultado y parche](evaluations/revision-usuario-2026-10-25/RESULTADO-06-variantes-nm-refresco.md). No aplicar el parche dentro de una limpieza documental; requiere autorización de datos/runtime. |
| Uso móvil | REV-01/03/04/05/06 registradas como implementadas; REV-02/07 sin corrección aplicada. | [Registro](evaluations/revision-usuario-2026-10-25/TAREAS.md). Reproducción Safari/iPhone físico, cámara/audio/encuadre físicos pendientes; emulación no acredita esos casos. |
| Textos y períodos | Metadata plegable y eje temporal con ventana completa entregados. | [Resultado](evaluations/revision-usuario-2026-10-25/RESULTADO-05-textos-y-periodos.md), [gate posterior](evaluations/tcgcsv-batch-completion-2026-10-26.md). El timeout previo no es el resultado posterior; no heredar su verde a cambios nuevos. |
| Escáner | Sólo DINOv2, autenticado; sin OCR ni fotos de consulta persistidas. Recorte exterior corregido. | [Guía](../frontend/docs/scanner.md), [recorte](evaluations/scanner-crop-fix-2026-10-20.md). Contraste de cinco originales: 3/5 top-1 y 5/5 top-8; el 5/5 anterior no se reprodujo con pipeline idéntico ni acredita precisión general. |
| Apariencia | Una sola aplicación; `/buscar-v2` compatible, parámetros `visual` antiguos ignorados. | [Rutas](../frontend/docs/routes.md), [decisiones](decisions.md). No restaurar selector ni código retirados. |
| Cuenta, Redis y QA | Recuperación/baja de cuenta, restore local y recuperación Redis tienen entregas aceptadas. | [Cuenta](plans/lanzamiento-2026-10-07/RESULTADOS/LOTE-CUENTA-validacion.md), [baja](plans/lanzamiento-2026-10-07/RESULTADOS/BE-05-eliminacion-validacion.md), [Redis](plans/lanzamiento-2026-10-07/RESULTADOS/LOTE-REDIS-revalidacion-global.md). El socket hang up histórico sigue sin causa/fix demostrados. Ensayos locales no acreditan producción. |

Las métricas de tests, PIDs y respuestas HTTP pertenecen a sus recibos. Consultar
una evidencia por problema, no cargar ni repetir todos los ensayos verdes.

## Decisiones externas todavía condicionadas

- Mini PC propia + Cloudflare Tunnel elegidos; instalación y validación real
  pendientes de equipo. [Preparación](infra/PROMPT-mini-pc-cloudflare.md).
- Resend Free y Backblaze B2 previstos; dueño custodio age, retención de 30 días
  desde creación original y registro independiente de bajas antes de reabrir
  tráfico tras restore. Cuentas, dominio, off-host/timer y operación real no se
  acreditan con adaptadores o ensayos locales. [Contratos vigentes](plans/lanzamiento-2026-10-07/10-decisiones-y-contratos.md#dec-06--hosting-artefactos-y-dominio).
- Beta/corpus requieren participantes, consentimiento e identidad exacta;
  primera ronda de medición manual. Pro/pagos, licencias, presupuesto y salida
  productiva conservan sus gates. No volver a preguntar elecciones ya registradas
  ni fabricar evidencia para completar sus entradas.

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
