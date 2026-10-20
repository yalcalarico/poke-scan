# INF-01 — Elección de proveedor de recuperación

Fecha: 11/10/2026. Estado: **Resend Free elegido; adaptador y ensayo local aceptados, activación externa diferida**. Evidencia: respuesta humana «Resend Free (recomendado)» en este chat. Alcance autorizado: comparar y elegir proveedor previsto. No implica cuenta, DNS, integración, contratación ni envío externo.

## Propuesta

El usuario eligió **Resend Free** para la recuperación de cuenta. El volumen real sigue pendiente de contrastar con las cuotas. La modalidad de hosting elegida es mini PC + Cloudflare Tunnel, pero el equipo aún no se adquirió. La operación real requiere dominio/remitente verificados y configuración posterior.

| Opción | Tarifas/cuotas oficiales consultadas el 11/10 | Límite relevante |
| --- | --- | --- |
| Resend Free | USD 0/mes; 3.000 correos/mes, 100/día y 3 dominios | Retención de datos publicada: 30 días. Dominio propio verificado para envío general. |
| Resend Pro | USD 20/mes; 50.000 correos/mes; sin límite diario de correos del plan | La cuota de correos no elimina límites de requests API. No contratar ni activar sobreconsumos automáticamente. |
| Postmark Free | USD 0/mes; 100 correos/mes | Opción de evaluación/volumen muy bajo. |
| Postmark Basic | USD 15/mes para 10.000 correos/mes; extras USD 1,80/1.000 | Retención publicada: 45 días. Alternativa paga, sin selección ni contratación. |

Fuentes: [Resend pricing](https://resend.com/pricing), [dominios verificados](https://resend.com/docs/dashboard/domains/introduction), [API de envío](https://resend.com/docs/api-reference/emails/send-email), [Postmark pricing](https://postmarkapp.com/pricing). La página dinámica de Brevo no expuso precios legibles; no se usa para cotizar ni se inventan cifras. Precios de proveedor, sin sumar dominio, impuestos ni otros servicios. No se conoce aún el volumen real esperado; las cuotas no acreditan capacidad suficiente ni entregabilidad.

## Integración posterior y límites

Al comparar proveedores, el binding usaba `UnavailableRecoveryMailPort`; ahora usa la factory del [adaptador simulado aceptado](RESEND-simulado-validacion.md), apagada por defecto. El contrato `RecoveryMailPort` existe y la recuperación local en memoria fue aceptada en [CUENTA](LOTE-CUENTA-validacion.md), La selección por sí sola no acreditó integración; el paso posterior implementó/verificó el adaptador sólo en simulación: respetar `AbortSignal`, generación, autorización PG inmediatamente antes del handoff, token efímero, respuesta genérica y resultado incierto sin replay automático. Una aceptación HTTP del proveedor no garantiza recepción ni permite retraer un correo ya aceptado.

Propuesta de operación: remitente en dominio/subdominio propio, enlaces HTTPS hacia la recuperación existente y seguimiento de aperturas/clics desactivado. La documentación de Resend permite configurar tracking por dominio y recomienda dejarlo desactivado para resets. El proveedor necesariamente procesa destinatario y cuerpo del correo; no equiparar el token hash-only de PostgreSQL con ausencia del enlace secreto en el mensaje externo. Confirmar alcance real de retención/acceso/borrado antes de activación; las duraciones publicadas no son una política propia aprobada. No persistir ni exportar token, destinatarios o cuerpos en logs/evidencias de PokéScan.

El dueño eligió Resend Free; la selección del proveedor previsto queda resuelta. El dueño autorizó ese paso y el [ensayo simulado quedó aceptado](RESEND-simulado-validacion.md); cuenta, dominio y envíos reales se difieren hasta el final. Cuenta, dominio, remitente, destinatario de prueba controlado y secreto por canal privado se resolverán al preparar activación/envío autorizados; no pedir credenciales por chat. La comparación inicial no ejecutó correo ni suites; el paso posterior ejecutó focales/check/runtime locales, sin cuenta, DNS o API externa. Instancia local y automatización PAUSED/dos horas conservadas; **19/38 completos,19 pendientes**, sin cierre adicional por la elección.
