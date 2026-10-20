# UX-04 — revisión de especificación de cuenta

Fecha: 2026-10-09 · Revisor: **GPT-6.1 Sol HIGH** · Dictamen: **especificación corregida y aceptada documentalmente para preparar FE-04/BE-05**. Implementación/evidencia funcional y cierre de UX-04 quedan para coordinación; no se resuelve el gate fallido BE-07 ni se habilitan suites/runtime.

Reserva limitada a [UX-04-cuenta.md](UX-04-cuenta.md), este informe y [evidencia propia](evidencia-ux04-cuenta-review/baseline-review.json). Se preservaron antes de editar el [documento Luna recibido](evidencia-ux04-cuenta-review/UX-04-cuenta-recibido.md) (SHA-256 `c366aabfcfd8de2d304e84b95c8bb5e3e16ca67e96b1354c1f8b713551aab335`) y ambos JSON originales; éstos permanecen intactos. Los 22 sources/18 links históricos no se atribuyen a la versión corregida. [Diff](evidencia-ux04-cuenta-review/correcciones.diff), [verificación final](evidencia-ux04-cuenta-review/verificacion.json) y [hashes finales](evidencia-ux04-cuenta-review/hashes-finales.json) registran la entrega.

Se aplicaron [frontend-ios-elegante](/Users/ysmaelalcalarico/.codex/skills/frontend-ios-elegante/SKILL.md) y su [dirección visual](/Users/ysmaelalcalarico/.codex/skills/frontend-ios-elegante/references/direccion-visual.md), anunciadas al empezar. Se leyó la descripción conservada, sin afirmar inspección de las capturas originales. Fuentes selectivas: instrucciones raíz/frontend, BE-05 y aceptación root, UX-04/DEC-05, diseño/build/componentes/rutas/gotchas, AuthShell/login/Field/PasswordInput/Input/Button/Alert, sesión cliente y DTO de contraseña. Se conservaron tokens, shells/providers y auth exitoso; no se propuso rediseño.

## Correcciones

1. **Recarga/navegación/StrictMode:** URL bare es solicitud normal. Marcador no secreto en history.state preservando estado de Next distingue entrada de enlace sin captura; no identifica una recarga. Captura idempotente en memoria previa a quitar fragmento, sin releer vacío en StrictMode ni limpiar por cleanup simulado. Vacío/malformado, navegación/back/bfcache y marcador indisponible tienen salida segura; sin GET/validación/envío por montaje. Es propuesta FE-04, no mecanismo construido.
2. **Correo y privacidad:** asunto/cuerpo/CTA sintéticos planificados con duración de 30 min propuesta y acciones de vencimiento/pedido ajeno, sin host/remitente/persona/URL real. 202 sólo recepción, sin promesa de entrega; email repetido omitido. Token permitido exclusivamente en memoria y body POST necesario, excluido de URL API/storage/log/evidencia/analytics.
3. **Errores/acciones:** 400 INPUT_INVALID con fields seguros conserva token y pide corregir; RECOVERY_LINK_INVALID ofrece nuevo pedido. 403 tiene salida a login, 429 segundos positivos/fallback local 60 s sin countdown anunciado cada segundo, y 503/cuerpo 200 inválido/red en cambio son inciertos. Login primario/nuevo enlace secundario, sin replay del POST ni transferir clave al login.
4. **Microcopy/components/accesibilidad:** h1 de cambio de cuatro palabras; títulos/CTA breves, error de campo concreto, Alert breve con roles por tono. Foco al h1/resultados/primer error según contexto, teclado/toggle/44 px locales futuros, AA/zoom/safe areas/scroll/reduced motion como criterios pendientes. Toggle actual 40 px no se declara corregido. Link de navegación usa variantes de Button, sin asChild inexistente.
5. **Sesión y límites:** limpieza sólo tras éxito confirmado, sin auto-login/logout al abrir link. Prevención de respuestas bootstrap/refresh viejas es requisito FE-04 futuro. Se respeta revocación PG propuesta y límite de requests en vuelo; eliminación/operación/legal siguen condicionadas, sin UI/endpoint/canal prometidos.

## Verificación y límites

La verificación es estática y selectiva: enlaces/anchors, hashes originales/fuentes, diff y coherencia semántica de estados frente a BE-05 y primitivas. Los criterios de aceptación son futuros; no se generaron tests espejo ni se hizo QA visual/funcional. La existencia de un enlace no acredita el soporte semántico ni una garantía implementada.

No se cambió contrato BE-05, código, DTO/schema/specs, paquetes ni centrales; no tests/check/stop, suites, build, DB/Redis, runtime/API/web/browser, red, correo o contactos. FE-04 debe probar captura/estado histórico/StrictMode, forma de respuestas, submits/reenvíos, limpieza/races y accesibilidad con consumidor BE-05/sandbox; TTL/quotas/entrega y eliminación mantienen sus gates. No afirmar cierre de IDs o check verde.

**Reserva liberada:** root puede consolidar este documento; sólo root actualiza aceptación y estados centrales.
