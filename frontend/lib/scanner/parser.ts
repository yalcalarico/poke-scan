import type { OcrLine, ParsedScan } from './types';

/**
 * OCR text of a Pokémon card is mostly noise. The name is readable, the card
 * number is usually not, and both arrive glued to garbage
 * ("115% 4 Charizard &", "| /Abomasnow 7 1208").
 *
 * We do NOT try to match against the catalog here: the client does not have the
 * 20k+ card list, so the backend does the matching. Our job is to hand it clean
 * candidates, and to produce a good-enough `nameGuess` for instant UI feedback.
 */

/** Words that are never part of a card name. */
export const NOISE_TOKENS = new Set<string>([
  // boilerplate
  'pokémon', 'pokemon', 'pokémons', 'pokemons', 'power', 'powers', 'attack', 'attacks',
  'weakness', 'resistance', 'retreat', 'cost', 'costs', 'stage', 'hp', 'evolves', 'from',
  'the', 'and', 'energy', 'energies', 'basic', 'first', 'second', 'one', 'two', 'lv', 'lvs',
  'print', 'edition', 'number', 'no', 'total', 'set', 'series', 'game', 'promo', 'promos',
  'unlimited', 'shadowless', 'base', 'neo', 'classic', 'rainbow', 'secret', 'rare', 'ultra',
  'common', 'uncommon', 'double', 'single', 'stamped', 'star', 'sv', 'sword', 'shield',
  'scarlet', 'violet', 'paldea', 'teal', 'mask', 'ex', 'gx', 'v', 'vmax', 'vstar', 'star',
  'shining', 'ill', 'illus', 'illustrator', 'illustration', 'artist', 'nico', 'cres', 'ken',
  'sugimori', 'kagemaru', 'arita', 'mitsuhiro', 'atsuko', 'nishida', 'hideyuki', 'matsuyama',
  'satoshi', 'yuji', 'kouji', 'koji', 'kazuya', 'kazu', 'naoki', 'takashi', 'yuki', 'aki',
  'mika', 'satoshi', 'mutsumi', 'takayuki', 'yukiko', 'noriko', 'sayo', 'tomoko', 'keiko',
  // types
  'fire', 'water', 'grass', 'lightning', 'psychic', 'fighting', 'darkness', 'metal', 'colorless',
  'colorless', 'draco', 'fairy', 'dragon', 'fighting', 'unknown', 'normal', 'bug', 'ghost',
  'psychic', 'poison', 'ground', 'flying', 'dark', 'steel',
  // stats / gameplay
  'damage', 'dmg', 'counter', 'counters', 'flip', 'coin', 'coins', 'heads', 'tails', 'discard',
  'attach', 'attached', 'attach', 'bench', 'benched', 'hand', 'deck', 'turn', 'opponent',
  'opposing', 'defending', 'knock', 'out', 'asleep', 'confused', 'paralyzed', 'burned',
  'apply', 'effects', 'effect', 'between', 'during', 'before', 'after', 'instead', 'choose',
  'switch', 'prevent', 'resolve', 'resolving', 'condition', 'search', 'shuffle', 'searching',
  'adds', 'add', 'does', 'this', 'that', 'each', 'both', 'all', 'any', 'if', 'may', 'can',
  'cannot', 'cant', 'cant', 'unless', 'while', 'when', 'more', 'than', 'up', 'your', 'yours',
  'theirs', 'opponents', 'its', 'their', 'is', 'are', 'was', 'be', 'been', 'being', 'has',
  'have', 'had', 'worn', 'asleep', 'asleep', 'dazed', 'confused', 'shocked', 'burn',
  // card layout
  'length', 'weight', 'lbs', 'ib', 'kilos', 'in', 'is', 'm', 'cm', 'feet', 'st', 'mr', 'ms',
  'holo', 'reverse', 'holofoil', 'foil', 'first', 'edition', 'stamp', 'promo', 'code',
  // languages
  'no', 'de', 'la', 'el', 'los', 'las', 'un', 'una', 'y', 'o', 'que', 'por', 'para', 'con',
  'en', 'para', 'del', 'una', 'uno', 'sus', 'más', 'mas', 'está', 'esta', 'sus', 'luz',
  'luz', 'fuego', 'agua', 'hierba', 'rayo', 'psiquico', 'lucha', 'oscuridad', 'metal',
  'incoloro', 'dragón', 'hada', 'sombra', 'acero', 'volador', 'veneno', 'tierra', 'bicho',
  // symbols OCR turns into letters
  'oo', 'o0', 'nn', 'rn', 'cl', 'ii', 'iii', 'iii', 'il', 'll', 'ii', 'wi', 'vv', 'yy', 'xx',
]);

const CARD_WORD_BLOCKLIST = new Set<string>([
  'into', 'its', 'over', 'under', 'also', 'back', 'will', 'were', 'from', 'them', 'they',
  'yourself', 'must', 'made', 'give', 'next', 'first', 'same', 'only', 'last', 'just',
  'already', 'player', 'opponent', 'turn', 'each', 'coins', 'flip', 'discard', 'search',
  'shuffle', 'draw', 'bench', 'hand', 'deck', 'attack', 'damage', 'heal', 'both', 'more',
  'less', 'least', 'most', 'very', 'much', 'many', 'some', 'every', 'between', 'during',
  'without', 'unless', 'while', 'before', 'after', 'because', 'also', 'like', 'make',
  'takes', 'take', 'put', 'onto', 'stop', 'start', 'end', 'gain', 'lose', 'win', 'lost',
  'release', 'return', 'recover', 'remove', 'attach', 'attached', 'evolve', 'evolved',
  'prevention', 'resistance', 'weakness', 'retreat', 'immunity', 'healing', 'switching',
]);

/** Known set names worth surfacing as a hint for the backend. */
export const SET_HINTS: string[] = [
  '151', 'Ancient Origins', 'Aquapolis', 'Astral Radiance', 'Base', 'Base Set', 'Black & White',
  'Brilliant Stars', 'Celebrations', 'Celestial Guardians', 'Crown Zenith', 'Destined Rivals',
  'Double Crisis', 'Emerald', 'Evolving Skies', 'Expedition', 'FireRed', 'Fossil', 'Fusion Arena',
  'Gym Heroes', 'HeartGold', 'Hidden Fates', 'Iron Hands', 'Journey', 'Journey Together',
  'Jungle', 'Lost Origin', 'McDonalds', 'Meteor Storm', 'Mighty Falcon', 'Neo', 'Neo Destiny',
  'Neo Genesis', 'Obsidian Flames', 'Paldea', 'Paldea Evolved', 'Paldean Fates',
  'Prismatic', 'Prismatic Evolutions', 'Roaring Moon', 'Ruby & Sapphire', 'Scarlet & Violet',
  'Shadowless', 'Shrouded Fable', 'Silver Tempest', 'Sky Pop', 'Sky Requiem', 'Sword & Shield',
  'Surging Sparks', 'Sword', 'Shield', 'Scarlet', 'Violet', 'Stellar Crown', 'Surprising Fates',
  'Team Rocket', 'Temporal Forces', 'Twilight Masquerade', 'Unlimited', 'Vivid Voltage', 'X & Y',
  'XY', 'Champion',
];

const SET_HINT_PATTERN = (() => {
  // Longest first: the alternation takes the first branch that matches, so
  // "Sword & Shield" has to be tried before "Sword".
  const escaped = [...new Set(SET_HINTS)]
    .sort((a, b) => b.length - a.length)
    .map((hint) => hint.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&'));
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
})();

const MIN_TOKEN_LENGTH = 3;
const MAX_LINES = 60;
const MAX_CANDIDATE_TOKENS = 3;
/** Names below this length (e.g. "Cua", "Sie") are almost always OCR garbage. */
const WEAK_TOKEN_LENGTH = 4;

export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, MAX_LINES);
}

/** Keeps only letters, digits, spaces, apostrophes and hyphens. */
export function cleanLine(line: string): string {
  return line
    // El logo estilizado ex suele salir como €X o &X; sólo se repara junto a un nombre.
    .replace(/([\p{L}]{3,})\s+(?:€[xX]|&[xX])(?=$|[^\p{L}\p{N}])/gu, '$1 ex')
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[^\p{L}\p{N} '\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isNoiseToken(token: string): boolean {
  const lower = token.toLowerCase();
  return NOISE_TOKENS.has(lower) || CARD_WORD_BLOCKLIST.has(lower);
}

function isUsableToken(token: string): boolean {
  if (token.length < MIN_TOKEN_LENGTH) return false;
  if (/^\d+$/.test(token)) return false;
  if (isNoiseToken(token)) return false;
  return /[\p{L}]/u.test(token);
}

const NAME_SUFFIXES = new Set(['ex', 'gx', 'v', 'vmax', 'vstar']);

function isNameSuffix(token: string): boolean {
  return NAME_SUFFIXES.has(token.toLowerCase());
}

function isTitleCase(token: string): boolean {
  return /^\p{Lu}/u.test(token);
}

function isAllLower(token: string): boolean {
  return token === token.toLowerCase() && /[a-z]/i.test(token);
}

export interface NameCandidate {
  value: string;
  score: number;
  lineIndex: number;
}

/**
 * "Put Charizard on the Stage" is card boilerplate that wraps the actual name,
 * so a candidate followed by it is very likely a real Pokémon name.
 */
const STAGE_FOLLOWER = /^(?:on|oh|to|the|ot)\s+(?:the\s+)?[sS][tTaA0-9]*\s*(?:stage|staae|stape)/;

function followedByStageSuffix(tokens: string[], index: number): boolean {
  const tail = tokens.slice(index + 1, index + 5).join(' ');
  return STAGE_FOLLOWER.test(tail);
}

function positionScore(lineIndex: number): number {
  return 1 / (1 + lineIndex * 0.12);
}

function lengthBonus(tokenCount: number, charLength: number): number {
  if (tokenCount === 1) {
    if (charLength < WEAK_TOKEN_LENGTH) return -0.2;
    if (charLength <= 4) return 0.02;
    if (charLength <= 14) return 0.12;
    return -0.05;
  }
  return 0;
}

function windowScore(
  tokens: string[],
  start: number,
  lineIndex: number,
  lineTokenIndex: number,
): number {
  const window = tokens.slice(start, start + MAX_CANDIDATE_TOKENS);
  const value = window.join(' ');
  const charLength = value.replace(/[^A-Za-z]/g, '').length;

  let score = 0;
  score += window.length === 1 ? 0.45 : window.length === 2 ? 0.5 : 0.2;
  score += lengthBonus(window.length, charLength);
  score += positionScore(lineIndex);

  if (window.every(isTitleCase)) score += 0.15;
  else if (window.every(isAllLower)) score -= 0.3;

  if (followedByStageSuffix(tokens, start + window.length - 1)) score += 0.25;

  // Inside a line, earlier tokens are marginally more likely to be the name.
  score -= lineTokenIndex * 0.02;

  return score;
}

/**
 * Generates 1..3 word windows per line and scores them. Purely lexical, no
 * catalog lookup, so it runs in Node and in the browser.
 */
export function collectNameCandidates(
  lines: string[],
  lineConfidence?: number[],
): NameCandidate[] {
  const bestByValue = new Map<string, NameCandidate>();

  // How many lines each token appears in: the real name is echoed by the card
  // text ("...if Charizard is Asleep"), OCR garbage is not.
  const tokenLineCounts = new Map<string, number>();
  for (const line of lines) {
    for (const token of new Set(cleanLine(line).split(' '))) {
      if (!isUsableToken(token)) continue;
      const key = token.toLowerCase();
      tokenLineCounts.set(key, (tokenLineCounts.get(key) ?? 0) + 1);
    }
  }

  lines.forEach((rawLine, lineIndex) => {
    const line = cleanLine(rawLine);
    if (!line) return;
    const tokens = line.split(' ').filter(Boolean);
    if (!tokens.length) return;

    // Every window of 1..3 consecutive usable tokens.
    for (let start = 0; start < tokens.length; start += 1) {
      if (!isUsableToken(tokens[start])) continue;
      for (let size = 1; size <= MAX_CANDIDATE_TOKENS; size += 1) {
        if (start + size > tokens.length) break;
        const window = tokens.slice(start, start + size);
        if (!window.every((token, index) => isUsableToken(token) ||
          (index > 0 && index === window.length - 1 && isNameSuffix(token)))) break;

        const hasSuffix = window.length > 1 && isNameSuffix(window[window.length - 1]);
        // El sufijo identifica el tipo de carta, pero no vuelve más largo ni
        // cambia la capitalización del nombre que estamos puntuando.
        const nameWindow = hasSuffix ? window.slice(0, -1) : window;
        let score = windowScore(nameWindow, 0, lineIndex, start);
        // Ex/GX/V son parte de la identidad, pero solos continúan siendo ruido.
        if (hasSuffix) score += 0.45;
        const repeats = window.every(
          (token) => (tokenLineCounts.get(token.toLowerCase()) ?? 0) > 1,
        )
          ? (tokenLineCounts.get(window[0].toLowerCase()) ?? 1) - 1
          : 0;
        score += Math.min(0.3, repeats * 0.12);

        if (lineConfidence?.[lineIndex] != null) {
          score += (lineConfidence[lineIndex] / 100 - 0.5) * 0.1;
        }

        const value = window.join(' ');
        const existing = bestByValue.get(value);
        if (!existing || score > existing.score) {
          bestByValue.set(value, { value, score, lineIndex });
        }
      }
    }
  });

  const candidates = [...bestByValue.values()];
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.lineIndex !== b.lineIndex) return a.lineIndex - b.lineIndex;
    return a.value.length - b.value.length;
  });

  return candidates;
}

export function extractNameCandidates(text: string): string[] {
  return collectNameCandidates(splitLines(text)).map((candidate) => candidate.value);
}

export interface NumberCandidate {
  value: string;
  score: number;
  kind: 'slash' | 'no' | 'hash' | 'bare';
}

/**
 * Card numbers are almost never readable, so this is deliberately conservative:
 * only explicit "25/203", "NO. 105" and "#65" shapes are returned, ordered by
 * how much we trust them. Bare numbers are opt-in, because on a card they are
 * usually damage, HP or a Pokédex number.
 */
export function collectNumberCandidates(
  text: string,
  opts: { includeBareNumbers?: boolean } = {},
): NumberCandidate[] {
  const found: NumberCandidate[] = [];
  const seen = new Set<string>();
  const push = (value: string, score: number, kind: NumberCandidate['kind']) => {
    const normalized = value.toUpperCase().replace(/^([A-Z]*)0+(?=\d)/, '$1');
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    found.push({ value: normalized, score, kind });
  };

  // "25/203" or "25/203" with full-width slash: number over set total.
  for (const match of text.matchAll(/\b([A-Z]{0,4}\d{1,3})\s*[\/／]\s*([A-Z]{0,4}\d{2,4})\b/gi)) {
    push(match[1], 1, 'slash');
  }

  // "NO.105", "NO 105", "N0.18" (OCR loves 0 for O).
  for (const match of text.matchAll(/\bN[oO0Q][.\s]*(\d{1,3})\b/g)) {
    push(match[1], 0.7, 'no');
  }

  // "#65" usually is the Pokédex number printed next to LV.42, so it ranks last.
  for (const match of text.matchAll(/(?:^|[^\w])#\s*(\d{1,3})\b/g)) {
    push(match[1], 0.4, 'hash');
  }

  if (opts.includeBareNumbers) {
    for (const match of text.matchAll(/(?:^|\s)(\d{1,3})(?=\s|$)/g)) {
      push(match[1], 0.1, 'bare');
    }
  }

  return found.sort((a, b) => b.score - a.score || Number(a.value) - Number(b.value));
}

export function extractNumberCandidates(text: string): string[] {
  return collectNumberCandidates(text).map((candidate) => candidate.value);
}

export function extractSetHints(text: string): string[] {
  const hints: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(SET_HINT_PATTERN)) {
    const hint = match[0].replace(/\s+/g, ' ').trim();
    const key = hint.toLowerCase();
    if (!hint || seen.has(key)) continue;
    seen.add(key);
    hints.push(hint);
  }
  return hints;
}

const MAX_SCORE_FOR_CONFIDENCE = 2.2;

/**
 * Turns raw OCR output into the payload the backend matches against the
 * catalog, plus a best-effort name guess for instant UI feedback.
 */
export function parseOcrText(text: string, lines?: OcrLine[]): ParsedScan {
  const rawLines = lines
    ? lines
        .map((line) => line.text.replace(/\s+/g, ' ').trim())
        .filter((line) => line.length > 0)
        .slice(0, MAX_LINES)
    : splitLines(text);
  const lineSource = lines ?? rawLines.map((line) => ({ text: line, confidence: 0 }));
  const confidences = lineSource
    .slice(0, rawLines.length)
    .map((line) => (Number.isFinite(line.confidence) ? line.confidence : 0));

  const nameCandidates = collectNameCandidates(rawLines, confidences);
  const nameGuess = nameCandidates[0]?.value ?? null;
  const numberCandidates = collectNumberCandidates(rawLines.join('\n'));
  const setHints = extractSetHints(rawLines.join('\n'));

  let confidence = 0;
  if (nameCandidates.length) {
    const withConfidence = confidences.filter((value) => value > 0);
    if (withConfidence.length) {
      // Weighted mean of the confidence of the lines the name came from.
      const top = nameCandidates.slice(0, 2);
      const picked = top
        .map((candidate) => confidences[candidate.lineIndex] ?? 0)
        .filter((value) => value > 0);
      const pool = picked.length ? picked : withConfidence.slice(0, 2);
      confidence = pool.reduce((acc, value) => acc + value, 0) / pool.length / 100;
    } else {
      confidence = Math.min(1, Math.max(0, (nameCandidates[0].score / MAX_SCORE_FOR_CONFIDENCE)));
    }
  }

  return {
    lines: rawLines,
    nameGuess,
    numberGuess: numberCandidates[0]?.value ?? null,
    setHint: setHints[0] ?? null,
    // El backend ya acepta `setCode` y lo bonusifica; queda en null hasta que
    // haya una banda medida para leerlo (fase 8.1). Ver `ParsedScan.setCode`.
    setCode: null,
    confidence: Math.min(1, Math.max(0, confidence)),
  };
}

export const STOPWORDS = NOISE_TOKENS;
