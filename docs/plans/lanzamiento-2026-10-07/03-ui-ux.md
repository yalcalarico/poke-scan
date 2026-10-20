# Plan de UI/UX

Fecha: 2026-10-07 · Estado: especificaciones en ejecución; implementación fuera del área · IA objetivo: Agente especialista de UI.

## Objetivo

Entregar especificaciones pequeñas y verificables reutilizando el design system.

## Alcance y fronteras

**Incluye:** Flujos, wireframes, estados, microcopy funcional, accesibilidad y validación de diseños. Entregables Markdown o prototipos adjuntos; implementación JSX pertenece a frontend.

**Fuera de alcance:** Cambios de API/modelo/datos, heurísticas DINOv2, promesas comerciales, SEO técnico, reemplazo del design system o edición simultánea de componentes con frontend.

Leé [el índice](README.md), [las decisiones](10-decisiones-y-contratos.md) y AGENTS.md antes de ejecutar. Elegí una sola tarea por entrega; los gates no se satisfacen por pasar el tiempo.

## Evidencia de partida

- [frontend/docs/design-system.md](../../../frontend/docs/design-system.md)

- [frontend/docs/components.md](../../../frontend/docs/components.md)

- [frontend/docs/scanner.md](../../../frontend/docs/scanner.md)

- [frontend/components/scanner/organize-sheet.tsx](../../../frontend/components/scanner/organize-sheet.tsx)

- [frontend/components/scanner/scan-match-sheet.tsx](../../../frontend/components/scanner/scan-match-sheet.tsx)

- [frontend/components/collections/item-sheet.tsx](../../../frontend/components/collections/item-sheet.tsx)

- [frontend/components/share/share-link-creator.tsx](../../../frontend/components/share/share-link-creator.tsx)

- [frontend/components/collections/portfolio-overview.tsx](../../../frontend/components/collections/portfolio-overview.tsx)


La evidencia es estática al 7/10 o documentada con su fecha. Revalidá código y cambios locales antes de actuar; no atribuyas a esta planificación tests, mediciones o entrevistas nuevas.

## Tareas delegables


### UX-01 — Especificar revisión e inventario del lote

Estado: especificación aceptada por coordinación · Prioridad: P0 · Estimación orientativa: 6–10 h.

**Dependencias/entradas:** DEC-01; usar protocolo RES-02.

**Trabajo:** Definir candidata propuesta, revisión, elección manual de acabado/condición, separación de copias, cantidades y precio correspondiente. Especificar comportamiento al cerrar hoja, recargar y corregir candidata. Conservar cámara automática y sesión salvo evidencia en contra; similitud no es certeza. Resolver ocupado/fallo parcial/resultado de guardado incierto con acciones concretas.

**Aceptación:** Flujo de 20 lecturas cubre múltiples variantes/condiciones del mismo ID y alternativa fuera del top-8 mediante búsqueda manual. Matriz de estados desktop/390 px, teclado y lector; componente/tokens existentes mapeados. Draft restaurable definido sin persistir recortes.

**Entregable:** [UX-01-flujo.md](RESULTADOS/UX-01-flujo.md), entregado y revisado el 7/10: estados, copy, componentes y criterios FE-01. La especificación no acredita uso con participantes; implementación BE-02/FE-01 aceptada localmente en [gate frontend](RESULTADOS/LOTE-FRONTEND-validacion.md).


### UX-02 — Definir compartir con control de visibilidad

Estado: especificación aceptada por coordinación · Prioridad: P0 · Estimación orientativa: 4–8 h.

**Dependencias/entradas:** DEC-02.

**Trabajo:** Diseñar preview de campos públicos, alcance de todas/una colección, notas privadas y vencimiento/revocación. Definir qué ve quien abre link y comportamiento >500 ítems. Carpeta solo intercambio se diseña como variante posterior, no ampliar contrato inicial si no es imprescindible. Mantener enlaces noindex.

**Aceptación:** Especificación determina exactamente campos visibles y totales; usuario anticipa exposición; diferencia revocar nuevas consultas de borrar copias externas. Estados vacío, expirado, revocado, truncado o paginado están resueltos.

**Entregable:** [UX-02-compartir.md](RESULTADOS/UX-02-compartir.md), matriz aceptada el 7/10 después de revisión/corrección por GPT-6 Luna; implementación BE-01/FE-02 aceptada localmente en [gate frontend](RESULTADOS/LOTE-FRONTEND-validacion.md), sin acreditar participantes.


### UX-03 — Especificar lectura honesta del valor

Estado: Especificación aceptada Luna/Sol HIGH; implementación y gate estándar local aceptados; comprensión con participantes pendiente · Prioridad: P1 · Estimación orientativa: 4–8 h.

**Dependencias/entradas:** DEC-03; contrato borrador BE-04.

**Trabajo:** Diseñar fuente, fechas, variante, cobertura, valor parcial y condición registrada sin ajuste. Explicar ARS convertido e historial por consultas. Mantener gráfico/top cards actual y estados accesibles; no diseñar rentabilidad ni históricos cambiarios inexistentes.

**Aceptación:** Fresco/viejo/sin upstream/parcial/desconocido/colección vacía tienen copy y jerarquía distintas. Prueba de comprensión objetivo 9/10, registrada con denominador; falta de participantes deja validación pendiente.

**Entregable:** RESULTADOS/UX-03-valores.md y pauta de prueba para RES-03/FE-03.

**Fase documental 8/10:** [especificación](RESULTADOS/UX-03-valores.md) y [revisión/corrección Sol HIGH](RESULTADOS/UX-03-review.md) aceptadas. Handoff por pantalla/contrato, copy de consulta/upstream/cobertura/ARS/historia, accesibilidad y protocolo alineado RES-03 con numerador/denominador/completitud. Sin implementación ni pruebas visuales/personas; 9/10 es objetivo pendiente. Habilita BE-04 implementación y después FE-03; gate integrado al final del lote.


### UX-04 — Especificar recuperación y acciones de error

Estado: Completada documentalmente; implementación del consumidor pertenece a BE-05/FE-04 · Prioridad: P1 · Estimación orientativa: 3–6 h.

**Dependencias/entradas:** Borrador de contrato BE-05; sin esperar implementación.

**Trabajo:** Diseñar solicitud de recuperación, correo, cambio de clave, token vencido/usado y confirmación. Definir error de red sin enumerar cuentas. Entregar comportamiento de foco, validación y navegación, usando formularios existentes.

**Aceptación:** No revela si email existe; estados se resuelven con una acción verificable. Flujo completo accesible, incluidos token inválido y retorno al login; no rehacer auth exitoso.

**Entregable:** [UX-04-cuenta.md](RESULTADOS/UX-04-cuenta.md) para FE-04/BE-05.

**Fase documental 9/10 aceptada:** Luna→[revisión/corrección Sol HIGH](RESULTADOS/UX-04-review.md)→[aceptación root](RESULTADOS/UX-04-aceptacion-root.json).26 fuentes/31 enlaces/9 hashes corroborados antes de consolidación. Solicitud no enumerante, correo propuesto, captura en memoria/StrictMode/recarga, errores/resultado incierto, reenvío explícito, foco y componentes actuales. Sin implementación, envío ni QA real; consumidor y evidencia funcional BE-05/FE-04 pendientes en sus propios IDs. UX-04 cumple su alcance de especificación y no espera implementación, como indica su entrada. Corrección de coordinación: la clasificación parcial anterior agregó un requisito ajeno al ID. Gate BE-07 no se resuelve con esta entrega.


### UX-05 — Especificar únicamente la oferta Pro validada

Estado: Condicionado a validación · Prioridad: P2 condicional · Estimación orientativa: 4–8 h.

**Dependencias/entradas:** NEG-01 y NEG-03 GO; DEC-05.

**Trabajo:** Diseñar beneficio seleccionado, precio/período, límite si corresponde, pago pendiente y baja. Diferenciar historial por consultas ya gratis de seguimiento automático nuevo; conservar exportación básica. No agregar badges/temas como supuesto motor de pago.

**Aceptación:** Pantallas reflejan alcance contratado, fecha de renovación y acceso al terminar período. Sin dark patterns ni promesas futuras presentadas como disponibles. Prueba de comprensión de precio/baja registrada.

**Entregable:** RESULTADOS/UX-05-pro.md para FE-06.


## Prompt refinado con Lyra

Modo BÁSICO: contexto preservado, scope cerrado, dependencias y aceptación explícitos. No se requiere una segunda optimización para comenzar. Sustituí únicamente el ID; los demás insumos están en los documentos.

```text

Actuá como especialista de UI/UX para PokéScan. Ejecutá solamente [ID_DE_TAREA] del archivo docs/plans/lanzamiento-2026-10-07/03-ui-ux.md.

Leé primero README.md y 10-decisiones-y-contratos.md de esa carpeta, AGENTS.md raíz y las instrucciones de la carpeta que vas a tocar. Inspeccioná el estado real y los cambios locales: no sobrescribas trabajo ajeno ni reimplementes funcionalidades existentes.

Tu alcance es: Flujos, wireframes, estados, microcopy funcional, accesibilidad y validación de diseños. Entregables Markdown o prototipos adjuntos; implementación JSX pertenece a frontend.
No incluye: Cambios de API/modelo/datos, heurísticas DINOv2, promesas comerciales, SEO técnico, reemplazo del design system o edición simultánea de componentes con frontend.

Comprobá las dependencias del ID. Si falta una, hacé solo preparación independiente, documentá la entrada faltante y dejá la tarea pendiente; no inventes contratos/resultados ni expandas scope. Una decisión comercial/externa no se reemplaza por tiempo transcurrido.

Respetá versiones/pnpm, DINOv2 exclusivo, fotos de consulta no persistidas y límites/cola/caché de fuentes. No reveles secretos ni datos personales. No mandes mensajes, publiques, cobres o contrates servicios salvo autorización humana explícita aplicable a esa acción.

Entregá los cambios/artefactos concretos del ID, referencias, criterio de aceptación verificado, pruebas/mediciones realmente ejecutadas y límites pendientes. Por corrección explícita del usuario, cada tarea requiere pruebas enfocadas y revisión/corrección Sol HIGH, con pnpm run stop antes de tests. Al finalizar el lote asignado por 11-orquestacion.md se ejecutan pnpm run check global y flujo real aislado/limpieza cuando afecta datos; no repetir global por tarea. Investigación/diseño sin código validan fuentes/enlaces/estados y no afirman check verde. Entregá artefacto/evidencia al coordinador, único escritor de REGISTRO-TAREAS.md y estados de los planes. No cierres tareas de otras áreas ni avances un lote con gate pendiente/fallido.

```


**Qué refinó Lyra:** separó responsabilidades, transformó mejoras generales en entregables observables, distinguió hipótesis de hechos y agregó gates para evitar construir Pro o marketplace sin evidencia.


**Consejo de uso:** delegá el ID y su plan completo; no copies solamente el título. Entregá dependencias resueltas y registrá cualquier cambio de contrato antes de implementar.
