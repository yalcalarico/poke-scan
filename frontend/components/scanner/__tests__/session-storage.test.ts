// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import {
  MAX_SESSION_ENTRIES,
  appendSessionEntry,
  clearSession,
  normalizeSession,
  readSession,
  writeSession,
} from '../session-storage';
import type { IdentifiedCandidateDto } from '@/types/api';

function candidate(n: number): IdentifiedCandidateDto {
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
    signals: {
      numberHint: null,
      setName: null,
      setCode: null,
      printedNumber: null,
      hp: null,
      artist: null,
      rarity: null,
    },
    price: null,
  };
}

function seed(count: number): { runId: number; candidate: IdentifiedCandidateDto }[] {
  return Array.from({ length: count }, (_, i) => ({ runId: i + 1, candidate: candidate(i + 1) }));
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('normalizeSession', () => {
  it('deja igual una sesión que ya está en el tope', () => {
    const entries = seed(MAX_SESSION_ENTRIES);
    expect(normalizeSession(entries)).toHaveLength(MAX_SESSION_ENTRIES);
  });

  it('conserva las más nuevas cuando se pasa del tope', () => {
    const normalized = normalizeSession(seed(MAX_SESSION_ENTRIES + 10));

    expect(normalized).toHaveLength(MAX_SESSION_ENTRIES);
    // Lo último es lo que el usuario está por procesar.
    expect(normalized[normalized.length - 1].runId).toBe(MAX_SESSION_ENTRIES + 10);
  });

  it('no muta el array que recibe', () => {
    const entries = seed(MAX_SESSION_ENTRIES + 5);
    const before = entries.length;

    normalizeSession(entries);

    expect(entries).toHaveLength(before);
  });
});

describe('appendSessionEntry', () => {
  /*
   * Este es el bug que estos tests cubren: el recorte al tope vivía solo en
   * `writeSession`, así que el estado de React de `/escanear` seguía creciendo
   * durante la sesión. La UI anunciaba "Guardamos hasta 30 cartas" mientras la
   * grilla mostraba 47, y al recargar desaparecían las 17 primeras sin aviso.
   */
  it('el estado en memoria respeta el mismo tope que lo que se persiste', () => {
    let session: { runId: number; candidate: IdentifiedCandidateDto }[] = [];
    for (let i = 0; i < MAX_SESSION_ENTRIES + 12; i += 1) {
      session = appendSessionEntry(session, { runId: i + 1, candidate: candidate(i + 1) });
    }

    expect(session).toHaveLength(MAX_SESSION_ENTRIES);
  });

  it('el estado en memoria y lo persistido no pueden divergir', () => {
    const overflow = MAX_SESSION_ENTRIES + 12;
    let memory: { runId: number; candidate: IdentifiedCandidateDto }[] = [];
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

  it('recorta una sesión guardada con más entradas que el tope', () => {
    // Escrita por una versión anterior del tope, o editada desde el devtools.
    window.sessionStorage.setItem('pcs.scanSession', JSON.stringify(seed(MAX_SESSION_ENTRIES + 5)));

    expect(readSession()).toHaveLength(MAX_SESSION_ENTRIES);
  });
});

describe('writeSession', () => {
  it('borra la clave cuando la sesión queda vacía', () => {
    // La home usa "hay sesión" para decidir si muestra "Continuás donde
    // quedaste", y un `[]` guardado se leería distinto de una clave ausente.
    writeSession(seed(2));
    expect(window.sessionStorage.getItem('pcs.scanSession')).not.toBeNull();

    clearSession();
    expect(window.sessionStorage.getItem('pcs.scanSession')).toBeNull();
  });

  it('recorta al tope lo que se guarda', () => {
    writeSession(seed(MAX_SESSION_ENTRIES + 9));
    expect(readSession()).toHaveLength(MAX_SESSION_ENTRIES);
  });
});
