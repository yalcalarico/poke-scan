# Revisión del flujo escaneo → colección con V2 — 20/10/2026
Actualización posterior: [recorte y numeración corregidos y validados](scanner-crop-fix-2026-10-20.md). El contenido siguiente conserva el diagnóstico anterior al cambio.

Resultado: **guardado funcional; reconocimiento con un fallo reproducido, todavía sin corregir**. No se modificó código de producto ni se repitió el gate global ya aprobado del cambio de apariencia.

## Verificación realizada

- `pnpm run stop` antes de las pruebas. Suite focal de escáner/preparación/borradores: **130/130**, 19 archivos, salida 0.
- Navegador real con Next y API compilados, cuenta sintética, clon PostgreSQL marcado y Redis descartable propios. El API usó entorno development porque el HTTP local no cumple la exigencia HTTPS de sesiones production; el primer arranque rechazado por ese guard se corrigió sólo en el arnés. El frontend usa el build de producción existente.
- Registro, login, navegación V2, carga de una foto de desarrollo ya existente y respuesta real del modelo DINOv2 local, sin simular resultados.
- Propuesta equivocada no guardada. Corrección manual a Umbreon ex de 30th Celebration, número 92. Destino/variante/condición obligatorios antes de habilitar guardado.
- Cerrar el lote no guardó; recargar recuperó la selección manual, holofoil, NM y dos copias. Guardado mediante Enter.
- PostgreSQL confirmó una fila `me55-92`, `holofoil`, `NM`, cantidad 2 y una sola operación. Colección, recarga, vuelta al escáner y logout/login conservaron dos copias, sin duplicación y sin lecturas pendientes.
- 390×844 y 1440×900 sin desborde horizontal en los estados consultados. Tema claro seleccionado y oscuro original restaurado. Consola del navegador sin errores registrados. Sin capturas.
- Los precios faltantes permanecieron como “Sin precio”/—; no se inventó un valor. Los proveedores y crons del API estaban bloqueados sólo en la instancia QA.

## Hallazgos pendientes

### Recorte automático degrada el reconocimiento de esta muestra

La foto de desarrollo muestra Umbreon ex. La UI propuso Luxray y sus ocho alternativas no contenían la carta correcta. El índice incluye `me55-92` y las 20.670 referencias; no es falta de cobertura.

Reproducción independiente, mismo modelo/índice y bytes originales, sin persistir imágenes nuevas:

| Entrada | Tamaño | Puesto de `me55-92` |
|---|---|---:|
| Original | 837×1060 | 2 |
| `normalizeCardImageData` actual | 462×646 | 563 |

El detector aceptó un cuadrilátero interior con límites aproximados x=27..777, y=41..626, recortó la mitad superior y aplicó una rotación de 90°. Los ocho IDs del diagnóstico normalizado coinciden con los mostrados por el navegador. Esto acredita la degradación causada por esa preparación en esta muestra; no demuestra que eliminar el recorte resuelva el primer puesto ni la precisión general.

Próximo paso propuesto: corregir la aceptación de recortes interiores/rotaciones equivocadas, con regresión sobre esta muestra y conservación de casos válidos de perspectiva y orientación. Después verificar de nuevo el flujo real y cerrar el cambio con su gate técnico.

### Numeración de la expansión inconsistente

La propuesta corregida muestra 92/161 mientras el organizador muestra 92/128. `visual-result.tsx` utiliza `set.total`; la revisión utiliza `printedTotal`. Pendiente unificar el denominador impreso en esa presentación; no afecta el ID guardado.

## Aislamiento y alcance

Se cerró la cuenta sintética, la pestaña temporal y los procesos QA. Se eliminaron el clon y Redis sólo después de verificar marker/full ID y cero conexiones SQL. Conteos de inventario/usuarios/colecciones/ítems/shares e índices GIN de dev y TEST permanecieron iguales; Redis compartido respondió PONG. Luego se restauró la instancia dev habitual, con su configuración previa de jobs.

No se acreditan cámara física, HTTPS, PWA instalada, precisión general ni precios nuevos. No se guardaron fotos de consulta, contraseñas, tokens ni traces/videos en las evidencias.

[Evidencia y recibo](scanner-v2-flow-2026-10-20-evidence/qa-receipt.json) · [Diagnóstico geométrico y ranking](scanner-v2-flow-2026-10-20-evidence/recognition-diagnostic.json) · [Persistencia](scanner-v2-flow-2026-10-20-evidence/persisted-after-navigation.json) · [Cleanup](scanner-v2-flow-2026-10-20-evidence/cleanup.json)
