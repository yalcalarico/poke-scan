// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../button';

/**
 * El guard del anillo de foco.
 *
 * El patrón viejo era `focus-visible:ring-2 focus-visible:ring-brand/20`, que
 * medía **1.38:1** contra una superficie clara: muy por debajo de los 3:1 de
 * WCAG 2.2 SC 1.4.11, y como `ring` es un `box-shadow` el UA lo fuerza a `none`
 * en high contrast, justo donde más se lo necesita.
 *
 * No se asserta la cadena de clases nueva exacta (churn de tokens), sino dos
 * cosas que cualquier reestilizado tiene que seguir cumpliendo: que el patrón
 * viejo **no** vuelva, y que el indicador venga del token `--focus-ring`, que es
 * el que `app/__tests__/contrast.test.ts` le mide el contraste en los dos temas.
 */
function expectFocusRingIsTheToken(className: string) {
  expect(className).not.toMatch(/ring-brand/);
  expect(className).not.toMatch(/ring-\d+-\d+/);
  expect(className).toContain('var(--focus-ring)');
}

describe('Button: nombre accesible', () => {
  it('sin loading conserva el nombre', () => {
    render(<Button>Guardar</Button>);
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
  });

  it('con loading y sin pendingLabel no pierde el nombre', () => {
    // El bug: con `loading` y sin `pendingLabel`, los children iban a un
    // `sr-only`. Antes de ese arreglo quedaban solo el `Spinner` (que es
    // `aria-hidden`) y el botón se anunciaba sin nombre (WCAG 2.2 SC 4.1.2).
    render(<Button loading>Guardar</Button>);

    const button = screen.getByRole('button', { name: 'Guardar' });
    expect(button).toBeInTheDocument();
    // Sigue siendo el mismo nombre: el texto no se duplica ni desaparece.
    expect(button).toHaveTextContent('Guardar');
  });

  it('con loading, el nombre no se anuncia dos veces', () => {
    // El texto tiene que estar **una** vez. Si quedara visible y además en el
    // `sr-only`, el lector lo leería dos veces.
    render(<Button loading>Guardar</Button>);

    const button = screen.getByRole('button', { name: 'Guardar' });
    expect(button.querySelectorAll('.sr-only')).toHaveLength(1);
  });

  it('pendingLabel reemplaza el nombre', () => {
    render(
      <Button loading pendingLabel="Guardando…">
        Guardar
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Guardando…' });
    expect(button).toHaveAccessibleName('Guardando…');
    expect(button).not.toHaveAccessibleName('Guardar');
    expect(button).toHaveTextContent('Guardando…');
  });

  it('el nombre con loading sale del children aunque sea un elemento', () => {
    render(
      <Button loading>
        <span>Guardar</span>
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
  });

  it('un aria-label del call site manda sobre el texto', () => {
    // El texto del `sr-only` no debe pisa una prop explícita del call site.
    render(
      <Button loading aria-label="Cerrar sesión">
        Guardar
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });
});

describe('Button: estado y atributos', () => {
  it('aria-busy va solo mientras carga', () => {
    const { rerender } = render(<Button loading>Guardar</Button>);
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveAttribute('aria-busy', 'true');

    rerender(<Button>Guardar</Button>);
    expect(screen.getByRole('button', { name: 'Guardar' })).not.toHaveAttribute('aria-busy');
  });

  it('loading deshabilita el botón', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Guardar
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Guardar' });
    expect(button).toBeDisabled();
    button.click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('el type por default es button, no submit', () => {
    // `type` sin default en un `<button>` dentro de un `<form>` es un submit
    // implícito: el botón "Cancelar" recarga la página.
    render(<Button>Cancelar</Button>);
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveAttribute('type', 'button');
  });

  it('un type explícito gana', () => {
    render(<Button type="submit">Entrar</Button>);
    expect(screen.getByRole('button', { name: 'Entrar' })).toHaveAttribute('type', 'submit');
  });

  it('no filtra isDisabled al DOM', () => {
    // `isDisabled` existe en `ButtonProps` (lo consume `cva` para resolver el
    // color de apagado) pero **no** está en la API pública: se omite con `Omit`.
    // El JSDOC promete que no se filtra al HTML, y si se filtrara sería un
    // atributo inválido que ningún navegador conoce.
    render(
      <Button {...({ isDisabled: true } as unknown as { variant: 'primary' })}>Guardar</Button>,
    );

    const button = screen.getByRole('button', { name: 'Guardar' });
    expect(button).not.toHaveAttribute('isdisabled');
    expect(button).not.toHaveAttribute('isDisabled');
    expect(button.outerHTML.toLowerCase()).not.toContain('isdisabled');
  });
});

describe('Button: indicador de foco', () => {
  it('todas las variantes usan el anillo a color pleno, no el alfa viejo', () => {
    for (const variant of ['primary', 'secondary', 'ghost', 'destructive', 'inverse'] as const) {
      const { unmount } = render(<Button variant={variant}>X</Button>);
      expectFocusRingIsTheToken(screen.getByRole('button', { name: 'X' }).className);
      unmount();
    }
  });

  it('el focus visible no usa un ring con opacidad', () => {
    const { className } = render(<Button>Guardar</Button>).getByRole('button', {
      name: 'Guardar',
    });
    // Cualquier `ring-N/color/NN` es el patrón que daba 1.38:1.
    expect(className).not.toMatch(/ring-\S+\/\d+/);
  });
});
