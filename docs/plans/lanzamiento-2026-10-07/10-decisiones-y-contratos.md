# Decisiones y contratos entre áreas

Revisión documental del 20/10/2026. Se mantienen decisiones, contratos y criterios
de aceptación. Los párrafos de contexto/propuestas y resoluciones con fecha
explican la secuencia; no son tareas nuevas. Las resoluciones implementadas y
el [estado actual](../../estado-actual.md) prevalecen sobre esos antecedentes.
Las cabeceras repetidas y la versión anterior íntegra quedan en
[archivo](../../archive/orchestration-2026-10-20/README.md).

## DEC-01 — Inventario y guardado ambiguo

**Implementado/verificado localmente:** UX-01/BE-02/FE-01. Responsables de contrato:
backend para consistencia, frontend para draft/consumidor, UX para interacción.

- Identidad de grupo: carta + variante + condición; destino elegido explícitamente.
  Mantener `runId` por lectura y permitir separar copias; no deducir condición de
  la foto ni presentar normal/NM como inspección física.
- Draft canónico versionado en sessionStorage: entradas, partes, cuenta, destino,
  operaciones y retiros; excluye fotos/recortes. Restauración y guardado parcial
  conservan las intenciones todavía pendientes.
- Cada intención tiene UUID y payload estable por propietario. Repetir una
  operación incierta conserva UUID/payload y no incrementa de nuevo; agregar otra
  copia deliberada usa una intención nueva. No auto-reenviar escrituras inciertas.
- Backend conserva idempotencia durable, concurrencia, conflictos y tombstones.
  Cambios de DTO se reflejan en ambos proyectos en la misma entrega.
- Precio ausente no cambia la identidad de la carta. Guardar requiere revisar
  candidata, atributos y destino; una propuesta en sesión no es guardado confirmado.

Evidencia: [UX-01](RESULTADOS/UX-01-flujo.md), [gate backend](RESULTADOS/LOTE-BACKEND-validacion.md)
y [gate frontend](RESULTADOS/LOTE-FRONTEND-validacion.md). No acredita cámara
física, precisión general ni participantes.

## DEC-02 — Compartir: campos, totales y vigencia

**Implementado/verificado localmente:** UX-02/BE-01/FE-02. Backend posee el DTO
y vigencia; frontend posee lectura, metadata, preview y controles del dueño.

- Allowlist pública: título derivado/displayName acordado, campos de catálogo,
  variante, condición, cantidad y referencia de valor con cobertura. Sin notas
  privadas, email, datos de sesión o IDs internos innecesarios.
- Lista limitada a 500 con alcance explícito; los agregados abarcan el scope
  completo. Distinguir copias, grupos y filas visibles sin cambiar denominadores.
- Una nueva solicitud al origen tras revocación o `expiresAt` no entrega payload
  ni metadata protegidos, incluso con cachés calientes. Next lee sin caché
  persistente sensible; API verifica vigencia y ownership en el `where` (404).
- Privacidad: `noindex`, fuera del sitemap, sin caché offline de payload privado.
  Una respuesta o preview ya descargados no pueden retractarse.
- UI privada permite preview, revocar/actualizar y manejar error/reintento. Next
  puede responder 200 con UI genérica por streaming: la aceptación exige ausencia
  de payload/metadata de colección y API 404/no-store, no HTTP 404 obligatorio de Next.

Evidencia: [UX-02](RESULTADOS/UX-02-compartir.md), [gate backend](RESULTADOS/LOTE-BACKEND-validacion.md),
[gate frontend](RESULTADOS/LOTE-FRONTEND-validacion.md) y
[clasificación focal posterior](RESULTADOS/LOTE-VALORES-cierre.md).

## DEC-03 — Qué significan precio e historial

**Implementado/verificado localmente:** BE-04/FE-03. UX-03 continúa parcial por
comprensión con participantes. Backend define campos y frontend conserva su
semántica; marketing utiliza sólo afirmaciones verificadas.

- La valuación combina cantidad y referencia exacta de variante/proveedor/moneda.
  Condición almacenada no ajusta el importe. `market:null` no se reemplaza con `mid`.
- Separar consulta (`fetchedAt`), fecha upstream opcional y evaluación/recencia.
  No inventar metadata de filas legacy ni rejuvenecer fechas por leer caché.
- `valuation` distingue vacío (0), desconocido (null) y parcial (importe conocido
  más cobertura). Cobertura por copias y scope completo; preservar campos legacy
  y parsers/espejo frontend. Un envelope sin `valuation` se anuncia no disponible.
- Históricos son observaciones, no una serie completa garantizada. Pueden incluir
  cambios de cantidad/composición; los snapshots derivan cobertura de sus propios
  contadores. La conversión de la serie a ARS usa el cambio actual, no histórico.
- Mostrar referencia internacional convertida, nunca prometer ganancia/ROI o
  precio realizable argentino. «Únicas» privado cuenta grupos frente a IDs públicos
  según el contrato legacy; no reinterpretar el denominador silenciosamente.
- TCGCSV es comparación separada de la misma referencia TCGplayer USD. Mantener
  identidad, variante, proveedor y fechas; sin promedio ni cambio del proveedor
  activo. Ver [comparación](../../../frontend/docs/comparison.md) y
  [operación diaria](../../../backend/docs/pricing.md).

Evidencia base: [contrato](RESULTADOS/BE-04-contrato-borrador.md),
[UX](RESULTADOS/UX-03-valores.md), [revisión backend](RESULTADOS/BE-04-implementacion-review.md),
[revisión frontend](RESULTADOS/FE-03-review.md) y
[cierre estándar aceptado](RESULTADOS/LOTE-VALORES-cierre.md).
EPERM/webpack y otros gates anteriores fallidos están conservados en sus informes;
no sustituyen ni invalidan el cierre posterior, ni son nuevos diagnósticos a repetir.

## DEC-04 — Medición mínima

**Responsables:** RES-03 diccionario/método; FE-05 eventos cliente; BE-06 métricas servidor; INF-04 alojamiento/monitoreo.

**Método elegido, 11/10:** [observación manual y tabla privada para la primera ronda](RESULTADOS/DEC-04-medicion-minima.md), conforme al protocolo RES-03 existente. Receptor propio/herramienta de analytics y FE-05 automáticos diferidos; no se habilitan cohortes automatizadas. BE-06 ya implementó/verificó métricas operativas agregadas, sin eventos personales; ver [validación](RESULTADOS/BE-06-validacion.md). Consentimiento, custodio, ubicación/retención y gates humanos de ejecución siguen registrados y pendientes antes de recolectar; elegir método no los aprueba.

**Diccionario inicial a validar:** registro, comienzo de sesión, revisión/corrección, lote guardado confirmado, primera colección útil y regreso a tarea útil. Definir denominador, ventana, duplicación y fallos; en React StrictMode no contar dos activaciones por montaje. “Registro” no equivale a “activo”; “vista” no equivale a completar una tarea.

**Datos permitidos:** métricas mínimas y seudónimos solo cuando hacen falta; retención y acceso definidos. No emails, tokens, fotos, notas de colección ni contenido de links en logs de medición. Consentimiento/requisitos de la herramienta se verifican antes de habilitarla.

**Salida:** esquema, entorno, retención, responsable y consulta/reporte reproducible. RES-03 fase protocolo entrega diccionario antes de FE-05/BE-06. RES-03 fase resultados espera instrumentación cuando corresponde; no hay dependencia circular. Una prueba de usabilidad observada manualmente puede empezar antes, sin atribuir cohortes automatizadas que no existen.

## DEC-05 — Pro y piloto pago

**Responsables:** negocio NEG-01/02/03 + dueño; consumidores UX-05, BE-08, FE-06 y marketing.

**Hipótesis inicial:** priorizar coleccionistas que completan sets y organizan duplicadas; comprobar recurrencia y disposición a pagar. Preservar prestaciones básicas actuales. Rango ARS 4.000/6.000/8.000 y cuotas de escaneo 100/1.000 son ejemplos fechados, sin capacidad ni precio validado.

**Orden de decisión:** evidencia de tarea recurrente → un beneficio definido → participantes comprometidos + costo/operación propuestos → GO de construir piloto → beneficio utilizable y permisos operables → requisitos y autorización de cobro → pagos reales → renovaciones/margen. No exigir pagos por una prestación todavía inexistente para autorizar construirla.

**Beneficio a elegir:** más escaneos, seguimiento automático u otra necesidad respaldada; no se agregan todos como pack por defecto. Historial por consulta y CSV básicos ya existen. Si seguimiento requiere nuevos jobs de precios, calcular capacidad de cola/proveedor y costo antes de programarlos. No consultar proveedores desde el request de usuario para resolver Pro.

**Contrato de salida:** ficha Free/Pro, precio/moneda/período, beneficio y cuota si aplica, timestamps de entitlement, estados de pago confirmado/vencimiento/baja/devolución, conservación de datos y soporte. Un redirect o estado `authorized` no confirma cobro. Piloto manual requiere conciliación auditable y vencimiento, no permisos perpetuos ocultos.

NEG-03 puede entregar requisitos de recuperación/eliminación de cuenta al inicio como preparación independiente. Su checklist final de cobro espera la oferta elegida: BE-05 no necesita esperar toda la validación comercial para trabajar en recuperación de cuenta.

**Cuenta integrada localmente:** [recuperación y consumidor FE-04](RESULTADOS/LOTE-CUENTA-validacion.md),
[Resend simulado](RESULTADOS/RESEND-simulado-validacion.md) y
[eliminación autoservicio BE-05](RESULTADOS/BE-05-eliminacion-validacion.md)
están aceptados. Canal/retención/destino/custodio ya elegidos: ver DEC-06. Esto
no aprueba correo externo, operación de backups, cumplimiento normativo ni GO
comercial. NEG-03 comercial continúa parcial.

**Pendientes humanos:** precio final, presupuesto, medio de cobro y requisitos comerciales/tributarios verificables. No inferir estas preferencias del código. Investigación verifica fuentes oficiales actuales; incertidumbres normativas quedan pendientes de revisión profesional cuando corresponda.

## DEC-06 — Hosting, artefactos y dominio

### Decisiones humanas vigentes

| Tema | Decisión y alcance | Evidencia |
|---|---|---|
| Hosting | Mini PC propia + Cloudflare Tunnel. Equipo todavía pendiente; preparación entregada, ejecución diferida al final. No implica publicar. | [Entorno](RESULTADOS/INF-01-entorno.md), [prompt futuro](../../infra/PROMPT-mini-pc-cloudflare.md) |
| Correo | Resend Free como proveedor previsto. Adaptador y ensayo simulado aceptados; cuenta, dominio, remitente y envíos reales pendientes al final. | [Elección](RESULTADOS/INF-01-correo-proveedor.md), [ensayo](RESULTADOS/RESEND-simulado-validacion.md) |
| Canal de baja | Autoservicio desde Ajustes, contraseña actual y confirmación. Recuperación y eliminación implementadas/verificadas localmente en BE-05; operación externa separada. | [Validación](RESULTADOS/BE-05-eliminacion-validacion.md) |
| Retención | Copias cifradas hasta 30 días desde creación original; copiar/restaurar no renueva la fecha. Antes de habilitar tráfico restaurado se verifica/aplica el registro independiente de bajas. Si falta cobertura, falla cerrado. | [Política](RESULTADOS/INF-03-retencion-supresiones.md), [implementación local](RESULTADOS/INF-03-retencion-validacion.md) |
| Destino y custodio | Backblaze B2 previsto. El dueño custodia la identidad privada age en bóveda y recuperación cifrada separadas del equipo y backups. Cuenta, permisos, medios y custodia real no acreditados. | [Decisión](RESULTADOS/INF-03-destino-custodia.md) |

El registro mínimo de bajas se conserva hasta comprobar que no quedan copias
restaurables que puedan contener las cuentas. No prometer borrado inmediato de
backups ni extrapolar retención de proveedores a una política propia.

### Implementado localmente, operación real pendiente

Reutilizar [packaging/runtime](RESULTADOS/INF-02-runtime-review.md),
[gate operación](RESULTADOS/LOTE-OPERACION-validacion.md),
[custodia](RESULTADOS/INF-03-custodia-validacion.md),
[ack de bajas](RESULTADOS/INF-03-bajas-custodia-validacion.md),
[transferencia simulada](RESULTADOS/INF-03-transferencia-validacion.md) y
[calendario](RESULTADOS/INF-03-calendario-validacion.md). No reimplementar ni repetir
ensayos intactos por haber separado la bitácora. Filesystem marcado y Linux de
ensayo no acreditan B2/off-host, pérdida eléctrica, hardware final ni uptime.

El equipo, sistema/acceso reales, dominio/cuentas, presupuesto y parámetros de
operación se verifican cuando existan. DINOv2 necesita modelo e índice locales;
Cloudflare Tunnel no ejecuta el modelo ni garantiza disponibilidad del equipo.
No pedir secretos por chat ni inferir GO comercial. La preparación no instala
servicios, activa bajas/correo externos ni despliega.

## Regla para cerrar entradas y contratos

Cada resolución registra ID, responsable, fecha, evidencia, opción elegida, consumidores y estado: **Propuesto**, **Resuelto para implementar**, **Implementado/verificado**, **Pendiente de dato humano**. Los estados iniciales y su secuencia están en la bitácora archivada; las resoluciones actuales figuran arriba. Una resolución parcial de UX no cierra la consistencia del servidor.

Una propuesta técnica rutinaria se resuelve dentro de su scope, sin inventar una aprobación extra. Si faltan datos humanos, preparar alternativas concretas y preguntar solamente por el dato/decisión necesaria; seguir con preparación independiente. El registro de tareas se actualiza al recibir el artefacto, no por fecha estimada.
