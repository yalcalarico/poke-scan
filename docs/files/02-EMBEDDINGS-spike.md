# 02: Spike de embeddings — la puerta de decisión

Experimento de **un día** que responde una pregunta binaria: ¿identificar por
apariencia funciona en este dominio? No toca producción. Sale un número y una
decisión.

## 1. La pregunta

Una foto real de una carta (con funda, sobre una frazada, con brillo, a
resolución de celular) ¿cae cerca de la imagen de referencia limpia de esa
misma carta en el espacio de embeddings?

Si la respuesta es no, **el enfoque está muerto** y ningún ajuste de pesos,
umbrales o ROIs lo revive. Si es sí, el trabajo que sigue es integración.

## 2. Por qué con 5 fotos alcanza para decidir esto (y no para más)

Cinco fotos alcanzan para una pregunta **pareada**: "con este modelo, la
referencia correcta de esta foto cae en el top-N?". Para cada foto la
comparación es contra los mismos 20.670 distractores, así que la señal es fuerte
aunque el set sea chico.

Cinco **no** alcanzan para:
- Estimar accuracy absoluto (ahí hacen falta 50-100 del dataset de Ola 0).
- Elegir DINOv2 vs CLIP (comparación no pareada, varianza alta).

Las 5 fotos son las del usuario, en `/tmp/cards-full/`, con ground truth:

| | Carta | Dificultad |
|---|---|---|
| 1 | Shining Celebi | nombre en dos palabras |
| 2 | Pikachu | fácil, referencia con holo |
| 3 | Umbreon ex | **funda, fondo oscuro, poco contraste** (el que fallaba) |
| 4 | Chandelure | nombre único largo |
| 5 | Hisuian Zorua | **full-art, nombre en contorno blanco** (el que falla hoy) |

## 3. Experimento

### 3.0 Preparar las fotos a resolución completa

Las copias de 1400px de `/tmp/cards-user/` **no sirven**: dan resultados
distintos a las que llegan del celular.

```bash
mkdir -p /tmp/cards-full
for i in 4985 4986 4987 4988 4989; do
  sips -s format png ~/Downloads/IMG_$i.HEIC --out /tmp/cards-full/IMG_$i.png
done
```

### 3.1 Meter el modelo (la parte más delicada)

- DINOv2-small exportado a ONNX, cuantizado a **int8** (~22 MB) y fp32 (~85 MB).
  Medir ambos: la correlación de coseno fp32 vs int8 tiene que dar **≥ 0.99**;
  si no, el int8 no sirve y se va fp32.
- **El modelo no va al repo.** `.gitignore`, y un script documentado que lo
  baje. `onnxruntime-node` es nativo: probarlo **en una rama chica y temprano**,
  porque el build ESM de Nest (`nest build`, imports con `.js`) se pone quisquilloso
  con los `.node`.
- Preprocesado **idéntico** en indexación y en query. Guardar un hash del
  preprocesado en `meta.json` y negarse a arrancar si no coincide (AGENTS.md
  tiene la regla equivalente para `pg_trgm`).

### 3.2 Qué medir, por cada una de las 5 fotos

Contra el catálogo completo (las 20.670 cartas de Postgres, con su imagen):

| Métrica | Por qué |
|---|---|
| Rango de la referencia correcta por coseno | La pregunta binaria: ¿está en el top-10? |
| `coseno_correcto − mediana(distractores)` | Cuánto separa; si es ~0 no hay señal |
| Rango con y sin 4 aumentaciones | ¿Las aumentaciones (brilho, glare, perspectiva, blur) ayudan de verdad? |
| Lista de los 5 distractores más cercanos | Dice **qué** confunde al modelo: mismo set, misma ilustración, cartas parecidas |
| Latencia de una inferencia (p50, p99) | Decide si entra en el presupuesto |

### 3.3 El presupuesto de latencia

Un escaneo de una foto a resolución completa, con las 9 pasadas de OCR, mide
**8.6 s** en Node (con el arranque del worker de Tesseract incluido, que son
2-4 s). Sumarle la inferencia:

| Inferencia | Total | Veredicto |
|---|---|---|
| < 300 ms | ~9 s | bien |
| 300-800 ms | ~9.5 s | aceptable, se avisa al usuario |
| > 800 ms | ~10 s+ | problemático: el embedding va al cliente (onnxruntime-web), que es otra etapa |

Si la inferencia en CPU es demasiado lenta, la salida no es descartar el
enfoque: es **embeber en el cliente** y mandar `clientEmbedding` (ya estaba en el
contrato viejo). Eso tiene su propio costo: validar el vector, no confiar en él y
duplicar el preprocesado. Se decide con el número medido.

## 4. Criterios de aceptación (fijados antes de correr)

Están en `00-README.md §6`. En corto:

| # | Criterio | Umbral |
|---|---|---|
| 1 | Referencia correcta en el top-10 | **≥ 4 de 5 fotos** |
| 2 | Separación sobre la mediana de distractores | **≥ 0.10** (fp32) / **≥ 0.05** (int8) |
| 3 | Inferencia en la máquina de desarrollo | dentro del presupuesto de §3.3 |

| Resultado | Decisión |
|---|---|
| 1 y 2 | Pasa → Ola 2 (integración) |
| Solo 1 | Hay señal pero no discrimina → **no** seguir con embeddings |
| Ninguna | El enfoque no sirve aquí → Ola 2' (solo OCR) y tema cerrado |
| Todo pasa | Elegir modelo y cuantización con la tabla completa |

Caso especial que hay que mirar: si Zorua sigue sin aparecer en el top-10 pero
las otras 4 entran holgadas, el problema es la **variante full-art**, no el
enfoque. Eso abriría un camino barato (indexar también la versión sin el marco) y
no debería hacer descartar todo.

## 5. Qué se escribe al terminar

Un `HANDOFF.md` en el spike con, sí o sí:

1. La tabla de §3.2 completa (no un resumen: los números).
2. La **distribución de cosenos** partida en dos grupos (misma carta / distinta), que es
   lo que define `NOT_IN_CATALOG_FLOOR` y la escala del coseno.
3. Los 5 distractores más cercanos por foto, con nombre de carta.
4. Latencia p50/p99 fp32 e int8, y la correlación entre ambos.
5. La veredicto, con los criterios de §4 citados.
6. Qué se aprendió que no estaba en el plan.

Ese archivo es la entrada de `01-CONTRACTS.md §3` y §4: hasta que exista, el
piso de `not_in_catalog` y la escala del coseno **no se tocan**.

## 6. Lo que NO se hace acá

- No se agrega la columna `card_embeddings` todavía (el spike puede medir con
  un índice en memoria temporal).
- No se modifica `identify()`. El spike no toca producción.
- No se calibran umbrales ni ROIs: eso es Ola 2, con el eval.
- No se elige el modelo definitivo: se miden DINOv2 y CLIP y gana el que pasa.
