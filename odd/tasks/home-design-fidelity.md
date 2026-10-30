# Home Viñeta — fidelidad y fluidez
Objetivo: corregir sólo Home contra el artboard existente; mantener datos/acciones reales y no rediseñar otras pantallas. Base actualizada: `b21a2c9ae3fb979277d1d01ee00f5ae89e9cd6a5`, rama `fix/home-design-fidelity`, PR general #23 ya publicado.
Entrega: otro PR limitado a Home, contra `master`, sin issue por instrucción humana; capturas sólo locales/ignoradas de Home y referencia, sin videos/traces ni imágenes en GitHub.

## Specs

- **S1** — “que quede exactamente igual que el desiño, comencemos con el home”. Referencia: `design/vitrina-variantes/03-vitrina-comic.html`, vista `home()`. Contrastar composición, jerarquía y estados en navegador, no certificar igualdad por tests funcionales.
- **S2** — “Las animaciones estan lentas, no parecen fluidas”. Reproducir antes de cambiar; distinguir duración intencional del artboard de cuadros perdidos. Registrar métricas observadas y conservar pausa/reduced-motion.
- **S3** — “la cartas en la vitrina no estan exactamente igual a como estaba en el diseño, los iconos y las secciones no quedaron igual”. Corregir cartas, iconos y secciones de Home usando la referencia, preservando los datos reales y las acciones existentes del producto.
- **S4** — “limitemos el scope por pantalla asi podemos hacer todas las validaciones y dejar en cada PR cada pagina.” No mezclar backend, otras pantallas ni fixes de dependencias.
- **S5** — “ok, oriemro baja los cambios de main, arranca con las correcciones solo de HOME, cuando termines crea un PR contra main con este fix, sin issue, avismae cuando termines.” Base confirmada (verbatim): “si master”. Base actualizada origin/master b21a2c9, PR general #23 mergeado. Entregar un PR exclusivo de Home contra master, sin issue y sin merge.
- **S6** — Selección humana exacta: “Sí, capturas locales para comparar el Home” (value: allow_local_home_reference_screenshots). Pregunta autorizada: “¿Autorizás capturas comparativas locales únicamente del Home y del artboard, con datos de prueba, sin subir imágenes a GitHub y sin generar videos ni traces?”

## Tasks

- **H1** [S1-S4,S6] — Reproducir y guardar baseline comparativa Home/referencia, geometría/iconos/secciones y movimiento. Ruta: parent + mapa read-only ya entregado; probes locales aislados. Estado: done — cuatro combinaciones runtime observadas: tres del job23 y desktop/claro del recheck autorizado job24. Ocho capturas y cuatro reportes locales; discrepancias geométricas reproducidas, sin afirmar jank causal resuelto. Commit: `7261873` (producto, pruebas y guía; baseline local ignorada). No afirmar FPS desde código ni capturar otras pantallas.
- **H2** [S1-S4] — Implementar Home fiel, con composición de cartas, iconos/secciones y movimiento; conservar datos reales y estados/acciones existentes. Ruta: inline tras fallo del writer acotado; una sola unidad de comportamiento, sin editar artboard. Estado: done — ajuste final del hero completado y focal9/9/tipos verdes; implementación de composición, abanico, galería y compartir; iconos gated a /inicio. RED 4 nuevas/3 previas; GREEN focal final 9/9 y tipos. Navegador post-fix inicial 4/4 (job1); ajustes de título/marca/pausa posteriores esperan comparación final en H3. Commit: `7261873` (producto, pruebas y guía; baseline local ignorada). Superficie derivada del mapa; cambios compartidos sólo si se limitan por ruta a Home y se prueban rutas previas.
- **H3** [S1-S4,S6] — Validar comparación visual/movimiento, foco, pausa/reduced-motion, regresión fuera de Home y gate pnpm run check con ownership/serialización. Ruta: parent; verifier independiente sólo si aparece Risk item concreto. Estado: done — job3 navegador4/4 y pnpmruncheck completo0; diferencial7rutas y verificador9/9+13/13/tipos0; Risk: item 3 (BottomNav compartido; nuevos iconos sólo Home), requiere diferencial y verificador independiente. Commit: `7261873`. No repetir pruebas verdes intactas ni inventar tolerancias/evidencia.
- **H4** [S4-S5] — Documentar resultado/límites, commits locales revisables, evaluación nativa si corresponde y PR exclusivo de Home contra master, sin issue, sin merge ni imágenes. Ruta: parent. Estado: in_progress — preparación de commits y PR autorizado contra master sin issue. Commit: cierre de esta feature. No declarar terminado si falta comparación autorizada o hay fallos de producto.

## Log

**L1 — Pedido original (verbatim)**

primero sube el PR con todo, luego hagamos algo, vamos pagina por pagina, que quede exactamente igual que el desiño, comencemos con el home y asi vamos avanzando, limitemos el scope por pantalla asi podemos hacer todas las validaciones y dejar en cada PR cada pagina.

**L2 — Fallo reportado (verbatim)**

Crea el PR y sube todo.

Luego, te pregunto, ya se implemento todo el design? Las animaciones estan lentas, no parecen fluidas, la cartas en la vitrina no estan exactamente igual a como estaba en el diseño, los iconos y las secciones no quedaron igual

**L3 — Permiso y mapa previos**

User selected: 1. Sí, capturas locales para comparar el Home (value: allow_local_home_reference_screenshots)

Mapa read-only mvv1deai-b-9fbs: referencia tiene hero/abanico de tres cartas, sección Tu vitrina de cuatro cartas, tarjeta compartir y columna valor/objetivos; app actual tiene otra jerarquía, grilla en vez de abanico y otro conjunto de iconos. Son hechos estáticos, no medidas de fluidez. La referencia usa fallback system-ui y la app Geist; design/system.md documenta ambos, con CSS vigente como fuente de tokens. La fidelidad se limita a Home, sin cambiar tipografía global. Las ilustraciones editoriales y textos de muestra no reemplazan cartas/valores reales ni estados de autenticación de producto.

PR23/issue22 y autorizaciones de publicación quedaron registrados en la feature anterior. Source baseline431f075 limpio antes de crear rama. Capturas a frontend/.playwright-output/home-fidelity/ o salida ignorada equivalente dentro del proyecto; sin .env, inventario real ni fotos privadas como fixtures. No hay Chrome DevTools MCP disponible según inventario; usar Chromium local/DOM/RAF sin traces, sin citar métricas no medidas.


**L4 — Preparación no equivale a baseline**

La preparación inicial asignada a un verificador no produjo archivos por permisos read-only. El primer handoff del writer fue rechazado por formato de Allowed edit surfaces; se reparó sin ejecutar. Otro writer señaló incompatibilidad entre helpers con salidas fijas y la superficie permitida; parent amplió sólo directorios efímeros locales/ignorados que esos helpers ya usan, sin consultar al humano por una decisión técnica.

Writer mvv2ateo-e-n1lw completó seis archivos bajo frontend/.playwright-output/home-fidelity/baseline/: fixtures,preload,launch,config,home.spec,probe. Sólo node--check de seis archivos y setup finito pasaron; ningún navegador, captura o métrica runtime se ejecutó todavía. No hay RED/GREEN de producto. H1 sigue in_progress; H2-H4 pending. No cambios de producto ni nuevos commits de Home. El parent verificará launcher y ejecutará una sola baseline aislada bajo lock en background.

PR23 verificadoOPEN/Draft/head431f075/únicatype:feature. CI seguridad41066982428 concluyósuccess; CodeQL observadoverde. Eso cierra publicación inicial, no fidelidad de Home.


**L5 — Baseline parcial, sin cierre ni retry automático**

Job23 terminó1:3 comparaciones pasaron (390x844 claro/oscuro y1440x1000 oscuro);1440x1000 claro falló en expectURL/login con timeout5000ms antes de entrar a Home. Su tráfico sólo registró dos404 de conversión deshabilitada: ningúnPOSTlogin, ningúnrequestinesperado y ningúnpageerror. No se atribuye todavía la falta de submit a un bug de producto ni se afirma causa de hidratación demostrada. El harness entraba directamente a/login; el patrón existente de la suite entra mediante una acción hidratada desde/escanear.

Se produjeron6PNG de Home/referencia y3 reportes comparativos válidosJSON, más4 reportes de tráfico. Cero error-context.md retenidos. La lectura inicial de unJSON excedió límite de50KB del tool y su parse de salida truncada falló; los archivos completos se parsearon estructuralmente después, sin interpretar aún métricas/causalidad desde salida truncada. No se inventan FPS ni diferencias numéricas no revisadas. No hubo captura de login, video o trace.

H1 queda blocked por prueba parcial y necesita decisión para una sola ejecución focal desktop/claro después de corregir readiness de login del harness; no hubo reejecución automática. Parent conserva la decisión técnica de usar el flujo público hidratado y comprobar campos antes del único submit, sin aumentar timeout para esconder el fallo ni tocar login de producción. H2-H4 siguen pending. No existe modificación de producto Home ni PR Home; PR23 sigue publicado con CIverde observado, sinmerge.


**L6 — Recheck focal autorizado**

User selected: 1. Authorize one focused desktop/light rerun (value: authorize_one_home_desktop_light_recheck)

Se cambió sólo harness ignorado: entrar a login por la acción pública hidratada de/escanear, comprobar campos y esperar el únicoPOST200, sin ampliar timeout. Launcher acepta filtro Playwright para ejecutar sólo1440x1000-light. Sintaxis de los dos archivos pasó. Se conserva el fallo original; nueva ejecución todavía pendiente. H1 vuelve a in_progress y H2-H4 permanecen pending.


**L7 — Baseline completada con recheck explícito**

Job24 terminó0, un test desktop/claro pasó35s; no se repitieron los otros tres. Hay cuatro combinaciones,8PNG autorizados locales y4reportes. Se inspeccionó par móvil claro: grilla/jerarquía/iconos no coinciden con referencia. Medidas móviles: cartas actuales~87.33px en flujo estático y±4deg contra132px absolutas y±12deg; shelf216.41px contra248px. Desktop oscuro: cartas137.84px contra172px; shelf286.95px contra300px. Falta galería de cuatro cartas y tarjeta compartir; orden/ubicación de valor/objetivos difiere.

En los tres casos inicialmente revisados,120intervalosRAF por ventana tuvieron p95~16.7–16.8ms y0longtasks, semejantes a referencia. Son callbacks idle con SVGs sintéticos, no FPS de render ni reproducción de decodificación de imágenes reales o interacción. No atribuir causalidad ni prometer mejorar0ms. H2 debe igualar composición/propiedades de movimiento y H3 comparar, conservando límites. Fuente de aplicaciónGeist está sustituida porArial en el harness; referencia system-ui. Usar fallbackdocumentado sóloHome para comparación consistente, sin cambiar tipografía global. Prototipo incluye chrome/leyendas de maqueta que no se deben publicar como datos o afirmaciones falsas de producto.

Callers verificados: AppPreview también vive en marketing/landing-page.tsx; no modificarlo globalmente para Home. PersonalShowcase/HomeCta/HomePortfolioSummary sólo aparecen en Home. Shell/nav y CollectionGoalPanel son compartidos: cualquier cambio debe ser Home-only con regresión de rutas previas, y Riskitem3 si se toca lógica compartida. H1done/H2in_progress; no se ha modificado producto todavía. Antes de tests de producto parent detendrá sólo sus previews propios12/15 y comprobará ownership/puertos; baseline3100 ya terminó.


**L8 — Continuación inline y reconciliación**

Usuario (verbatim): “sigue”

Writer mvv56mdw-f-qwfk devolvió assistant reported an error, sin evidencia válida. No se relanza. Parent recuperó contexto/mirror/archivo y comprobó Git: rama fix/home-design-fidelity y únicamente odd/tasks/home-design-fidelity.md untracked, sin cambios de frontend/producto ni parciales que promover. Puertos3000/3001/3100 libres; los previews propios12/15 fueron detenidos y pnpmstop terminó0 antes del intento. H1 conserva su evidencia4combinaciones/8capturas; H2 continúa inline, sin RED/GREEN de producto aún. H3/H4 siguen pending. PR23 no se modifica.


**L9 — Plan reconciliado y RED sin exagerar evidencia**

Se agregaron cuatro regresiones de Home por reglas solicitadas. Primera corrida focal terminó1:4fallidas y3previasverdes. Secciones e icono fallaron por diferencias observables reales. Abanico/movimiento esperaron texto que CardTile no imprime en su variantecollection, por lo que esa precondición era incorrecta y no se presenta como evidencia de esas reglas. Se corrigió para esperar la imagen con nombre accesible y luego comprobar las propiedades solicitadas; la siguiente corrida se registra aparte. H2 sigue in_progress, sólo test nuevo y tracking cambiados; producción aún intacta. H3/H4pending.


**L10 — Estado verificado del plan**

La corrida posterior a corregir las precondiciones terminó con código 1: cuatro pruebas nuevas fallan y tres existentes pasan. Los fallos actuales son: falta la sección «Cartas que cuentan algo.», falta la lista accesible «Cartas destacadas», el trazado SVG de Inicio difiere del artboard y falta el elemento de arte animable esperado. Las aserciones posteriores de poses y pausa todavía no se alcanzan: no se presentan como comprobadas. Git confirma sólo dos archivos nuevos sin seguimiento: el test y este documento; no hay cambios de producto. H1 permanece done con su evidencia previa; H2 sigue in_progress, sin GREEN ni implementación; H3 y H4 siguen pending. No se agregó trabajo ni se cambió el alcance.


**L11 — Nueva entrega autorizada (verbatim)**

ok, oriemro baja los cambios de main, arranca con las correcciones solo de HOME, cuando termines crea un PR contra main con este fix, sin issue, avismae cuando termines.

Confirmación de base (verbatim): “si master”. Fetch observado y fast-forward a origin/master b21a2c9; PR23 mergeado. Mantener baseline histórica, sin inventar prueba post-fix.


**L12 — Implementación y comprobaciones focales**

H2 implementado inline sobre master. Job1 post-fix pasó4/4 (móvil/escritorio ambos temas), poses172/132px y alturas300/248px, foco, sin overflow, pausa de3animaciones y reduced-motion. Se revisaron PNG móvil Home/referencia; se corrigió peso de h2 y marca móvil después. Último focal9/9 y tiposverdes; primer typecheck detectó opciones exact de TestingLibrary no admitidas y luego condition sintética near_mint (contrato NM), ambos corregidos. Sin cambios backend/artboard/otras páginas. Diferencias editoriales de datos no se presentan como píxel-idénticas.


**L13 — Gate verde y ajuste visual observado**

Job2 terminó0: navegador4/4 y pnpmruncheck completoverde. Lectura de capturas detectó un enlace duplicado de Personalizar y metadatos que estiraban el hero; H2 se reabre para esa corrección acotada. Las referencias de precios se conservan en un disclosure, sin duplicar el CTA del hero. H3 vuelve pending para verificar el candidato final; no se atribuye el verde anterior a código posterior.


**L14 — Corrección acotada normalizada y diferencial**

Se retiró CTA duplicado sólo con cartas cargadas, manteniendo enlace en vacío; las referencias por variante siguen accesibles en details. Se ajustó agrupación/espaciado del texto y peso/alineación de botones. Diferencial de BottomNav compara markup público con b21a2c9 en7rutas noHome:7/7idénticas. Primer script falló antes de escribir por root mal resuelto (ENOENT en /Projects/frontend); se corrigió sólo la ruta y una ejecución pasó. Último focal9/9 y tiposverdes. H2done/H3in_progress; falta comparación final, gate y verificador.


**L15 — Verificación independiente final**

Gentle-ai-verify mvvgykf3-1-c94h: sin bloqueantes reproducibles. En scratch9/9tests candidatos,13/13probes propios y tipos0. Cubriópausa/reduced/hidden,bootstrap,guest/vacío/error/retry/logout-race/disclosure,7rutas noHome. Iniciales6fallos de harnesspor orden de atributos se corrigieron comparandoDOM; sinfixproducto. S1/fidelidadvisual siguependiente del parent; noFPS. Job3 iniciado para último navegador/gate tras compactarhero; no nuevos sourcewrites mientras corre. No se promueven probes efímeros como si fueran cambiosdelrepo.


**L16 — Evaluación nativa del candidato normalizado**

ASSESS final sobre14paths/733diff-lines: nativeRiskmedium, reviewDuefalse (under_budget). Escalaciónitem3 requiere verificador independiente, ya ejecutado sobre este mismo producto final. No corresponde INSPECT/START ni se afirma aprobaciónnativa. Verificación funcional siguependiente deljob3.


**L17 — Validación final observada**

Job3 terminó0:4/4navegador y pnpmruncheck completoverde (lint/tipos/tests/builds). PNGfinal revisado desktopclaro y móviloscuro, además de referencias ya leídas. Cuatro reportes: shelf300px/cartas172px desktop, shelf248px/cartas132px móvil; ángulos−12/+12/0 ycentro−12 verificados por navegador. Foco, cerooverflowhorizontal, pausa3animaciones y reduced-motion pasan;0pageerrors. RAFp9516.7–16.8ms/0longtasks en ventanaidle sintética; noFPS ni causalidad. Hero520px vs512pxreferencia desktop;890px vs956px móvil por textos/metadatos/acciones y datosdeproducto, no igualdadpíxel a píxel. Se conserva la marca real, selector de colección, estados reales, campos y acceso a compartir; no se publican demo, cuatro cartas inventadas ni falsa serie. Capturaslocalesignoradas, sinvideo/trace/upload. H3done/H4in_progress. No fallos de producto pendientes; quedan limitaciones explícitas de arte/entorno de comparación y CI remoto por ejecutar tras PR.


**L18 — Unidad de producto committeada**

`7261873` — fix(home): align Vineta composition and card motion.13archivos producto/pruebas/guías,439adiciones/177borrados, una sola pantalla. Riskitem3: BottomNavgated; verificador/diferencial cumplidos. Siguiente unidad documental conserva este registro; push/PR contra master autorizados, sinissue/sinmerge. No hay capturastracked.
