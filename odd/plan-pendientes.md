# Plan para atacar los pendientes

Empezar por el **preflight de NM, sin cambiar datos reales**. Después, avanzar
por unidades chicas y verificables en el orden de abajo. Este documento ordena
el [backlog único](backlog.md): no es una feature ODD, una autorización de
implementación ni evidencia de runtime actual. Cada unidad necesita alcance y GO
propios; no hay fechas ni estimaciones de duración inventadas.

## 1. Preflight NM y dos unidades de implementación

**Entrada:** frontend ya entregado; backend/conversión sin aplicar según el
[resultado NM y parche preservado](../docs/evaluations/revision-usuario-2026-10-25/RESULTADO-06-variantes-nm-refresco.md).

1. **Primera unidad recomendada: preflight.** Contrastar parche, código vigente,
   contratos y migraciones; identificar cambios ya presentes y conflictos.
   Diseñar análisis de colisiones por colección/carta/variante y casos sintéticos.
   No aplicar el parche a ciegas ni consultar/mutar inventario real sin permiso.
2. **Servidor NM:** reconciliar e implementar sólo lo faltante, con pruebas
   aisladas de clientes legacy, idempotencia, variantes/precios y refresco.
3. **Conversión histórica, unidad de datos separada:** ensayar colisiones, suma
   de cantidades, conservación de notas sin truncar, intercambio, fechas, IDs y
   referencias idempotentes. Los conflictos de límites deben abortar todo, no
   descartar copias ni atributos. No tocar precios históricos ni índices GIN.

**Aceptación:** preflight con diferencias, riesgos y estrategia verificable;
backend validado con fixtures propios; conversión repetible y rollback completo
ante conflictos. **Antes de convertir datos reales:** aprobación operativa
explícita, análisis autorizado de colisiones, respaldo/restauración comprobables,
ventana coordinada y verificación antes/después de cantidades y atributos.
El ensayo histórico no reemplaza esa aprobación ni acredita el código actual.

## 2. Baseline E2E de navegador y deuda de foco/móvil

**Entrada:** reconciliar cobertura existente; el smoke HTTP y E2E de API no
prueban interacción por UI. Usar la base NM validada para el recorrido de guardado;
el relevamiento de cobertura y las pruebas físicas pueden avanzar en paralelo.

- Inventariar y cubrir faltantes de login por UI, sesión, ownership, búsqueda,
  edición/guardado y vistas públicas, con matriz explícita de navegadores.
- Reconciliar foco sobre foto (`outline-on-media-text` frente a
  `--focus-ring-on-media`), cantidad real de indicadores, teclado y ambos temas.
- Reproducir **REV-02/07 en Safari/iPhone físico antes de proponer arreglos**;
  validar encuadre, autocaptura, audio y controles de REV-04. Registrar dispositivo,
  versión, zoom y estado de barras. Si no reproduce, dejar el límite explícito.

**Aceptación:** matriz con casos/resultados y faltantes distinguibles; foco visible
sin regresiones; reproducción y comparación física de cada corrección móvil.
Emulación no cierra cámara, audio ni comportamiento de iPhone. La falta de teléfono
no bloquea trabajo local independiente. [Fuente móvil](../docs/evaluations/revision-usuario-2026-10-25/TAREAS.md).

## 3. TCGCSV: identidad y evidencia de ciclos reales

**Entrada:** reconciliar el [roadmap de precios](../docs/plans/tcgcsv-cobertura-optimizacion-2026-10-21.md)
con la [recuperación posterior](../docs/evaluations/tcgcsv-recovery-2026-10-25.md)
y el [cierre de tanda](../docs/evaluations/tcgcsv-batch-completion-2026-10-26.md).
No reabrir Rumble/SVE, continuación tras medianoche, coordinación o ampliación
entregadas porque una casilla vieja siga abierta.

- Investigar identidad de Futsal por producto, número, idioma y variante; conservar
  la ambigüedad si no hay prueba suficiente, sin asignar por nombre parecido.
- Observar ciclos reales autorizados y comparar peticiones/bytes por archivo,
  duración, reintentos, pausas, cobertura y reutilización entre ciclos. Separar
  checks de publicación, descargas y `304` (que sigue contando como petición).
- Evaluar comprobaciones repetidas de `last-updated.txt` sólo si la medición
  justifica cambios sin debilitar identidad, reservas ni publicación segura.

**Aceptación:** asociación respaldada o motivo de no asociación; resultados
terminales por grupo, reservas de 24 h y ahorro comparable documentados, sin
confundir fixtures o recibos fechados con observación actual. TCGCSV sigue siendo
la única fuente activa; ninguna lectura pública descarga precios. Backfill queda
como decisión opt-in separada, nunca requisito del cierre diario.

## 4. DINOv2: corpus, baseline real y después mejoras

**Entrada:** [roadmap del escáner](../docs/plans/scanner-improvements.md), consentimiento
y etiquetas exactas; no usar las cinco muestras históricas como precisión general.

1. **B1 / RES-02:** primera tanda voluntaria de 20, luego 50–100 fotos con identidad
   exacta (incluida edición de Darmanitan), origen y condiciones. Incluir negativos,
   cartas ausentes, full-art, reimpresiones, fundas y reflejos; reservar una partición
   heldout que no se use para ajustar.
2. **B2:** baseline de recortes realmente exportados por el cliente, separado de
   originales directos: top-1/top-8, falsas predicciones, rechazo, denominadores,
   tiempos fríos/calientes y falsos avisos de calidad.
3. **B3–B5, sólo con B2:** reproducir Carkol/fuera del top-8 y medir recuperación,
   calibración, ediciones y acabados contra el baseline y heldout. No prometer que
   la foto distingue acabados; confirmar explícitamente cuando no alcance.
4. **A4 local:** acordar duración prolongada y condiciones antes de ejecutar;
   registrar RSS, errores, percentiles y recuperación, interviniendo únicamente
   procesos propios. Una corrida breve no cierra horas/días de estabilidad.
5. **C1–C3 cuando haya dispositivos:** cámara/PWA, red/offline/reintento sin
   duplicados y rendimiento/render en iPhone/Android físicos. Pueden avanzar
   junto con B1 o A4; no bloquean unidades locales no relacionadas.

**Aceptación:** corpus consentido y particionado, baseline reproducible, métricas
comparables y regresiones explícitas; A4 cubre el período acordado y C1–C3 separan
resultados físicos de emulación. Sólo DINOv2 autenticado: sin OCR/ORB ni persistir
fotos de consulta en servidor. Runtime/cuantización/WebGPU requieren evidencia de
precisión, memoria, latencia y compatibilidad antes de decidir implementación.

## 5. Investigación y medición antes de negocio

**Entrada:** participantes voluntarios, consentimiento, custodia y retención;
protocolos de la [beta](../docs/beta/README.md). Puede prepararse junto al corpus,
sin inventar usuarios, respuestas ni resultados.

- Ejecutar UX-03, RES-01 y RES-03, con RES-02 compartido con la fase 4; primera
  ronda de medición **manual**, con denominadores y límites.
- Con esa evidencia, resolver NEG-01/03 y MKT-03; después UX-05, FE-06 y BE-08,
  sólo si hay GO de oferta, requisitos, fuentes y pagos. No asumir Pro aprobado.
- **NEG-02 no se posterga:** análisis local de costes, licencias y restricciones
  de fuentes puede avanzar desde ahora. Separar estimaciones documentadas de
  consumo medido; no inventar cifras para cerrar la decisión comercial.
- SEO-02 local: preparar contenido/brief con MKT-03 cuando exista evidencia.
  FE-05 es automatización opcional posterior: decidir receptor, acceso y retención
  antes de diseñarla; no sustituye la primera medición manual.

**Aceptación:** hallazgos trazables, medición manual y decisiones GO/no-GO con
costes/licencias y límites explícitos; ningún pago ni automatización por defecto.

## Alcances que no se prometen

`share_target`, endpoint bulk, backfill, memoria visual consentida con borrado,
app nativa y runtime/cuantización/WebGPU requieren evidencia y decisión de producto
propias. No son correcciones automáticas ni condiciones para terminar lo anterior.
El `socket hang up` es un antecedente sin causa/fix demostrado: investigarlo sólo
si se reproduce, no tratarlo como una caída activa conocida.

## Cuándo se considera terminada una unidad

- Alcance autorizado, aceptación observable y evidencia nueva, sin reabrir
  REV-01/03/04/05/06 ni textos/períodos ya entregados; distinguir validación física
  pendiente de implementación pendiente.
- Para producto: `pnpm run stop` antes de tests, pruebas focales y
  `pnpm run check` verde; serializar suites, DB/Redis, builds y runtime compartido.
  Si afecta datos, además flujo real aislado con fixtures propios, limpieza
  verificable y conservación del inventario real.
- Revisión de alto riesgo aplicable según el switch humano, especialmente para
  conversión de datos; no reemplaza aprobación operativa ni inventa permisos.
- Para **este cambio sólo documental**: diff y enlaces locales; sin detener
  servicios, tests/builds de producto ni nueva evidencia física.

Lo apartado queda en [infra diferida](infra-diferida.md), fuera de esta secuencia.
