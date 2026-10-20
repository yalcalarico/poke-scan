# INF-03 — destino externo y custodia elegidos

12/10/2026, Buenos Aires. **Decisión humana registrada: Backblaze B2 como destino previsto y dueño del proyecto como custodio de la clave privada.** Evidencia: respuestas «Backblaze B2 (recomendado)» y «Yo seré el custodio (recomendado)» en este chat. La elección es para configuración futura; no acredita cuenta, acceso, claves existentes ni custodia operativa. No crear cuentas, buckets, claves, cobros, subidas ni servicios. Mini PC pendiente de adquisición; [prompt futuro](../../../infra/PROMPT-mini-pc-cloudflare.md) conservado.

## Comparación consultada

Fuentes oficiales reconsultadas el12/10/2026. Sólo lecturas de documentación pública, sin acceso a cuentas.

| Destino | Uso incluido y precio publicado | Encaje con PokéScan |
|---|---|---|
| **Backblaze B2, elegido** | Primeros10GB gratis; almacenamiento USD6,95/TB/mes; salida incluida hasta3× almacenamiento medio mensual, exceso USD0,01/GB. | Cuenta independiente de Cloudflare; application keys permiten restringir bucket/prefijo y capacidades, incluyendo separar escritura de eliminación. Requiere una cuenta adicional al activar. |
| Cloudflare R2 Standard | 10GB-mes,1millón operacionesA y10millonesB incluidos mensualmente; exceso USD0,015/GB-mes, USD4,50/millónA y USD0,36/millónB; salida directa sin cargo. | Aprovecha la cuenta Cloudflare prevista para Tunnel. Tokens limitables a buckets; los roles ordinarios son lectura o lectura/escritura, no asumir un permiso de subida sin borrado. Comparte dependencia de cuenta con el acceso público. |

[Precio B2](https://www.backblaze.com/cloud-storage/pricing), [capacidades de claves B2](https://www.backblaze.com/docs/cloud-storage-application-keys), [precio R2](https://developers.cloudflare.com/r2/pricing/), [permisos R2](https://developers.cloudflare.com/r2/api/tokens/).

La preferencia B2 es una inferencia de diseño: menor dependencia compartida y permisos ajustables para backups. La selección humana ya está registrada; esta justificación no acredita una cuenta configurada ni una integración real probada con este stack. No recomendar B2 Overdrive ni R2 Infrequent Access para este alcance. Importes en USD, sin prometer costo total o gratuidad permanente; revisar tarifas/facturación al activar. No se midió el tamaño del backup real ni se eligió frecuencia. El uso total incluye copias simultáneas, metadatos, reintentos y artefactos separados si se agregan;10GB de uso incluido no es un límite de gasto.

## Propuesta de custodia para ambos destinos

**Custodio elegido: dueño del proyecto, confirmado en este chat.** Usar su gestor de contraseñas cifrado y una copia de recuperación cifrada fuera de la mini PC; la selección concreta del gestor y ubicación física se dejan a la configuración futura, sin pedir secretos por chat.

| Material | Dónde se propone conservar | Acceso propuesto |
|---|---|---|
| Destinatario público age | Configuración del proceso de backup en mini PC | Permite cifrar, no descifrar. |
| Identidad privada age | Bóveda del custodio, con recuperación cifrada separada del equipo y del bucket de dumps | Sólo operador de restore; se usa temporalmente en un destino aislado. No se necesita para generar copias periódicas. |
| Credencial de subida | Almacén de secretos del servicio futuro | Bucket/prefijo de backups propios; en B2 intentar sólo capacidades mínimas verificadas, sin deleteFiles ni administración. Validar compatibilidad del cliente elegido; no asumir que writeFiles basta para todas sus llamadas. |
| Credencial de lectura/restauración | Bóveda del custodio | Leer copias propias; separada de la de subida. |
| Credencial de retirada | Servicio operativo separado y restringido al repositorio | El proceso de subida no debe recibirla por conveniencia; calendario, disponibilidad y operador todavía pendientes. |
| Claves HMAC de inventario/supresiones | Secretos del servicio que firma; recuperación cifrada protegida por custodio | Son distintas de age y de credenciales del proveedor; firma en operación requiere disponibilidad, no se promete que todas las claves permanezcan fuera del host. |
| Registro mínimo vigente, inventario y checkpoints | Custodia recuperable separada del dump y de su ciclo de30d | Deben sobrevivir a pérdida del host; validar la cabeza actual por autoridad independiente del paquete restaurado. Diseño/adaptador externo y sincronización aún pendientes. |

La copia de una clave no conserva las bajas: clave, registro y frescura son requisitos diferentes. El adaptador local aceptado no prueba publicación durable de cada intención fuera del host. La operación futura debe acreditar persistencia de las bajas aceptadas y cobertura actual; ante pérdida del registro/cabeza o incertidumbre, no habilitar restore ni crear un registro vacío. HMAC no impide que el propio custodio revierta conjuntamente registro y checkpoint. No presentar una segunda carpeta o bucket como solución automática a esa premisa.

No generar ni guardar claves reales en Git, evidencias, fotos, mensajes o capturas. No reutilizar identidades efímeras de QA. Rotación futura conserva acceso a las claves antiguas mientras haya copias válidas que las necesiten.

## Retención y activación futura

La [política humana30d](INF-03-retencion-supresiones.md) y el [inventario/restore local aceptado](INF-03-retencion-validacion.md) permanecen vigentes. Retirar ciphertext y recibos por fecha original confiada, sin renovar al subir/copiar. Incluir todas las versiones/copias operativas controladas; no podar supresiones hasta acreditar su retiro.

No confundir lifecycle del proveedor con cumplimiento a la hora exacta: [R2 documenta eliminación normalmente dentro de24h de la expiración](https://developers.cloudflare.com/r2/buckets/object-lifecycles/) y posibles demoras al aplicar reglas. Una regla de30d desde upload no demuestra máximo30d desde creación original. El calendario de retirada anticipada, borrado explícito, confirmación de ausencia y alertas ante incumplimiento deberá diseñarse y ensayarse según el proveedor seleccionado. No elegir bloqueos/retenciones inmutables que impidan la política. Si hay copias con retiro incierto, conservar supresiones y bloquear restore fuera del plazo; eso no equivale a demostrar borrado físico puntual.

Al activar, verificar cuenta/bucket privados, alcance de credenciales, tamaño/costos reales, presupuesto y alertas, sincronización de custodia actual, calendario/retirada de versiones, lectura/descifrado/restore aislado y recuperación ante pérdida del equipo. No instalar ahora scheduler ni scripts conectados al proveedor. No se acredita off-host/RPO/RTO, borrado remoto, compra ni operación humana por esta propuesta.

**Elección cerrada en este paso:** Backblaze B2 y dueño como custodio de la identidad privada, con bóveda y recuperación cifrada separada según la pregunta aceptada. El gestor concreto, ubicación, presupuesto, frecuencia y medios de recuperación se comprobarán en la configuración futura; no pedir ni generar secretos aquí. **Próximo propuesto sin iniciar:** adaptador de transferencia y ensayo local simulado de subida, descarga e integridad, sin cuenta ni llamadas a Backblaze. Mantener inventario/fecha original/supresiones; custodia/frescura externa real sigue siendo gate propio. Preguntar y esperar autorización antes de implementar o ensayar ese paso.

Estado20/38 completos,18pendientes; sin nuevo ID, suites, delegación, recursos, cambios de producto ni de instancia. Automatización PAUSED/dos horas intacta.
