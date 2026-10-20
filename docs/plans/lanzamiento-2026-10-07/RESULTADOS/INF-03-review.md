# INF-03 — Revisión del preflight de recuperación

Fecha: 2026-10-07 · Revisor: GPT-6.1 Sol HIGH · Estado: **preflight corregido y aceptado para futura reserva local; INF-03 pendiente**.

La revisión corrigió sólo [INF-03-preflight](INF-03-preflight.md) y este informe.
Leyó INF-03 en 05-infraestructura, contratos INF-01/02, script de preparación de
DB de tests, schema y migraciones, y fuentes primarias de cifrado/restore. No
ejecutó Docker, DB/Redis, scripts de backup/cifrado, tests, aplicación, compras
ni transferencias; no leyó usuarios/secretos. La revisión de código FE-08 fue
una tarea separada con evidencia propia en [FE-08-review](FE-08-review.md).

## Hallazgos corregidos

1. **Reserva inventada.** El borrador atribuía implementación reservada a INF-02
   y se reservaba scripts INF-03. Ahora son candidatos: coordinación debe
   asignar escritor/archivos y serializar ejecución antes de implementar.
2. **Falsa separación por puerto.** Origen/destino aislados pueden usar 5432
   interno y schema public. Se verifica contenedor/project/labels/red/volumen,
   conexión DB/rol, destino vacío y marcador propio; no firmas ni framework
   adicional. No se acepta DATABASE_URL/DB_TEST ni recursos compartidos.
3. **AEAD imposible en openssl enc.** No admite CCM/GCM. Se propone age
   estándar con versión/procedencia a fijar en implementación, sin ejecutar ni
   instalar herramientas ahora. [OpenSSL enc](https://docs.openssl.org/master/man1/openssl-enc/).
4. **Descifrado parcial antes de SQL.** La autenticación de age por chunks no
   habilita restaurar un stream antes de verificar el final. Se exige descifrar
   completo a buffer acotado/temporal 0600 bajo directorio 0700, esperar éxito,
   validar manifest/dump y recién invocar restore; cleanup en finally. El
   negativo debe alterar/truncar también el último chunk. [Formato age](https://age-encryption.org/v1).
5. **Digest no es autenticación ni anonimato.** Se propone manifest/dump en un
   paquete estándar cifrado, recibo externo para transferencia y digest del
   dump dentro del manifiesto, evitando autorreferencia. El dump contiene PII
   y hashes de password/sesión; excluirlos del manifiesto no elimina los datos
   privados de PostgreSQL. No se agregan fotos ni configuración secreta al
   paquete. Sólo se restaura el dump sintético propio; el cifrado no demuestra
   autoría ni vuelve seguro SQL de un origen desconocido. [Advertencia de
   PostgreSQL](https://www.postgresql.org/docs/16/app-pgrestore.html).
6. **RPO confundido con duración.** Se separan duración de backup, último
   commit recuperable frente al incidente simulado y tiempo/etapas de
   recuperación local. RPO ≤24 h/RTO ≤4 h siguen siendo objetivos operativos,
   sin medida demostrada, destino remoto ni incidente real de pérdida de host.
7. **Detalles de inventario/contrato.** setup-test-db exige Docker; no tiene
   fallback de cliente local. La tabla es `_prisma_migrations`; ShareLink usa
   `collectionId` nullable, `isActive` y `expiresAt`; la operación usa `key` y
   `resultItemId`. Se aplica schema antes de insertar fixtures.

Fuentes consultadas el 7/10/2026. No hay evidencia nueva de compatibilidad de
binarios, cifrado, restore, hashes de payload ni resultados RPO/RTO.

## Handoff implementable y límites

Se libera la reserva documental de preflight/review. Coordinación puede
reservar implementación local después de ordenar las fases de INF-02: scripts
acotados/runbook, Postgres 16 y datos sintéticos, age fijado, aislamiento y
guardas, round-trip/fallos/cleanup y mediciones separadas. No hace falta elegir
un proveedor remoto para ese ensayo. La aceptación actual no habilita subir
datos, desplegar, contratar ni restaurar sobre dev/producción.

El preflight conserva **una única pregunta humana pendiente** sobre destino
off-host, retención y presupuesto para la fase remota; no se envía ahora ni se
duplica en otros documentos. Copia/alertas/retención/restore remoto y objetivos
operativos requieren evidencia futura; el gate global queda al cierre del
lote. INF-03 permanece pendiente de implementación y revisión de esa entrega.
