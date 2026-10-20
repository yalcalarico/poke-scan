# Orquestación del trabajo por áreas

Revisión documental del 20/10/2026. La política vigente está en
[orquestacion-codex.md](../../orquestacion-codex.md); este documento sólo explica
cómo usar el registro del lanzamiento. No establece otro límite de agentes,
modelo, esfuerzo ni frecuencia de revisión.

## Procedimiento actual

1. Leer [estado](../../estado-actual.md), [registro](REGISTRO-TAREAS.md) y
   [decisiones](10-decisiones-y-contratos.md). Delimitar el pedido humano actual.
2. Reservar alcance y archivos sólo mientras exista trabajo real; root escribe
   los registros centrales. No reactivar reservas citadas en snapshots.
3. Resolver directamente o delegar un paquete acotado cuando aporte cobertura,
   según la política canónica. Serializar implementación y recursos compartidos.
4. Verificar la aceptación de la fase. Cambios de producto requieren focales,
   `pnpm run stop` antes de tests, check estándar al cerrar lote y flujo real
   aislado/cleanup si afectan datos. Documentación sola requiere enlaces y diff.
5. Registrar entrega y limitaciones en su informe fechado; actualizar únicamente
   el estado actual y los IDs efectivamente aceptados. No pegar la bitácora en
   cada documento. Preparación, simulación local y operación real son estados distintos.

## Entradas humanas y seguimiento

La mini PC está diferida al final; preparación entregada no significa instalación.
Participantes/corpus, servicios externos y negocio conservan sus gates propios.
Las preferencias de comunicación y autonomía se consultan en la política vigente.
La automatización existente permanece **PAUSED**, cadencia de dos horas; esta
limpieza no modifica su configuración ni habilita publicación.

Rondas, prompts recurrentes y reservas anteriores: [archivo](../../archive/orchestration-2026-10-20/README.md).
