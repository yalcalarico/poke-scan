# Coordinación y roadmap

Fecha: 2026-10-07. Responsable: dueño/coordinador. Este documento organiza encargos; no añade scope de implementación a las áreas.

## Orden de las próximas cinco acciones

**Actualización 8/10:** backend, frontend y [gate técnico local de operación](RESULTADOS/LOTE-OPERACION-validacion.md)
aprobados. Próximo lote: BE-04 borrador → UX-03 especificación → BE-04
implementación/FE-03 consumidor, con revisión enfocada por tarea y global al
final. Las cinco acciones iniciales siguientes se conservan como roadmap
histórico: INF-01/INF-03 aún tienen fases humanas/externas pendientes y G1 no
se considera completo. Investigación/fuentes/hosting/off-host mantienen sus
entradas; sin compra, publicación ni despliegue.

1. **RES-01 y RES-03, fase protocolo:** preparar un único guion/cohorte, consentimiento, tarea de 20 cartas y diccionario de medición. Delegables ya; la ejecución con participantes viene después.
2. **UX-01 y UX-02:** cerrar DEC-01/02 con contratos existentes, estados de revisión/guardado y política de campos públicos. Entregar especificaciones; no editar JSX.
3. **BE-02 y BE-01:** reproducir ambigüedad de guardado y acordar solución; implementar contrato público/vigencia. Hacer un encargo por ID y entregar contratos duplicados coherentes.
4. **FE-01 y FE-02:** implementar las especificaciones y contratos resueltos; verificar lote mixto, guardado parcial y enlace con caché caliente.
5. **INF-01, BE-03, INF-02 e INF-03:** elegir arquitectura propuesta, completar readiness y paquete DINOv2, y comprobar restore. Solo entonces preparar uso de beta en ese entorno.

La preparación documental y RES-04 pueden avanzar en paralelo. Los listados agrupados son secuencias dentro de una acción, no un prompt que mezcla áreas.

## Horizonte de 90 días

**Supuesto editable:** 20 horas semanales, 13 semanas, aproximadamente 260 horas. No conocemos todavía la disponibilidad efectiva del dueño. Presupuesto de bloques orientativo, sujeto a los rangos de cada ID y a la evidencia. Los 38 IDs son cartera de trabajo; no se promete terminarlos todos dentro de este horizonte.

| Ventana | Capacidad | Foco | Condición para avanzar |
|---|---:|---|---|
| Semanas 1–3 | 60 h | Protocolos, decisiones de inventario/privacidad, BE-02/01 y FE-01/02 | Lote mixto y link público cumplen contrato; errores/ambigüedad tienen salida |
| Semanas 4–6 | 60 h | Runtime, readiness, restore, licencias preliminares, evaluación y beta acotada | Paquete limpio funciona y datos recuperables; participantes y muestra disponibles |
| Semanas 7–8 | 40 h | Precios comprensibles, métricas mínimas, dispositivos reales y copy fiel | Cobertura/fecha explicadas y evidencia de tareas en móvil; sin claims fabricados |
| Semanas 9–10 | 40 h | Recuperación de cuenta, Redis/operación, primeras cohortes y economía | Recuperación probada, costos estimados con inputs y decisión comercial documentada |
| Semanas 11–12 | 40 h | Un piloto Pro si hay GO; si no, resolver mayor fricción de recurrencia | Beneficio concreto, entrega operable y requisitos de pago antes de cobrar |
| Semana 13 | 20 h | Revisar resultados, backlog y siguiente ciclo | Decisión seguir/cambiar/frenar con denominadores y límites |

Reservá aproximadamente 20% de cada bloque para integración, revisión, fallos y documentación. Si el núcleo excede capacidad, postergá SEO-02/03, MKT-03 y Pro; no reduzcas pruebas de privacidad/restore para cumplir calendario. Reestimá FE-06/BE-08 cuando se elija beneficio: sus rangos iniciales no comprometen una suscripción automatizada completa en 40 horas. D28 y dos renovaciones dependen de fechas reales y pueden terminar fuera de los 90 días.

## Gates verificables

| Gate | Evidencia exigida | Dueños |
|---|---|---|
| G0 · Encargos preparados | Planes, IDs, fronteras, prompts y entradas pendientes explícitas | Coordinación; cumplido solo para documentación |
| G1 · Beta acotada operable | UX-01/02, BE-01/02/03, FE-01/02, INF-02/03 aceptados; licencias RES-04 sin impedimento material pendiente para el uso previsto | Front/back/UX/infra/investigación |
| G2 · Ampliación pública | G1; RES-02/03 medidos en dispositivos reales; FE-03, recuperación BE-05/FE-04, mensajes MKT-01/FE-07, SEO-01 y soporte/operación comprobados | Producto y responsables de cada entrega |
| G3 · Construir piloto Pro | NEG-01/02/03 documentados; un beneficio recurrente, usuarios comprometidos, costo sostenible como hipótesis y DEC-05 GO | Negocio/dueño |
| G4 · Cobrar piloto | Beneficio utilizable y permisos correctos; confirmación/conciliación de pagos, vencimiento/baja/soporte, requisitos y fuentes resueltos; autorización de cobro aplicable | Negocio/back/front/operación |
| G5 · Expandir | Retorno y uso recurrente observados, pagos reales cuando corresponda, dos renovaciones y margen/tiempo revisados | Negocio/investigación |

Los tamaños de muestra y umbrales en RES-03 son criterios exploratorios, no garantía estadística. El gate puede concluir NO-GO con evidencia; esa conclusión cierra la decisión comercial sin marcar una implementación inexistente como completa.

## Entrega entre áreas

| Entrega | Responsable que la produce | Consumidor | Frontera |
|---|---|---|---|
| Interacción/estados | UI/UX | Frontend | UX especifica; FE escribe componentes |
| API/errores/consistencia | Backend | Frontend | BE define contrato; tipos duplicados se actualizan en la misma entrega |
| Mediciones y segmento | Investigación | UX/negocio/marketing | Investigación conserva método y evidencia; destinatarios deciden con ella |
| Copy con evidencia | Marketing | FE-07 y SEO | Marketing redacta; FE incorpora; SEO adapta metadata sin inventar promesas |
| Política SEO y metadata | SEO | Frontend si necesita nueva UI | SEO puede editar exports acotados acordados; nuevas pantallas requieren nuevo ID FE |
| Health/runtime/configuración | Backend / infraestructura | Operación | BE escribe endpoint; INF configura empaquetado/probes y mide recursos |
| Oferta/pago/periodos | Negocio | UX/BE-08/FE-06 | Beneficio/precio se decide antes de código; API y UX completan su propio contrato |

Para un handoff nuevo registrá: ID origen, área destinataria, problema, archivos, entrada disponible, aceptación, dependencia y estimación. Si requiere código que no cubre ningún ID, el coordinador crea un ID del área destinataria y lo añade al registro antes de delegarlo.

## Evitar colisiones

Máximo recomendado: una tarea de implementación activa para el dueño y hasta dos tareas independientes de análisis/especificación delegadas. Un mismo archivo tiene un responsable activo. FE y SEO no editan simultáneamente layouts, páginas o metadata; reservar archivo/ventana en el registro. El coordinador es el único que consolida el registro cuando hay varias entregas.

Cambios de API/DTO se entregan con su espejo frontend; esa obligación transversal no habilita implementar una segunda feature de otra área. Infra no modifica servicios de aplicación para resolver health; entrega requisitos a BE-03. UI especializada entrega spec; si también programa, recibe luego un encargo FE separado.

## Marketplace: fuera del núcleo

1. **Compartir entre conocidos:** ya hay links y duplicados; primero corregir privacidad y probar utilidad para organizar intercambio.
2. **Interés/contacto:** investigar tareas reales y solicitudes recurrentes. Antes de programar, decidir visibilidad, consentimiento, bloqueo y canal de contacto; crear planes específicos si hay demanda.
3. **Descubrimiento/reputación/moderación:** requiere resolver abuse, soporte, identidad y capacidad operativa. Las colecciones actuales no se vuelven indexables automáticamente.
4. **Transacciones:** considerar solo con demanda, confianza y operación verificadas, y requisitos de pagos/disputas definidos. Marketplace no se agrega a los planes de front/back por aproximarse una fecha.

## Refinamientos futuros con Lyra

Los prompts de las ocho áreas ya se refinaron en modo BÁSICO con el contexto disponible. Para una tarea nueva todavía ambigua, usar Lyra en modo DETALLADO antes de abrir implementación: objetivo, evidencia, scope propio, exclusiones, entrada, aceptación y artefacto. La salida vuelve al plan/registro como ID; no autoriza contactos, pagos ni despliegues por sí misma.
