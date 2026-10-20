# Plan de Frontend

**Cierre vigente CUENTA, 10/10:** recuperación implementada y validada localmente, **FE-04 completada localmente**. [Gate](RESULTADOS/LOTE-CUENTA-validacion.md) y [aceptación root](RESULTADOS/LOTE-CUENTA-aceptacion-root.json): **979/979 pruebas estándar, cero skips**, lint/tipos frontend/builds Nest y Next Turbopack verdes; **81 controles integrados distintos por fases**, correo DI en memoria/API/Next reales, sesiones revocadas, errores/incertidumbre, SW y QA390/1280 ambos temas. Bug real popstate/hashchange corregido con regresión antes/después. Root verificó160hashes/24enlaces,507fuentes (sólo2deltas autorizados),6recibos y298/2085outputs intactos durante runtime; cleanup y conteos/GIN/IDs compartidos corroborados independientemente. **17/38 completos,21pendientes: FE3/BE3/UX2/RES3/INF3/SEO3/MKT1/NEG3** (13locales+4documentales). BE-05 recuperación aceptada; ID parcial por canal/operador/retención de eliminación/backups ya registrados. Correo externo/producción, HTTPS, bfcache real, teléfonos y lectores de pantalla no acreditados. Timeout backfill histórico sin causa localizada, conservado; no repetir global/diagnóstico para verde. Sin reservas ni recursos propios vivos. Siguiente lote serial disponible: FE-07/SEO-03 implementación de adquisición con copy/briefs aceptados, sin repetir preparación. Automatización ACTIVE/2horas recibida preservada.

**Checkpoint previo de reserva gate CUENTA:** backend BE-05 y consumidor FE-04 corregidos/revisados, aceptados como entradas. [FE-04 revisión](RESULTADOS/FE-04-review.md)/[aceptación root](RESULTADOS/FE-04-review-aceptacion-root.json):69casos distintos por fases, lint/tipos finales verdes; root83hashes artefactos/26fuentes/27copias/7baselines/321inventario/19enlaces. /root/be05_account_draft_review_sol es único escritor y dueño de suites/DB/Redis/build/runtime del gate: stop/check estándar exacto y API/Next compilados/correo DI privado, navegador propio, cleanup por ownership. Sin dev/TEST/Redis compartidos ni terceros; root único centrales. BE-05/FE-04 y lote pendientes,16/38 completos,22pendientes. BE-05 política de eliminación/canal/operador/retención conservan entrada humana; no cerrar por recovery solamente. No otra implementación ni repetir BE-07. Automatización ACTIVE/2horas recibida preservada.

Fecha: 2026-10-07 · Estado: FE-01/FE-02/FE-03/FE-08 completados localmente; lotes validados · IA objetivo: Codex.

## Objetivo

Implementar flujos coherentes de inventario, compartir y precios sobre la UI existente.

## Alcance y fronteras

**Incluye:** Componentes, hooks, cliente HTTP, estado y tests frontend. Actualizar documentación de los flujos tocados.

**Fuera de alcance:** Diseño de producto sin especificación; backend, Prisma, Docker, SEO técnico, compra de servicios, creación de contenidos de adquisición y modelo comercial. Puede incorporar copy ya validado mediante FE-07.

Leé [el índice](README.md), [las decisiones](10-decisiones-y-contratos.md) y AGENTS.md antes de ejecutar. Elegí una sola tarea por entrega; los gates no se satisfacen por pasar el tiempo.

## Evidencia de partida

- [frontend/AGENTS.md](../../../frontend/AGENTS.md)

- [frontend/docs/build-guide.md](../../../frontend/docs/build-guide.md)

- [frontend/docs/design-system.md](../../../frontend/docs/design-system.md)

- [frontend/docs/scanner.md](../../../frontend/docs/scanner.md)

- [frontend/components/scanner/organize-sheet.tsx](../../../frontend/components/scanner/organize-sheet.tsx)

- [frontend/components/scanner/session-storage.ts](../../../frontend/components/scanner/session-storage.ts)

- [frontend/lib/scanner/camera-visual.ts](../../../frontend/lib/scanner/camera-visual.ts)

- [frontend/components/collections/portfolio-overview.tsx](../../../frontend/components/collections/portfolio-overview.tsx)

- [frontend/app/share/[slug]/page.tsx](../../../frontend/app/share/[slug]/page.tsx)


La evidencia es estática al 7/10 o documentada con su fecha. Revalidá código y cambios locales antes de actuar; no atribuyas a esta planificación tests, mediciones o entrevistas nuevas.

## Tareas delegables


### FE-01 — Guardar el acabado y la condición elegidos

Estado: Completada localmente · Luna + revisión/correcciones Sol HIGH (76 enfocadas); [gate frontend](RESULTADOS/LOTE-FRONTEND-validacion.md): 815 pruebas y flujo real · Prioridad: P0 · Estimación orientativa: 16–28 h.

**Dependencias/entradas:** UX-01; DEC-01. Coordinar el resultado de BE-02.

**Trabajo:** Agregar variante/condición al draft y enviar campos ya soportados por addItem. Agrupar por carta, variante y condición, preservando runIds y correcciones. Permitir separar copias del mismo ID. Elegir precio por variante, nunca prices[0] por posición. Definir restauración de draft según UX-01; no persistir recortes. Si no hay respuesta cierta al guardar, no reintentar automáticamente una mutación aditiva.

**Aceptación:** Lote con normal/NM, reverse/NM y normal/LP conserva grupos, cantidades y precios correspondientes. Guardado parcial retira solo lecturas confirmadas. Corregir candidata conserva una lectura. Reabrir/recargar sigue política documentada, con lectura tolerante del storage previo. Una respuesta perdida se muestra como resultado incierto hasta reconciliar según BE-02.

**Entregable:** Implementación, regresiones significativas y evidencia del flujo autenticado; frontend/docs/scanner.md actualizado.


### FE-02 — Aplicar el contrato público y vigencia del enlace

Estado: Completada localmente · consumidor público + UI privada/preview; Luna/Sol HIGH (52 enfocadas), temas/teclado y [gate frontend](RESULTADOS/LOTE-FRONTEND-validacion.md) aprobados · Prioridad: P0 · Estimación orientativa: 8–16 h.

**Dependencias/entradas:** UX-02; BE-01; DEC-02.

**Trabajo:** Consumir el DTO público acordado, adaptar vista/preview y truncamiento o paginación elegidos. Hacer coherente la caché de Next con revocación/vencimiento definidos en BE-01, incluyendo generateMetadata. Mostrar alcance, campos visibles y controles de vencimiento. No indexar links ni añadir descubrimiento.

**Aceptación:** Enlace revocado o vencido deja de servir payload/metadata en nuevas solicitudes según DEC-02, incluso con caché caliente. No reaparecen notas privadas. Más de 500 ítems comunica alcance correcto. Aclarar que una página ya abierta o una copia externa no puede retractarse.

**Entregable:** Vista y cliente adaptados; verificación anónima, caché caliente y teclado.


### FE-03 — Explicar cobertura y frescura de la valuación

Estado: Completada localmente · Luna/Sol HIGH; gate estándar y consumidor real aceptados · Prioridad: P1 · Estimación orientativa: 8–16 h.

**Dependencias/entradas:** UX-03; BE-04; DEC-03.

**Trabajo:** Mostrar procedencia, fecha de consulta, fecha upstream si existe, variante y cobertura/antigüedad del total. Conservar distinción vacío=0, desconocido=null y valor parcial. Explicar condición sin ajuste, ARS convertido y observaciones del portafolio; no presentar ROI ni tasación local.

**Aceptación:** Fixtures fresco/viejo/sin fecha/sin precio/parcial muestran estados distintos. Selector de variante cambia referencia. Históricos explican movimientos y cambio vigente, sin inventar tipo de cambio pasado. Flujo comprensible con lector de pantalla.

**Entregable:** UI de ficha y portafolio con estados comprobados y documentación.


**Cierre local aceptado, 9/10 UTC (ejecución 8/10 local):** [nuevo gate estándar](RESULTADOS/LOTE-VALORES-cierre.md)/[aceptación de coordinación](RESULTADOS/LOTE-VALORES-cierre-aceptacion-root.json). Stop/check exacto en verde:894 pruebas/0skips, lint/tipos/builds Nest y Next Turbopack;15API+7SSR actuales, QA real390/1280 claro/oscuro y cleanup. Corrección acotada de transporte workerThreads experimental en next.config.ts, sin cambiar bundler/versions/contrato. Históricos EPERM/webpack conservados. No teléfonos físicos, participantes, precisión, producción ni snapshot completo de DB.


### FE-04 — Recuperar acceso a la cuenta

Estado: Completada localmente · Luna/Sol HIGH; [gate CUENTA](RESULTADOS/LOTE-CUENTA-validacion.md)/[aceptación root](RESULTADOS/LOTE-CUENTA-aceptacion-root.json),979/0skip,81integradas por fases, correo de prueba/QA/cleanup · Prioridad: P1.

**Dependencias/entradas:** UX-04; BE-05.

**Trabajo:** Agregar ingreso al flujo de recuperación en login, solicitud y cambio de clave con DTO contratado. Manejar token inválido/vencido/usado, red y cierre de sesión. No persistir ni enviar token de recuperación en analítica o logs.

**Aceptación:** Respuesta de solicitud no confirma si existe el email. Usuario recupera acceso con correo de prueba; token inválido y repetido se resuelven con copy/acción concreta. Cookie y CSRF existentes se conservan.

**Entregable:** Pantallas, API client, tests del flujo y evidencia en correo de prueba.


### FE-05 — Instrumentar el embudo acordado

Estado: Pendiente; automatización diferida para primera ronda manual según [DEC-04](RESULTADOS/DEC-04-medicion-minima.md) · Prioridad: P1 · Estimación orientativa: 6–10 h.

**Dependencias/entradas:** RES-03 protocolo; DEC-04; BE-06 si el receptor es propio.

**Trabajo:** Emitir eventos mínimos de registro/activación, lectura propuesta/corregida, guardado confirmado, enlace creado y retorno. Distinguir origen, resultado y tiempos sin fotos, texto de notas, email, JWT ni URLs con tokens/slugs privados. Deduplicar efectos de StrictMode y errores. No sumar una nueva plataforma por defecto.

**Aceptación:** Diccionario de eventos coincide con RES-03; una acción produce el conteo esperado. Falla del receptor no bloquea guardar. Ningún payload incluye secretos ni recortes; rechazos 503 no se contabilizan como reconocimiento exitoso.

**Entregable:** Instrumentación acotada y evidencia de payloads anonimizados.


### FE-06 — Integrar únicamente el beneficio Pro elegido

Estado: Condicionado a validación · Prioridad: P2 condicional · Estimación orientativa: Reestimar, máximo primer lote 20 h.

**Dependencias/entradas:** NEG-01 y NEG-03 GO; UX-05; BE-08.

**Trabajo:** Implementar estado del plan, acceso al beneficio elegido, cuota si se acordó, estado de pago y baja. Un retorno del checkout no habilita Pro por sí solo. Mantener lectura/exportación básica y datos al bajar a Free. No implementar alertas, vendedor ni tres beneficios juntos.

**Aceptación:** Permisos provienen de API; pago pendiente/rechazado/activo/vencido y baja funcionan. Beneficio cumple el alcance vendido. Datos siguen disponibles al terminar Pro; fallo técnico de escaneo no consume cuota según contrato.

**Entregable:** UI del piloto, tests y evidencia de estados; no publicación externa automática.


### FE-07 — Incorporar mensajes validados de landing y FAQ

Estado: Completada localmente · [cierre adquisición](RESULTADOS/LOTE-ADQUISICION-cierre.md) aceptado root: copy/QA/CTA/preview y check982reutilizado · Prioridad: P1 · Estimación orientativa: 3–6 h.

**Dependencias/entradas:** MKT-01 matriz actual/propuesto/evidencia. UX-03 si se modifica explicación de precios. Coordinar archivos con SEO-03.

**Trabajo:** Aplicar únicamente los textos entregados para landing/FAQ en los componentes existentes. Mantener rutas, CTA y design system; revisar composición mobile/desktop y ambos temas. No crear beneficios, fijar precios ni decidir mensajes desde frontend. Los cambios de metadata pertenecen a SEO.

**Aceptación:** Cada texto coincide con la matriz aprobada por el responsable de marketing y capacidades verificadas. Historial básico y CSV no figuran como ausentes. Pro futuro no parece disponible para cobrar. Sin desbordes en tamaños móviles ni alteración accidental de enlaces.

**Entregable:** Componentes actualizados y evidencia visual local; trazabilidad a MKT-01. Publicación externa fuera de esta tarea.


### FE-08 — Base privada de API para SSR de producción

Estado: Completada localmente; SSR privado/consumidor real y [gate operación](RESULTADOS/LOTE-OPERACION-validacion.md) aprobados Luna/Sol HIGH · Prioridad: P0 integración INF-02 · Estimación: 1–2 h.

**Origen/entrada:** INF-02-review.md y BE-03-validacion.md revisados; nuevo handoff frontend indispensable de INF-02, sin feature de UI.

**Problema:** NEXT_PUBLIC_API_URL=/api conserva same-origin del browser pero el fetch SSR de compartir/ficha requiere URL absoluta; hoy production usa la misma base relativa.

**Scope exclusivo:** frontend/lib/api/api-client.ts, api-client.test.ts y frontend/docs/api-client.md. No UI, rutas, DTO, cookies, token-storage, Next config, packages ni Docker.

**Contrato:** browser usa su base pública y nunca API_INTERNAL_URL; server production lee API_INTERNAL_URL privada absoluta con trailing slash normalizado; desarrollo conserva DEV_API_PROXY_TARGET y fallback actuales. Sin env privada conserva fallback previo; no concatenar /api adicional, congelar valor privado al importar ni exportar hostname interno al bundle. La env describe la base completa con /api.

**Aceptación:** regresiones enfocadas server/browser/producción/desarrollo/fallback y resolución en runtime; lint/tipos y revisión Sol HIGH por tarea. SSR real compartir/ficha y ausencia del hostname interno en bundle se verifican junto a INF-02; gate global sólo al cerrar operación. No declarar ID completo antes del gate.

**Entregable:** RESULTADOS/FE-08-implementacion.md y revisión Sol HIGH. Infra configura la env en su fase propia.

**Prompt refinado con Lyra — BÁSICO, Codex:**

```text
Actuá como ejecutor frontend. Implementá solamente FE-08. Leé AGENTS raíz/frontend, guía Next instalada de environment variables, INF-02-review.md y FE-08 en 01-frontend.md. Preservá cambios locales y API/session anteriores. Reservas exclusivas api-client.ts/test y docs/api-client.md; entregá RESULTADOS/FE-08-implementacion.md, sin editar registros/otros planes. API_INTERNAL_URL es privada del server production y se resuelve al usar la base; browser continúa /api y development su proxy actual. Ejemplo: public=/api + internal=http://backend:3001/api/ ⇒ server=http://backend:3001/api, browser=/api. Sin internal conserva fallback previo. No UI, cookies/refresh, DTO, Docker, paquetes ni publicación. pnpm run stop antes de tests; enfocadas + lint/tipos, no check global. Esperá revisión/correcciones Sol HIGH antes de habilitar INF-02. SSR real y bundle se prueban en INF-02 aislado, no se atribuyen a tests mockeados.
```

**Qué refinó Lyra:** separó consumidor/configuración de infraestructura, ejemplos por runtime y gate compartido sin expandir el flujo de sesión.

## Prompt refinado con Lyra

Modo BÁSICO: contexto preservado, scope cerrado, dependencias y aceptación explícitos. No se requiere una segunda optimización para comenzar. Sustituí únicamente el ID; los demás insumos están en los documentos.

```text

Actuá como especialista de Frontend para PokéScan. Ejecutá solamente [ID_DE_TAREA] del archivo docs/plans/lanzamiento-2026-10-07/01-frontend.md.

Leé primero README.md y 10-decisiones-y-contratos.md de esa carpeta, AGENTS.md raíz y las instrucciones de la carpeta que vas a tocar. Inspeccioná el estado real y los cambios locales: no sobrescribas trabajo ajeno ni reimplementes funcionalidades existentes.

Tu alcance es: Componentes, hooks, cliente HTTP, estado y tests frontend. Actualizar documentación de los flujos tocados.
No incluye: Diseño de producto sin especificación; backend, Prisma, Docker, SEO técnico, compra de servicios, creación de contenidos de adquisición y modelo comercial. Puede incorporar copy ya validado mediante FE-07.

Comprobá las dependencias del ID. Si falta una, hacé solo preparación independiente, documentá la entrada faltante y dejá la tarea pendiente; no inventes contratos/resultados ni expandas scope. Una decisión comercial/externa no se reemplaza por tiempo transcurrido.

Respetá versiones/pnpm, DINOv2 exclusivo, fotos de consulta no persistidas y límites/cola/caché de fuentes. No reveles secretos ni datos personales. No mandes mensajes, publiques, cobres o contrates servicios salvo autorización humana explícita aplicable a esa acción.

Entregá los cambios/artefactos concretos del ID, referencias, criterio de aceptación verificado, pruebas/mediciones realmente ejecutadas y límites pendientes. Por corrección del usuario, cada tarea requiere pruebas enfocadas y revisión Sol Alto; pnpm run stop antes de tests. El pnpm run check global y flujo real aislado se hacen al finalizar el lote FE-01/FE-02, no por tarea. Investigación/diseño sin código validan fuentes/enlaces/estados y no afirman check verde. Entregá evidencia y estado al coordinador, único responsable de consolidar REGISTRO-TAREAS.md y los planes. No cierres tareas de otras áreas. Coordiná los cambios del registro para evitar escrituras simultáneas.

```


**Qué refinó Lyra:** separó responsabilidades, transformó mejoras generales en entregables observables, distinguió hipótesis de hechos y agregó gates para evitar construir Pro o marketplace sin evidencia.


**Consejo de uso:** delegá el ID y su plan completo; no copies solamente el título. Entregá dependencias resueltas y registrá cualquier cambio de contrato antes de implementar.
