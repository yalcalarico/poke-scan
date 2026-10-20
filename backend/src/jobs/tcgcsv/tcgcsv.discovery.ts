import { TCGCSV_GROUPS } from './tcgcsv.adapter.js';

export interface TcgcsvGroup { groupId: number; name: string; isSupplemental: boolean }
export interface TcgcsvLocalSet { id: string; name: string; series: string | null; englishOnly: boolean }
export interface TcgcsvSetMapping { setId: string; groupId: number }
export interface TcgcsvDiscoveryReport { mappings: TcgcsvSetMapping[]; missing: { setId: string; reason: string }[]; groups: number }

const seriesByPrefix: Readonly<Record<string, string>> = {
  ME: 'mega evolution', SV: 'scarlet and violet', SWSH: 'sword and shield', HS: 'heartgold and soulsilver',
  SM: 'sun and moon', XY: 'xy', EX: 'ex',
};
const aliases: Readonly<Record<string, string>> = {
  'base set': 'base', 'expedition base set': 'expedition', 'pokémon go': 'pokemon go', 'scarlet and violet 151': '151',
  'scarlet and violet base set': 'scarlet and violet', 'sword and shield base set': 'sword and shield',
  'sm base set': 'sun and moon', 'xy base set': 'xy', 'heartgold soulsilver': 'heartgold and soulsilver',
};
function canonical(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en').replace(/&/g, ' and ').replace(/\s*:\s*/g, ' ').replace(/\s+/g, ' ').trim();
}
function identity(value: string): { title: string; series: string | null } {
  const prefix = /^(ME|SV|SWSH)(?:\d{2})?:\s+|^(SM|XY)\s+-\s+|^(EX)\s+|HS[—–-]\s*/i.exec(value);
  const series = prefix ? seriesByPrefix[(prefix[1] ?? prefix[2] ?? prefix[3] ?? 'HS').toUpperCase()] : null;
  const title = canonical(prefix ? value.slice(prefix[0].length) : value);
  return { title: aliases[title] ?? title, series };
}

/** Se normalizan sólo prefijos conocidos; edición, región y subconjunto nunca se borran. */
export function discoverSetMappings(sets: readonly TcgcsvLocalSet[], groups: readonly TcgcsvGroup[], existing: readonly TcgcsvSetMapping[] = []): TcgcsvDiscoveryReport {
  const mappings: TcgcsvSetMapping[] = [];
  const missing: TcgcsvDiscoveryReport['missing'] = [];
  const pinned = Object.entries(TCGCSV_GROUPS).map(([setId, groupId]) => ({ setId, groupId }));
  const registered = [...pinned, ...existing];
  const forbidden = /\b(japanese|japan|jp|korean|chinese|asia|exclusive|shadowless|1st edition|first edition|unlimited)\b/i;
  const candidateGroups = (set: TcgcsvLocalSet): TcgcsvGroup[] => {
    const local = identity(set.name);
    return groups.filter((group) => {
      if (group.isSupplemental || forbidden.test(group.name) || forbidden.test(set.name)) return false;
      const remote = identity(group.name);
      return remote.title === local.title && (remote.series === null || canonical(set.series ?? '') === remote.series);
    });
  };
  for (const set of sets) {
    const known = registered.filter((mapping) => mapping.setId === set.id);
    const uniqueKnown = [...new Set(known.map((mapping) => mapping.groupId))];
    if (uniqueKnown.length === 1 && !registered.some((mapping) => mapping.groupId === uniqueKnown[0] && mapping.setId !== set.id)) {
      mappings.push({ setId: set.id, groupId: uniqueKnown[0] });
      continue;
    }
    if (uniqueKnown.length > 0) { missing.push({ setId: set.id, reason: 'registro ambiguo' }); continue; }
    if (!set.englishOnly) { missing.push({ setId: set.id, reason: 'idioma sin identidad inglesa exclusiva' }); continue; }
    const candidates = candidateGroups(set);
    if (candidates.length !== 1) {
      missing.push({ setId: set.id, reason: candidates.length ? 'grupo ambiguo' : 'sin grupo exacto compatible' });
      continue;
    }
    const candidate = candidates[0];
    // La identidad debe ser uno a uno en ambos catálogos, no sólo en este recorrido.
    if (registered.some((mapping) => mapping.groupId === candidate.groupId && mapping.setId !== set.id)
      || sets.filter((other) => other.englishOnly && candidateGroups(other).some((group) => group.groupId === candidate.groupId)).length !== 1) {
      missing.push({ setId: set.id, reason: 'identidad local ambigua o grupo reservado' });
      continue;
    }
    mappings.push({ setId: set.id, groupId: candidate.groupId });
  }
  return { mappings, missing, groups: groups.length };
}

export function parseGroups(value: unknown): TcgcsvGroup[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Catálogo de grupos inválido');
  const envelope = value as Record<string, unknown>;
  if (envelope.success !== true || !Array.isArray(envelope.errors) || envelope.errors.length !== 0 || !Array.isArray(envelope.results)
    || envelope.results.length === 0 || envelope.results.length > 2000 || (envelope.totalItems !== undefined && envelope.totalItems !== envelope.results.length)) throw new Error('Catálogo de grupos incompleto');
  const ids = new Set<number>();
  return envelope.results.map((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) throw new Error('Grupo inválido');
    const row = entry as Record<string, unknown>;
    if (typeof row.groupId !== 'number' || !Number.isSafeInteger(row.groupId) || row.groupId <= 0 || row.groupId > 999999999
      || ids.has(row.groupId) || row.categoryId !== 3 || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 300
      || typeof row.isSupplemental !== 'boolean') throw new Error('Identidad de grupo inválida');
    ids.add(row.groupId);
    return { groupId: row.groupId, name: row.name, isSupplemental: row.isSupplemental };
  });
}

export function buildIsNew(build: Date, published: Date | null): boolean {
  return published === null || build.getTime() > published.getTime();
}
