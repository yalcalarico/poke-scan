# Infraestructura diferida — documento dormido

**Retomar únicamente cuando el usuario pida explícitamente configurar la mini PC.**
Sin fechas, recordatorios ni revisiones periódicas. No hace falta releer este
archivo al consultar pendientes ordinarios; no integra el plan activo ni bloquea
trabajo local. Esto conserva contexto, no autoriza cuentas, publicación o servicios.

## Alcance apartado y trazabilidad

Del corte histórico de lanzamiento (18 IDs abiertos y 20 cerrados), acá quedan
**cinco IDs completos y la porción dependiente de despliegue de SEO-02**. Los otros
13 IDs conservan alcance local/condicionado en el [backlog](backlog.md); SEO-02
está dividido, no duplicado en el conteo. [Registro original de los 38 IDs](../docs/plans/lanzamiento-2026-10-07/REGISTRO-TAREAS.md).

| ID | Porción dormida | Base que no hay que reabrir |
|---|---|---|
| INF-01 | Cuenta, dominio y operación reales con equipo disponible | Preparación local aceptada |
| INF-03 | Backups off-host, timer, custodia/cuentas y operación real | Ensayo local aceptado |
| INF-04 | Uptime, carga/consumo y presupuesto del host objetivo | No confundir estimaciones locales con medición del host |
| SEO-01 | Dominio y salida productivos | Auditoría y matriz local aceptadas |
| SEO-03 | Dominio y salida productivos | Fase documental y preview local aceptados |
| SEO-02 (parte) | Publicación/verificación dependiente de SEO-01 y entorno desplegado | Contenido/brief local con MKT-03 sigue en el plan activo |

## Decisiones conservadas para ese pedido futuro

Mini PC propia + Cloudflare Tunnel elegidos, Resend Free y Backblaze B2 previstos.
Conservar dueño custodio age, retención de 30 días desde creación original y
registro independiente de bajas antes de reabrir tráfico tras restore. Las
cuentas, dominio, off-host/timer y operación real no se acreditan con adaptadores
ni ensayos locales. Al retomar, comprobar estado y permisos actuales; ningún PID,
recibo HTTP o autorización histórica habilita intervenir procesos o publicar.

Fuentes para consultar **sólo al retomar**:

- [Preparación mini PC + Tunnel](../docs/infra/PROMPT-mini-pc-cloudflare.md).
- [Recuperación Resend](../docs/infra/resend-recovery.md).
- [Backups, restore y custodia](../infra/inf03/README.md).
- [DEC-06 y contratos](../docs/plans/lanzamiento-2026-10-07/10-decisiones-y-contratos.md#dec-06--hosting-artefactos-y-dominio).

El análisis local de costes/licencias **NEG-02 no está diferido**. Tampoco se
trasladan acá los permisos de beta, consentimiento ni decisiones comerciales:
siguen vigentes en el backlog activo. Los documentos fuente se preservan como
historia y contratos; sus checklists no generan recordatorios automáticos.
