import { describe, expect, it } from 'vitest';

import {
  filterOptions,
  firstEnabledIndex,
  findEnabledIndex,
  lastEnabledIndex,
  matchTypeaheadIndex,
  noOptionsMessage,
  noResultsMessage,
  normalizeText,
  resolveInitialActiveIndex,
} from '../select-utils';

interface Opt {
  value: string;
  label: string;
  disabled?: boolean;
}

describe('normalizeText', () => {
  it('saca tildes', () => {
    expect(normalizeText('Gengar')).toBe('gengar');
    expect(normalizeText('Polo')).toBe('polo');
    expect(normalizeText('HEY YOU!')).toBe('hey you!');
  });

  it('baja a minúsculas y colapsa espacios', () => {
    expect(normalizeText('  Pikachu   EX  ')).toBe('pikachu ex');
  });

  it('no toca lo que no es diacrítico', () => {
    expect(normalizeText('Pikachu ex')).toBe('pikachu ex');
    expect(normalizeText('HGSS-PT 2')).toBe('hgss-pt 2');
  });

  it('aguenta cadena vacía y espacios', () => {
    expect(normalizeText('')).toBe('');
    expect(normalizeText('   ')).toBe('');
  });
});

describe('filterOptions', () => {
  const options: Opt[] = [
    { value: 'pika', label: 'Pikachu' },
    { value: 'gengar', label: 'Gengar ex' },
    { value: 'gengar2', label: 'Gengar' },
    { value: 'char', label: 'Charizard' },
    { value: 'off', label: 'Charizard', disabled: true },
  ];

  it('sin consulta devuelve todo', () => {
    expect(filterOptions(options, '')).toEqual(options);
    expect(filterOptions(options, '   ')).toEqual(options);
  });

  it('matchea ignorando mayúsculas y tildes en las dos direcciones', () => {
    expect(filterOptions(options, 'pika')).toHaveLength(1);
    expect(filterOptions(options, 'PIKA')).toHaveLength(1);
    expect(filterOptions(options, 'gengar').map((o) => o.value)).toEqual(['gengar', 'gengar2']);
    expect(filterOptions(options, 'GeNgAr')).toHaveLength(2);
  });

  it('matchea por fragmento, no por prefijo', () => {
    expect(filterOptions(options, 'izard')).toHaveLength(2);
  });

  it('incluye opciones deshabilitadas (navegar ≠ elegir)', () => {
    expect(filterOptions(options, 'charizard')).toHaveLength(2);
  });

  it('devuelve lista vacía si nada matchea', () => {
    expect(filterOptions(options, 'mewtwo')).toEqual([]);
  });

  it('no muta la entrada', () => {
    const original = [...options];
    filterOptions(options, 'gengar');
    expect(options).toEqual(original);
  });
});

describe('findEnabledIndex', () => {
  const options: Opt[] = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B', disabled: true },
    { value: 'c', label: 'C', disabled: true },
    { value: 'd', label: 'D' },
    { value: 'e', label: 'E' },
  ];

  it('avanza saltando deshabilitadas', () => {
    expect(findEnabledIndex(options, 0, 1)).toBe(3);
  });

  it('da la vuelta por abajo', () => {
    expect(findEnabledIndex(options, 4, 1)).toBe(0);
  });

  it('da la vuelta por arriba', () => {
    expect(findEnabledIndex(options, 0, -1)).toBe(4);
  });

  it('empieza desde -1 y options.length para los extremos', () => {
    expect(firstEnabledIndex(options)).toBe(0);
    expect(lastEnabledIndex(options)).toBe(4);
  });

  it('devuelve -1 con lista vacía o toda deshabilitada', () => {
    expect(findEnabledIndex([], -1, 1)).toBe(-1);
    const allOff: Opt[] = [{ value: 'a', label: 'A', disabled: true }];
    expect(findEnabledIndex(allOff, -1, 1)).toBe(-1);
    expect(lastEnabledIndex(allOff)).toBe(-1);
  });
});

describe('matchTypeaheadIndex', () => {
  const options: Opt[] = [
    { value: 'a', label: 'Alakazam' },
    { value: 'b', label: 'Abomasnow' },
    { value: 'c', label: 'Charizard' },
    { value: 'd', label: 'Alolan Raichu' },
    { value: 'e', label: 'Abomasnow', disabled: true },
  ];

  it('busca desde la activa hacia abajo y da la vuelta', () => {
    // Desde A, la primera que empieza con "a" ABIJO de la actual es B.
    expect(matchTypeaheadIndex(options, 'a', 'a')).toBe(1);
    // Desde B, la siguiente es D (el wrap salta a A).
    expect(matchTypeaheadIndex(options, 'a', 'b')).toBe(3);
  });

  it('normaliza la entrada y las etiquetas', () => {
    expect(matchTypeaheadIndex(options, 'A', null)).toBe(0);
    expect(matchTypeaheadIndex(options, 'c', null)).toBe(2);
  });

  it('ignora las deshabilitadas', () => {
    expect(matchTypeaheadIndex(options, 'ab', null)).toBe(1);
  });

  it('devuelve -1 si no hay coincidencia o el buffer está vacío', () => {
    expect(matchTypeaheadIndex(options, 'z', null)).toBe(-1);
    expect(matchTypeaheadIndex(options, '', null)).toBe(-1);
    expect(matchTypeaheadIndex([], 'a', null)).toBe(-1);
  });
});

describe('resolveInitialActiveIndex', () => {
  const options: Opt[] = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
    { value: 'c', label: 'C', disabled: true },
  ];

  it('arranca en la seleccionada', () => {
    expect(resolveInitialActiveIndex(options, 'b', false)).toBe(1);
    expect(resolveInitialActiveIndex(options, 'b', true)).toBe(1);
  });

  it('cae al primer o último habilitado si no hay selección', () => {
    expect(resolveInitialActiveIndex(options, null, false)).toBe(0);
    expect(resolveInitialActiveIndex(options, null, true)).toBe(1);
  });

  it('cae al extremo si la seleccionada está deshabilitada', () => {
    expect(resolveInitialActiveIndex(options, 'c', false)).toBe(0);
  });

  it('cae al extremo si el valor ya no está en la lista', () => {
    expect(resolveInitialActiveIndex(options, 'zzz', false)).toBe(0);
  });
});

describe('copy de estado vacío (§10.2)', () => {
  it('repite el criterio cuando hay consulta', () => {
    expect(noResultsMessage('gengar ex')).toBe('Sin resultados para «gengar ex».');
  });

  it('no inventa un criterio vacío', () => {
    expect(noResultsMessage('   ')).toBe('Sin resultados.');
  });

  it('el vacío sin consulta explica qué falta', () => {
    expect(noOptionsMessage()).toBe('No hay opciones para elegir.');
  });
});
