# Corrección de recorte y numeración V2 — 20/10/2026
Contraste posterior de los originales con otro decodificador: [resultados y límites de reproducibilidad](scanner-baseline-contrast-2026-10-20.md).

**Corrección implementada y validada localmente.** El recorte de la muestra de Umbreon conserva ahora la carta completa y la referencia correcta vuelve a las alternativas. El total impreso coincide entre propuesta, revisión y organizador. La primera coincidencia de esta foto sigue siendo Luxray: no se declara resuelto el top-1 ni la precisión general.

## Cambio

`normalizeCardImageData` consulta ambos detectores. Si el marco rectangular contiene el cuadrilátero (con el margen existente del 6% sobre su lado menor) y éste ocupa como máximo el 75% del área del marco, utiliza el contorno exterior. Así no rectifica ni gira una figura interna como si fuera la carta completa. Si no existe ese marco envolvente, conserva la rectificación de perspectiva. Los límites de payload, la cámara ya encuadrada y el modelo/índice permanecen iguales.

`VisualScanResult` usa `set.printedTotal`, igual que la revisión y el organizador, en lugar de `set.total`. Una expansión con 128 cartas impresas y 161 contando adicionales muestra 92/128.

## Evidencia

| Misma foto de desarrollo | Antes | Después |
|---|---:|---:|
| Recorte enviado | 462×646 | 834×1042 |
| Rotación automática | 90° | 0° |
| Puesto de `me55-92` | 563 | 3 |
| Primera coincidencia | Luxray | Luxray |

El diagnóstico independiente usa el mismo modelo e índice locales, sin persistir imágenes nuevas. En navegador real sobre API/Next compilados se vieron las mismas ocho alternativas: se eligió Umbreon ex de 30th Celebration directamente, **sin búsqueda manual**, y se confirmó. La propuesta corregida, la revisión y el organizador mostraron **92/128**.

Se guardaron dos copias holofoil NM en la colección sintética. PostgreSQL confirmó **una fila, cantidad 2 y una sola operación**; la recarga mantuvo ambas copias y al volver al escáner no quedaron lecturas pendientes. El guardado se activó con teclado. V2 estuvo activa sin parámetro de versión. Se observaron 390×844 y 1440×900 sin desborde horizontal; se comprobó tema claro y se restauró el oscuro. Consola sin errores registrados. No se tomaron capturas ni se descargaron fotos/diagnósticos desde la UI.

## Validación técnica

- Regresiones nuevas antes de implementar: 3 fallos y 8 casos anteriores verdes. Cubren el dibujo interior en orientación vertical/horizontal y la diferencia entre total impreso y total con adicionales.
- Focal final: **133/133**, 19 archivos, salida 0. Conserva las pruebas de perspectiva válida, carta horizontal, alineada y geometría inválida.
- `pnpm run stop`, luego **`pnpm run check` estándar exacto una vez**, salida 0: lint/tipos, 596 casos Vitest backend, 22 Node backend, 6 e2e, 622 frontend y 76 Node de operaciones; **1.322 casos, cero skips**, builds Nest y Next/Turbopack verdes.
- Hashes de los cuatro archivos de implementación/pruebas estables durante el check y el runtime. No se cambiaron contratos, proveedores, dependencias ni versiones.

Se preservaron las corridas focales intermedias: se ajustó la tolerancia de contención para ambas orientaciones y se corrigió la posición esperada del pie tras dos giros horarios en la nueva prueba. Una corrida intermedia también falló en la prueba preexistente de acciones de revisión de galería, cuya preparación está mockeada; ese flujo/test no se modificó y no se atribuye una causa ni una reparación. Tanto la focal final como el check completo lo pasaron.

## Aislamiento y límites

El gate y el ensayo real usaron clones PostgreSQL marcados y Redis propios, serialmente. Se verificaron full IDs/markers, cero conexiones antes de cada drop y cleanup de ambos clones/contenedores. Dev y TEST conservaron sus conteos de inventario, usuarios, colecciones, ítems, shares e índices GIN; Redis compartido respondió PONG. La instancia QA bloqueó proveedores y deshabilitó workers/crons; los precios ausentes siguieron como “Sin precio”. La instancia dev habitual quedó restaurada con su configuración previa de jobs, API y web HTTP 200.

No se acreditan cámara física, HTTPS/PWA instalada ni precisión general. Se intentó contrastar los cinco HEIC originales existentes, pero sharp no pudo decodificar el primero (`bad seek`); esa comprobación no produjo un nuevo resultado del corpus. El histórico 5/5 de octubre permanece como evidencia histórica, sin presentarlo como revalidado hoy.

**Próximo trabajo propuesto:** investigar el orden de coincidencias de DINOv2 para esta muestra: la opción correcta está disponible y el flujo de confirmación/guardado funciona, pero no es la primera propuesta. No se cambiaron scores ni se forzó una identidad para conseguir ese resultado.

[Recibo](scanner-crop-fix-2026-10-20-evidence/receipt.json) · [Check completo](scanner-crop-fix-2026-10-20-evidence/check.log) · [Diagnóstico después](scanner-crop-fix-2026-10-20-evidence/recognition-diagnostic.json) · [Persistencia](scanner-crop-fix-2026-10-20-evidence/runtime-persisted-final.json) · [Cleanup](scanner-crop-fix-2026-10-20-evidence/runtime-cleanup.json)
