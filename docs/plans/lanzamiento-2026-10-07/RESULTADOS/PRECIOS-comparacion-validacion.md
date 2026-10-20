# Comparación de precios y gráficas — aceptación local

13/10/2026. Implementación solicitada por el usuario, aceptada localmente por root. No hay una importación real TCGCSV publicada todavía: la primera ejecución está programada para **14/10,20:30UTC /17:30Argentina**, con la instancia encendida y conexión disponible.

## Entrega funcional

- Adaptador TCGCSV, asociación de productos por identidad/edición/idioma/número/variante y mapa explícito de30 cartas Classic. Grupos24722/24837. TCGdex conserva la política principal; ambas fuentes transportan referencias TCGplayerUSD.
- Cola porgrupo persistente, demanda que sólo encola, descarga diaria20:30UTC, presupuesto durable24h y ritmo global150ms. Timeout15s, bytes acotados, builds repetidos/anteriores/cambiantes, lease, checksum y publicación atómica. No hay fetch externo desde los handlers ni desde el navegador.
- Comparación y gráficas de cartas con variante fija y períodos7/30/90/365d, dos series rotuladas, huecos/null y cero válido. Un dato dibuja un punto; no se fabrica una tendencia ni historial anterior.
- Snapshots porcolección/política/proveedor/díaUTC: decimalUSD, cantidades/cobertura/frescura, composición y corte coherente. Hoy provisional, pasado cerrado; cascada privada al eliminar colección/cuenta. Portfolio suma cortes coherentes y omite cortes incompletos. Legacy conserva su historial sin atribuirle una fuente nueva.
- Paneles en carta, detalle de colección y portafolio; actualizan al editar cantidades, permiten relectura local y tienen estados de carga/error/ausencia. USD permanece explícito aunque el resto de la app esté enpesos.
- PWA v7: no guarda ni reproduce offline comparaciones no-store, incluso con caché caliente.

## Validación

36 focales backend y18 frontend. Primera focal frontend4/5: expectativa contradictoria de la fixture (TCGCSV tenía dos días consecutivos pero exigía cero líneas); corregida para verificar cada serie, sin atribuir un fix al renderer. Correcciones root de tipos/narrowing y dependencia del callback; resultados conservados.

Check estándar inicial1200/1200,0skips. Revisión posterior encontró cacheado PWA: regresión causal **2 fallos/3 verdes antes →5 verdes después**. Nuevo clon estándar propio, sin fixtures de ingesta, para el check final exacto: **1202/1202,0skips**, lint/tipos/builds Nest+NextTurbopack verdes. No se repitieron diagnósticos históricos de socket/backfill ni se les atribuye un fix.

**71 controles integrados distintos por fases**:32API sobre PG/Redis propios y feed HTTPloopback, más39 de navegador/edición/cascada. API/Next compilados, login con redirección real a/buscar, comparación/fuente/variante, Classic30, metadata, null/0/cobertura, builds/idempotencia/cortes/cambios de cantidades; móvil390/desktop1280, ambos temas, teclado y reflow, sin errores JS. Sin capturas/traces/videos. Valores e intervalos históricos del ensayo son fixtures explícitas, no tendencias reales del mercado ni24h transcurridas.

Cuatro fallos previos del harness preservados: cabecera de seguridad de registro ausente; Next heredaba puerto3001; selector ignoraba sufijo accesible obligatorio; expectativa de redirección/inicio en lugar de/buscar. Se corrigieron los helpers; los32controles API no se repitieron durante las fases de navegador. No se debilitó producto ni sus guardas.

3614fuentes/outputs intactos durante el consumidor. Dos clones y sus Redis retirados por marker/fullID/SQL0; TEST compartida11migraciones/7cotizadas y Redis compartidoPONG intactos. Migración aditiva14 aplicada al dev después del ensayo, respaldo temporal privado y hashes lógicos: usuarios/colecciones/ítems/shares/catálogo/precios previos e índicesGIN intactos. Copia temporal retirada tras comprobar integridad y salud; metadata conservada. Ninguna fixture escrita a dev.

## Operación local actual

App viva en http://localhost:3000, API19441/Next19194 (verificar recibo y ascendencia antes de detener). Snapshot diario20:35UTC activo:44valoraciones reales persistidas. Ingesta comparativa TCGCSV habilitada para los dos grupos, dos jobs pendientes; primera ejecución14/10 a17:30Argentina. Presupuesto inicial contabiliza las lecturas públicas reales13/10:24722 a14:22UTC y24837 a19:29UTC. Guardia local permite sólo GET de esos endpoints después del plazo;10controles con fetch stub y cero red real acreditan la restricción. Estado final:0precios TCGCSV,2jobs futuros,0slots de rateTCGCSV consumidos.

Otros proveedores/jobs antiguos, correo y bajas reales mantienen su bloqueo. No se cambió PRICE_PROVIDER, se crearon cuentas externas ni se desplegó. La primera ingesta real y su cobertura completa siguen pendientes de ejecución; no se promete precio para todas las cartas/variantes. Uso local solicitado; derechos de redistribución pública/comercial y GO conservan su evaluación propia. Guías del feed:[TCGCSV](https://tcgcsv.com/docs).

Beta/corpus siguen a cargo del usuario; miniPC/servicios reales al final.20/38IDs,18pendientes: este alcance técnico adicional no cierra requisitos comerciales, físicos ni de participantes. AutomatizaciónPAUSED/doshoras intacta, sin agentes/reservas/recursos QA vivos. Preview beta7752 intencional conservado.

Evidencia:[manifest de28artefactos](PRECIOS-comparacion-evidencia/hashes.json),[check final](PRECIOS-comparacion-evidencia/current-check-result.json),[consumidor](PRECIOS-comparacion-evidencia/runtime-result.json),[estado local](PRECIOS-comparacion-evidencia/final-local-data-state.json),[programación](PRECIOS-comparacion-evidencia/live-schedule-receipt.json),[instancia](PRECIOS-comparacion-evidencia/final-instance.json).
