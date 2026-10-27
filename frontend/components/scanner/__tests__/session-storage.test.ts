// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import {
  appendSessionEntry,
  clearSession,
  normalizeSession,
  readSession,
  writeSession,
} from '../session-storage';
import type { RecognizedCard } from '@/types/api';

function candidate(n: number): RecognizedCard {
  return {
    card: {
      id: `base1-${n}`,
      name: `Carta ${n}`,
      supertype: 'pokemon',
      subtypes: [],
      hp: '60',
      types: ['fire'],
      number: `${n}/102`,
      rarity: 'Common',
      artist: 'Ken Sugimori',
      setId: 'base1',
      imageSmall: `https://example.test/${n}.png`,
      imageLarge: `https://example.test/${n}.lg.png`,
    },
    score: Math.max(0, 0.9 - n / 100),
    rawScore: 100 - n,
    price: null,
  };
}

function seed(count: number): { runId: number; candidate: RecognizedCard }[] {
  return Array.from({ length: count }, (_, i) => ({ runId: i + 1, candidate: candidate(i + 1) }));
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('normalizeSession', () => {
  it('conserva el lote completo', () => {
    const entries = seed(100);
    expect(normalizeSession(entries)).toHaveLength(100);
  });

  it('conserva todas las lecturas anteriores', () => {
    const normalized = normalizeSession(seed(100));

    expect(normalized).toHaveLength(100);
    // Lo último es lo que el usuario está por procesar.
    expect(normalized[normalized.length - 1].runId).toBe(100);
  });

  it('no muta el array que recibe', () => {
    const entries = seed(35);
    const before = entries.length;

    normalizeSession(entries);

    expect(entries).toHaveLength(before);
  });
});

describe('appendSessionEntry', () => {
  it('agrega lecturas más allá de 30 en memoria sin reemplazar anteriores', () => {
    let session: { runId: number; candidate: RecognizedCard }[] = [];
    for (let i = 0; i < 100; i += 1) {
      session = appendSessionEntry(session, { runId: i + 1, candidate: candidate(i + 1) });
    }

    expect(session).toHaveLength(100);
    expect(session[0]?.runId).toBe(1);
    expect(session.at(-1)?.runId).toBe(100);
  });

  it('persiste y restaura 100 lecturas', () => {
    const overflow = 100;
    let memory: { runId: number; candidate: RecognizedCard }[] = [];
    for (let i = 0; i < overflow; i += 1) {
      memory = appendSessionEntry(memory, { runId: i + 1, candidate: candidate(i + 1) });
    }
    writeSession(memory);

    expect(readSession().map((e) => e.runId)).toEqual(memory.map((e) => e.runId));
  });
});

describe('readSession', () => {
  it('devuelve vacío cuando no hay nada guardado', () => {
    expect(readSession()).toEqual([]);
  });

  it('descarta la entrada rota y conserva las buenas', () => {
    // El criterio del módulo: descartar la entrada, no la sesión.
    window.sessionStorage.setItem(
      'pcs.scanSession',
      JSON.stringify([...seed(2), { runId: 'no-numero', candidate: candidate(9) }]),
    );

    const session = readSession();
    expect(session).toHaveLength(2);
    expect(session.map((e) => e.runId)).toEqual([1, 2]);
  });

  it('descarta un candidate sin card.name', () => {
    window.sessionStorage.setItem(
      'pcs.scanSession',
      JSON.stringify([{ runId: 1, candidate: { card: { id: 'x' } } }]),
    );

    expect(readSession()).toEqual([]);
  });

  it('ignora un JSON que no es un array', () => {
    window.sessionStorage.setItem('pcs.scanSession', JSON.stringify({ hola: 'que tal' }));
    expect(readSession()).toEqual([]);
  });

  it('ignora un JSON corrupto sin tirar', () => {
    window.sessionStorage.setItem('pcs.scanSession', '{esto no es json');
    expect(readSession()).toEqual([]);
  });

  it('restaura un borrador largo completo', () => {
    window.sessionStorage.setItem('pcs.scanSession', JSON.stringify(seed(100)));

    expect(readSession()).toHaveLength(100);
  });
});

describe('writeSession', () => {
  it('migra precios legacy y los conserva en el snapshot canónico después de cinco reloads', () => {
    const scan = seed(1)[0]!;
    scan.candidate.prices = [
      { cardId: 'base1-1', variant: 'normal', low: null, mid: null, high: null, market: 10, currency: 'USD', provider: 'tcgcsv', source: 'tcgplayer', fetchedAt: '2026-10-07T12:00:00Z' },
      { cardId: 'base1-1', variant: 'holofoil', low: null, mid: null, high: null, market: 0, currency: 'USD', provider: 'tcgcsv', source: 'tcgplayer', fetchedAt: '2026-10-07T12:00:00Z' },
      { cardId: 'base1-1', variant: 'reverseHolofoil', low: null, mid: null, high: null, market: null, currency: 'USD', provider: 'tcgcsv', source: 'tcgplayer', fetchedAt: '2026-10-07T12:00:00Z' },
    ];
    sessionStorage.setItem('pcs.scanSession', JSON.stringify([scan]));
    for (let round = 0; round < 5; round++) {
      const restored = readSession();
      expect(restored[0]!.candidate.prices?.map((price) => price.market)).toEqual([10, 0, null]);
      expect(writeSession(restored)).toBe(true);
      sessionStorage.removeItem('pcs.scanSession');
      const canonical = JSON.parse(sessionStorage.getItem('pcs.scanDraft') ?? '{}');
      expect(canonical.entries[0].candidate.prices.map((price: { market: number | null }) => price.market)).toEqual([10, 0, null]);
    }
  });

  it('guarda snapshot canónico vacío conservando evidencia de sesión', () => {
    // La home usa "hay sesión" para decidir si muestra "Continuás donde
    // quedaste", y un `[]` guardado se leería distinto de una clave ausente.
    writeSession(seed(2));
    expect(window.sessionStorage.getItem('pcs.scanDraft')).not.toBeNull();

    clearSession();
    expect(readSession()).toEqual([]);
    expect(window.sessionStorage.getItem('pcs.scanDraft')).not.toBeNull();
  });

  it('no trunca lecturas previas al persistir', () => {
    writeSession(seed(100));
    expect(readSession()).toHaveLength(100);
  });
});
