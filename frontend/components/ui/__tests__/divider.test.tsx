// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Divider } from '../divider';

describe('Divider: separador decorativo', () => {
  it('el <hr> plano es aria-hidden', () => {
    // El JSDoc del componente promete este `aria-hidden`. Antes había `<hr>` con
    // texto suelto que los lectores de pantalla leían como un grupo de palabras
    // sin contexto.
    const { container } = render(<Divider />);
    const hr = container.querySelector('hr');

    expect(hr).not.toBeNull();
    expect(hr).toHaveAttribute('aria-hidden', 'true');
  });

  it('el aria-hidden no es ganable desde el call site', () => {
    // Va **después** del spread a propósito: un separador decorativo no tiene
    // nada que anunciar nunca. `DividerProps` es `HTMLAttributes<HTMLDivElement>`,
    // así que `aria-hidden` typecheckea y el test tiene que ejecutarlo: el
    // atributo está permitido por el tipo pero no por el contrato.
    const { container } = render(<Divider aria-hidden={false} data-testid="d" />);

    expect(screen.getByTestId('d').tagName).toBe('HR');
    expect(container.querySelector('hr')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Divider: separador vertical', () => {
  it('es un separator con orientación, no un <hr>', () => {
    render(<Divider orientation="vertical" />);

    const separator = screen.getByRole('separator');
    expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    expect(separator.tagName).not.toBe('HR');
  });

  it('el separator horizontal con label es un separator horizontal', () => {
    render(<Divider label="o seguí con" />);

    const separator = screen.getByRole('separator');
    expect(separator).toHaveAttribute('aria-orientation', 'horizontal');
  });

  /*
   * BUG CONOCIDO — `components/ui/divider.tsx:67-80`.
   *
   * El JSDOC del componente afirma que "el texto del label es su nombre
   * accesible". No lo es: `separator` es un rol **estructural**, y ARIA no le
   * permite tomar el nombre del contenido ("name from: author"), así que el
   * `<span>` con "o seguí con" no se anuncia nunca. El lector dice "separator" a
   * secas, que es exactamente el síntoma que el `aria-hidden` del `<hr>` plano
   * vino a arreglar del otro lado.
   *
   *
   * El arreglo fue una línea: `aria-label={label}` en el `div` de la fila.
   *
   * Este test empieza a assertar el nombre, así que va a marcar el cambio de
   * contrato de acá en adelante: si alguien saca el `aria-label`, se pone rojo.
   */
  it('el separator con label toma el label como nombre accesible', () => {
    render(<Divider label="o seguí con" />);
    expect(screen.getByRole('separator')).toHaveAccessibleName('o seguí con');
  });

  it('el rol del separator no es ganable desde el call site', () => {
    // El JSDoc promete que la fila con texto es un separator. Si el rol fuera
    // ganable, la promesa dependería de que nadie se acuerde.
    const { container } = render(<Divider label="o seguí con" role="presentation" />);

    const separator = container.querySelector('[role]');
    expect(separator).toHaveAttribute('role', 'separator');
  });

  it('el <hr> plano no es un separator announced', () => {
    // `aria-hidden` gana: el separador decorativo no aparece en el árbol de
    // accesibilidad, así que `getByRole` no lo encuentra.
    render(<Divider />);
    expect(screen.queryByRole('separator')).toBeNull();
  });
});
