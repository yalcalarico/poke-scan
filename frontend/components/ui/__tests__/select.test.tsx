// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Select, type SelectOption } from '../select';

const OPTIONS: readonly SelectOption<'base' | 'neo' | 'sky'>[] = [
  { value: 'base', label: 'Base Set' },
  { value: 'neo', label: 'Neo Genesis' },
  { value: 'sky', label: 'Skyridge' },
];

/** Con `disabled` en el medio, para probar que el resaltado no se para ahí. */
const WITH_DISABLED: readonly SelectOption<'a' | 'off' | 'b'>[] = [
  { value: 'a', label: 'Alfa' },
  { value: 'off', label: 'Apagada', disabled: true },
  { value: 'b', label: 'Beta' },
];

function Harness({
  options = OPTIONS,
  initial = null,
  label,
  onChange,
}: {
  options?: readonly SelectOption<string>[];
  initial?: string | null;
  label?: string;
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <Select
      id="set"
      aria-label={label}
      options={options}
      value={value}
      onChange={(next) => {
        onChange?.(next);
        setValue(next);
      }}
    />
  );
}

/** El id del `role="option"` que el combobox está anunciando como activo. */
function activeOptionLabel(): string | null {
  const id = screen.getByRole('combobox').getAttribute('aria-activedescendant');
  if (!id) return null;
  return document.getElementById(id)?.textContent ?? null;
}

describe('Select: el trigger', () => {
  it('es un combobox cerrado con haspopup listbox', () => {
    render(<Harness />);

    const combobox = screen.getByRole('combobox');
    expect(combobox).toHaveAttribute('aria-haspopup', 'listbox');
    expect(combobox).toHaveAttribute('aria-expanded', 'false');
    expect(combobox.tagName).toBe('BUTTON');
  });

  it('aria-expanded alterna al abrir y cerrar', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const combobox = screen.getByRole('combobox');
    await user.click(combobox);
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
  });

  it('aria-controls existe solo mientras el listbox está en el DOM', () => {
    // Apuntar a un id que no existe es un `aria-controls` colgando: el lector
    // trata de resolver una referencia rota.
    const { rerender } = render(<Harness />);

    const closed = screen.getByRole('combobox');
    expect(closed).not.toHaveAttribute('aria-controls');
    expect(document.querySelector('[role="listbox"]')).toBeNull();

    rerender(<Harness />);
    // Sigue cerrado: el `rerender` no abre nada.
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-controls');
  });

  it('al abrir, aria-controls apunta al id real del listbox', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('combobox'));

    const controls = screen.getByRole('combobox').getAttribute('aria-controls');
    expect(controls).not.toBeNull();
    expect(document.getElementById(controls!)).toBe(document.querySelector('[role="listbox"]'));
  });

  it('aria-activedescendant no existe cerrado y sí abierto', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-activedescendant');

    await user.click(screen.getByRole('combobox'));
    const active = screen.getByRole('combobox').getAttribute('aria-activedescendant');
    expect(active).not.toBeNull();
    expect(document.getElementById(active!)).not.toBeNull();
  });

  it('el nombre accesible sale del aria-label del call site', () => {
    // La otra mitad del bug del `Field`: un `<button role="combobox">` no lo
    // nombra el `<label htmlFor>`, así que el nombre entra por acá o por el
    // `aria-labelledby` que inyecta el `Field`.
    render(<Harness label="Set de la carta" />);
    expect(screen.getByRole('combobox')).toHaveAccessibleName('Set de la carta');
  });
});

describe('Select: navegación con teclado', () => {
  it('ArrowDown abre y avanza el aria-activedescendant', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const combobox = screen.getByRole('combobox');
    combobox.focus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true');
    expect(activeOptionLabel()).toContain('Base Set');

    await user.keyboard('{ArrowDown}');
    expect(activeOptionLabel()).toContain('Neo Genesis');

    await user.keyboard('{ArrowUp}');
    expect(activeOptionLabel()).toContain('Base Set');
  });

  it('el resaltado salta las opciones deshabilitadas', async () => {
    const user = userEvent.setup();
    render(<Harness options={WITH_DISABLED} />);

    screen.getByRole('combobox').focus();
    await user.keyboard('{ArrowDown}');
    expect(activeOptionLabel()).toContain('Alfa');

    await user.keyboard('{ArrowDown}');
    expect(activeOptionLabel()).toContain('Beta');
  });

  it('el foco real nunca sale del trigger', async () => {
    // El patrón de combobox: el highlight se mueve con `aria-activedescendant`
    // y el foco se queda. Con 176 opciones, `focus()` + `scrollIntoView` se
    // pelean.
    const user = userEvent.setup();
    render(<Harness />);

    const combobox = screen.getByRole('combobox');
    combobox.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}');

    expect(combobox).toHaveFocus();
  });

  it('Enter elige la opción resaltada, cierra y vuelve el foco al trigger', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    const combobox = screen.getByRole('combobox');
    combobox.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith('neo');
    expect(combobox).toHaveAttribute('aria-expanded', 'false');
    expect(combobox).toHaveFocus();
    expect(combobox).toHaveTextContent('Neo Genesis');
  });

  it('Escape cierra sin elegir nada', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    const combobox = screen.getByRole('combobox');
    combobox.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Escape}');

    expect(onChange).not.toHaveBeenCalled();
    expect(combobox).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('al reabrir arranca en la opción elegida, no en la primera', async () => {
    const user = userEvent.setup();
    render(<Harness initial="sky" />);

    const combobox = screen.getByRole('combobox');
    combobox.focus();
    await user.keyboard('{ArrowDown}');

    expect(activeOptionLabel()).toContain('Skyridge');
  });

  it('una opción deshabilitada se ve pero no se puede elegir', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness options={WITH_DISABLED} onChange={onChange} />);

    screen.getByRole('combobox').focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}{Enter}');

    // Se movió a Alfa, saltando la apagada: nunca landea arriba.
    expect(onChange).toHaveBeenCalledWith('a');
  });
});

describe('Select: el popover', () => {
  it('el listbox toma el nombre del combobox', async () => {
    // Sin esto, recorrer la lista con un lector anuncia una lista sin nombre
    // mientras el trigger sí lo tiene.
    const user = userEvent.setup();
    render(<Harness label="Set de la carta" />);

    await user.click(screen.getByRole('combobox'));

    expect(screen.getByRole('listbox')).toHaveAccessibleName('Set de la carta');
  });

  it('cada opción es una option con aria-selected', async () => {
    const user = userEvent.setup();
    render(<Harness initial="neo" />);

    await user.click(screen.getByRole('combobox'));

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
  });

  it('una lista vacía lo dice en vez de dibujar un popover mudo', async () => {
    const user = userEvent.setup();
    render(<Harness options={[]} />);

    await user.click(screen.getByRole('combobox'));

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('No hay opciones para elegir.')).toBeInTheDocument();
  });

  it('con más de 12 opciones aparece el buscador, con aria-autocomplete', async () => {
    // Con 176 opciones el buscador deja de ser decorativo: es la única forma de
    // llegar a la variante sin recorrer la lista.
    const user = userEvent.setup();
    const many = Array.from({ length: 13 }, (_, i) => ({
      value: `v${i}`,
      label: `Variante ${i}`,
    }));

    render(<Harness options={many} />);
    await user.click(screen.getByRole('combobox'));

    const search = screen.getByRole('textbox', { name: 'Buscar opción' });
    expect(search).toHaveAttribute('aria-autocomplete', 'list');
    expect(search).toHaveFocus();
  });

  it('con pocas opciones no hay buscador', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('combobox'));
    expect(screen.queryByRole('textbox', { name: 'Buscar opción' })).toBeNull();
  });

  it('un click afuera cierra y no roba el foco', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness />
        <button type="button">Afuera</button>
      </>,
    );

    await user.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Afuera' }));
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
  });
});
