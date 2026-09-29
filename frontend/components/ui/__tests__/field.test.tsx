// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { Fragment, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, type SelectOption, type SelectProps } from '@/components/ui/select';

const OPTIONS: readonly SelectOption<'a' | 'b' | 'c'>[] = [
  { value: 'a', label: 'Base' },
  { value: 'b', label: 'Neo' },
  { value: 'c', label: 'Skyridge' },
];

/**
 * `Select` es controlado, así que el `Field` necesita un hijo real y no un
 * elemento suelto. Este wrapper existe solo por eso: el estado vive acá y el
 * `Field`/`Select` se arman como en un call site de la app.
 *
 * Reparte `...props` en vez de nombrar cada atributo a mano: el `Field` inyecta
 * con `cloneElement`, y un wrapper que reescribiera `aria-labelledby={undefined}`
 * se estaría comiendo la inyección y el test mediría el wrapper, no el `Field`.
 */
type AriaOverrides = Partial<
  Pick<SelectProps<'a' | 'b' | 'c'>, 'aria-labelledby' | 'aria-describedby'>
>;

function ControlledSelect(props: AriaOverrides) {
  const [value, setValue] = useState<'a' | 'b' | 'c' | null>(null);
  return <Select id="set" options={OPTIONS} value={value} onChange={setValue} {...props} />;
}

describe('Field: el nombre del control', () => {
  it('inyecta aria-labelledby apuntando al <label> cuando hay label', () => {
    // El bug que esto ata: `<label htmlFor>` **no nombra un `<button>`**. El
    // `Select` renderiza un `<button role="combobox">`, así que sin esta
    // inyección el lector de pantalla anunciaba "combobox" a secas.
    render(
      <Field id="set" label="Set">
        <ControlledSelect />
      </Field>,
    );

    const label = screen.getByText('Set');
    const combobox = screen.getByRole('combobox');

    expect(combobox).toHaveAttribute('aria-labelledby', label.id);
    expect(label).toHaveAttribute('for', 'set');
    // La versión que importa: el nombre accesible real, no el atributo.
    expect(combobox).toHaveAccessibleName('Set');
  });

  it('no pisa el aria-labelledby que puso el call site', () => {
    // `organize-sheet.tsx` pasa el suyo (id compuesto de la fila). Una prop
    // explícita es una decisión del call site y el `Field` no puede saber a qué
    // label se refiere.
    render(
      <>
        <span id="mi-label">Variante</span>
        <Field id="set" label="Set">
          <ControlledSelect aria-labelledby="mi-label" />
        </Field>
      </>,
    );

    expect(screen.getByRole('combobox')).toHaveAttribute('aria-labelledby', 'mi-label');
    expect(screen.getByRole('combobox')).toHaveAccessibleName('Variante');
  });

  it('no inyecta aria-labelledby si no hay label (sería una referencia colgando)', () => {
    // Apuntar a un id que no existe en el DOM es peor que no apuntar: el lector
    // queda con una referencia colgando en vez de con un nombre.
    render(
      <Field id="set">
        <ControlledSelect />
      </Field>,
    );

    const combobox = screen.getByRole('combobox');
    expect(combobox).not.toHaveAttribute('aria-labelledby');
    expect(screen.queryByText('Set')).toBeNull();
  });

  it('no inyecta aria-labelledby con un label vacío tampoco', () => {
    // `label={null}` y `label={undefined}` salen por el mismo camino que
    // "no hay label": no hay nodo al que apuntar.
    const { rerender } = render(
      <Field id="set" label={null}>
        <ControlledSelect />
      </Field>,
    );
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-labelledby');

    rerender(
      <Field id="set" label={undefined}>
        <ControlledSelect />
      </Field>,
    );
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-labelledby');
  });
});

describe('Field: la descripción', () => {
  it('con hint, aria-describedby apunta al hint', () => {
    render(
      <Field id="set" label="Set" hint="Máximo 999">
        <ControlledSelect />
      </Field>,
    );

    const hint = screen.getByText('Máximo 999');
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-describedby', hint.id);
    expect(screen.getByRole('combobox')).toHaveAccessibleDescription('Máximo 999');
  });

  it('el error le gana al hint, y el hint ni se renderiza', () => {
    // Los dos a la vez duplicarían la ayuda y harían que el lector anuncie la
    // instrucción y el error pegados. Y `aria-describedby` apunta a una sola
    // cosa: si apuntara a los dos, anunciaría el hint de un campo inválido.
    render(
      <Field id="set" label="Set" hint="Máximo 999" error="Falta el set">
        <ControlledSelect />
      </Field>,
    );

    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('Falta el set');
    expect(screen.queryByText('Máximo 999')).toBeNull();

    const combobox = screen.getByRole('combobox');
    expect(combobox).toHaveAttribute('aria-describedby', error.id);
    expect(combobox).toHaveAccessibleDescription('Falta el set');
  });

  it('sin hint ni error no inventa un aria-describedby', () => {
    render(
      <Field id="set" label="Set">
        <ControlledSelect />
      </Field>,
    );

    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-describedby');
  });

  it('tampoco pisa el aria-describedby del call site', () => {
    render(
      <>
        <p id="ayuda-manual">Ayuda escrita a mano</p>
        <Field id="set" label="Set" hint="Máximo 999">
          <ControlledSelect aria-describedby="ayuda-manual" />
        </Field>
      </>,
    );

    expect(screen.getByRole('combobox')).toHaveAttribute('aria-describedby', 'ayuda-manual');
  });

  it("el hint vacío ('') no cuenta como contenido", () => {
    // `''`, `null` y `undefined` no son contenido: si contaran, el `Field`
    // publicaría un `aria-describedby` apuntando a un `<p>` vacío.
    render(
      <Field id="set" label="Set" hint="">
        <Input id="set" />
      </Field>,
    );

    expect(screen.getByLabelText('Set')).not.toHaveAttribute('aria-describedby');
  });
});

describe('Field: hijos que no son un elemento inyectable', () => {
  it('un string no revienta', () => {
    render(<Field id="x" label="Nota">texto suelto</Field>);
    expect(screen.getByText('texto suelto')).toBeInTheDocument();
  });

  it('un array de elementos no revienta', () => {
    render(
      <Field id="x" label="Nota">
        {[<input key="a" aria-label="a" />, <input key="b" aria-label="b" />]}
      </Field>,
    );
    expect(screen.getByLabelText('a')).toBeInTheDocument();
    expect(screen.getByLabelText('b')).toBeInTheDocument();
  });

  it('un fragment no revienta', () => {
    expect(() =>
      render(
        <Field id="x" label="Nota">
          <Fragment>
            <span>dentro</span>
          </Fragment>
        </Field>,
      ),
    ).not.toThrow();
    expect(screen.getByText('dentro')).toBeInTheDocument();
  });

  it('sin hijos no revienta', () => {
    expect(() => render(<Field id="x" label="Nota" />)).not.toThrow();
  });
});

describe('Field: el <label> sigue nombrando a un <input>', () => {
  it('la vía htmlFor, que es la que sí funciona con un input nativo', () => {
    const onChange = vi.fn();
    render(
      <Field id="email" label="Email" required>
        <Input id="email" onChange={onChange} />
      </Field>,
    );

    const input = screen.getByLabelText(/Email/);
    expect(input).toHaveAttribute('id', 'email');
    expect(input).toHaveAccessibleName(/Email/);
  });

  it('el asterisco de required es decorativo y hay texto para lectores', () => {
    render(
      <Field id="email" label="Email" required>
        <Input id="email" />
      </Field>,
    );

    const label = screen.getByText('Email').closest('label');
    expect(label).toBeInTheDocument();
    // El `*` es `aria-hidden` (si no, VoiceOver lee "Email asterisco"), y el
    // sufijo real va en un `sr-only`.
    expect(label?.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(label).toHaveTextContent('(obligatorio)');
  });
});
