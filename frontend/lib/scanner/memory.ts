import type { ParsedScan } from './types';

interface RememberedScan { pattern: string; cardId: string; savedAt: number }
const PREFIX = 'pokemon-scanner-corrections-v1:';
const MAX_AGE = 180 * 24 * 60 * 60 * 1000;

// Se conserva texto normalizado, nunca la foto. Una lectura distinta necesita confirmación nueva.
export function scanPattern(parsed: ParsedScan): string {
  return parsed.lines.join(' ').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9/]+/g, ' ').trim().slice(0, 4000);
}

function read(scope: string): RememberedScan[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PREFIX + scope) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item: unknown): item is RememberedScan => {
      if (typeof item !== 'object' || item === null) return false;
      const entry = item as Partial<RememberedScan>;
      return typeof entry.pattern === 'string' && entry.pattern.length >= 20 && entry.pattern.length <= 4000 &&
        typeof entry.cardId === 'string' && entry.cardId.length <= 100 &&
        typeof entry.savedAt === 'number' && entry.savedAt <= Date.now() && Date.now() - entry.savedAt < MAX_AGE;
    }).slice(-100);
  } catch { return []; }
}

export function findRememberedCard(scope: string, parsed: ParsedScan): string | null {
  const pattern = scanPattern(parsed);
  return read(scope).find((entry) => entry.pattern === pattern)?.cardId ?? null;
}

export function rememberCard(scope: string, parsed: ParsedScan, cardId: string): boolean {
  const pattern = scanPattern(parsed);
  if (pattern.length < 20) return false;
  try {
    const entries = read(scope).filter((entry) => entry.pattern !== pattern);
    localStorage.setItem(PREFIX + scope, JSON.stringify([...entries, { pattern, cardId, savedAt: Date.now() }].slice(-100)));
    return true;
  } catch { return false; }
}

export function clearRememberedCards(scope: string): void {
  try { localStorage.removeItem(PREFIX + scope); } catch { /* Storage puede estar desactivado. */ }
}
