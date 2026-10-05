// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CardGrid } from '../card-grid';
import type { CardDto } from '@/types/api';

function card(id: string, name: string): CardDto {
  return {
    id,
    name,
    supertype: 'pokemon',
    subtypes: [],
    hp: '60',
    types: ['grass'],
    number: '1/102',
    rarity: 'Common',
    artist: 'Ken Sugimori',
    setId: 'base1',
    imageSmall: `https://example.test/${id}.png`,
    imageLarge: `https://example.test/${id}.lg.png`,
  };
}

const CARDS = [card('base1-4', 'Charizard'), card('base1-6', 'Alakazam')];

describe('CardGrid: la variante div', () => {
  it('conserva el destino con contexto al abrir una carta', () => {
    const href = '/carta/base1-4?returnTo=%2Fbuscar%3Fq%3Dcharizard';
    render(<CardGrid entries={[{ card: CARDS[0], href }]} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', href);
  });
  /*
   * Este es el bug que ya salió una vez.
   *
   * Un `div` es un elemento genérico y la spec **ignora** el `aria-label` salvo
   * que el elemento tenga un rol. Con un `div` a secas, "Resultados de la
   * búsqueda" y "Cartas de la colección" no se anunciaban: el atributo estaba en
   * el HTML, no había ningún error, y no se notó en 3 de 4 call sites porque en
   * el cuarto la grilla tenía un título visible cerca.
   *
   * El arreglo es `role="list"` en el contenedor y `role="listitem"` en cada
   * celda. Estos dos tests son la razón por la que no se puede volver a sacar.
   */
  it('el contenedor div tiene role=list para que el aria-label aterrice', () => {
    render(<CardGrid cards={CARDS} label="Resultados de la búsqueda" />);

    const list = screen.getByRole('list', { name: 'Resultados de la búsqueda' });
    expect(list.tagName).toBe('DIV');
    // La versión que importa: el nombre accesible **computed**, no el atributo.
    expect(list).toHaveAccessibleName('Resultados de la búsqueda');
  });

  it('cada celda es un listitem', () => {
    render(<CardGrid cards={CARDS} label="Resultados de la búsqueda" />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(CARDS.length);
    for (const item of items) expect(item.tagName).toBe('DIV');
  });

  it('sin label la grilla sigue siendo una lista navegable', () => {
    // El `role="list"` no depende del `label`: también habilita la tecla de
    // listas del lector, que en 24 cartas es recorrer la pantalla o saltar de a
    // un ítem.
    render(<CardGrid cards={CARDS} />);

    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(CARDS.length);
  });

  it('data-card-index llega a la celda', () => {
    // `/buscar` lo usa para bajarse a la primera carta nueva cuando carga una
    // página más (§8.13). No es decorativo.
    const { container } = render(<CardGrid cards={CARDS} label="Resultados" />);

    const cells = container.querySelectorAll('[data-card-index]');
    expect([...cells].map((cell) => cell.getAttribute('data-card-index'))).toEqual(['0', '1']);
  });
});

describe('CardGrid: la variante ul', () => {
  it('no agrega roles redundantes sobre el ul nativo', () => {
    // El `aria-label` sobre un `<ul>` **sí** se anuncia: el elemento ya es una
    // lista. Y un `role="list"` explícito sobre un `<ul>` puede llegar a
    // **deshabilitar** las listas navegables nativas del lector (VoiceOver lo
    // respeta en el modo completo y anuncia la lista como un grupo plano).
    // O sea: "arreglar" la variante `ul` rompiendo justo lo que funcionaba.
    const { container } = render(
      <CardGrid as="ul" cards={CARDS} label="Colección compartida" />,
    );

    const list = container.querySelector('ul');
    expect(list).not.toBeNull();
    expect(list).not.toHaveAttribute('role');

    for (const item of container.querySelectorAll('li')) {
      expect(item).not.toHaveAttribute('role');
    }
  });

  it('el label sigue anunciándose en la variante ul', () => {
    render(<CardGrid as="ul" cards={CARDS} label="Colección compartida" />);
    expect(screen.getByRole('list', { name: 'Colección compartida' })).toBeInTheDocument();
  });

  it('la variante ul expone los mismos items que la div', () => {
    const { container } = render(<CardGrid as="ul" cards={CARDS} />);
    expect(container.querySelectorAll('li')).toHaveLength(CARDS.length);
    expect(screen.getAllByRole('listitem')).toHaveLength(CARDS.length);
  });
});

describe('CardGrid: entradas', () => {
  it('con 0 cartas no renderiza nada', () => {
    const { container } = render(<CardGrid cards={[]} label="Resultados" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('una carta repetida con key distintas son dos celdas', () => {
    // En la colección la misma carta con dos variantes son dos ítems con el
    // mismo `card.id`: con la `key` sola React reutiliza el nodo y el primer
    // hover queda pegado al equivocado.
    const charizard = card('base1-4', 'Charizard');

    const { container } = render(
      <CardGrid
        variant="collection"
        label="Cartas de la colección"
        entries={[
          { card: charizard, key: 'holofoil' },
          { card: charizard, key: 'normal' },
        ]}
      />,
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(container.querySelectorAll('[data-card-index]')).toHaveLength(2);
  });
});
