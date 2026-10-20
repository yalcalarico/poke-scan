# Adaptador de correo para recuperación

El adaptador queda apagado salvo que `RECOVERY_MAIL_MODE=resend` y toda la
configuración sean válidas. Hoy no hay cuenta ni dominio conectado: la activación
externa queda para el final, con autorización aplicable. La configuración incompleta
falla cerrada: recuperación responde 503 antes de consultar la cuenta. Con transporte
disponible, 202 sigue siendo genérico y no acredita entrega.

## Activación posterior

1. Crear la cuenta de Resend y verificar el dominio remitente siguiendo el DNS
   que indique la cuenta. Usar una dirección de ese dominio en `RESEND_FROM`.
2. Crear una API key de alcance mínimo para envío. Guardarla como secreto del
   entorno de despliegue; nunca agregarla a Git, logs, imágenes ni documentación.
3. Configurar en Resend el tracking de aperturas y clics como desactivado para
   estos mensajes. Verificar el alcance de la retención publicada de 30 días,
   acceso y borrado en la cuenta; no asumir que se puede cambiar en Free ni
   convertir ese dato en una política propia aprobada.
4. Sólo al completar esos pasos, definir `RECOVERY_MAIL_MODE=resend`,
   `RESEND_API_KEY`, `RESEND_FROM` y `FRONTEND_URL` como origen HTTPS exacto del
   frontend. No debe incluir ruta, query, fragmento ni credenciales.
5. Verificar con el harness local de loopback y una revisión del envío real
   controlado antes de habilitar la ruta a usuarios.

El endpoint está fijado en `https://api.resend.com/emails`; no acepta URLs de
proveedor configurables. La petición contiene destinatario, remitente, asunto y
texto plano con el enlace `/recuperar#token=…`. No incorpora identificadores de
usuario, etiquetas ni analytics. No se siguen redirecciones ni se reintenta un
resultado incierto. Una respuesta HTTP exitosa sólo confirma aceptación del
proveedor, no entrega al buzón.

El adaptador limita el transporte y la lectura a 1,8 segundos con reloj
monotónico y cuerpo de respuesta de hasta 4 KiB. El servicio conserva su lease
global de 2 segundos; esto no prueba cuánto tarda una entrega externa. Los errores se absorben sin registrar
respuesta cruda, dirección ni token. La autorización de vigencia en PostgreSQL
ocurre antes de leer el token y de iniciar el handoff. La cancelación no detiene
una consulta SQL que ya está en vuelo y ningún adaptador puede retractar un
mensaje luego de entregarlo al proveedor. JavaScript tampoco garantiza borrar
físicamente copias previas del secreto.

## Ensayo simulado

El transporte inyectado por DI en el harness de QA llama exclusivamente a un
servidor HTTP propio en loopback y usa credenciales/destinatarios sintéticos en
memoria. No hay un modo público de simulación, una URL de proveedor por entorno
ni una bandeja de depuración accesible desde la app. La instancia habitual
conserva `RECOVERY_MAIL_MODE=disabled`; cuenta, dominio y envíos externos quedan
para el final. [Evidencia del paso](../plans/lanzamiento-2026-10-07/RESULTADOS/RESEND-simulado-validacion.md).
