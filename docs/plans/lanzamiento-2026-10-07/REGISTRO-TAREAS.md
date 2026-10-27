# Registro de tareas

> **Snapshot de lanzamiento; cantidades conciliadas el 27/10/2026.** Conserva IDs,
> cierres y evidencias. Los pendientes se continúan desde el [backlog ODD](../../../odd/backlog.md);
> no agregar nuevas bitácoras ni mantener otro contador aquí.

Registro por ID del lanzamiento. Limpieza del 20/10/2026: se conservan los cierres
y sus evidencias, sin sumar IDs por documentación, precios, V2 o capturas.
Los números dentro de cada entrega son recibos fechados, no el conteo actual de tests.
[Estado actual](../../estado-actual.md) · [cantidades/checklist](STATUS-CHECKLIST.md) ·
[historia anterior completa](../../archive/orchestration-2026-10-20/README.md).

| ID | Plan responsable | Prioridad | Estado | Dependencias/entradas |
|---|---|---|---|---|
| FE-01 | [Frontend](01-frontend.md) | P0 | Completada localmente · Luna/Sol HIGH; draft/guardado mixto/replay; [gate frontend](RESULTADOS/LOTE-FRONTEND-validacion.md) aprobado | UX-01; DEC-01. Coordinar el resultado de BE-02. |
| FE-02 | [Frontend](01-frontend.md) | P0 | Completada localmente · público + UI privada/preview/control; [gate frontend](RESULTADOS/LOTE-FRONTEND-validacion.md) aprobado | UX-02; BE-01; DEC-02. |
| FE-03 | [Frontend](01-frontend.md) | P1 | Completada localmente · Luna/Sol HIGH;78 enfocadas y [gate estándar](RESULTADOS/LOTE-VALORES-cierre.md) aceptado:894/0skip,22API-SSR,QA real y cleanup | UX-03; BE-04 revisión enfocada aceptada; DEC-03. |
| FE-04 | [Frontend](01-frontend.md) | P1 | Completada localmente · Luna/Sol HIGH; [gate CUENTA](RESULTADOS/LOTE-CUENTA-validacion.md) aceptado root:979/0skip,81integradas por fases, correo local/QA/cleanup | UX-04; BE-05 recuperación revisada/integrada. |
| FE-05 | [Frontend](01-frontend.md) | P1 | Pendiente; automatización diferida en primera ronda manual según [DEC-04](RESULTADOS/DEC-04-medicion-minima.md) | RES-03 protocolo; nuevo acuerdo de receptor/acceso/retención antes de automatizar. |
| FE-06 | [Frontend](01-frontend.md) | P2 condicional | Condicionado a validación | NEG-01 y NEG-03 GO; UX-05; BE-08. |
| FE-07 | [Frontend](01-frontend.md) | P1 | Completada localmente · Luna/Sol HIGH implementación/revisión; [cierre adquisición](RESULTADOS/LOTE-ADQUISICION-cierre.md) aceptado root: check982reutilizado, QA390/1280ambos temas/CTA/FAQ/cleanup | MKT-01; UX-03 si corresponde; coordinar SEO-03. |
| FE-08 | [Frontend](01-frontend.md) | P0 integración INF-02 | Completada localmente · SSR privado revisado Luna/Sol HIGH y consumidor real; [gate operación](RESULTADOS/LOTE-OPERACION-validacion.md) aprobado | Handoff INF-02 revisado; BE-03 revisado. |
| BE-01 | [Backend](02-backend.md) | P0 | Completada localmente: contrato público y vigencia; lote validado · Luna/Sol Alto | UX-02; DEC-02. |
| BE-02 | [Backend](02-backend.md) | P0 validación; arreglo si se reproduce | Completada localmente: idempotencia y migración test/dev; lote validado · Luna/Sol Alto | [746 tests + smoke del lote](RESULTADOS/LOTE-BACKEND-validacion.md); integración draft FE-01 validada en gate frontend. |
| BE-03 | [Backend](02-backend.md) | P0 | Completada localmente · 49 enfocadas y runtime/readiness; [gate operación](RESULTADOS/LOTE-OPERACION-validacion.md) aprobado Sol HIGH | INF-01 requisitos de operación. |
| BE-04 | [Backend](02-backend.md) | P1 | Completada localmente · Luna/Sol HIGH;172 enfocadas y contrato+FE-03 validados juntos en [gate estándar](RESULTADOS/LOTE-VALORES-cierre.md):894/0skip,22API-SSR,QA y cleanup | DEC-03; UX-03 especificación aceptada. |
| BE-05 | [Backend](02-backend.md) | P1 | Completada localmente · recuperación CUENTA/Resend simulado + [baja y restore aceptados](RESULTADOS/BE-05-eliminacion-validacion.md):1055/0skip,69integradas/7capturas/cleanup | UX-04; canal autoservicio y retención30d elegidos. Activación/custodia/backups/correo externos pertenecen a INF-01/03 y operación. |
| BE-06 | [Backend](02-backend.md) | P1 | Completada localmente · Luna/root; [gate aceptado](RESULTADOS/BE-06-validacion.md):45focales,996/0skip,22controles API/cola/Redis y cleanup | DEC-04 manual; señales operativas sin receptor personal. |
| BE-07 | [Backend](02-backend.md) | P1 | Completada localmente · Luna/Sol HIGH;27 enfocadas y [gate integrado aceptado](RESULTADOS/LOTE-REDIS-revalidacion-global.md):910/0skip, ambos builds y34checks Redis/API/SSR, mismo PID/caché caliente/PGfallback y cleanup; [root](RESULTADOS/LOTE-REDIS-revalidacion-global-aceptacion-root.json). Causa del socket hang up histórico no localizada | Sin dependencia externa; recuperación comprobada localmente. |
| BE-08 | [Backend](02-backend.md) | P2 condicional | Condicionado a validación | NEG-01, NEG-02 y NEG-03 GO; RES-04 fuentes; DEC-05. |
| UX-01 | [UI/UX](03-ui-ux.md) | P0 | Completada: especificación; FE-01 integrado/verificado localmente | DEC-01; usar protocolo RES-02. |
| UX-02 | [UI/UX](03-ui-ux.md) | P0 | Completada: especificación · GPT-6 Luna; BE-01/FE-02 integrados/verificados localmente | DEC-02. |
| UX-03 | [UI/UX](03-ui-ux.md) | P1 | Especificación aceptada Luna/Sol HIGH; implementación y [gate estándar local](RESULTADOS/LOTE-VALORES-cierre.md) aceptados; comprensión con participantes pendiente, ID parcial | DEC-03; contrato borrador BE-04 aceptado. |
| UX-04 | [UI/UX](03-ui-ux.md) | P1 | Completada documentalmente · Luna/Sol HIGH; [flujo/revisión](RESULTADOS/UX-04-review.md) aceptado. Implementación y evidencia funcional pertenecen a BE-05/FE-04 | Borrador de contrato BE-05; sin esperar implementación. |
| UX-05 | [UI/UX](03-ui-ux.md) | P2 condicional | Condicionado a validación | NEG-01 y NEG-03 GO; DEC-05. |
| RES-01 | [Investigación](04-investigacion.md) | P0 planificación; P1 ejecución | Protocolo entregado; entrevistas/resultados pendientes | Sin dependencia para protocolo; participantes vía MKT-02 y dueño. |
| RES-02 | [Investigación](04-investigacion.md) | P0 protocolo; P1 ejecución | Protocolo entregado/revisado Luna + Sol HIGH; [revisión](RESULTADOS/RES-02-review.md); corpus y resultados pendientes, ID parcial | Fotos voluntarias y etiquetas exactas; runtime local disponible. |
| RES-03 | [Investigación](04-investigacion.md) | P1 | Protocolo entregado; método manual elegido; ejecución/resultados pendientes | FE-01/02 e INF-02 aceptados; primera ronda manual sin FE-05. Participantes/consentimiento/custodio/retención y gates de uso pendientes. |
| RES-04 | [Investigación](04-investigacion.md) | P1 | Completada documentalmente · Luna + revisión/corrección Sol HIGH; [fuentes](RESULTADOS/RES-04-fuentes.md)/[revisión](RESULTADOS/RES-04-review.md); incertidumbres comerciales/técnicas derivadas | Acceso a fuentes oficiales; datos locales solo si son verificables. |
| INF-01 | [Infraestructura](05-infraestructura.md) | P0 | Propuesta técnica y [correo local preparatorio](RESULTADOS/INF-01-correo-sandbox-review.md) revisados Sol HIGH; adaptador/ensayo local cumplidos en [gate CUENTA](RESULTADOS/LOTE-CUENTA-validacion.md). Mini PC + Cloudflare Tunnel y Resend elegidos; cuenta/dominio/ejecución externa y operación pendientes, ID parcial | RES-04 fuentes puede alimentar; DEC-06. |
| INF-02 | [Infraestructura](05-infraestructura.md) | P0 | Completada localmente · packaging/runtime Luna/Sol HIGH; [runtime](RESULTADOS/INF-02-runtime-review.md) y [gate operación](RESULTADOS/LOTE-OPERACION-validacion.md) aprobados | INF-01; BE-03 para readiness final. |
| INF-03 | [Infraestructura](05-infraestructura.md) | P0 | Fase local y gate técnico aprobados Sol HIGH:backup/restore/16 negativos/28checks APIweb; [gate operación](RESULTADOS/LOTE-OPERACION-validacion.md). Off-host/operación pendientes, ID parcial | INF-01; entorno descartable. |
| INF-04 | [Infraestructura](05-infraestructura.md) | P1 | Fase local implementada/aceptada root: [15focales/1011global/22integradas/cleanup](RESULTADOS/INF-04-operacion.md); ID parcial por uptime externo, carga/consumo y presupuesto en host objetivo | BE-03/BE-06 e INF-02/03 locales; entorno real pendiente. |
| SEO-01 | [SEO](06-seo.md) | P1 | Fases documental/matriz local aceptadas Luna/Sol HIGH; clasificación anónima focal resuelta en [gate valores](RESULTADOS/LOTE-VALORES-cierre.md); dominio/salida productivos pendientes, ID parcial | INF-01 dominio; sin dependencia para auditoría local. |
| SEO-02 | [SEO](06-seo.md) | P2 | Pendiente | SEO-01; INF-02 entorno; MKT-03 brief de intención. |
| SEO-03 | [SEO](06-seo.md) | P2 | Fase documental aceptada Luna/Sol HIGH; [brief/revisión](RESULTADOS/SEO-03-review.md); [preview/gate local aceptado](RESULTADOS/LOTE-ADQUISICION-cierre.md):8HTMLporUA/PNG2001200×630/QA; dominio/salida productivos pendientes, ID parcial | MKT-01 copy; SEO-01; RES-04 referencias. |
| MKT-01 | [Marketing](07-marketing.md) | P1 | Completada documentalmente · Luna + revisión/corrección Sol HIGH; [copy/brief](RESULTADOS/MKT-01-copy.md)/[revisión](RESULTADOS/MKT-01-review.md); hipótesis sin validar, FE-07/SEO-03 separados | Inventario vigente; RES-01 para versión validada; NEG-01 para Pro. |
| MKT-02 | [Marketing](07-marketing.md) | P1 | Completada documentalmente · Luna/Sol HIGH; [logística/revisión](RESULTADOS/MKT-02-review.md); canales/embudo/D28/permisos preparados, ejecución/contactos separados y pendientes | RES-01 guion; RES-03 protocolo; INF-02/03 y P0 para invitar a usar. |
| MKT-03 | [Marketing](07-marketing.md) | P2 | Pendiente | RES-01/03 resultados; SEO-03 briefs coordinados; NEG-01 si hay oferta. |
| NEG-01 | [Negocio y monetización](08-negocio-monetizacion.md) | P1 decisión; implementación P2 | Pendiente | RES-01 y RES-03 evidencia; DEC-05. |
| NEG-02 | [Negocio y monetización](08-negocio-monetizacion.md) | P1 | Pendiente | INF-01 presupuesto; RES-04 datos/licencias; RES-03 consumo. |
| NEG-03 | [Negocio y monetización](08-negocio-monetizacion.md) | P1 antes de cobro | Fase documental de cuenta aceptada Luna/Sol HIGH; [revisión](RESULTADOS/NEG-03-cuenta-review.md) habilita borrador BE-05; requisitos comerciales/GO pendientes, ID parcial | RES-04 fuentes; NEG-01; INF-01 correo/hosting; DEC-05. |

Estado consolidado y cantidades por plan: [STATUS-CHECKLIST.md](STATUS-CHECKLIST.md). Los IDs parciales/condicionados cuentan como pendientes.
