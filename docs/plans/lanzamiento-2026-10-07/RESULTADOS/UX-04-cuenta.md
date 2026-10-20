# UX-04 — Recuperación de cuenta

Fecha: 2026-10-09 · Estado: **corregida y aceptada Sol HIGH como especificación documental** · Área: UX; implementación FE-04/BE-05 pendiente.

Esta propuesta convierte el contrato BE-05 aceptado como entrada en pantallas, copy, estados y criterios verificables. Recuperación aplica a Free y no requiere Pro ni cobro (DEC-05). No es implementación, no acredita envío de correo ni modifica el gate integrado BE-07, que sigue fallido.

## Alcance y navegación

- Desde `/login`, link secundario **“¿Olvidaste tu contraseña?”** a `/recuperar`, ruta propuesta en la rama `(auth)`/`PlainShell`, sin BottomNav ni nuevos providers. Hoy no existe en el inventario de rutas.
- Entrada bare `/recuperar` sin fragmento ni marcador: solicitud normal. El correo propone `/recuperar#token=<secreto>`; forma local admisible: un único parámetro `token`, 43 caracteres base64url sin padding. Fragmento vacío `#token=`, duplicado, inesperado o malformado: estado de enlace inválido. Esa forma sólo habilita el formulario, no demuestra validez del token. No hacer GET ni POST de validación.
- Antes de analytics/terceros, capturar el secreto una vez en un controlador de vista efímero en memoria y quitar fragmento con `history.replaceState`. Añadir sólo marcador no secreto `pcsRecoveryView: "link"` a `history.state`, preservando el estado preexistente de Next; nunca token, email, contraseña, hash o id de cuenta. Es propuesta FE-04, no mecanismo actual. El marcador sólo indica que esa entrada mostró un enlace; no prueba recarga, cuenta ni vigencia.
- Inicialización idempotente: el controlador captura y retira fragmento antes de publicar su estado al formulario; una segunda inicialización de StrictMode reutiliza esa captura en memoria y no relee un fragmento vacío como solicitud. No limpiar por el cleanup simulado de React; limpiar ante navegación real fuera de la vista, nueva entrada/enlace o `pagehide`. Ante retorno por historial/bfcache, sin captura vigente se presenta la salida segura del marcador. Resolver/testear integración con router/estado histórico en FE-04, sin escribir implementación ahora.
- Sin fragmento y con marcador `"link"`, pero sin token en memoria (recarga o retorno): Título **“Enlace no disponible”**. Cuerpo: “Volvé a abrirlo desde el correo o pedí uno nuevo.” CTA **“Pedir otro enlace”**. No afirmar que se detectó una recarga. Si no se puede guardar el marcador sin secreto, degradar a solicitud normal al perder memoria; no persistir credenciales para conservar el aviso. No habilitar cambio sin token; si no se puede quitar fragmento, no abrir el formulario ni terceros y ofrecer volver al flujo propio sin copiar el link.
- **“Pedir otro enlace”** desde cambio/error borra token y claves de memoria, reemplaza esta entrada por `/recuperar` con marcador `"request"` y muestra solicitud vacía; no envía. Back del navegador respeta el destino anterior; si vuelve a una entrada `"link"` sin captura, muestra salida segura, nunca reconstruye secreto. Login lleva a `/login` sin `next` arbitrario ni retorno externo. No afirmar limpieza de todo el historial: replace retira fragmento de la entrada actual.
- GET, preview, apertura, montaje, StrictMode, recarga, atrás y navegación nunca consumen, validan contra API ni envían/reenvían. Sólo submit explícito intenta cambio. Token sólo en memoria y en el **body JSON del POST de cambio**, como exige BE-05; nunca query/URL API, storage, logs, body de evidencia o analytics. FE-04 revisará arranque, Referrer-Policy/CSP y caché; no se acredita protección funcional hoy.
- Éxito confirmado ofrece **“Iniciar sesión”**, navegación replace a `/login`; no auto-login ni reanudación de destino previo. No transferir contraseña/token/email por URL, storage o estado de navegación al login: la persona usa el formulario normal y su gestor de contraseñas.

## Pantallas y copy

### Solicitar enlace — `/recuperar`

**Título:** “Recuperá tu cuenta”  
**Descripción:** “Ingresá el email de tu cuenta. Te vamos a indicar cómo seguir si el pedido puede procesarse.”

Campo **Email**, requerido, `type=email`, `inputMode=email`, `autoComplete=email`; aceptar pegar y gestores de datos. Validación local: vacío “Ingresá tu email.”; formato no válido “Revisá el formato del email.” No revelar si existe la cuenta.

CTA **“Pedir enlace”**; durante envío “Procesando…”, deshabilitado y `aria-busy`. Un único submit activo aunque coincidan doble clic, Enter o repetición de evento. No limpiar ni duplicar el email ante error.

Al `202` con cuerpo válido: reemplazar formulario por estado persistente **“Recibimos tu pedido”**; “Si corresponde y el envío puede completarse, vas a recibir instrucciones. Revisá también correo no deseado.” Omitir email repetido; conservarlo sólo en memoria si se necesita para un nuevo pedido manual, sin mostrarlo duplicado ni enviarlo a URL/evidencia/telemetría. **“Pedir otro enlace”** disponible después de 60 s desde aceptación local: primero vuelve al formulario, luego requiere submit manual. Espera mínima orientativa sujeta a cuotas, sin contador por cuenta ni promesa de emisión. Mantener deadline en memoria durante esta vista para que rerender/StrictMode no reinicien la espera; la autoridad de límites es backend, no el timer local. No reenvío automático.

### Correo planificado — sólo sandbox sintético

**Asunto:** “Recuperá tu cuenta de PokéScan”. **Cuerpo:** “Recibimos un pedido para cambiar tu contraseña. Abrí el enlace y elegí una nueva clave. El enlace vence a los 30 minutos desde su emisión y se usa una vez. Pedir otro no invalida éste; al cambiar la clave se invalidan todos. Si venció o no abre, pedí uno nuevo desde PokéScan. Si no hiciste este pedido, ignoralo: pedirlo no cambia tu clave ni cierra sesiones.” **CTA:** “Cambiar contraseña”, al destino frontend acordado más fragmento; placeholder documental `<enlace de prueba>` sin host, remitente, persona ni URL secreta real. Al implementarlo, informar duración efectiva configurada; 30 min/entrega siguen pendientes de ensayo BE-05/INF-01. No correo adjunto, tracking ni envío en esta fase.

### Cambiar contraseña — fragmento válido en forma local

**Título:** “Elegí tu nueva contraseña”  
**Descripción:** “Usá entre 8 y 72 caracteres. Después vas a tener que iniciar sesión.”

Campos **Nueva contraseña** (`new-password`) y **Repetí la contraseña** (`new-password`); ambos con revelar/ocultar, sin límites de composición inventados. Requeridos. La confirmación se compara localmente y no forma parte del DTO.

Validación previa al request: nueva vacía “Ingresá una contraseña.”; fuera de 8–72 caracteres “Usá entre 8 y 72 caracteres.”; confirmación vacía “Repetí la contraseña.”; distinta “Las contraseñas no coinciden.” Foco en primer error. No recortar/truncar claves ni impedir paste; inválida no consume ni envía token.

CTA **“Cambiar contraseña”**, pending “Cambiando…”, bloquea reentradas. Tras `200` con `{ success: true }` válido, mostrar **“Cambiaste tu contraseña”**, “Iniciá sesión con la nueva clave.” y botón **“Iniciar sesión”**. Sólo entonces limpiar access token, pista local y estado AuthProvider, además de aceptar limpieza de cookie del servidor. No auto-auth.

## Matriz de estados y acciones

| Estado observable | Mensaje / acción |
|---|---|
| Email vacío/formato inválido/más de 254 caracteres | `Field`: “Ingresá tu email.” / “Revisá el formato del email.” / “Usá hasta 254 caracteres.” Corregí y enviá. |
| Solicitud pendiente o cambio pendiente, Enter/doble clic | Un request activo; Button ocupado. Sin cola duplicada ni segundo submit. |
| Solicitud `202` con body contratado | “Recibimos tu pedido”, mismo copy para todos; no confirma entrega. Pedir otro mediante formulario/submit manual tras espera mínima, sujeto a cuotas. |
| `400 INPUT_INVALID` en solicitud | Mapear sólo `fields.email` al Field seguro; `fields.request`, campos desconocidos/ausentes: Alert “Revisá los datos ingresados.” Conservar email y corregir; no renderizar errores crudos ni valores devueltos. |
| `400 INPUT_INVALID` en cambio | `fields.newPassword`: Field “Usá entre 8 y 72 caracteres.”; `request`/campos desconocidos: Alert “Revisá los datos ingresados.” Conservar token en memoria, foco al primer campo inválido si existe; corregí sin pedir otro enlace ni asumir consumo. |
| `403 SESSION_REQUEST_FORBIDDEN`, solicitud o cambio | “No pudimos procesar el pedido desde esta página. Volvé a empezar desde PokéScan.” Acción **“Iniciar sesión”** a `/login`; limpiar secretos de esta vista al salir, sin simular éxito ni limpiar sesión autenticada. No reintento automático/detalle interno. |
| `429 RECOVERY_RATE_LIMITED`, solicitud o cambio | “Esperá un poco antes de volver a intentar.” CTA de submit bloqueado por `Retry-After` entero positivo válido. No mostrar cuota/contador de cuenta. El enlace puede vencer durante la espera; no se valida ni consume por esperar. |
| `429` sin `Retry-After` o malformado | Espera local de respaldo de 60 s, orientativa y sin garantizar aceptación. Luego reintento sólo manual; no loop. No parsear como fecha ni truncar decimales/negativos a cero. Backend debe emitir segundos positivos según contrato. |
| Solicitud `503 RECOVERY_UNAVAILABLE` | “No pudimos procesar el pedido ahora. Probá más tarde.” Conservar email, reintento manual; sin señal de existencia. |
| Solicitud red/timeout/5xx inesperado o `202` con body inválido | “No pudimos confirmar el pedido. Podés volver a intentarlo.” Conservar email; submit manual sujeto a cuotas, sin afirmar correo ni éxito. |
| Fragmento malformado o `400 RECOVERY_LINK_INVALID` (usado/vencido/revocado/versión vieja incluidos) | “El enlace no es válido o venció. Pedí uno nuevo para continuar.” **“Pedir otro enlace”** muestra solicitud; no envía ni distingue causa. Bare sin marcador es solicitud normal, no token ausente inválido. |
| Clave inválida/confirmación distinta, local | Mensajes por Field; token sigue en memoria y no se genera request. Corregí. |
| Cambio `503`, red/timeout/5xx inesperado, code/cuerpo inesperado o `200` sin `{ success: true }` válido | Resultado incierto: título **“No confirmamos el cambio”**; “Intentá iniciar sesión con la clave que elegiste. Si no funciona, pedí otro enlace.” Primaria **“Iniciar sesión”**; secundaria **“Pedir otro enlace”**. No ofrecer repetir ese POST, limpiar sesión como éxito ni reponer automáticamente el formulario de cambio. |
| Cambio `200` con body contratado | **“Cambiaste tu contraseña”**; “Iniciá sesión con la nueva clave.” Limpiar sesión local sólo tras éxito confirmado; aceptar cookie clear del servidor. Primaria **“Iniciar sesión”**. |

Mapear `code` y `fields` por allowlist al copy de esta especificación; no regex de mensajes ni exponer códigos/valores crudos. El cliente actual no conserva esos campos: adaptación FE-04 pendiente. Cualquier forma de respuesta no reconocida al cambiar va a incertidumbre. La confirmación local no llega al DTO; POST público usa `skipAuth`, `credentials: include` y header de sesión, sin replay por refresh. Tras incertidumbre, la persona inicia sesión con la clave elegida y sólo después pide otro si falla; no transportar esa clave al login. Un commit con respuesta perdida se resuelve así, sin repetir la mutación.

La misma UI/copy de solicitud aplica a emails existentes/inexistentes, incluso ante cuotas de identificador/fallo de entrega. No mostrar causa de token, expiración exacta, estado de correo, cupo ni existencia. Todos los reintentos son explícitos; errores/red no limpian cookie/access/provider como éxito. Solicitar enlace no cambia sesión.

## Disposición y componentes

Wireframe mobile (390 × 844):

```text
┌──────────────────────────────┐
│          marca PokéScan      │
│                              │
│  Recuperá tu cuenta          │
│  Ingresá el email…           │
│  [ Email                  ]  │
│  [ Pedir enlace           ]  │
│                              │
│       Iniciar sesión         │
└──────────────────────────────┘
```

En resultado, reemplazar campos por un Alert/estado legible y las acciones posibles; en cambio, mantener dos Fields, botón principal y enlace para pedir otro. Una acción primaria por pantalla. No ilustración ni paneles redundantes.

Dirección de [frontend-ios-elegante](/Users/ysmaelalcalarico/.codex/skills/frontend-ios-elegante/SKILL.md) y su [referencia visual](/Users/ysmaelalcalarico/.codex/skills/frontend-ios-elegante/references/direccion-visual.md): jerarquía sobria, radios suaves y controles cómodos a partir de su descripción conservada; no se vieron las capturas originales. Mantener tokens/tema actual, sin blur decorativo, colores nuevos ni paneles por estado. Reusar `AuthShell` para marca, ancho y superficie; `Field` + `Input` para email; `Field` + `PasswordInput` para claves; `Button` para submit y `Link` con sus variantes para navegación (no `asChild`, ausente en esta primitiva); `Alert` para feedback de submit persistente. `login-form.tsx` aporta patrón de validación explícita, pending y errores; conservarlo sin rehacer auth exitoso. `use-auth` y `token-storage` indican que access vive en memoria, hay pista local y provider separado: la integración de limpieza tras éxito pertenece a FE-04.

El toggle actual de `PasswordInput` es de 40 × 40 px según inventario; la regla general es 44 × 44. FE-04 debe asegurar un objetivo táctil local de al menos 44 px en este flujo sin rediseñar la primitiva ahora ni afirmar que ya cumple. Inputs, botones, link y toggle alcanzables por teclado/lector; labels persistentes, autocomplete correcto, paste y gestores de contraseñas habilitados. Errores asociados al campo con `aria-invalid`/descripción; error de submit con Alert error (`role=alert`), confirmaciones con Alert neutral/success (`role=status`, polite) e incertidumbre con warning; no sólo color. Texto de Alert breve (~140 caracteres), instrucciones adicionales fuera del Alert si hacen falta.

No autoenfocar email ni abrir teclado al entrar: foco de navegación al h1 (`tabIndex=-1`) sin bloquear Tab ni conservar un foco en nodo desmontado. Submit inválido lleva foco al primer Field inválido; error de submit conserva foco/contexto y se anuncia una vez. Si se reemplaza formulario por `202`/éxito/pérdida/incertidumbre, foco al h1 de resultado; no duplicar su lectura con otra región que repita texto. Tras “Pedir otro enlace”, foco al título de solicitud. Espera: texto estático “Podés volver a intentar cuando termine la espera.”; no live countdown por segundo. Anunciar una vez por status al quedar disponible el CTA; no mover foco por timer.

Orden Tab: campos, toggles, submit y links; toggles con nombre/estado y Enter/Espacio. Inputs, enlaces y botones ≥44 ×44 CSS px; toggle 40 actual requiere adaptación local futura (no editar primitiva ahora), con aire sin superposición ni foco recortado. AA según tokens: texto normal 4,5:1, grande 3:1, control/foco 3:1; no medición real en esta fase. Layout con scroll normal y safe areas, sin CTA fija tapada por teclado; errores/foco accesibles al reducir viewport. Desktop con ancho legible AuthShell, ambos temas, sin depender de hover; reduced motion sin animación nueva. Validar en FE-04 teclado/lector/zoom 200 %/390 y desktop, ambos temas; dispositivos/PWA quedan pendientes.

## Sesión y límites de promesa

El borrador propone `User.authVersion` comparada en Postgres en cada autorización. Autorizaciones nuevas consultadas después del commit rechazan credenciales viejas; requests que ya pasaron guard pueden terminar. Esto no promete cancelar requests en vuelo ni limpiar visualmente otros dispositivos.

La integración futura debe impedir que una respuesta bootstrap/refresh anterior al éxito vuelva a colocar usuario/access/pista después de la limpieza (generación/cancelación o equivalente). Resolverlo junto con AuthProvider, token-storage y cliente, sin logout automático ni refresh que repita cambio. Es requisito FE-04, no protección implementada hoy. Logout ni refresh no se ejecutan al abrir link. Una solicitud de enlace no cambia clave ni sesión.

NEG-03 se incorpora sólo como requisito aceptado de preparación: no diseñar eliminación, canal de soporte, endpoint, operador, plazo, política legal o retención no decididos. No agregar ofertas Pro ni cambiar la autenticación normal.

## Criterios para FE-04 y BE-05

**FE-04 verificable:**

1. Login ofrece ruta a solicitud; solicitud y cambio usan las pantallas/copys/estados de esta especificación.
2. Fragmento leído una vez y retirado con replace antes de analytics/terceros; secreto sólo en memoria, nunca query/URL API/storage/log/evidencia; sólo body JSON de cambio.
3. Montaje, StrictMode, GET, preview, recarga y navegación no consumen, validan API ni repiten solicitudes; marcador no secreto diferencia vista de enlace perdida de bare normal; fallback sin marcador vuelve a solicitud.
4. Submit impide duplicados por Enter/doble clic; reenvío requiere acción y espera mínima 60 s local; `Retry-After` positivo gobierna 429, fallback 60 s sin live countdown.
5. Email no enumera cuentas; codes/fields seguros se mapean, nunca se exhiben crudos; 400 DTO conserva token y 400 enlace ofrece otro. Confirmación local de clave no llega al DTO; inválida no genera request.
6. Resultado incierto conserva sesión; incluye 503/body inválido y ofrece login primario/nuevo enlace secundario, sin transferir clave ni repetir POST.
7. Limpieza de cookie/access/pista/provider sólo tras éxito confirmado, con race del bootstrap resuelta; sin auto-login.
8. Back/login seguro sin fragmento ni destino arbitrario; validación, foco, teclado, lector, paste, autocomplete, toque mínimo, AA, reduced motion, safe area y scroll especificados en móvil/desktop y tema claro/oscuro.

**BE-05 verificable en su implementación futura:** `202` y respuesta/cabeceras idénticas para emails existentes/no existentes; no señal por cuenta en cuotas/fallo; `Retry-After` positivo en 429; 503 genérico; 403 seguro; token inválido/usado/vencido/revocado uniforme; validación DTO previa no consume; `200` sólo tras commit y limpia cookie; errores/red no afirman éxito; credenciales viejas rechazadas por lookup de versión posterior al commit; sandbox sin envío externo ni persistencia de secreto; allowlists de respuesta sin campos privados. Son criterios pendientes, no resultados actuales.

## Fuentes y verificación documental

Entrada contractual: [BE-05 contrato](BE-05-contrato-borrador.md), [revisión Sol HIGH](BE-05-borrador-review.md), [aceptación root](BE-05-borrador-aceptacion-root.json). Negocio: [DEC-05](../10-decisiones-y-contratos.md#dec-05--pro-y-piloto-pago) y requisitos NEG-03 referenciados por el contrato.

Fuentes de UI: [design system](../../../../frontend/docs/design-system.md), [build guide](../../../../frontend/docs/build-guide.md), [componentes](../../../../frontend/docs/components.md), [rutas](../../../../frontend/docs/routes.md), [gotchas](../../../../frontend/docs/gotchas.md); [AuthShell](../../../../frontend/components/auth/auth-shell.tsx), [login-form](../../../../frontend/components/auth/login-form.tsx), [Field](../../../../frontend/components/ui/field.tsx), [PasswordInput](../../../../frontend/components/ui/password-input.tsx), [Alert](../../../../frontend/components/ui/alert.tsx), [Button](../../../../frontend/components/ui/button.tsx), [use-auth](../../../../frontend/hooks/use-auth.tsx), [token-storage](../../../../frontend/lib/api/token-storage.ts).

La [evidencia Luna original](evidencia-ux04-cuenta/) conserva 22 fuentes/18 enlaces de la versión recibida. Antes de corregir se preservaron documento y ambos JSON en [baseline de revisión](evidencia-ux04-cuenta-review/baseline-review.json). [Revisión Sol HIGH](UX-04-review.md) y [verificación final](evidencia-ux04-cuenta-review/verificacion.json) distinguen enlaces/hashes de contraste semántico y límites. No se ejecutaron tests, suites, runtime, build/check, DB/Redis, browser, red, correo ni contactos; no se hizo QA visual ni dispositivo físico. No se tocó código ni centrales.
