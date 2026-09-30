import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/index.js';
import { PRICE_PROVIDER, type PriceProvider } from '../providers/card-provider.interface.js';
import type { CardDto, CardPriceDto, SetDto } from './cards.service.js';
import {
  DEFAULT_IDENTIFY_LIMIT,
  type IdentifyDto,
} from './dto/identify.dto.js';

// ─── Sintonización ────────────────────────────────────────────────────────
// Mismos valores que `CardsService.search()`: reusamos su estrategia en capas
// (ILIKE + trigram) contra los índices GIN de `cards.name` / `card_sets.name`.
const TRIGRAM_THRESHOLD = '0.2';
const PREFIX_BONUS = 0.2;

const MAX_CANDIDATES = 200;
const MAX_MATCH_ROWS = 300;
const MAX_TOKENS = 800;
const MAX_CARDS_PER_NAME = 3;
const MIN_SCORE = 0.25;
// El número impreso en la carta es una señal MUY débil: con cartas reales,
// Tesseract leyó "NO. 105" en Alolan Marowak, que es el número de la Pokédex,
// no el número de carta (que es 12). Por eso el bonus es chico: sirve para
// desempatar, no para decidir.
const NUMBER_BONUS = 0.06;
// ─── Atributos impresos en la carta ───────────────────────────────────────
//
// El nombre solo no alcanza: "Charizard" existe en ~40 sets. Lo que desempata es
// lo demás que la carta imprime, y el OCR lo lee bastante bien (medido sobre
// fotos reales: la última línea de la carta trae "Mitsuhiro Arita © 1995...
// 4/102"). Cada señal es un bonus chico: desempatan, no deciden, y una señal
// mal leída simplemente no aporta.
/** "4/102" → n=4, m=102: número de carta y total impreso del set. */
const PRINTED_NUMBER_BONUS = 0.25;
/** "120 HP" en la caja de arriba a la derecha. */
const HP_BONUS = 0.12;
/** "Mitsuhiro Arita" en el pie de la carta: único por impresión. */
const ARTIST_BONUS = 0.12;
/** "Rare Holo", "Secret Rare"... en la esquina inferior derecha. */
const RARITY_BONUS = 0.08;
/**
 * El código de 3 caracteres impreso abajo a la izquierda ("30C").
 *
 * Vale lo mismo que `SET_BONUS` y por la misma razón: identifica el SET, no la
 * carta. La diferencia es que este match es exacto contra un vocabulario
 * cerrado, así que no necesita la tolerancia del trigram de `setBonus`. Cuando
 * hay colisión (el par set/sub-producto, p.ej. `me55` y `me55c` comparten
 * "30C") el bonus reparte entre los dos y no decide: por eso no sube.
 *
 * Sin calibrar con `eval:diff` todavía: es el mismo número que una señal que ya
 * está en producción, no uno inventado. Cuando haya dataset de Ola 0 se ajusta
 * junto con los demás, mirando si el código se lee o no.
 */
const SET_CODE_BONUS = 0.2;
// Bonus por coincidencia de cantidad de palabras: si el OCR leyó una ventana de
// 2-3 palabras ("polan Marowak"), debe preferir un nombre de carta de 2-3
// palabras ("Alolan Marowak") por sobre el match parcial de 1 palabra ("Marowak").
const WORD_COUNT_BONUS = 0.18;
// Penalización por cobertura del piso de match exacto: por cada palabra que el
// OCR leyó de más y el nombre de la carta no cubre, se resta esto al piso.
const COVERAGE_PENALTY = 0.3;
// Las cartas de energía se llaman "N", "F", "W", "C"... Con nombres de 1-2
// caracteres cualquier ruido de OCR matchea perfecto (la carta "N" matcheaba
// "Ned" con 1.0). Se hunden para que no ganen nunca por coincidencia trivial.
const SHORT_NAME_FACTOR = 0.2;
/**
 * Tope del piso de match exacto para nombres de 3 letras o menos.
 *
 * Con un nombre tan corto, "igual" y "casi igual" son la misma cosa: Tesseract
 * leyó "mes" donde la carta dice "Mew" y el token es exactamente el nombre con
 * una letra distinta, así que el piso de 1.0 lo declaraba winner sobre el nombre
 * real ("Chandelure", leído una sola vez y por eso con el 0.97 de
 * SINGLE_OCCURRENCE_FACTOR). Medido: con el tope, "Chandelure" le gana a "Mew";
 * sin él, gana "Mew".
 *
 * No hunde la carta: 0.8 sigue estando muy por encima de MIN_SCORE, así que un
 * "Mew" legítimo sigue siendo el top-1 cuando no hay nada mejor.
 */
const SHORT_NAME_FLOOR = 0.8;
const SHORT_NAME_FLOOR_LENGTH = 3;

/**
 * Una palabra que podría ser parte de un nombre de carta: empieza con letra y
 * sigue con letras, dígitos o apóstrofos, con 3+ caracteres. Filtra el ruido OCR
 * ("27ec1", "100", "27ec1)") para poder contar cuántas palabras de una ventana
 * de candidato son "parecidas a un nombre".
 */
const NAME_LIKE_WORD = "^[[:alpha:]][[:alnum:]'-]{2,}$";

/** Ventana de 2+ palabras, todas con forma de nombre. */
const NAME_LIKE_PHRASE = "^([[:alpha:]][[:alnum:]'-]{2,})( +([[:alpha:]][[:alnum:]'-]{2,}))+$";
const SET_BONUS = 0.2;
const SET_SIMILARITY_MIN = 0.35;
const STOPWORD_FACTOR = 0.25;
const SINGLE_OCCURRENCE_FACTOR = 0.97;
const MAX_LINES = 60;
const WINDOW_SIZES = [1, 2, 3] as const;

const TRIGRAM_MIN_LENGTH = 3;

/** Todo lo que no sea alfanumérico (con acentos) o separador se va a espacio. */
const NOISE = /[^A-Za-z0-9áéíóúñÁÉÍÓÚÑ .'-]+/g;
const WORDS = /[^A-Za-z0-9áéíóúñÁÉÍÓÚÑ]+/;
const HAS_LETTER = /[\p{L}]/u;

/**
 * Vocabulario del boilerplate de una carta ("Evolves from X", "Flip a coin",
 * "weakness resistance retreat cost"...). Un candidato compuesto solo por estas
 * palabras nunca es el nombre de una carta, pero trigram los matchea igual
 * ("from" ~ "Frost Rotom"), así que los penalizamos.
 */
const STOPWORDS = new Set([
  'a', 'all', 'and', 'are', 'as', 'at', 'attach', 'attached', 'be', 'bench', 'by',
  'can', 'card', 'choose', 'coin', 'cannot', 'counter', 'counters', 'damage',
  'deck', 'defending', 'does', 'during', 'each', 'energy', 'end', 'ends', 'evolve',
  'evolves', 'evolution', 'flip', 'for', 'from', 'has', 'have', 'heads', 'hp',
  'if', 'in', 'into', 'is', 'it', 'knock', 'more', 'may', 'no', 'not', 'of',
  'off', 'on', 'one', 'only', 'opponent', 'or', 'power', 'pokemon', 'put', 'resist',
  'resistance', 'rest', 'retreat', 'search', 'set', 'shuffle', 'stage', 'tails',
  'that', 'the', 'this', 'to', 'turn', 'unable', 'used', 'weakness', 'your', 'you',
]);

export interface IdentifiedCandidateDto {
  card: CardDto;
  score: number;
  /**
   * El score sin clampear, para diagnóstico y para que la UI pueda ordenar por
   * margen real. `score` va saturado a 1 por compatibilidad: varios candidatos
   * legítimos empatan en 1.00 y sin esto no hay forma de ver que el segundo tuvo
   * 0,97.
   */
  rawScore: number;
  /**
   * Qué señales votaron y si coincidieron. `null` = la señal no se pudo leer y
   * por lo tanto no vota (ni a favor ni en contra); `false` = se leyó y no
   * coincidió. La diferencia importa: no es lo mismo "el set no es este" que
   "no sabemos qué set es".
   */
  signals: CandidateSignalsDto;
  matchedText: string;
  /**
   * Precios en USD. Sin `priceArs` a propósito: identify es público y sin
   * usuario, así que no se pegarle a DolarApi. El cliente convierte con el
   * rate de `GET /currency/usd-ars`.
   */
  prices: CardPriceDto[];
  /** Variante más barata/reciente: la que consume hoy `IdentifiedCandidateDto`. */
  price: CardPriceDto | null;
}

export interface CandidateSignalsDto {
  /** `number` del cliente coincidió con el número de la carta. */
  numberHint: boolean | null;
  /** `setHint` del cliente coincidió con el nombre del set. */
  setName: boolean | null;
  /** `setCode` del cliente coincidió con el código impreso del set. */
  setCode: boolean | null;
  /** El "N/M" leído por el OCR es el de esta impresión. */
  printedNumber: boolean | null;
  hp: boolean | null;
  artist: boolean | null;
  rarity: boolean | null;
}

export interface ExtractedDto {
  name: string | null;
  number: string | null;
  /** Set detectado. El nombre de la clave coincide con `setHint` del request. */
  setHint: string | null;
}

export interface IdentifyResultDto {
  candidates: IdentifiedCandidateDto[];
  extracted: ExtractedDto;
  totalCandidates: number;
}

interface Candidate {
  text: string;
  pattern: string;
  weight: number;
  wordCount: number;
}

interface MatchRow {
  id: string;
  name: string;
  supertype: string;
  subtypes: string[] | null;
  hp: string | null;
  types: string[] | null;
  number: string;
  rarity: string | null;
  artist: string | null;
  setId: string;
  imageSmall: string;
  imageLarge: string;
  setIdSet: string | null;
  setName: string | null;
  setSeries: string | null;
  setPrintedTotal: number | null;
  setTotal: number | null;
  setReleaseDate: Date | null;
  setLogoUrl: string | null;
  setSymbolUrl: string | null;
  score: number;
  /** Bonus de cada señal, proyectado aparte para armar `signals` de la respuesta. */
  sigNumberHint: number;
  sigSetName: number;
  sigSetCode: number;
  sigPrinted: number;
  sigHp: number;
  sigArtist: number;
  sigRarity: number;
  matchedText: string;
  hasPrice: boolean;
}

interface PriceRow {
  cardId: string;
  variant: string;
  low: number | string | null;
  mid: number | string | null;
  high: number | string | null;
  market: number | string | null;
  provider: string | null;
  currency: string;
  source: string;
  fetchedAt: Date;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function toIso(value: Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const numeric = Number(value as { toString(): string });
  return Number.isFinite(numeric) ? numeric : null;
}

function stripNoise(line: string): string {
  return line.replace(NOISE, ' ').replace(/\s+/g, ' ').trim();
}

/** Un candidato sirve si tiene letras y no es un caso de solo dígitos/ruido. */
function isUsable(text: string): boolean {
  if (text.length < TRIGRAM_MIN_LENGTH) return false;
  return HAS_LETTER.test(text);
}

function isBoilerplate(text: string): boolean {
  const words = text.toLowerCase().split(WORDS).filter(Boolean);
  return words.length > 0 && words.every((word) => STOPWORDS.has(word));
}

/**
 * Calidad del texto candidato:
 *  - si es solo boilerplate de carta ("from", "the Stage card"), se hunde: el
 *    trigram lo matchea con nombres reales ("from" ~ "Frost Rotom");
 *  - si el texto es el nombre de una PRE-evolución, se hunde fuerte: la carta
 *    imprime "Evolves from Cubone" en su propio texto, así que "Cubone" matchea
 *    perfecto (1.0) aunque el nombre real de la carta sea otro. Es evidencia
 *    negativa: saber que evoluciona desde Cubone NO dice que sea un Cubone;
 *  - si aparece en una sola línea del OCR, vale un poco menos que uno que el
 *    OCR repitió (el nombre propio de la carta se repite en su propio texto:
 *    "Charizard" aparece en el título, en la habilidad y en el ataque).
 */
const EVOLUTION_FACTOR = 0.15;

/** Palabras que cortan el nombre de la pre-evolución en "Evolves from X ...". */
const EVOLUTION_STOPWORDS = new Set([
  'put', 'on', 'the', 'a', 'an', 'to', 'and', 'or', 'if', 'when', 'while',
  'during', 'after', 'before', 'this', 'that', 'it', 'stage', 'card', 'of',
  'in', 'by', 'from', 'with', 'as', 'at', 'is', 'are', 'be',
]);

/** Nombres que, si aparecen después de "Evolves from", son de otra carta. */
function evolutionNames(text: string): Set<string> {
  const found = new Set<string>();
  // Captura acotada a 6 palabras: "Evolves from Eon Put Charizard on the Stage"
  // es una sola línea donde el nombre de la pre-evolución es solo "Eon". Si se
  // capturara hasta el final se tragaría el nombre real de la carta.
  const pattern = /evolves?\s+from\s+((?:[A-Za-z][A-Za-z0-9'-]*\s+){0,5}[A-Za-z][A-Za-z0-9'-]*)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const words = match[1].split(' ').filter(Boolean);
    // Se corta en la primera palabra de boilerplate: lo que viene después
    // ("Put Charizard on the Stage") ya no es parte del nombre de la evolución.
    const head: string[] = [];
    for (const word of words) {
      if (EVOLUTION_STOPWORDS.has(word.toLowerCase())) break;
      head.push(word);
      if (head.length >= 3) break;
    }
    for (const size of WINDOW_SIZES) {
      for (let i = 0; i + size <= head.length; i += 1) {
        const phrase = head.slice(i, i + size).join(' ').toLowerCase();
        if (phrase.length >= 3) found.add(phrase);
      }
    }
  }
  return found;
}

function candidateWeight(
  text: string,
  cleanedLowerLines: string[],
  preEvolution: Set<string>,
): number {
  const weight = isBoilerplate(text) ? STOPWORD_FACTOR : 1;
  if (weight < 1) return weight;

  if (preEvolution.has(text.toLowerCase())) return EVOLUTION_FACTOR;

  const needle = text.toLowerCase();
  const occurrences = cleanedLowerLines.reduce(
    (count, line) => (line.includes(needle) ? count + 1 : count),
    0,
  );
  return occurrences === 1 ? SINGLE_OCCURRENCE_FACTOR : weight;
}

/** "4/102" → 4, "006" → 6, "NO.18" → 18, "LV.76" → 76. null si no hay dígitos. */
function firstInteger(value: string | undefined): number | null {
  if (!value) return null;
  const groups = value.match(/\d+/g);
  if (!groups || groups.length === 0) return null;
  const parsed = Number.parseInt(groups[0]!, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * Señales que se leen de las líneas del OCR y que la carta imprime de verdad.
 *
 * Se extraen del texto (no se hardcodea vocabulario) y se usan como bonus: si
 * el OCR no las leyó, no suman nada; si las leyó mal, no restan.
 */
interface CardSignals {
  /** "120 HP" → 120. */
  hp: number | null;
  /** "4/102" → { n: 4, m: 102 }. El denominador es el total impreso del set. */
  printed: { n: number; m: number } | null;
}

function extractSignals(lines: string[]): CardSignals {
  const text = lines.join(' \n ');

  // "120 HP": la caja de arriba a la derecha. Se exige el "HP" para no confundir
  // con daño de ataque ("does 40 damage") ni con el número de la Pokédex.
  let hp: number | null = null;
  for (const match of text.matchAll(/(\d{2,4})\s*HP\b/gi)) {
    const value = Number.parseInt(match[1]!, 10);
    // Los HP de carta van de 10 a 400; fuera de eso es ruido de otra cosa.
    if (Number.isSafeInteger(value) && value >= 10 && value <= 400) {
      hp = value;
      break;
    }
  }

  // "4/102" en la esquina inferior derecha. Se exige que el denominador sea
  // plausible como total de un set (30..400) para no agarrar un "1/2" de un
  // porcentaje o de un rango de daño.
  let printed: { n: number; m: number } | null = null;
  for (const match of text.matchAll(/(?<![\d/])(\d{1,3})\s*\/\s*(\d{2,3})(?![\d/])/g)) {
    const n = Number.parseInt(match[1]!, 10);
    const m = Number.parseInt(match[2]!, 10);
    if (Number.isSafeInteger(n) && m >= 30 && m <= 400) {
      printed = { n, m };
      break;
    }
  }

  return { hp, printed };
}

@Injectable()
export class IdentifyService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRICE_PROVIDER) private readonly priceProvider: PriceProvider,
  ) {}

  /**
   * Log de diagnóstico de `identify`, apagado salvo `IDENTIFY_DEBUG=1`.
   *
   * Existe porque el ranking se arma en el servidor a partir de lo que manda el
   * OCR del cliente: si el resultado no es el esperado, la única forma de
   * saber por qué es ver qué llegó y qué salió. Sin esto hay que adivinar desde
   * el síntoma en pantalla, y se adivinó mal varias veces.
   */
  private debug(event: string, data: Record<string, unknown>): void {
    if (process.env.IDENTIFY_DEBUG !== '1') return;
    // eslint-disable-next-line no-console
    console.log(`[identify:${event}]`, JSON.stringify(data));
  }

  async identify(dto: IdentifyDto): Promise<IdentifyResultDto> {
    const limit = dto.limit ?? DEFAULT_IDENTIFY_LIMIT;
    const lines = (dto.lines ?? []).slice(0, MAX_LINES);
    const preEvolution = evolutionNames(lines.join(' \n '));
    const candidates = this.buildCandidates(lines, dto.name, preEvolution);

    if (candidates.length === 0) {
      this.debug('sin candidatos', { lines, name: dto.name, number: dto.number });
      return {
        candidates: [],
        extracted: { name: null, number: null, setHint: null },
        totalCandidates: 0,
      };
    }

    const signals = {
      ...extractSignals(lines),
      // Para rareza y artista no hace falta vocabulario: se busca el valor que
      // tiene la carta dentro del texto del OCR. Así el bonus funciona con
      // cualquier rareza o firmante que la fuente tenga.
      text: lines.join(' \n ').toLowerCase(),
    };
    // Qué señales están disponibles, para poder distinguir "no coincidió" de
    // "no se pudo leer". Es lo que hace `signals` en la respuesta.
    const votan = {
      numberHint: firstInteger(dto.number) !== null,
      setName: Boolean(dto.setHint?.trim()),
      setCode: Boolean(dto.setCode?.trim()),
      printed: signals.printed !== null,
      hp: signals.hp !== null,
      // Rareza y artista siempre "votan": son búsquedas de substring sobre el
      // texto. Sin texto no hay nada que leer, y ahí no.startswith tampoco.
      text: signals.text.trim().length > 0,
    };

    const rows = await this.match(candidates, this.buildTokens(lines, preEvolution), dto, signals);
    const prices = new Map<string, CardPriceDto[]>();
    const picked = this.rank(rows, limit);
    this.debug('respondiendo', {
      lines,
      name: dto.name,
      number: dto.number,
      patrones: candidates.length,
      filas: rows.length,
      top: picked.slice(0, 5).map((r) => `${r.name}=${r.score.toFixed(2)}`),
    });
    if (picked.length > 0) {
      for (const [cardId, list] of await this.pricesFor(picked.map((r) => r.id))) {
        prices.set(cardId, list);
      }
    }

    const result: IdentifiedCandidateDto[] = picked.map((row) => {
      const cardPrices = prices.get(row.id) ?? [];
      return {
        card: toCardDto(row),
        score: round2(Math.min(1, Math.max(0, row.score))),
        rawScore: round2(row.score),
        signals: toSignalsDto(row, votan),
        matchedText: row.matchedText,
        prices: cardPrices,
        price: bestPrice(cardPrices),
      };
    });

    const top = result[0];
    return {
      candidates: result,
      extracted: {
        name: top?.card.name ?? null,
        number: dto.number?.trim() || null,
        setHint: top?.card.set?.name ?? null,
      },
      totalCandidates: rows.filter((row) => row.score >= MIN_SCORE).length,
    };
  }

  // ─── (a) generación de candidatos ───────────────────────────────────────

  private buildCandidates(
    lines: string[],
    name: string | undefined,
    preEvolution: Set<string>,
  ): Candidate[] {
    const picked: string[] = [];
    const seen = new Set<string>();
    const add = (raw: string | undefined): void => {
      if (!raw) return;
      const text = raw.replace(/\s+/g, ' ').trim();
      if (!isUsable(text)) return;
      const key = text.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      picked.push(text);
    };

    // El guess del cliente tiene máxima prioridad: si la lista se trunca, ése
    // ya está dentro.
    if (name) {
      add(name);
      add(stripNoise(name));
    }

    const cleaned = lines.map((line) => stripNoise(line));
    const cleanedLower = cleaned.map((line) => line.toLowerCase());
    for (const line of lines) add(line);
    for (const line of cleaned) add(line);
    // Ventanas deslizantes: de 1 a 3 palabras. "115% 4 Charizard &" produce
    // "115", "4", "Charizard", "115 4", "4 Charizard", "115% 4 Charizard".
    //
    // El orden importa: se recorren las ventanas POR LÍNEA y no tamaño primero.
    // Con ~26 líneas de OCR ruidoso, las ventanas de 1 palabra de todas las
    // líneas consumían solas el cupo de MAX_CANDIDATES y las de 2-3 palabras
    // nunca entraban — justamente las que permiten identificar nombres de
    // varias palabras ("polan Marowak" → "Alolan Marowak").
    for (const line of cleaned) {
      const words = line.split(' ').filter(Boolean);
      for (const size of WINDOW_SIZES) {
        for (let i = 0; i + size <= words.length; i += 1) {
          add(words.slice(i, i + size).join(' '));
        }
      }
    }

    return picked.slice(0, MAX_CANDIDATES).map((text) => ({
      text,
      pattern: escapeLike(text),
      weight: candidateWeight(text, cleanedLower, preEvolution),      wordCount: text.split(' ').filter(Boolean).length,
    }));
  }

  /**
   * Tokens crudos del OCR: si el nombre de la carta aparece literal, es un
   * match fuerte.
   *
   * Se excluyen los nombres de pre-evolución ("Evolves from Cubone"): aunque
   * "cubone" esté literalmente en el texto, la carta NO es un Cubone. Sin esta
   * exclusión el piso de match exacto le daba 1.0 y ganaba el ranking.
   */
  private buildTokens(lines: string[], preEvolution: Set<string>): string[] {
    const tokens = new Set<string>();
    for (const line of lines.slice(0, MAX_LINES)) {
      for (const token of stripNoise(line).toLowerCase().split(WORDS)) {
        if (token && !preEvolution.has(token)) tokens.add(token);
      }
    }
    return [...tokens].slice(0, MAX_TOKENS);
  }

  // ─── (b) matching contra el catálogo ────────────────────────────────────

  private async match(
    candidates: Candidate[],
    tokens: string[],
    dto: IdentifyDto,
    signals: CardSignals & { text: string },
  ): Promise<MatchRow[]> {
    const raw = candidates.map((c) => c.text);
    const patterns = candidates.map((c) => c.pattern);
    const weights = candidates.map((c) => String(c.weight));
    const wordCounts = candidates.map((c) => String(c.wordCount));
    const number = firstInteger(dto.number);
    const setHint = dto.setHint?.trim() || undefined;
    const setCode = dto.setCode?.trim().toUpperCase() || undefined;

    // `base` = trigram + bonus de prefijo + bonus de coincidencia de palabras,
    // con piso de 1.0 cuando el OCR leyó el nombre como una palabra exacta. El
    // factor por candidato (boilerplate / cantidad de repeticiones) multiplica todo.
    //
    // El piso de match exacto está penalizado por cobertura: si el OCR leyó una
    // ventana de 2+ palabras pero el nombre de la carta solo tiene 1, ese match
    // no merece el piso completo, porque explica menos de lo que el OCR leyó.
    // Con eso "polan Marowak" (2 palabras) prefiere "Alolan Marowak" (2) por
    // sobre "Marowak" (1), que igual recibe crédito parcial.
    const cardWordCount = Prisma.sql`cardinality(regexp_split_to_array(trim(c.name), '\s+'))`;

    const base = Prisma.sql`
      (
        GREATEST(
          (CASE WHEN char_length(trim(c.name)) <= ${SHORT_NAME_FLOOR_LENGTH}
            THEN ${SHORT_NAME_FLOOR}::float8 ELSE 1.0::float8 END)
          * CASE WHEN lower(c.name) = ANY(${tokens}::text[])
            THEN GREATEST(
              0.0::float8,
              1.0::float8 - ${COVERAGE_PENALTY}::float8 * GREATEST(
                -- (a) El candidato actual tiene más palabras con forma de
                --     nombre que la carta. Se ignoran las de ruido: "4
                --     Charizard" no penaliza a Charizard, pero
                --     "27ec1) plolan Marowak »100®" sí penaliza a "Marowak".
                (
                  SELECT count(*)::int
                  FROM regexp_split_to_table(cand.raw, ' ') AS w(word)
                  WHERE w.word ~ ${NAME_LIKE_WORD}
                ) - ${cardWordCount},
                -- (b) Existe otra ventana enteramente alfabética que contiene
                --     este nombre como palabra completa. Entonces este nombre
                --     es probablemente la cola de uno más largo que el OCR no
                --     leyó bien ("polan Marowak" contiene "Marowak"), y
                --     matchear solo la cola no explica todo el texto.
                CASE WHEN EXISTS (
                  SELECT 1 FROM cand c2
                  WHERE c2.word_count > ${cardWordCount}
                    AND lower(c2.raw) ~ ${NAME_LIKE_PHRASE}
                    AND position(' ' || lower(c.name) || ' ' IN ' ' || lower(c2.raw) || ' ') > 0
                )
                THEN 1 ELSE 0 END
              )
            )
            ELSE 0.0::float8
          END,
          LEAST(
            1.0::float8,
            similarity(c.name, cand.raw)
            + CASE
                WHEN starts_with(lower(c.name), lower(cand.raw))
                  OR starts_with(lower(cand.raw), lower(c.name))
                THEN ${PREFIX_BONUS}::float8
                ELSE 0::float8
              END
          )
        ) * cand.weight
        * CASE
            WHEN char_length(trim(c.name)) < 3
            THEN ${SHORT_NAME_FACTOR}::float8
            ELSE 1.0::float8
          END
        + CASE
            WHEN cand.word_count > 1
              AND cand.word_count = ${cardWordCount}
            THEN ${WORD_COUNT_BONUS}::float8
            ELSE 0::float8
          END
      )`;

    const parts = this.bonusParts({ number, setHint, setCode }, signals);
    const total = Prisma.sql`(
      ${parts.numberHint} + ${parts.setName} + ${parts.setCode}
      + ${parts.printedNumber} + ${parts.hp} + ${parts.rarity} + ${parts.artist}
    )::float8`;

    return this.prisma.$transaction(async (tx) => {
      // `set_config(..., true)` es local a la transacción: el mismo connection
      // tiene que hacer el match por trigram y leer los precios.
      await tx.$executeRaw(
        Prisma.sql`SELECT set_config('pg_trgm.similarity_threshold', ${TRIGRAM_THRESHOLD}, true)`,
      );

      // `hits` son las parejas (carta, candidato) que matchean. Las dos ramas
      // (ILIKE y trigram) van por separado a propósito: unidas con un OR el
      // planner deja de usar el índice GIN y hace un seq scan de 20k cartas por
      // cada candidato (~1s). Proyectando solo (id, candidato, score) el
      // planner elige Bitmap Index Scan (~70ms).
      return tx.$queryRaw<MatchRow[]>(Prisma.sql`
        WITH         cand AS (
          SELECT
            t.raw,
            t.pat,
            t.weight::float8 AS weight,
            t.word_count::int AS word_count
          FROM unnest(
            ${raw}::text[],
            ${patterns}::text[],
            ${weights}::text[],
            ${wordCounts}::text[]
          ) AS t(raw, pat, weight, word_count)
        ),
        hits AS (
          SELECT c.id, ${base} AS base, cand.raw AS raw
          FROM cand
          JOIN cards c ON c.name ILIKE '%' || cand.pat || '%' ESCAPE '\\'
          UNION ALL
          SELECT c.id, ${base} AS base, cand.raw AS raw
          FROM cand
          JOIN cards c ON c.name % cand.raw
        ),
        best AS (
          SELECT
            id,
            MAX(base)::float8 AS base,
            (array_agg(raw ORDER BY base DESC, length(raw) ASC))[1] AS raw
          FROM hits
          GROUP BY id
        )
        SELECT
          c.id,
          c.name,
          c.supertype,
          c.subtypes,
          c.hp,
          c.types,
          c.number,
          c.rarity,
          c.artist,
          c."setId" AS "setId",
          c."imageSmall" AS "imageSmall",
          c."imageLarge" AS "imageLarge",
          s.id AS "setIdSet",
          s.name AS "setName",
          s.series AS "setSeries",
          s."printedTotal" AS "setPrintedTotal",
          s.total AS "setTotal",
          s."releaseDate" AS "setReleaseDate",
          s."logoUrl" AS "setLogoUrl",
          s."symbolUrl" AS "setSymbolUrl",
          (b.base + ${total})::float8 AS score,
          ${parts.numberHint}::float8 AS "sigNumberHint",
          ${parts.setName}::float8 AS "sigSetName",
          ${parts.setCode}::float8 AS "sigSetCode",
          ${parts.printedNumber}::float8 AS "sigPrinted",
          ${parts.hp}::float8 AS "sigHp",
          ${parts.artist}::float8 AS "sigArtist",
          ${parts.rarity}::float8 AS "sigRarity",
          b.raw AS "matchedText",
           EXISTS (
             SELECT 1 FROM card_prices cp
             WHERE cp."cardId" = c.id
               AND cp.provider = ${this.priceProvider.id}
               AND cp.source = ${this.priceProvider.defaultSource}
               AND cp.currency = ${this.priceProvider.defaultCurrency}
               AND cp.market IS NOT NULL
           ) AS "hasPrice"
        FROM best b
        JOIN cards c ON c.id = b.id
        LEFT JOIN card_sets s ON s.id = c."setId"
        ORDER BY score DESC, "hasPrice" DESC, "setReleaseDate" DESC NULLS LAST, c.id ASC
        LIMIT ${MAX_MATCH_ROWS}
      `);
    });
  }

  /**
   * Los siete bonuses, sueltos.
   *
   * Se devuelven por separado y no ya sumados porque se usan dos veces: una para
   * sumar al `base` del score, y otra para proyectar cada uno en la respuesta,
   * que es lo que arma `signals` (si la señal votó a favor, en contra, o no
   * votó porque no se pudo leer).
   *
   * Todos son chicos y ninguno resta: una señal que el OCR no leyó no aparece en
   * el texto y no suma nada. Se calculan una sola vez por carta, en el SELECT
   * final y no en el CTE de hits.
   */
  private bonusParts(
    hints: { number: number | null; setHint: string | undefined; setCode: string | undefined },
    signals: CardSignals & { text: string },
  ): Record<keyof CandidateSignalsDto, Prisma.Sql> {
    const { number, setHint, setCode } = hints;
    const { hp, printed, text } = signals;

    const numberHint =
      number === null
        ? Prisma.sql`0::float8`
        : Prisma.sql`
            CASE
              WHEN NULLIF(regexp_replace(c.number, '\\D', '', 'g'), '') ~ '^[0-9]{1,9}$'
                AND NULLIF(regexp_replace(c.number, '\\D', '', 'g'), '')::bigint = ${number}::bigint
              THEN ${NUMBER_BONUS}::float8
              ELSE 0::float8
            END`;

    const setName =
      setHint === undefined
        ? Prisma.sql`0::float8`
        : Prisma.sql`
            CASE
              WHEN s.name IS NULL THEN 0::float8
              ELSE GREATEST(
                CASE WHEN s.name ILIKE ${escapeLike(setHint)} || '%' ESCAPE '\\' THEN ${SET_BONUS}::float8 ELSE 0 END,
                CASE WHEN s.name ILIKE '%' || ${escapeLike(setHint)} || '%' ESCAPE '\\' THEN ${SET_BONUS}::float8 ELSE 0 END,
                CASE WHEN similarity(s.name, ${setHint}) >= ${SET_SIMILARITY_MIN}::float8
                  THEN ${SET_BONUS}::float8 ELSE 0 END
              )
            END`;

    // El código va por `ptcgoCode` y no por el nombre: es exacto contra un
    // vocabulario cerrado, así que no necesita la tolerancia de trigram. En
    // mayúsculas porque el cliente lo manda tal cual lo leyó.
    const setCodeSql =
      setCode === undefined
        ? Prisma.sql`0::float8`
        : Prisma.sql`
            CASE
              WHEN upper(s."ptcgoCode") = ${setCode} THEN ${SET_CODE_BONUS}::float8
              ELSE 0::float8
            END`;

    // El denominador se acepta contra los DOS totales que expone la fuente, no
    // solo contra `printedTotal`. Difieren en 106 de 176 sets (me55: 128 vs 161)
    // y la carta imprime el que corresponde a su producto, así que con igualdad
    // exacta el bonus se perdía para más de la mitad del catálogo.
    //
    // Ojo: hay sets donde NO ninguno de los dos es lo impreso. me55 imprime
    // "092/120" y la fuente no tiene 120 en ningún campo (ni `printedTotal`=128,
    // ni `total`=161, ni las 158 cartas espejadas). Para esos, la señal del set
    // es el código, no el denominador.
    const printedNumber =
      printed === null
        ? Prisma.sql`0::float8`
        : Prisma.sql`
            CASE
              WHEN NULLIF(regexp_replace(c.number, '\\D', '', 'g'), '') ~ '^[0-9]{1,9}$'
                AND NULLIF(regexp_replace(c.number, '\\D', '', 'g'), '')::bigint = ${printed.n}::bigint
                AND (s."printedTotal" = ${printed.m} OR s."total" = ${printed.m})
              THEN ${PRINTED_NUMBER_BONUS}::float8
              ELSE 0::float8
            END`;

    const hpSql =
      hp === null
        ? Prisma.sql`0::float8`
        : Prisma.sql`
            CASE
              WHEN NULLIF(regexp_replace(c.hp, '\\D', '', 'g'), '') ~ '^[0-9]{1,9}$'
                AND NULLIF(regexp_replace(c.hp, '\\D', '', 'g'), '')::bigint = ${hp}::bigint
              THEN ${HP_BONUS}::float8
              ELSE 0::float8
            END`;

    // `c.rarity` / `c.artist` se buscan dentro del texto del OCR ya en minúsculas.
    // Se exige que el valor tenga letras y un largo razonable para no dar bonus
    // por una rareza de una palabra que matchee ruido ("Common").
    const rarity = Prisma.sql`
      CASE
        WHEN c.rarity IS NULL OR char_length(c.rarity) < 4 THEN 0::float8
        WHEN position(lower(c.rarity) in ${text}) > 0 THEN ${RARITY_BONUS}::float8
        ELSE 0::float8
      END`;

    const artist = Prisma.sql`
      CASE
        WHEN c.artist IS NULL OR char_length(c.artist) < 4 THEN 0::float8
        WHEN position(lower(c.artist) in ${text}) > 0 THEN ${ARTIST_BONUS}::float8
        ELSE 0::float8
      END`;

    return {
      numberHint,
      setName,
      setCode: setCodeSql,
      printedNumber,
      hp: hpSql,
      rarity,
      artist,
    };
  }

  // ─── (e) ranking ────────────────────────────────────────────────────────

  private rank(rows: MatchRow[], limit: number): MatchRow[] {
    const perName = new Map<string, number>();
    const picked: MatchRow[] = [];

    for (const row of rows) {
      if (row.score < MIN_SCORE) continue;
      const key = row.name.trim().toLowerCase();
      const used = perName.get(key) ?? 0;
      if (used >= MAX_CARDS_PER_NAME) continue;
      perName.set(key, used + 1);
      picked.push(row);
      if (picked.length >= limit) break;
    }

    return picked;
  }

  // ─── (f) precios: solo `card_prices`, nunca la API externa ──────────────

  private async pricesFor(cardIds: string[]): Promise<Map<string, CardPriceDto[]>> {
    const result = new Map<string, CardPriceDto[]>();
    if (cardIds.length === 0) return result;

    const rows = await this.prisma.$queryRaw<PriceRow[]>(Prisma.sql`
      SELECT DISTINCT ON ("cardId", variant)
        "cardId" AS "cardId",
        variant AS variant,
        low AS low,
        mid AS mid,
        high AS high,
        market AS market,
        provider AS provider,
        currency AS currency,
        source AS source,
        "fetchedAt" AS "fetchedAt"
      FROM card_prices
      WHERE "cardId" = ANY(${cardIds}::text[])
        AND provider = ${this.priceProvider.id}
        AND source = ${this.priceProvider.defaultSource}
        AND currency = ${this.priceProvider.defaultCurrency}
      ORDER BY "cardId", variant, "fetchedAt" DESC
    `);

    for (const row of rows) {
      const list = result.get(row.cardId) ?? [];
      list.push({
        cardId: row.cardId,
        variant: row.variant,
        low: toNumber(row.low),
        mid: toNumber(row.mid),
        high: toNumber(row.high),
        market: toNumber(row.market),
        provider: row.provider,
        currency: row.currency,
        source: row.source,
        fetchedAt: toIso(row.fetchedAt) ?? new Date(0).toISOString(),
      });
      result.set(row.cardId, list);
    }

    return result;
  }
}

/** Señal que el bonus proyecta, con si estaba disponible para votar. */
interface SignalPresence {
  numberHint: boolean;
  setName: boolean;
  setCode: boolean;
  printed: boolean;
  hp: boolean;
  text: boolean;
}

function toSignalsDto(row: MatchRow, votan: SignalPresence): CandidateSignalsDto {
  const voted = (bonus: number, available: boolean): boolean | null =>
    available ? bonus > 0 : null;
  return {
    numberHint: voted(row.sigNumberHint, votan.numberHint),
    setName: voted(row.sigSetName, votan.setName),
    setCode: voted(row.sigSetCode, votan.setCode),
    printedNumber: voted(row.sigPrinted, votan.printed),
    hp: voted(row.sigHp, votan.hp),
    // Rareza y artista comparten disponibilidad: ambas se leen del mismo texto.
    artist: voted(row.sigArtist, votan.text),
    rarity: voted(row.sigRarity, votan.text),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Variante "principal": la de mayor precio de mercado, si la hay. */
function bestPrice(prices: CardPriceDto[]): CardPriceDto | null {
  let best: CardPriceDto | null = null;
  for (const price of prices) {
    if (price.market === null) continue;
    if (best === null || (best.market ?? -Infinity) < price.market) best = price;
  }
  return best ?? prices[0] ?? null;
}

function toCardDto(row: MatchRow): CardDto {
  const card: CardDto = {
    id: row.id,
    name: row.name,
    supertype: row.supertype,
    subtypes: row.subtypes ?? [],
    hp: row.hp,
    types: row.types ?? [],
    number: row.number,
    rarity: row.rarity,
    artist: row.artist,
    setId: row.setId,
    imageSmall: row.imageSmall,
    imageLarge: row.imageLarge,
  };

  if (row.setIdSet !== null && row.setName !== null) {
    const set: SetDto = {
      id: row.setIdSet,
      name: row.setName,
      series: row.setSeries,
      printedTotal: row.setPrintedTotal,
      total: row.setTotal,
      releaseDate: toIso(row.setReleaseDate),
      logoUrl: row.setLogoUrl,
      symbolUrl: row.setSymbolUrl,
    };
    card.set = set;
  }

  return card;
}
