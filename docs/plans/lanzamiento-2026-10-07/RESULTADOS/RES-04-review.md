# RES-04 — Revisión Sol HIGH

Fecha: 2026-10-08 · Responsable: Sol HIGH · alcance: investigación documental RES-04.

**Dictamen:** RES-04 completo en su alcance documental. La aceptación exige fuentes fechadas, modalidad/moneda/grado explícitos, incertidumbre y handoffs; no exige obtener una licencia comercial nueva ni comprobar ventas argentinas inexistentes en la muestra. El coordinador actualiza registro/planes. Este dictamen no autoriza comercialización, despliegue, distribución del ONNX o migración de proveedor.

## Estado recibido y preservación

Se inspeccionó `git status --short` antes de corregir: workspace con cambios amplios previos de backend/frontend/evaluaciones/infra y carpeta de lanzamiento untracked. El artefacto RES-04 ya existía y era untracked; el review no existía. Se conservó [copia exacta recibida](evidencia-res04-review/RES-04-fuentes-recibido.md), SHA-256 `32c970152fba5b293344b4f17f591218adc7f71cbbeb7306cd473a4e1efd385d`, y [estado dirty anterior a las correcciones](evidencia-res04-review/dirty-antes.txt). La captura dirty se guardó después de crear la carpeta de evidencia y copiar el recibido, antes de editar el informe; no es un checkout limpio ni un commit nuevo.

Hashes de entradas leídas al inicio (pueden cambiar luego por coordinación, único writer de planes):

| Entrada | SHA-256 recibido |
|---|---|
| AGENTS.md | `0a44196ce9194cafcd54094af02e90e73f0da0f693604d0876d97bf14ee30688` |
| README de lanzamiento | `24ec5dee918d19778b3a7bfd4187fecf1eff2e2f855ffdd2a26ed0843fc1eced` |
| 04-investigacion.md | `9742dabb023ceeaf4d08b5321a55df97010bd9b0e11ae7b39cb68a57bbf3cdde` |
| 10-decisiones-y-contratos.md | `a1334c37eab2be2893cfdba65f2e294eaa8c2f5820950a9e572c999c50a71b3c` |

## Hallazgos corregidos

1. **Licencia atribuida a una familia equivocada.** La entrega inicial trataba [LICENSE_CELL_DINO_MODELS](https://github.com/facebookresearch/dinov2/blob/main/LICENSE_CELL_DINO_MODELS) como licencia específica general de DINOv2 y deducía riesgo no comercial. La sección Cell-DINO del [README oficial](https://github.com/facebookresearch/dinov2) asigna esa licencia a Cell-DINO; el [MODEL_CARD DINOv2-S/B/L/g](https://github.com/facebookresearch/dinov2/blob/main/MODEL_CARD.md) incluye las ocho variantes base/registers y declara Apache 2.0. Se verificaron además las fichas separadas [small base](https://huggingface.co/facebook/dinov2-small) y [small con registers](https://huggingface.co/facebook/dinov2-with-registers-small): ambas publican Apache 2.0; no se asumió que todas las familias presentes en el repo comparten licencia. El binario local no se identifica por estas fichas. Se retiró la discrepancia/aplicación no comercial fabricada y se conservó sólo la trazabilidad local pendiente.
2. **Vigencia de precios y modalidad de acceso.** Artemis y la búsqueda de TCGplayer se recuperaron como resultados indexados de ~un mes; apertura directa sin contenido usable. Se califican históricos y no revalidados en vivo. TCGplayer enlaza la búsqueda exacta que respaldó la cifra. Carax muestra Gengar a $15.500; se corrigió $15.400 y se retiró Mewtwo $4.700 como precio actual no reproducido. No se sustituyen precios por otra impresión o condición.
3. **Moneda inferida.** Se conservaron ARS probables para símbolos $ de tiendas argentinas. Scrydex pricing no imprime ISO; USD se etiqueta inferencia por contexto, incluso para sobreuso. PriceCharting sí muestra selector USD y TCGdex documenta USD para TCGplayer. No hubo conversión de valores de comparadores ni checkout para verificar facturación.
4. **Producto declarado frente a flujo comprobado.** Card Stash declara retención de dinero para buy orders y acreditación distinta para listings; no se afirma custodia efectiva verificada. Sus tarifas son un ejemplo publicado, no comisiones comprobadas en una compra ni reglas de MercadoPago universales. Se retiró colección personal no comprobada y se mantuvieron sin probar checkout, grado e idioma cuando no constan.
5. **Condiciones de alternativa.** Se agregaron [términos públicos de Scrydex](https://scrydex.com/terms), §§4/7/9: restricciones de redistribución/competencia, límites discrecionales y derechos de terceros. Pricing no prueba sublicencia, SLA ni permiso para todos los activos. La revisión contractual queda en NEG-02/03 e INF-01.
6. **Histórico local y actualidad upstream.** `ProvidersModule` mantiene catálogo `PokemonTcgIoProvider` y precios `TcgdexProvider`; lectura selectiva confirma `pricing.tcgplayer`, default USD y URL. [Auth oficial](https://docs.pokemontcg.io/getting-started/authentication/) confirma banner de deprecación/nuevas altas cerradas y fecha 2027-03-01, aunque conserva body antiguo de signup. 1.000/día y 30/min se mantienen como restricciones locales de AGENTS, sin atribuirlas al proveedor de precios ni asegurar cuota contractual actual.

## Verificación y aceptación

| Criterio RES-04 | Resultado |
|---|---|
| 4–6 competidores, incluyendo locales | Seis: Mi Mazo, Card Stash, Artemis, Carax, TCGplayer y PriceCharting; cuatro locales, dos internacionales. Las modalidades son referencia convertida, buy order, listing, agregado/modelo e historial reportado. |
| Fuentes, fecha, moneda y grado | Fuentes primarias enlazadas; acceso 8/10/2026. Indexación anterior y fallos de recuperación explícitos. Fecha de acceso no se usa como fecha de venta ni actualización upstream. [Registro de verificación](evidencia-res04-review/fuentes-verificadas.json). |
| Comparar carta/variante/condición/idioma/fecha | Ningún par argentino homologable identificado. No se calcula referencia ARS ni se presenta oferta como venta. Ventas de PriceCharting son reportes del agregador sin validación primaria de transacción/fotos. |
| Catálogo/imágenes/modelo ONNX/feed | Tabla por clase de activo, sin transferir MIT de software a pesos/art/catálogo/feed. [ONNX Runtime MIT](https://github.com/microsoft/onnxruntime/blob/main/LICENSE) no licencia el checkpoint. Hash ONNX recalculado `c179f8f7f592449c4c1bca4cd124a7538021428c5ffb89afde9503935b197efb`; tamaño 24.446.700 bytes. |
| Deprecación y alternativas sin cambio PK | [Upstream PokémonTCG](https://github.com/PokemonTCG/pokemon-tcg-data) confirma API offline prevista 1/3/2027 y conservación histórica del JSON; TCGdex/Scrydex evaluables mediante mapping externo. Sin cambio de código/PK. |
| Handoff y cierre preciso | ID documental completo; pendientes de procedencia/contratos para INF-01 y NEG-02/03, copy para SEO-03. No es una fase preparatoria sin fuentes ni un gate comercial aprobado. |

Se verificaron enlaces locales de informe/review/evidencia, parseo de JSON y hashes; [manifest final](evidencia-res04-review/hashes-finales.json) deja identidad auditable sin hash autorreferente. Una URL enlazada como evidencia no garantiza disponibilidad permanente: el registro distingue contenido recuperado, indexado y fallos. No se archivaron páginas completas ni imágenes de terceros.

La revisión ejecutó lectura/rg, SHA-256/stat, web de páginas públicas y validación documental. No ejecutó API de precios, scraping masivo, inferencia, fotos privadas, DB/Redis, stacks, build/tests ni `pnpm run check`: no cambió código, contratos o datos y el encargo restringió la ejecución a documentación. No se afirma check global verde.

No creó cuentas, compró, contactó proveedores, publicó ni resolvió legalmente permisos. No accedió a `.next` ni tomó puertos/procesos. La reserva de escritura RES-04 queda liberada al entregar; ningún proceso propio queda activo. Los cambios ajenos se preservaron y registro/planes quedaron a cargo de coordinación.
