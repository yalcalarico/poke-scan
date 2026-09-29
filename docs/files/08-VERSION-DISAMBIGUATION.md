# 08: Desambiguación de versión exacta (misma carta, distinto set/print)

> Depende de `02-EMBEDDINGS-spike.md` habiendo pasado la puerta y de `identify()`
> ya con prefiltrado visual (Ola 2 de `00-README.md`). Si todavía no llegaste
> ahí, este documento no aplica: no hay candidatos visuales que desambiguar.
>
> **La fase 8.0 ya está corrida** (ver §8). El problema es real y no marginal:
> no se pospone.

## 1. El problema, dicho con precisión

`identify()` con prefiltrado visual resuelve "qué Pokémon es". No resuelve
"cuál de las 8 versiones de ese Pikachu es". Son dos preguntas distintas:

- **Reimpresión con misma ilustración**: la misma carta sale en varios sets
  (promos, colecciones especiales, reprints directos). El embedding las ve
  como la misma imagen — coseno altísimo entre sí — porque **son** la misma
  imagen, salvo por número, símbolo de set y la letra de regulation mark.
- **Variante física dentro del mismo print**: normal / reverse holo / holo /
  1st edition de la misma carta y set. Acá el arte es literalmente idéntico;
  lo único que cambia es una textura reflectante o un sello pequeño. Esto es
  otro problema y **no entra en v1** (ver §7).

Lo que hoy tenés (número + set + HP + artista + rareza por texto, corriendo
sobre el top-200 visual) ya cubre bien el primer caso *cuando el OCR lee el
número*. El gap real es: **¿qué pasa cuando el OCR del número falla o es
ambiguo, y dos o más candidatos del top-200 tienen coseno casi idéntico entre
sí?** Ahí es donde hace falta una señal más, dirigida, no otra pasada de OCR
genérico.

## 2. Señales disponibles, ordenadas por fiabilidad

| Señal | Ya la tenés | Cobertura en el catálogo | Fiabilidad | Costo de leerla |
|---|---|---|---|---|
| Número impreso (`025/198`) | Sí (OCR banda inferior) | siempre que se lea | Alta cuando se lee | Ya pagado |
| `setHint` / código de set | Parcial | — | Media | Ya pagado |
| **Código impreso del set** (`30C`, 3 caracteres) | Sí, ya implementado | 151/176 sets, 142 distintos | Alta — exacto sobre vocabulario cerrado | **Lo más barato que hay**: OCR de 3 caracteres, sin plantillas |
| **Símbolo del set** (ícono pequeño junto al número) | No | 176/176 sets con `symbolUrl` | Alta — es determinístico | ROI + comparación contra 176 referencias, no contra 20.670 cartas |
| **Regulation mark** (letra en pentágono, SWSH+) | No | **40,6%** de las cartas (8.395/20.670) | Alta cuando aplica y cuando existe | ROI + OCR de 1 carácter, whitelist `DEFGHIJ` |
| Rareza (símbolo círculo/diamante/estrella) | Parcial (texto) | — | Baja sola, útil como desempate | Ya tenés el dato del catálogo |
| Coseno del embedding | Sí | — | Alta para "qué Pokémon", **nula** para desambiguar reimpresiones idénticas | Ya pagado |
| Textura holo/reverse | No | — | — | Fuera de v1, ver §7 |

La clave del diseño: **el código, el símbolo y el regulation mark son datos que
ya tenés por set** (vienen de pokemontcg.io / TCGdex, igual que el símbolo que
ya mostrás en la ficha). El trabajo no es conseguir el dato — es leerlo de la
foto y compararlo contra lo que cada candidato del top-200 dice que debería
tener ahí. Mismo patrón que ya usás con el número: leer y comparar, no inventar
una fuente nueva.

**La señal de set es primaria, no el desempate.** La cobertura lo manda: el
regulation mark no existe en el 59,4% del catálogo (todo lo anterior a Sun &
Moon, más las cartas sin marca), y las únicas letras que aparecen en
`regulationMark` son **D, E, F, G, H, I, J** (7, no 8: no hay A, B ni C). La
letra sirve cuando la señal de set falla; nunca al revés.

Y dentro de "la señal de set", la más confiable y la más barata es el **código
impreso** (`ptcgoCode`), no el símbolo: es texto contra un vocabulario cerrado, y
un código inventado no le suma a nadie (§4.3).

## 3. Lo que las APIs ya te dan (confirmado, no supuesto)

| Campo | pokemontcg.io | TCGdex | Verificado en tu catálogo |
|---|---|---|---|
| **Código impreso del set** (`ptcgoCode`) | `set.ptcgoCode` | — | `card_sets.ptcgoCode` en 151/176 sets, 142 distintos, 9 colisiones set/sub-producto |
| Símbolo del set (imagen) | `set.images.symbol` | símbolo por set | `card_sets.symbolUrl` poblado en 176/176 |
| Regulation mark | `regulationMark` (por carta) | — (no confirmado; si falta, se infiere por rango de sets, ver §4.2) | presente en 40,6% de las cartas, letras `D`–`J` |
| Variantes físicas que existen para ese print | no expone esto explícito | `variants.normal/reverse/holo/firstEdition` (booleanos) | — |
| Total impreso del set | `set.printedTotal` | equivalente | **difiere de `total` en 106 de 176 sets, y hay sets donde ninguno de los dos es lo que la carta imprime** |

`ptcgoCode` es el único de esta tabla que es texto. Ya está modelado, ya se
sincroniza y ya bonusifica en `identify()` (`IdentifyDto.setCode`); lo que
falta es la banda de la que leerlo (§4.3).

No hay endpoint que te devuelva "la plantilla visual para reconocer este
símbolo": eso lo armás vos, una sola vez, recortando el símbolo de la imagen
de referencia de una carta por set (ya la tenés descargada). Es trabajo de
`backend/prisma` + un script, no de investigación.

## 4. Diseño: verificadores dirigidos, no más OCR genérico

### 4.1 Cuándo se activan

Solo cuando hacen falta. La mayoría de los escaneos con número legible no
necesitan esto:

```
top-200 visual → ranking de texto (como hoy)
  → si top1.score ≥ T_HIGH y (top1 - top2) ≥ MARGIN
        y el número OCR coincide con top1        → listo, ni se toca este módulo
  → si no, y top1 y top2 (o más) pertenecen al mismo
    grupo de casi-duplicados (embeddings.near_duplicate_group_id)
                                                    → correr §4.2 y §4.3 SOLO
                                                      sobre esos candidatos
```

Nunca corre sobre los 200; corre sobre el puñado que comparten ilustración.
En la muestra de 8.0, el grupo mediano tiene 2 cartas y la cola llega a 8
(la población completa tiene grupos de hasta 11, con 4.454 nombres distintos
para 20.670 cartas). El costo por escaneo es de a lo sumo una template y una
OCR de un carácter, y sólo en la minoría de los escaneos.

### 4.2 Grupos de casi-duplicados (precálculo, en el indexer)

```sql
-- Nueva columna en card_embeddings, calculada una vez por el backfill
ALTER TABLE card_embeddings ADD COLUMN near_duplicate_group_id INTEGER;
CREATE INDEX card_embeddings_ndg_idx ON card_embeddings (near_duplicate_group_id);
```

Algoritmo (offline, en el script de backfill, no en runtime):
1. Para cada carta, buscar sus vecinos más cercanos por coseno dentro de
   `card_embeddings`.
2. Si coseno > `NEAR_DUP_THRESHOLD` (arrancar en 0.97, **medir con el spike
   real, no fijar a ojo**) → mismo grupo (union-find).
3. Guardar `near_duplicate_group_id`. Los grupos de tamaño 1 quedan `null`.

Este es el dato que responde tu pregunta de "varias versiones para el mismo
nombre": un grupo es exactamente eso, cuantificado, no supuesto.

**No se puede dedupear por hash de archivo.** En el catálogo hay 20.670
`imageLarge` distintos para 20.670 cartas: pokemontcg.io re-escanea cada
reimpresión, así que el mismo arte llega como archivos diferentes. Verificado
bajando 75 pares candidatos: los 75 sha256 dan distintos. Cualquier atajo
tipo "misma URL ⇒ misma carta" es falso y hay que descartarlo antes de
escribir §4.2.

**Cómo se generan los candidatos sin embeddings (o sea, hoy).** Un par que
comparte ilustración tiene que compartir nombre; y en la práctica casi siempre
también artista. Los dos candidatos salen de un `GROUP BY`:

| Candidatos | Grupos | Cartas |
|---|---|---|
| `(name, artist)` en más de un set | 2.578 | 6.433 |
| `(name, number)` en más de un set | 1.086 | 2.391 |

Son el ceiling del problema y el upper bound de lo que 8.2 tiene que
encontrar. Sirven para dos cosas: medir (8.0) y, si el backfill de embeddings
se demora, tener una lista de pares a los que mirar de cerca.

### 4.3 Qué leer, y en qué orden

El plan original decía: comparar **el símbolo del set por imagen** contra ~176
plantillas. Antes de construir eso, hay una señal más barata que ya está en la
base y que resuelve el mismo problema.

**`card_sets.ptcgoCode` es el código de 3 caracteres que la carta imprime en la
esquina inferior izquierda** (`30C`), y pokemontcg.io lo expone. Es texto, no
imagen: match exacto contra vocabulario cerrado.

| | Símbolo del set | `ptcgoCode` |
|---|---|---|
| Dato | `symbolUrl` (imagen) | `ptcgoCode` (texto) |
| Cobertura | 176/176 sets | 151/176 sets, 142 valores distintos |
| Lectura | comparar imagen contra N plantillas | OCR de 3 caracteres con whitelist |
| Trabajo | banco de plantillas, backfill, perceptual hash, ROI por era | un ROI y un `psm` |
| Colisiones | ninguna (un símbolo por set) | 9 códigos compartidos por un par set/sub-producto (`me55`/`me55c`) |
| Riesgo | que el ícono sea muy chico en la foto | que el OCR lea basura en vez de el código |

El caso que motivó el trabajo lo confirma: `me55-92` es Umbreon ex del 30th
Celebration, la foto dice `092/120` con `30C` al lado, y sin el código el
ranking gana la impresión **por orden de release, no por evidencia** — hay tres
Umbreon ex con 280 HP y dos con 270 en el catálogo.

**Verificado contra la API**: con `setCode: "30C"` el Umbreon ex de 270 HP pasa de
`0.97` (empate con cinco impostores, ganado por `setReleaseDate DESC`) a `1.29`
con `signals.setCode === true`.

> **Por qué el backend NO la saca de `lines`.** Medido sobre las 8 fixtures
> reales de OCR: buscar cualquier token de 3 caracteres que sea un código de set
> dio **22 falsos positivos y 0 verdaderos**. `EVO` sale de "Evolves from", `MEW`
> de una carta que se llama Mew, `PAR`/`CRE`/`FLI` de basura del OCR. El backend
> recibe `lines: string[]` sin coordenadas, así que no tiene con qué filtrar por
> posición. Por eso `setCode` es un **hint del cliente** (`IdentifyDto.setCode`)
> y el campo viene en `null` hasta que haya banda medida.

**Entonces, el orden de 8.1 es:**

1. **Medir la banda del `ptcgoCode`.** Mismo método que `NAME_BAND_BOX`: banda
   medida, no puesta a ojo, y tasa de lectura sobre el dataset de Ola 0. Si se
   lee bien, la señal de set está resuelta y el símbolo del set **no hace falta
   en v1**.
2. Recién si la banda no rinde, medir la del símbolo y hacer el backfill de
   plantillas (§8.2).

El resto de §4.3 aplica igual, con el ROI del código en lugar del símbolo:

```json
{
  "sv":       { "setCode": [x, y, w, h], "regulationMark": [x, y, w, h] },
  "sm_swsh":  { "setCode": [x, y, w, h], "regulationMark": [x, y, w, h] },
  "bw_xy":    { "setCode": [x, y, w, h] },
  "ex":       { "setCode": [x, y, w, h] },
  "classic":  { "setCode": [x, y, w, h] }
}
```

- **`regulationMark`** solo existe desde Sun & Moon (2017) en adelante, y en el
  catálogo solo en el 40,6% de las cartas. Donde el candidato no tiene
  `regulationMark` cargado, la señal no vota (ni a favor ni en contra).
- **Lectura del código**: OCR con whitelist de los 142 valores que hay en
  `card_sets.ptcgoCode`. El backend ya valida el hint contra esa columna
  (`upper(s."ptcgoCode") = setCode`), así que un código inventado no suma nada:
  es imposible que un token equivocado bonusifique a un set.
- **Lectura de la letra**: OCR de un solo carácter, whitelist `DEFGHIJ` (las
  que existen en el catálogo, no el alfabeto completo), `psm 10` (carácter
  único). Es la pasada de OCR más barata y más confiable de todo el pipeline.
- **El símbolo del set**, si llegara a hacer falta, se lee como está planeado
  abajo: recorte, normalizar tamaño, comparar contra las 176 referencias
  (embedding chico o hash perceptual con `sharp` + DCT).

### 4.4 Cómo desempata (dentro del grupo, no como fusión global)

```
Para cada candidato del grupo:
  score_code   = 1 si el código leído matchea el set del candidato, 0 si no,
                 null si no se pudo leer
  score_symbol = 1 si el símbolo leído matchea el set del candidato, 0 si no,
                 0.5 si no se pudo leer
  score_reg    = 1 si la letra leída matchea regulationMark del candidato,
                 0 si no coincide, null si el candidato no tiene regulationMark
  score_number = como ya existe hoy

  ganador del grupo = el candidato con más señales en 1, desempatando por
    score de texto ya calculado (que no cambia)

  si dos candidatos quedan empatados en todas las señales disponibles
    → status: 'ambiguous', se muestran ambos con la diferencia resaltada
      (ej: "Set: Base Set" vs "Set: Base Set 2 Wizards Promo")
```

**El peso relativo importa y va al revés de la intuición.** En 8.0, los
peores casos (coseno ≈ 1,0) son casi siempre reimpresiones con **número
distinto** — `col1-79` ↔ `hgss2-77`, `xy1-117` ↔ `xy10-100`, `swsh1-9` ↔
`swsh45-9`, `dp1-107` ↔ `dp7-84`. Ahí el número impreso no desambigua entre
candidatos: no hay coincidencia que comparar, el score de texto queda neutral
o directamente contraproducente. La señal de set es la que resuelve esos
casos; la letra y el número son corroboración. Conviene que el desempate no los pese igual.

Y dentro de la señal de set, el **código va antes que el símbolo** por lo de
§4.3: es exacto, es texto, y un código mal leído no le suma al set equivocado
mientras que un símbolo parecido sí.

Esto **no es** una fusión ponderada nueva: es un desempate categórico dentro
de un grupo ya acotado. Coherente con la decisión de `01-CONTRACTS.md §4` de
no reescribir el ranking.

## 5. Contrato: qué se agrega (opcional, compatible)

```ts
// En VisualDebug (ya existe, es para diagnóstico/eval, no para la UI pública)
export interface VisualDebug {
  topScore: number;
  medianDistractor: number;
  poolSize: number;
  calibration: 'unset' | 'calibrated';
  /** Nuevo. Si el top-1 cae en un grupo de casi-duplicados. */
  nearDuplicateGroupId?: number;
  /** Nuevo. Qué señales de desambiguación se leyeron y si coincidieron. */
  disambiguation?: {
    setSymbolRead: string | null;      // código de set leído, ej "SVI"
    setSymbolMatch: boolean | null;
    regulationMarkRead: string | null; // letra leída
    regulationMarkMatch: boolean | null;
  };
}
```

Nada de esto rompe clientes viejos: son campos opcionales dentro de un objeto
que ya es opcional.

## 6. Patrones locales: guardar y mejorar con el tiempo

Esto es lo que pediste de "guardar patrones locales en mi DB". Se apoya en la
tabla de feedback que Ola 3 ya contempla (`01-CONTRACTS.md`, consentimiento
explícito), extendida:

```sql
CREATE TABLE identification_feedback (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scanId           UUID NOT NULL,
  topCandidateId   TEXT REFERENCES cards(id),
  selectedCardId   TEXT REFERENCES cards(id),
  nearDuplicateGroupId INTEGER,
  setSymbolRead    TEXT,
  regulationMarkRead TEXT,
  wasCorrect       BOOLEAN NOT NULL,
  imageStored      BOOLEAN NOT NULL DEFAULT false,  -- solo true con allowStoreImage
  createdAt        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Por qué esto mejora la detección de verdad, y no es solo logging:**

1. **Whitelist de códigos leídos de verdad.** La referencia del set (el código
   de la API, o el símbolo si se llega a usar) es un dato de la fuente: limpio y
   sin objeciones. Una lectura real, confirmada por el usuario, sacada con
   celular y con la luz que sea, es lo que de verdad se va a encontrar en
   producción. Cuando `imageStored=true`, ese recorte se agrega como **ejemplo
   adicional** de ese set (no reemplaza al de la fuente, se suma). Con ~20-30
   confirmaciones por set empezás a tener evidencia robusta a condiciones
   reales, algo que ninguna API te da. Con el código esto es todavía más
   simple: no hay nada que comparar, se cuenta la frecuencia de las lecturas.
2. **Detectar grupos de casi-duplicados que confunden mucho.** Un query
   simple sobre esta tabla (`wasCorrect=false GROUP BY nearDuplicateGroupId`)
   te dice exactamente qué reimpresiones hay que reforzar primero. Es
   priorización con datos, coherente con la cultura del repo.
3. **Recalibrar `NEAR_DUP_THRESHOLD` y los umbrales de match con evidencia,
   no a ojo.** Cada fila es un caso etiquetado. Con un par de cientos, un
   script (`eval/tune-disambiguation.ts`, mismo espíritu que
   `tune-weights.ts` del plan viejo) puede barrer el umbral y reportar
   precisión, igual que se hace con `T_HIGH`/`T_LOW`.

**Regla explícita, para que no se malinterprete:** nada de esto entrena un
modelo nuevo ni reemplaza el embedding. Es una tabla de casos + un script de
calibración. Coherente con "nada se calibra sin `eval:diff`".

## 7. Lo que queda fuera de v1 (a propósito)

- **Variante física** (holo/reverse/1st edition/shadowless) del mismo print.
  El arte es idéntico; la señal es textura reflectante o un sello chico
  (edición). Es un clasificador de imagen aparte, con su propio dataset
  etiquetado. TCGdex ya te dice **qué variantes existen** para un print
  (`variants.*`), así que cuando el desambiguador de §4 resuelve el print
  exacto, si ese print tiene una sola variante posible (`variants.holo: true`
  y el resto `false`), ya no hay nada que adivinar — se resuelve gratis.
  Cuando hay más de una variante posible para el mismo print, se le pregunta
  al usuario (selector en la UI), no se adivina. No hay presupuesto para
  clasificador de holo en v1.
- **Cartas de distinto idioma con el mismo grupo visual.** El regulation mark,
  el código y el símbolo de set son iguales entre idiomas; lo que cambia es el
  texto, que ya está fuera del alcance del embedding. Se resuelve con
  `setHint`/idioma si el usuario lo da, si no, `ambiguous`.

## 8. Fases (encajan en las Olas de `00-README.md`)

| Fase | Qué | Depende de | Gate |
|---|---|---|---|
| 8.0 | **CERRADA.** Medir cuántos grupos de casi-duplicados existen en el catálogo | sólo del catálogo (no de embeddings) | Resultado en §8.1: el problema es real, no se pospone |
| 8.1 | **Medir primero la banda del `ptcgoCode`** (§4.3) y, solo si no rinde, la del símbolo. En paralelo, la de `regulationMark` | 8.0 | Reporte de banda + tasa de lectura, no valores a ojo |
| 8.2 | Backfill de `near_duplicate_group_id`, y de plantillas de símbolo **solo si 8.1 dice que hacen falta** | 8.1 | Auto-recuperación: cada carta de referencia reconoce su propio símbolo |
| 8.3 | Verificadores en `identify()`, solo dentro de grupos (el de `setCode` **ya está hecho**, ver §4.3) | 8.2 | `eval:diff`: los casos de reimpresión conocidos (armar 10-15 en el dataset de Ola 0, a propósito) mejoran sin bajar el resto |
| 8.4 | Tabla de feedback + script de recalibración | 8.3 | — |
| 8.5 | Plantillas locales sumadas a las oficiales | 8.4, con volumen real de uso | Medir antes/después con el mismo `eval:diff` |

### 8.1 8.0 corrida: el problema es real

Se midió sin esperar el backfill de embeddings, que todavía no existe. La
herramienta es `backend/scripts/measure-near-duplicates.ts`
(`pnpm run db:measure-near-dups`): Toma los grupos candidatos de §4.2, baja
las `imageSmall` y calcula un coseno de píxeles sobre un thumbnail 32×32
**recortando el marco** de la carta (el marco blanco domina la similitud
global y no dice nada sobre el arte: sin recortarlo, la mediana de pares
al azar da 0,945 y no separa nada).

**Ojo con qué es este número y qué no es.** No es el coseno de CLIP, así que
**no sirve para fijar `NEAR_DUP_THRESHOLD`** (para eso, 8.2 con
`card_embeddings`). Es un proxy de píxeles, más tosco y por lo tanto más
conservador: sólo cuenta como casi-idéntico lo que además es casi idéntico
píxel a píxel. Al ser una cota, el problema real es **igual o más grande**.

Método: 150 grupos por variante, corte en 0,98 (medido: 27% de los pares
candidatos de `(name, artist)` lo superan, contra 0,8% de los pares cruzados
de control — el corte discrimina).

| Candidatos | Grupos con par casi-idéntico |
|---|---|
| `(name, artist)` | **32,4%** (22,4% de los grupos de 2 · 44,4% de 3 · 62,5% de 4 · 60% de 5) |
| `(name, number)` | **12,1%** |

Dos lecturas, y la segunda es la importante:

1. El problema **no es marginal**. Aplicando las tasas por tamaño a la
   población completa de `(name, artist)`, el orden de magnitud es **~800
   grupos y ~1.800 cartas, ≈9% del catálogo**, con los grupos de 3 o más
   encima como los más frecuentes. Una de cada diez cartas del catálogo
   tiene al menos una reimpresión visualmente idéntica.
2. **El gate de 8.0 no se cumple, pero la forma del problema es la opuesta a la
   que suponía el plan.** No es "grupos de tamaño 1 que se ignoran": el
   problema aparece justo en los grupos **grandes**, y encima casi todos son
   de `(name, artist)` y no de `(name, number)`. Es decir, la Worst case que
   8.0 describe (95% de tamaño 1) es minoritario, y 8.1 no se pospone.

Corolario que cambia el diseño (§4.4): los peores casos son reimpresiones con
**número distinto**, donde la señal de texto no ayuda. El símbolo de set es la
señal primaria.

## 9. Riesgos específicos de este documento

| Riesgo | Mitigación |
|---|---|
| El símbolo de set es muy chico en la foto para leerse de forma confiable | Medir resolución mínima necesaria en 8.1; si no alcanza con la resolución típica de celular, bajar a solo regulation mark + número |
| `regulationMark` no viene de TCGdex si esa es tu fuente principal para esa carta | Falta de dato ≠ falta de señal: si no está en el catálogo para ese candidato, esa señal no vota para él, no se asume que no tiene. Ojo: hoy cubre 40,6% de las cartas, así que el diseño tiene que funcionar sin él |
| Plantillas locales de mala calidad contaminan las oficiales | Nunca se mezclan: se guardan aparte y se usan como "candidatas adicionales", con revisión antes de promoverlas (aunque sea manual al principio) |
| Grupos de casi-duplicados mal formados (`NEAR_DUP_THRESHOLD` mal calibrado) | Es lo primero que mide 8.2 con datos reales, no un valor fijo del plan. El proxy de 8.0 no sirve para calibrarlo |
| Asumir que el mismo archivo es la misma reimpresión | Falso: 20.670 imágenes distintas para 20.670 cartas. Hay que ir a perceptual o embedding |

## 10. Qué se escribe al terminar cada fase

`HANDOFF.md` con: tamaño y distribución de los grupos de casi-duplicados
encontrados (ya está en §8.1 de este documento), banda medida de los ROIs
nuevos, tasa de lectura correcta de símbolo y regulation mark sobre el dataset
de Ola 0, y el `eval:diff` de antes y después de activar el desambiguador.
