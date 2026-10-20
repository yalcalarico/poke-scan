# Contraste del resultado histórico DINOv2 — 20/10/2026

El usuario señaló que el reconocimiento ya se había corregido. La referencia verificable es [la evaluación del 6 de octubre](scanner-perspective-2026-10-06.md): cinco originales preparados a ancho máximo 1280 mediante sharp y rectificación, top-1 5/5. La prueba reciente que encontró el recorte incorrecto usó un archivo distinto, ya recortado, de 837×1060; no equivalía a repetir aquel protocolo.

Después de subir el snapshot `14895d3`, se contrastaron los cinco HEIC existentes antes y después del último parche. Sharp directo falla hoy con `bad seek`; se utilizó ImageIO nativo de macOS con EXIF, entrega PNG en memoria y resize de sharp a ancho máximo 1280. No se guardaron imágenes nuevas ni se usó el servidor o la base de datos para esta comparación.

| ID esperado | Antes del último parche | Después | Histórico 06/10 |
|---|---:|---:|---:|
| me55c-106 | 3 | 3 | 1 |
| me55-23 | 1 | 1 | 1 |
| me55-92 | 2 | 2 | 1 |
| me55-137 | 1 | 1 | 1 |
| me55-145 | 1 | 1 | 1 |

Ambas preparaciones actuales siguen aplicando perspectiva en los cinco originales y producen las mismas dimensiones, orientaciones y rankings registrados entre sí: top-1 3/5 y top-8 5/5. El módulo “antes” es el snapshot inmediatamente anterior al último parche del 20/10; no una reconstrucción del estado completo del 06/10.

Esto muestra que el último parche no empeoró esos cinco rankings en esta ejecución. **No demuestra por qué el resultado actual difiere del 5/5 histórico**, porque cambió el decodificador y no se reconstruyó toda la cadena histórica. Tampoco permite atribuir esa diferencia a la apariencia V2, a un rollback o a cambios de modelo/índice.

La primera explicación mezclaba un caso nuevo de doble recorte con la noción de una regresión histórica. Corresponde separar ambos hallazgos: el recorte interior quedó corregido para el caso reproducido, mientras que la reproducibilidad exacta del 5/5 y la primera coincidencia siguen pendientes de investigar.

[Resultados, hashes y procedencia](scanner-baseline-contrast-2026-10-20.json). No hubo nuevos cambios de producto ni otra suite global; continúa vigente el check de 1.322 casos del snapshot anterior.
