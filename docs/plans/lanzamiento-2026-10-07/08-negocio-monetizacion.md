# Plan de Negocio y monetización

Fecha: 2026-10-07 · Estado: plan preparado, ejecución no iniciada · IA objetivo: ChatGPT / dueño de producto.

## Objetivo

Decidir oferta, precio y viabilidad del piloto antes de encargar suscripciones.

## Alcance y fronteras

**Incluye:** Oferta Free/Pro, hipótesis y experimento de precio, escenarios editables, gates y requisitos operativos de cobro/cuenta. Esta área extra evita repartir decisiones comerciales entre frontend y marketing.

**Fuera de alcance:** Código, cobros reales, contrato legal redactado como certeza, apertura de cuentas, contratación de planes, campañas, promesa de rentabilidad y transacciones marketplace.

Leé [el índice](README.md), [las decisiones](10-decisiones-y-contratos.md) y AGENTS.md antes de ejecutar. Elegí una sola tarea por entrega; los gates no se satisfacen por pasar el tiempo.

## Evidencia de partida

- [frontend/components/marketing/landing-page.tsx](../../../frontend/components/marketing/landing-page.tsx)

- [frontend/components/marketing/faq-section.tsx](../../../frontend/components/marketing/faq-section.tsx)

- [frontend/docs/portfolio.md](../../../frontend/docs/portfolio.md)

- [backend/prisma/schema.prisma](../../../backend/prisma/schema.prisma)

- [backend/src/modules/collections/portfolio.service.ts](../../../backend/src/modules/collections/portfolio.service.ts)

- [docs/security.md](../../../docs/security.md)


La evidencia es estática al 7/10 o documentada con su fecha. Revalidá código y cambios locales antes de actuar; no atribuyas a esta planificación tests, mediciones o entrevistas nuevas.

## Tareas delegables


### NEG-01 — Definir oferta con un beneficio recurrente

Estado: Pendiente · Prioridad: P1 decisión; implementación P2 · Estimación orientativa: 4–8 h.

**Dependencias/entradas:** RES-01 y RES-03 evidencia; DEC-05.

**Trabajo:** Conservar búsqueda, colección, duplicados, progreso, compartir y CSV básicos gratuitos. Comparar más escaneos y seguimiento automático con usuario real; elegir uno como beneficio central. Rango ARS 4k/6k/8k y cuotas 100/1000 son hipótesis del 6/10, no precios/capacidad validados. Evitar anualidad hasta renovar y no quitar funciones existentes a usuarios.

**Aceptación:** Ficha beneficio/alcance/costo/tarea recurrente/medición/limitación/baja. GO de construir piloto puede venir de participantes comprometidos y pruebas; pago solo cuando beneficio usable. Validación comercial requiere 5–10 pagos y observar dos renovaciones, que pueden exceder 90 días. NO-GO documentado si no hay evidencia.

**Entregable:** RESULTADOS/NEG-01-oferta.md y decisión DEC-05 para BE-08/UX-05/FE-06/MKT-01.


### NEG-02 — Actualizar escenarios y punto de equilibrio

Estado: Pendiente · Prioridad: P1 · Estimación orientativa: 4–8 h.

**Dependencias/entradas:** INF-01 presupuesto; RES-04 datos/licencias; RES-03 consumo.

**Trabajo:** Modelar activos×conversión×precio; churn y reemplazo, comisiones/devoluciones, datos por créditos, inferencia/DB/storage/backup/correo, soporte y remuneración del dueño. Usar precios oficiales con fecha y modalidad; cambio ARS/USD editable. Si inferencia comparte host, repartir costo sin duplicar. Separar inversión hundida e incremental, caja y resultado económico, impuestos pendientes.

**Aceptación:** Tres escenarios con fórmulas editables y sensibilidad de precio, conversión, cambio y horas. Las horas de soporte son parte del total, no doble descuento. Cobros y costos argentinos verificados o marcados hipótesis. No asumir que USD29 alcanza para toda la carga ni garantizar escala por MAU.

**Entregable:** RESULTADOS/NEG-02-economia.md con inputs y fórmulas; archivo de hoja solo si se solicita o es útil y se sigue skill correspondiente.


### NEG-03 — Requisitos de piloto pago y bajas

Estado: Pendiente · Prioridad: P1 antes de cobro · Estimación orientativa: 4–8 h.

**Dependencias/entradas:** RES-04 fuentes; NEG-01; INF-01 correo/hosting; DEC-05.

**Trabajo:** Revisar Mercado Pago por link/manual vs API con fuentes oficiales actuales, medios recurrentes y tarifas de la cuenta. Definir activación por pago confirmado, período, renovación fallida, baja, devolución, conciliación y datos al downgrade. Registrar requisitos de privacidad, eliminación, términos, facturación/tributos y atribuciones; derivar revisión profesional donde no se pueda verificar. No cobrar ni redactar autorización comercial inexistente.

**Aceptación:** Matriz estado-pago-permiso-baja con propietario operativo. Lista de requisitos para cobrar cerrada o marcada pendiente; no habilitar plan por redirect/authorized. Prototipo manual tiene registro auditable y fecha de vencimiento. Ninguna acción externa se ejecuta en esta entrega.

**Entregable:** RESULTADOS/NEG-03-piloto.md, brief backend/frontend y checklist GO de cobro.


**Preparación de cuenta aceptada, 9/10:** [requisitos](RESULTADOS/NEG-03-cuenta-requisitos.md)/[revisión Sol HIGH](RESULTADOS/NEG-03-cuenta-review.md) y [aceptación root](RESULTADOS/NEG-03-cuenta-aceptacion-root.json). Sesiones/JWT, propiedad/cascadas, cachés/share/SSR/SW, seis capas de eliminación/restores, concurrencia y sandbox precisados.57enlaces/32fuentes/8artefactos corroborados antes de centrales. Entrada documental para borrador BE-05; UX-04 espera ese contrato y la implementación sus gates. NEG-03 completo/GO cobro, normativa, canal/retención/off-host y demás decisiones pendientes. Sin código/suites/runtime/contactos.

## Prompt refinado con Lyra

Modo BÁSICO: contexto preservado, scope cerrado, dependencias y aceptación explícitos. No se requiere una segunda optimización para comenzar. Sustituí únicamente el ID; los demás insumos están en los documentos.

```text

Actuá como especialista de Negocio y monetización para PokéScan. Ejecutá solamente [ID_DE_TAREA] del archivo docs/plans/lanzamiento-2026-10-07/08-negocio-monetizacion.md.

Leé primero README.md y 10-decisiones-y-contratos.md de esa carpeta, AGENTS.md raíz y las instrucciones de la carpeta que vas a tocar. Inspeccioná el estado real y los cambios locales: no sobrescribas trabajo ajeno ni reimplementes funcionalidades existentes.

Tu alcance es: Oferta Free/Pro, hipótesis y experimento de precio, escenarios editables, gates y requisitos operativos de cobro/cuenta. Esta área extra evita repartir decisiones comerciales entre frontend y marketing.
No incluye: Código, cobros reales, contrato legal redactado como certeza, apertura de cuentas, contratación de planes, campañas, promesa de rentabilidad y transacciones marketplace.

Comprobá las dependencias del ID. Si falta una, hacé solo preparación independiente, documentá la entrada faltante y dejá la tarea pendiente; no inventes contratos/resultados ni expandas scope. Una decisión comercial/externa no se reemplaza por tiempo transcurrido.

Respetá versiones/pnpm, DINOv2 exclusivo, fotos de consulta no persistidas y límites/cola/caché de fuentes. No reveles secretos ni datos personales. No mandes mensajes, publiques, cobres o contrates servicios salvo autorización humana explícita aplicable a esa acción.

Entregá los cambios/artefactos concretos del ID, referencias, criterio de aceptación verificado, pruebas/mediciones realmente ejecutadas y límites pendientes. Por corrección explícita del usuario, cada tarea requiere pruebas enfocadas y revisión/corrección Sol HIGH, con pnpm run stop antes de tests. Al finalizar el lote asignado por 11-orquestacion.md se ejecutan pnpm run check global y flujo real aislado/limpieza cuando afecta datos; no repetir global por tarea. Investigación/diseño sin código validan fuentes/enlaces/estados y no afirman check verde. Entregá artefacto/evidencia al coordinador, único escritor de REGISTRO-TAREAS.md y estados de los planes. No cierres tareas de otras áreas ni avances un lote con gate pendiente/fallido.

```


**Qué refinó Lyra:** separó responsabilidades, transformó mejoras generales en entregables observables, distinguió hipótesis de hechos y agregó gates para evitar construir Pro o marketplace sin evidencia.


**Consejo de uso:** delegá el ID y su plan completo; no copies solamente el título. Entregá dependencias resueltas y registrá cualquier cambio de contrato antes de implementar.
