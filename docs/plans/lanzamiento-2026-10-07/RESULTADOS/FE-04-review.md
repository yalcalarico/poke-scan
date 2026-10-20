# FE-04 — revisión y correcciones

Sol6.1 HIGH · run `fe04-review-88331833f831` · 10/10/2026 UTC.
Entrega apta como entrada al gate integrado; FE-04 sigue pendiente hasta check estándar y correo de prueba con API/Next reales. Esta revisión no cierra BE-05 ni otros IDs.

## Resultado

Se corrigió la implementación recibida contra [UX-04](/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/docs/plans/lanzamiento-2026-10-07/RESULTADOS/UX-04-cuenta.md) y [contrato BE-05](/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/docs/plans/lanzamiento-2026-10-07/RESULTADOS/BE-05-contrato-borrador.md). Se aplicaron [frontend-ios-elegante](/Users/ysmaelalcalarico/.codex/skills/frontend-ios-elegante/SKILL.md) y su dirección visual mediante componentes/tokens existentes; no se acredita QA visual de navegador en esta fase.

- **Cambio confirmado e incertidumbre.** Se quitó la navegación automática a los 900ms. Éxito confirmado limpia sesión dentro de la cola y ofrece login manual. Código/status desconocido, body inesperado o fallo de transporte dejan login como acción primaria y pedido nuevo como secundaria; no queda formulario para repetir ese POST. 403 cambia acciones, 400 de campos conserva enlace/campos y enfoca el campo.
- **Privacidad del pedido.** 202 dice «Recibimos tu pedido», sin email duplicado ni promesa de entrega. El cliente no devuelve mensajes/valores arbitrarios del servidor: allowlista pares status/código y sustituye fields por copy local. El POST de recuperación fuerza redirect:error, no-store, sin bearer/refresh/replay; un redirect rechazado es incierto. El body legítimo conserva token/newPassword.
- **Sesión y respuestas tardías.** Refresh, login, registro, logout y reset comparten cola y Web Lock `pcs.session-mutation`. Se relee epoch al entrar al refresh y después de esperarlo, antes de replay/redirect. Limpieza tras reset ocurre antes de liberar la cola. El provider cerca bootstrap/refreshUser y toma el inicio efectivo de login/registro/logout para permitir la sesión posterior al reset. Sin Web Locks la coordinación es sólo local; generaciones no se sincronizan entre pestañas.
- **Entradas y captura.** Nueva entrada, incluso push bare a la misma ruta conservando state anterior, descarta token/campos/resultado. StrictMode reutiliza snapshot. Captura usa replace nativo sin publicar estado intermedio y conserva state ajeno. pagehide descarta el secreto; retorno marcado sin captura muestra no disponible. Sin controlador y con fragmento, falla cerrado. No hay GET de validación ni consumo por mount.
- **Formulario y accesibilidad.** Títulos hasta cuatro palabras; claves cuentan codepoints sin trim ni maxlength UTF16; ambos toggles reciben tamaño local 44px. Se conectaron errores Field reales y foco posterior al commit. 429 usa header seguro/fallback de 60s, texto estático y un anuncio al terminar, sin submit automático. HTML SSR: method POST, email vacío y controles/submit inertes hasta snapshot cliente; el fallback nativo no habilita GET con email en query.

Fuentes corregidas: [experiencia](/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/frontend/components/auth/recovery-experience.tsx), [captura](/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/frontend/lib/recovery/recovery-capture-script.ts), [vista](/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/frontend/lib/recovery/recovery-view.ts), [cliente HTTP](/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/frontend/lib/api/api-client.ts), [auth](/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/frontend/lib/api/auth.ts), [cola común](/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/frontend/lib/api/session-mutations.ts) y [provider](/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/frontend/hooks/use-auth.tsx).

## Evidencia observada

Antes de tests se ejecutó `pnpm run stop`: exit 0. No se ejecutaron backend, DB, Redis, build, global, navegador ni correo.

| Verificación | Observado | Alcance / log |
|---|---|---|
| Matriz ampliada | 67/67, 7 archivos, 0 skips | [focal-final.log](/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/docs/plans/lanzamiento-2026-10-07/RESULTADOS/FE-04-review-anexos/focal-final.log) |
| Helper corregido | 43/43, 4 archivos | [session-corrected.log](/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/docs/plans/lanzamiento-2026-10-07/RESULTADOS/FE-04-review-anexos/session-corrected.log) |
| UI/captura final + SSR | 24/24, 2 archivos | [ui-capture-ready.log](/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/docs/plans/lanzamiento-2026-10-07/RESULTADOS/FE-04-review-anexos/ui-capture-ready.log) |
| Lint frontend + guards | exit 0; 1 warning luego corregido | [lint-final.log](/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/docs/plans/lanzamiento-2026-10-07/RESULTADOS/FE-04-review-anexos/lint-final.log) + ESLint focal posterior |
| Typecheck raíz/frontend final | exit 0 | [typecheck-delivery.log](/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/docs/plans/lanzamiento-2026-10-07/RESULTADOS/FE-04-review-anexos/typecheck-delivery.log) |

Alcance final: **69 casos distintos**, no suma de rondas: 43 API/sesión/provider + 24 UI/captura + 2 SW sin cambios acreditados en la matriz ampliada. Los fetch, Web Locks, history/bfcache son stubs; SSR se verificó con renderToString de la experiencia real, no servidor Next levantado.

Fallas propias preservadas y resueltas: primera focal 41/42 por error Field omitido en el refactor; primera comprobación TS por genérico Web Locks; primer lint del fallback SSR por setState síncrono en efecto. No se escondieron con skips, cambios de config ni supresiones. El log inicial entregable redacta una contraseña sintética del DOM; hash/original privado quedan registrados en log-redaction.json.

## Preservación y alcance

[recibo y copias](/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/docs/plans/lanzamiento-2026-10-07/RESULTADOS/FE-04-review-anexos/received-sha256.json) conserva 27 archivos antes de mis edits, incluidos documento/JSON/resumen Luna. Los siete baselines de Luna se preservaron separados: son escalonados, no un único snapshot anterior al primer edit. Las 503 pruebas declaradas por Luna siguen siendo declaración del productor; validacion.txt no es raw log.

Inventario frontend recibido: 321 fuentes; 308 intactas, 13 cambios dentro de reserva y 2 archivos nuevos autorizados (cola común y test provider). tsconfig.tsbuildinfo es caché generada, excluida del inventario. No se usó este inventario para afirmar snapshot de todo el repo. [diff contra recibido](/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/docs/plans/lanzamiento-2026-10-07/RESULTADOS/FE-04-review-anexos/review-diff.patch) y [verificación](/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/docs/plans/lanzamiento-2026-10-07/RESULTADOS/FE-04-review-anexos/verification.json) distinguen fuentes finales y copias preservadas. Recibo Luna intacto.

No se crearon recursos; ownership liveResources=[] y procesos de comandos terminaron. No hubo DB/Redis que retirar. Centrales, backend, tipos espejo, config permanente ajena y UI de eliminación quedan fuera de esta revisión.

## Gate pendiente y límites

El siguiente gate debe ejecutar stop/check exactos sobre fuentes finales y API/Next compilados, correo DI privado en memoria y fixtures propias. Reutilizar [factory privada](/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/backend/test/password-recovery-mail-harness.ts) con clon compatible, users=0 al autorizar, IDs/email exactos predeclarados y listener loopback antes de payload; luego fixture sintética y login real. No SMTP, endpoints debug, trace/video, perfiles de usuario ni secretos en evidencias.

Pendientes operativos: headers/noindex/no-store SSR reales, service worker y purge reales, navegación/parches history Next, guards/version/refresh tras reset con respuesta real, tamaños computados/contraste/foco/teclado en 390/1280 y ambos temas. Back/reload no acreditan bfcache: sólo pageshow.persisted observado permite afirmarlo; en otro caso queda límite junto al caso sintético.

Eliminación y backups conservan el procedimiento y decisiones humanas registrados en BE-05/NEG-03: no se inventó canal, operador o retención ni se agregó endpoint/UI. Root determina el cierre del alcance BE-05 por separado.

Reserva FE-04 revisión liberada tras entregar estos artefactos; gate aún no ejecutado.
