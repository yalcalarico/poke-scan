# Lote CUENTA — validación integrada

Entrega Sol HIGH, 2026-10-10. Reserva serial liberada al completar esta entrega. Recuperación local y FE-04 cumplen la matriz ejecutada; el cierre de IDs corresponde a root. BE-05 mantiene pendiente el componente humano de canal, operador y retención de eliminación/backups.

La entrada fue [BE-05 revisión aceptada](BE-05-implementacion-review-aceptacion-root.json) y [FE-04 revisión aceptada](FE-04-review-aceptacion-root.json). Los seis recibos originales siguen intactos. La validación usó infraestructura propia y outputs estándar; no SMTP, endpoint de captura, proveedor elegido ni cambios de configuración permanente.

## Resultado estándar y corrección causal

| Ejecución preservada | Resultado observado | Alcance |
|---|---|---|
| [Check inicial](LOTE-CUENTA-anexos/check-standard-result.json) | 976/976, 0 skips | 414 backend + 13 scripts + 6 e2e + 543 frontend; Nest y Next completos, anterior al fix |
| [Check tras fix](LOTE-CUENTA-anexos/check-standard-corrected-result.json) | 413/414 backend, fallo | Timeout 5000 ms en backfill; no llegó a scripts/e2e/frontend/builds |
| [Caso diagnóstico](LOTE-CUENTA-anexos/backfill-timeout-focal.log) | 1 pasó, 10 filtrados | No cuenta como gate; mismo timeout, sin edición |
| [Archivo diagnóstico](LOTE-CUENTA-anexos/backfill-file-diagnostic.log) | 11/11, 0 skips | No demuestra causa histórica del timeout |
| [Check contextual fresco](LOTE-CUENTA-anexos/check-standard-fresh-context-result.json) | **979/979, 0 skips** | 414 backend + 13 scripts + 6 e2e + 546 frontend, builds Nest y Next 16.3.6 Turbopack |

`pnpm run stop` precedió cada ciclo; `pnpm run check` fue exacto, con defaults intactos. Typecheck estándar es **frontend** `tsc --noEmit`; Nest build tipa backend productivo. Dos warnings oxlint (spread/sort) no bloquean. No se cambió timeout, spec de backfill, worker global ni herramienta de build. [Log final completo redactado desde origen](LOTE-CUENTA-anexos/check-standard-fresh-context.log), SHA256 `9d38203952f85f70fac8ae3487839a5b175d22f271fcf8a06246340bcb30a7b4`.

El consumidor encontró una causa real de captura: navegación nativa al fragmento en la misma ruta dispara `popstate`, el script elimina el hash y el `hashchange` pendiente relee vacío, perdiendo el token. [Cronología previa sin secretos](LOTE-CUENTA-anexos/capture-diagnostic-2/capture-same-document-observation.json). El fix descarta sólo `hashchange` con `newURL` presente distinto del href actual; no persiste URLs. [Diff de las únicas dos fuentes modificadas](LOTE-CUENTA-anexos/capture-causal.diff), [baseline preservado](LOTE-CUENTA-anexos/capture-causal-baseline/manifest.json). La [regresión previa](LOTE-CUENTA-anexos/capture-causal-before.log) falló exactamente dos casos; [posterior](LOTE-CUENTA-anexos/capture-causal-after.log) pasó 14/14. Lint focal y types pasaron. Incluye hash vigente/remoción deliberada, nueva entrada bare, back/pagehide y lectura idempotente. [Captura real corregida](LOTE-CUENTA-anexos/runtime-attempt-3/capture-fixed-real-observation.json).

La segunda ejecución global falló sin causa localizada. La [comparación contextual](LOTE-CUENTA-anexos/prior-environment-observation.json) acreditó cambios del clon respecto del inicial: usuarios 2→8, colecciones 3→0, items 2→0, shares 1→0; Redis tenía 0 keys. Se retiraron recursos exactos y se clonó TEST otra vez con autorización de root. Es cambio contextual comprobado, **no explicación ni reparación atribuida del timeout**. No hubo ciclos adicionales.

## Consumidor real y QA

[Consolidado](LOTE-CUENTA-anexos/runtime-consolidated.json): **81 controles distintos, 81 verdes**, deduplicados por ID. No son 100 tests de una corrida: fase primaria/navegación tuvo 47 observaciones (46 verdes y una fixture 403 incorrecta), fase HTTP/UI/visual 44 verdes y fase SW final 10 verdes con bootstrap repetido. El 403 inicial usó body `{}` y ValidationPipe respondió 400 antes del controller; la fixture corregida usó DTO válido sin X-Session. Los intentos y fallos de helpers están preservados; no se suman repeticiones.

- API AppModule compilado con DI privada del receptor, bootstrap equivalente (prefix/CORS/helmet/JSON/ValidationPipe/shutdown) y listener 127.0.0.1 verificado antes de crear payload. Factory exigió DB/role/owner/comment/marker exactos y users=0; luego se insertaron cinco fixtures sintéticas allowlisted. Login fue HTTP real; no se necesitó registro ni ampliar allowlist.
- Mail real en memoria → fragmento → captura antes de habilitar campos → reset real → login manual nuevo. 202 usa copy genérico de recepción. Confirmación local no manda POST; mount/navegación no consumen; token/password no quedan en history/storage/query. Éxito limpia cookie/pista/provider y no autentica ni redirige automáticamente.
- Cookie HttpOnly/SameSite real; JWT y refresh anteriores rechazados 401. Web Lock entre dos tabs: refresh real 200 retenido, reset espera sin emitir POST, luego commit y limpieza. Dos resets concurrentes reales dieron 200/400 enlace inválido. Pérdida deliberada de respuesta después del commit real produjo incertidumbre, cero replay y login manual con la nueva clave.
- Back, reload con marcador y push bare en misma ruta no reconstruyen secreto. `pageshow.persisted=false`: **bfcache real no acreditado**; la cobertura sintética previa sigue separada. StrictMode/lectura doble está cubierto focalmente, no se afirma doble montaje de producción.
- 429 real conserva la espera accesible sin contador anunciado; malformed JSON y slash final devuelven 400 INPUT_INVALID/no-store; 403 válido y 503 general fueron reales. Fixtures HTTP explícitamente sintéticas comprobaron UI para INPUT_INVALID, 503 en cambio, code desconocido 400 y malformed shape 200. No se confunden con respuestas observadas del servidor.
- Ocho codepoints astrales: reset y login reales, incluso con transporte de correo indisponible después de recibir el enlace. Toggles locales 44×44 y teclado/aria-pressed comprobados.
- Solicitud vacía 390×844 y 1280×900, ambos temas: foco heading→email, touch target, reduced motion, zoom 200% sin overflow y contraste computado AA de heading/label/description/button. Root revisó las cuatro capturas vacías y aceptó composición/legibilidad. No prueba teléfono físico ni lector de pantalla.
- SW real activo: purgó recuperación de caches calientes actuales/anteriores; online no cacheó ruta; offline la navegación falló sin response de recuperación ni replay. El helper anterior intentó leer DOM durante la navegación rechazada y cayó; el control final usa respuesta/barrera, sin ese acceso.

Runtime: API `NODE_ENV=test` para HTTP loopback explícito, Next producción sobre el output exacto del check final. **Secure/HTTPS/configuración productiva no acreditados**. Crons/worker/scanner/FX externos apagados sólo en runtime; defaults globales intactos. Chrome privado existente, sin perfil del usuario, descargas, trace, video ni logs de inputs. Guardas de fetch loopback en runner/Next y bloqueo browser de hosts e image proxy externos; 24 intentos browser fueron bloqueados en fase primaria. Los intentos iniciales de diagnóstico no tenían guard de image proxy/Next: no se acredita ausencia de red externa en ellos. No se afirma zeroización ni igualdad de latencias.

## Preservación y cleanup

[Fuentes finales](LOTE-CUENTA-anexos/sources-final.json): 507 inventariadas, 505 intactas, sólo capture script/test cambian. [Recibos finales](LOTE-CUENTA-anexos/receipts-final.json): 6 intactos. Outputs anteriores y primer build verde preservados antes de recompilar. [Outputs finales](LOTE-CUENTA-anexos/outputs-post-runtime.json): backend 298/Next 2085 archivos, **0 diferencias** respecto del check fresco; cache de Next excluido explícitamente.

Original: `be05_review_3aaf105723d3_test` + Redis fullID `31003d3c622fd04c9a669438888e744340808efb9b2ab7cbbe6128864c6006ba`, retirados antes del cambio contextual. Fresco: `be05_review_a4b26947b392_test` + Redis fullID `e12cec0e0a8ae88cd28345babf53fe2134d2712f6b568f93956cbf8525b4dacd`, retirados al cerrar. [Ownership final](LOTE-CUENTA-anexos/ownership.json) y [cleanup observado](LOTE-CUENTA-anexos/cleanup-observed-result.json): SQL0, owner/comment/marker y fullID/label/bind verificados; API/Next/Chrome cerrados, puertos libres; drain pending/tickets/messages/leases/waits0, sin deadline ni quarantine.

[Inventario compartido antes](LOTE-CUENTA-anexos/source-inventory-before.json) y [después](LOTE-CUENTA-anexos/source-inventory-after.json): conteos acotados dev/TEST iguales; PostgreSQL/Redis compartidos con mismos fullIDs/healthy; cinco GIN con identidades/definiciones intactas en ambas bases. Cada clon conservó cinco GIN y recibió sólo migrate deploy aditivo (13 migraciones). No acredita snapshot completo de filas. No se tocó dev/TEST ni Redis compartidos. [Evidencia y manifiesto](LOTE-CUENTA-evidencia.json).

Dictamen: gate de recuperación local/FE-04 apto para consolidación de root con estos límites. BE-05 eliminación/retención permanece parcial hasta decisiones humanas ya registradas; no se inventó política, operador, canal ni endpoint. Esta entrega no cierra IDs por sí sola.
