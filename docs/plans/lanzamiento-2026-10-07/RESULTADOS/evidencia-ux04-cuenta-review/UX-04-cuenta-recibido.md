# UX-04 — Recuperación de cuenta

Fecha: 2026-10-09 · Estado: **especificación documental para revisión Sol HIGH** · Área: UX; implementación FE-04/BE-05 pendiente.

Esta propuesta convierte el contrato BE-05 aceptado como entrada en pantallas, copy, estados y criterios verificables. Recuperación aplica a Free y no requiere Pro ni cobro (DEC-05). No es implementación, no acredita envío de correo ni modifica el gate integrado BE-07, que sigue fallido.

## Alcance y navegación

- Desde `/login`, link secundario **“¿Olvidaste tu contraseña?”** navega a `/recuperar`.
- `/recuperar` sin fragmento muestra solicitud. El enlace de correo abre `/recuperar#token=<secreto>` y, tras lectura única, muestra cambio. No se propone ruta nueva para pantallas separadas.
- Leer el fragmento una vez en memoria y quitarlo de la barra con `history.replaceState` antes de analytics, píxeles o terceros. No copiarlo a query, API URL, storage, logs, body de evidencia ni analytics. FE-04 debe impedir que el arranque/SSR/cache lo filtre y revisar Referrer-Policy/CSP; esto no está verificado hoy.
- GET, preview, apertura, montaje, recarga o volver atrás no validan el token contra API, consumen, envían ni reenvían nada. Sólo un submit explícito intenta cambiar clave.
- El token permanece sólo en memoria durante esa vista. Si se recarga, se pierde: texto **“El enlace ya no está disponible en esta pantalla. Volvé a abrirlo desde el correo o pedí uno nuevo.”** Acción: “Ir a pedir otro enlace”. No persistir para salvar la recarga.
- Atrás desde cambio no conserva secreto en URL: volver a `/recuperar` solicitud; login siempre accesible. Sin parámetro `next` arbitrario ni retorno a URL externa. Sin token en historial tras replace.
- Éxito confirmado ofrece **“Ir a iniciar sesión”** con `/login` y replace. No inicia sesión automáticamente ni reanuda destino previo.

## Pantallas y copy

### Solicitar enlace — `/recuperar`

**Título:** “Recuperá tu cuenta”  
**Descripción:** “Ingresá el email de tu cuenta. Te vamos a indicar cómo seguir si el pedido puede procesarse.”

Campo **Email**, requerido, `type=email`, `inputMode=email`, `autoComplete=email`; aceptar pegar y gestores de datos. Validación local: vacío “Ingresá tu email.”; formato no válido “Revisá el formato del email.” No revelar si existe la cuenta.

CTA **“Enviar instrucciones”**; durante envío “Enviando…”, deshabilitado y `aria-busy`. Un único submit activo aunque coincidan doble clic, Enter o repetición de evento. No limpiar ni duplicar el email ante error.

Al `202`: reemplazar formulario por estado persistente: **“Recibimos tu pedido”**; “Si corresponde y el envío puede completarse, vas a recibir instrucciones en ese email. Revisá también correo no deseado. Por seguridad, no podemos confirmar desde acá si la cuenta existe.” Mostrar el email ingresado escapado/solo en pantalla si se desea verificar destino, nunca en URL/evidencia/telemetría. Acción explícita **“Pedir otro enlace”** disponible sólo después de 60 s desde aceptación local; espera mínima orientativa, sujeta a cuotas. No mostrar contador por cuenta, límite ni prometer que un nuevo envío se hará. Reenvío vuelve a enviar por submit manual, nunca automático.

### Cambiar contraseña — fragmento válido en forma local

**Título:** “Elegí una contraseña nueva”  
**Descripción:** “Usá entre 8 y 72 caracteres. Después vas a tener que iniciar sesión.”

Campos **Nueva contraseña** (`new-password`) y **Repetí la contraseña** (`new-password`); ambos con revelar/ocultar, sin límites de composición inventados. Requeridos. La confirmación se compara localmente y no forma parte del DTO.

Validación previa al request: vacío; menos de 8; más de 72; confirmación distinta. Mensajes concretos por campo y foco en primer error. Clave inválida o confirmación distinta no consume ni envía token.

CTA **“Cambiar contraseña”**, pending “Cambiando…”, bloquea reentradas. Tras `200` confirmado, mostrar **“Cambiaste tu contraseña”**, “Iniciá sesión con la nueva clave.” y botón **“Ir a iniciar sesión”**. Sólo entonces limpiar access token, pista local y estado AuthProvider, además de aceptar limpieza de cookie del servidor. No auto-auth.

## Matriz de estados y acciones

| Estado observable | Mensaje / acción |
|---|---|
| Email vacío o formato inválido | Error dentro del `Field`; corregir y volver a enviar. |
| Solicitud pendiente, Enter/doble clic | Un request activo; botón ocupado. Sin cola duplicada ni segundo submit. |
| Solicitud `202` | Confirmación genérica idéntica para cuenta existente/inexistente; no afirmar correo enviado. Reenvío explícito tras mínimo 60 s, sujeto a cuotas. |
| Solicitud `429` con `Retry-After` | Alert persistente: “Esperá un poco antes de volver a intentar.” Bloquear CTA hasta el tiempo indicado; no exhibir cuota por cuenta. Reintento sólo manual. |
| Solicitud `503` | “No pudimos procesar el pedido ahora. Probá de nuevo más tarde.” Mantener email; reintento manual. No señalar existencia. |
| Solicitud `403` | “No pudimos procesar el pedido desde esta página. Volvé a empezar desde PokéScan.” Link a `/login`; sin detalle interno ni reintento automático. |
| Red/timeout/respuesta incierta al solicitar | “No pudimos confirmar el pedido. Podés volver a intentarlo manualmente.” Enviar de nuevo sólo por acción explícita y sujeto a cuotas. |
| Token falta/malformado/usado/vencido/revocado/versión vieja | Mensaje único: “El enlace no es válido o venció. Pedí uno nuevo para continuar.” Acción a formulario solicitud. No distinguir causa. |
| Clave inválida o confirmación distinta | Error de campo local; token queda en memoria y no se consume. Corregir. |
| Cambio `400 RECOVERY_LINK_INVALID` | Mensaje genérico anterior; acción solicitar nuevo enlace. No exponer code ni volver a enviar clave. |
| Cambio `403` | “No pudimos procesar el pedido desde esta página. Volvé a empezar desde PokéScan.” No retry automático. |
| Cambio `429` | “Esperá un poco antes de volver a intentar.” Mostrar espera del `Retry-After`; sólo submit manual cuando corresponda. |
| Cambio `503` | “No pudimos procesar el pedido ahora.” No limpiar sesión ni decir que cambió. Ante ambigüedad, seguir la regla de resultado incierto. |
| Cambio sin respuesta, timeout o 5xx inesperado | “No pudimos confirmar si cambió. Probá iniciar sesión con la contraseña que elegiste; si no funciona, pedí un enlace nuevo.” Sin replay de POST ni limpieza local. |
| Cambio `200` | Éxito confirmado, limpiar sesión local y cookie según respuesta; link a login, sin auto-login. |

Para cualquier respuesta incierta al cambiar, intentar login con la clave nueva; si falla, volver a pedir un enlace. Nunca auto-POST, replay por refresh, montaje, StrictMode, navegación o reintento de red. No limpiar cookies/estado como éxito antes del `200` confirmado. Si el commit ocurrió pero se perdió la respuesta, el login elegido por la persona resuelve el caso.

La misma UI/copy de solicitud aplica a emails existentes y no existentes, incluso ante cuotas de identificador/fallo de entrega. No mostrar codes internos, causa de token, hora de expiración, estado de correo, cupo restante ni existencia. La respuesta genérica no promete entrega; el sandbox futuro usa contenido sintético `example.test`, sin host, remitente, persona ni correo real.

## Disposición y componentes

Wireframe mobile (390 × 844):

```text
┌──────────────────────────────┐
│          marca PokéScan      │
│                              │
│  Recuperá tu cuenta          │
│  Ingresá el email…           │
│  [ Email                  ]  │
│  [ Enviar instrucciones   ]  │
│                              │
│       Volver a iniciar sesión│
└──────────────────────────────┘
```

En resultado, reemplazar campos por un Alert/estado legible y las acciones posibles; en cambio, mantener dos Fields, botón principal y enlace para pedir otro. Una acción primaria por pantalla. No ilustración ni paneles redundantes.

Reusar `AuthShell` para marca, ancho y superficie; `Field` + `Input` para email; `Field` + `PasswordInput` para claves; `Button` para submit/navegación; `Alert` para feedback de submit persistente. `login-form.tsx` aporta patrón de validación explícita, pending y errores; conservarlo sin rehacer auth exitoso. `use-auth` y `token-storage` indican que access vive en memoria, hay pista local y provider separado: la integración de limpieza tras éxito pertenece a FE-04.

El toggle actual de `PasswordInput` es de 40 × 40 px según inventario; la regla general es 44 × 44. FE-04 debe asegurar un objetivo táctil local de al menos 44 px en este flujo sin rediseñar la primitiva ahora ni afirmar que ya cumple. Inputs, botones, link y toggle alcanzables por teclado/lector; labels persistentes, autocomplete correcto, paste y gestores de contraseñas habilitados. Errores asociados al campo con `aria-invalid`/descripción; error de submit y estado `202` anunciados como región persistente (`role=alert`/status apropiado), no sólo por color.

No autoenfocar email al entrar ni abrir teclado virtual: foco inicial natural en página/título según navegación, manteniendo scroll arriba. Tras submit inválido, llevar foco al primer campo con error y mantener orden de tabulación; al error de servidor, anunciar Alert y conservar foco/contexto. Al cambiar estado a confirmación, anunciar encabezado y foco gestionado sin salto inesperado. Foco visible y no recortado, contraste AA, movimiento reducido; teclado virtual no debe tapar CTA/errores. En mobile contemplar safe areas, scroll y viewport reducido por teclado. En desktop centrar con ancho legible de AuthShell y no estirar campos a todo el viewport; ambos temas.

## Sesión y límites de promesa

El borrador propone `User.authVersion` comparada en Postgres en cada autorización. Autorizaciones nuevas consultadas después del commit rechazan credenciales viejas; requests que ya pasaron guard pueden terminar. Esto no promete cancelar requests en vuelo ni limpiar visualmente otros dispositivos.

La carrera futura del `AuthProvider` bootstrap/refresh pendiente puede volver a colocar estado anterior después de limpiar sesión. FE-04 debe diseñar generación/cancelación o mecanismo equivalente y resolverla; hoy no se afirma que el provider lo haga. Logout ni refresh no se ejecutan al abrir link. Una solicitud de enlace no cambia clave ni sesión.

NEG-03 se incorpora sólo como requisito aceptado de preparación: no diseñar eliminación, canal de soporte, endpoint, operador, plazo, política legal o retención no decididos. No agregar ofertas Pro ni cambiar la autenticación normal.

## Criterios para FE-04 y BE-05

**FE-04 verificable:**

1. Login ofrece ruta a solicitud; solicitud y cambio usan las pantallas/copys/estados de esta especificación.
2. Fragmento leído una vez y retirado con replace antes de analytics/terceros; secreto sólo en memoria, nunca query/API/storage/log/evidencia.
3. Montaje, StrictMode, GET, preview, recarga y navegación no consumen, validan API ni repiten solicitudes; pérdida por recarga da salida segura.
4. Submit impide duplicados por Enter/doble clic; reenvío requiere acción y espera mínima 60 s local; `Retry-After` gobierna 429.
5. Email no enumera cuentas; errors codes internos nunca son copy. Confirmación local de clave no llega al DTO; inválida no genera request.
6. Resultado incierto conserva sesión; instruye login con clave elegida y solicitud manual posterior si falla. No hay replay automático.
7. Limpieza de cookie/access/pista/provider sólo tras éxito confirmado, con race del bootstrap resuelta; sin auto-login.
8. Back/login seguro sin fragmento ni destino arbitrario; validación, foco, teclado, lector, paste, autocomplete, toque mínimo, AA, reduced motion, safe area y scroll especificados en móvil/desktop y tema claro/oscuro.

**BE-05 verificable en su implementación futura:** `202` y respuesta/cabeceras idénticas para emails existentes/no existentes; no señal por cuenta en cuotas/fallo; `Retry-After` positivo en 429; 503 genérico; 403 seguro; token inválido/usado/vencido/revocado uniforme; validación DTO previa no consume; `200` sólo tras commit y limpia cookie; errores/red no afirman éxito; credenciales viejas rechazadas por lookup de versión posterior al commit; sandbox sin envío externo ni persistencia de secreto; allowlists de respuesta sin campos privados. Son criterios pendientes, no resultados actuales.

## Fuentes y verificación documental

Entrada contractual: [BE-05 contrato](BE-05-contrato-borrador.md), [revisión Sol HIGH](BE-05-borrador-review.md), [aceptación root](BE-05-borrador-aceptacion-root.json). Negocio: [DEC-05](../10-decisiones-y-contratos.md#dec-05--pro-y-piloto-pago) y requisitos NEG-03 referenciados por el contrato.

Fuentes de UI: [design system](../../../../frontend/docs/design-system.md), [build guide](../../../../frontend/docs/build-guide.md), [componentes](../../../../frontend/docs/components.md), [rutas](../../../../frontend/docs/routes.md), [gotchas](../../../../frontend/docs/gotchas.md); [AuthShell](../../../../frontend/components/auth/auth-shell.tsx), [login-form](../../../../frontend/components/auth/login-form.tsx), [Field](../../../../frontend/components/ui/field.tsx), [PasswordInput](../../../../frontend/components/ui/password-input.tsx), [Alert](../../../../frontend/components/ui/alert.tsx), [Button](../../../../frontend/components/ui/button.tsx), [use-auth](../../../../frontend/hooks/use-auth.tsx), [token-storage](../../../../frontend/lib/api/token-storage.ts).

La [evidencia selectiva](evidencia-ux04-cuenta/) registra hashes SHA-256 de fuentes, verificación de enlaces locales/anchors y límites de la inspección. No se ejecutaron tests, suites, runtime, build/check, DB/Redis, browser, red, correo ni contactos; no se hizo QA visual ni dispositivo físico. No se tocó código ni centrales.
