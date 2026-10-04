import type { RecognizedCard } from '@/types/api';

/**
 * La sesión de escaneo, en `sessionStorage`.
 *
 * ## Por qué `sessionStorage` y no `localStorage`
 *
 * Es la decisión de alcance, y es la correcta por una razón que no es de
 * espacio: una sesión de escaneo son **cartas de otra persona** —con su nombre,
 * su número de carta y la URL de su imagen— y el destino de la sesión es el
 * `OrganizeSheet`, que las **agrega a la colección del usuario**. Eso es una
 * acción que escribe datos. Con `localStorage`, escanear 20 cartas en un
 * dispositivo compartido y cerrar la app dejaría 20 candidatos de otro
 * esperando en el disco para el próximo que abra la PWA en ese mismo navegador.
 *
 * `sessionStorage` se borra con la pestaña, que es exactamente el alcance que
 * tiene el significado "sesión": lo que el usuario leyó **en esta vuelta del
 * navegador**. El caso que motiva la feature —escanear 20, recibir una llamada,
 * cerrar la app, volver a abrirla— sigue funcionando porque cerrar y reabrir la
 * PWA **no** destruye la `sessionStorage` de iOS y Android: el WebView se
 * mantiene en memoria hasta que el browser mata el proceso, y el Service Worker
 * en standalone tampoco fuerza el cierre de la pestaña.
 *
 * ## Por qué el token y la sesión comparten storage pero no módulo
 *
 * `token-storage.ts` es la fuente de verdad del token y no se toca. Este módulo
 * es su hermano en forma (mismo patrón de `try/catch` en cada acceso, misma
 * convención de claves `pcs.*`) pero es un dominio distinto: si el usuario cierra
 * sesión, la sesión de escaneo **sobrevive**, y tiene que sobrevivir, porque no
 * tiene nada que ver con su identidad.
 *
 * ## El límite de tamaño, y por qué no hay `localStorage` de respaldo
 *
 * Un candidato es un `RecognizedCard` con la carta entera, o sea ~1,5 kB
 * en JSON. 20 escaneos son ~30 kB, y `sessionStorage` aguanta 5 MB por origen en
 * todos los navegadores relevantes. Si alguna vez una sesión llegara al límite,
 * `setItem` **tira** `QuotaExceededError`, y por eso cada escritura está
 * envuelta en `try/catch`: perder la persistencia de la sesión es una
 * degradación tolerable, perder la pantalla por un `throw` en un `useEffect` no.
 *
 * ## El límite de 30 entradas
 *
 * No es por el tamaño. Es porque la sesión es para las cartas que el usuario
 * todavía no agregó a ninguna colección, y más de 30 cartas sin decidir el
 * destino es una sesión **abandonada**, no una sesión larga: el `OrganizeSheet`
 * muestra 30 filas y el caso de uso real ("agregar las que recién escaneé")
 * tiene que ser legible de un tirón. Cuando se supera el tope se conservan las
 * **más nuevas**, que son las que el usuario está por procesar.
 */

const SESSION_KEY = 'pcs.scanSession';

/** Máximo de entradas que se conservan. Ver el JSDOC del módulo. */
export const MAX_SESSION_ENTRIES = 30;

/**
 * Recorta una sesión al tope, conservando las **más nuevas**.
 *
 * Es la única función que aplica el tope, y es la que usan tanto la escritura
 * como el alta en memoria. Eso es deliberado: antes el recorte vivía solo en
 * `writeSession`, así que el estado de React de `/escanear` podía crecer sin
 * límite durante la sesión —la UI anunciaba un máximo de 30 y la grilla llegaba
 * a mostrar 47—, y al recargar desaparecían las primeras 17 sin avisar. Un tope
 * que solo está en un call site no es un tope.
 */
export function normalizeSession<T>(entries: readonly T[]): T[] {
  return entries.length > MAX_SESSION_ENTRIES
    ? entries.slice(-MAX_SESSION_ENTRIES)
    : [...entries];
}

/**
 * Agrega una entrada a la sesión y devuelve la siguiente, ya recortada.
 *
 * Se usa en el `setSession` de `/escanear` para que el estado en memoria y lo
 * que se persiste no puedan divergir: los dos caminos pasan por acá.
 */
export function appendSessionEntry<T>(current: readonly T[], entry: T): T[] {
  return normalizeSession([...current, entry]);
}

/** La forma que se guarda. Sin envoltura: el array pelado es el contrato. */
type StoredEntry = {
  runId: number;
  candidate: RecognizedCard;
};

const isBrowser = () => typeof window !== 'undefined';

function read(): StoredEntry[] | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredEntry[]) : null;
  } catch {
    // Storage bloqueado (modo privado) o JSON corrupto: es indistinguible desde
    // acá y en los dos casos lo correcto es "no hay sesión guardada".
    return null;
  }
}

function write(entries: StoredEntry[]): void {
  if (!isBrowser()) return;
  try {
    if (entries.length === 0) {
      window.sessionStorage.removeItem(SESSION_KEY);
      return;
    }
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(entries));
  } catch {
    /* modo privado o cuota llena: la sesión sigue viva en memoria */
  }
}

/**
 * La sesión guardada, **validada**.
 *
 * ## Por qué no un `as StoredEntry[]`
 *
 * `sessionStorage` es almacenamiento **no confiable**: lo puede escribir
 * cualquier pestaña anterior de la app, una versión vieja del esquema, o un
 * `JSON.parse` de algo que no es un array. Un `as` no valida nada —solo le dice
 * al compilador que es lo que nos gustaría— así que una entrada con `candidate:
 * null` llegaría al `OrganizeSheet` y crashearía el render de una carta que el
 * usuario acaba de escanear.
 *
 * Y el criterio es **descartar la entrada, no la sesión**: una entrada rota es
 * una carta que no se puede mostrar, y las otras N siguen siendo válidas y son
 * las que el usuario quiere guardar. Tirar la sesión entera porque una entrada
 * se corrompió sería la versión destructiva de lo mismo.
 *
 * ## Qué se valida
 *
 * Lo que el render necesita para no romper:
 *
 * - `runId`: número finito. Es la clave de las filas del `OrganizeSheet` y de
 *   `onSaved`, así que sin él la fila no se puede ni identificar ni borrar.
 * - `candidate.card`: un objeto con `id` y `name`. Es el mínimo del contrato
 *   para que la `CardThumb` y el nombre tengan algo que dibujar.
 * - `candidate.card.setId`: sin él, el link "ver el set" apuntaría a un `id` de
 *   carta en vez de un id de set (el mismo bug que `toCardDto` documenta).
 *
 * Lo que **no** se valida es `score`, `price` o los subcampos de
 * la carta: son opcionales por contrato y un default que no existe
 * (`score: 0`) se vería como "no leímos nada" cuando en realidad sí.
 */
export function readSession(): StoredEntry[] {
  const stored = read();
  if (!stored) return [];

  const valid: StoredEntry[] = [];
  for (const entry of stored) {
    if (typeof entry !== 'object' || entry === null) continue;
    const runId = entry.runId;
    const candidate = entry.candidate;
    if (typeof runId !== 'number' || !Number.isFinite(runId)) continue;
    if (typeof candidate !== 'object' || candidate === null) continue;

    const card = candidate.card;
    if (typeof card !== 'object' || card === null) continue;
    if (typeof card.id !== 'string' || card.id === '') continue;
    if (typeof card.name !== 'string' || card.name === '') continue;
    if (typeof card.setId !== 'string' || card.setId === '') continue;

    valid.push({ runId, candidate });
  }
  // El recorte también va en la lectura: una sesión escrita por una versión
  // anterior del tope, o editada a mano desde el devtools, entra recortada.
  return normalizeSession(valid);
}

/**
 * Guarda la sesión, recortada al tope y con las más nuevas al final.
 *
 * El recorte va **acá** y no en el consumidor para que ningún call site pueda
 * guardar más del tope: un `write` que no recorta es un `QuotaExceededError`
 * esperando, y el `try/catch` lo tragaría en silencio —la sesión dejaría de
 * persistir sin que nadie se entere—.
 */
export function writeSession(entries: readonly StoredEntry[]): void {
  if (entries.length === 0) {
    write([]);
    return;
  }
  write(normalizeSession(entries));
}

export function clearSession(): void {
  write([]);
}

/*
 * No hay un `countSession()` a propósito.
 *
 * La tentación es exportarlo porque "la home solo necesita el número", y el
 * número es lo más barato de calcular. Sería un segundo camino al mismo dato
 * con su propia lógica de qué cuenta, y la regla de este módulo es que lo que
 * cuenta son las entradas **válidas**: una sesión con 5 corrupas y 3 buenas tiene
 * 3 cartas, no 5. Un `getItem(...).length` contaría 5.
 *
 * Con `readSession().length` el conteo y la lista que el `OrganizeSheet` dibuja
 * salen **de la misma llamada** y no pueden divergir, que es lo que importa
 * cuando uno dice "3" y el otro muestra 3 filas. El costo es el mismo
 * `JSON.parse` que la pantalla paga igual.
 */
