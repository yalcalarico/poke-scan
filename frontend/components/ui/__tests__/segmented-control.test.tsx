// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SegmentedControl, type SegmentedControlOption } from '../segmented-control';

type Theme = 'light' | 'dark' | 'auto';

const OPTIONS: readonly SegmentedControlOption<Theme>[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
  { value: 'auto', label: 'Auto' },
];

/** Controlado, como en un call site real. */
function Controlled() {
  const [value, setValue] = useState<Theme>('light');
  return <SegmentedControl label="Tema" value={value} options={OPTIONS} onChange={setValue} />;
}

describe('SegmentedControl: semántica del grupo', () => {
  it('es un group con nombre accesible', () => {
    // El label **visible** lo pone el consumidor arriba; el `aria-label` del
    // componente es el que nombra al grupo para el lector. Sin este, el lector
    // anunciaba tres botones sueltos sin contexto de qué elige.
    render(<Controlled />);

    const group = screen.getByRole('group', { name: 'Tema' });
    expect(group).toBeInTheDocument();
  });

  it('no es un tablist ni un radiogroup', () => {
    // §11: si el contenido no cambia, son controles con `aria-pressed`. Un
    // `tablist` obligaría a(tabpanel) que acá no existe.
    render(<Controlled />);

    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('un aria-pressed por segmento, y solo uno activo', () => {
    render(<Controlled />);

    const pressed = screen.getAllByRole('button').map((button) => [
      button.textContent,
      button.getAttribute('aria-pressed'),
    ]);

    expect(pressed).toEqual([
      ['Claro', 'true'],
      ['Oscuro', 'false'],
      ['Auto', 'false'],
    ]);
  });

  it('el ícono no es la única fuente de información y no se anuncia', () => {
    render(<Controlled />);

    // El `aria-pressed` ya dice el estado; el ícono es decorativo.
    const icon = document.querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Claro' })).toBeInTheDocument();
  });
});

describe('SegmentedControl: interacción', () => {
  it('un click mueve el estado y el aria-pressed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    function Harness() {
      const [value, setValue] = useState<Theme>('light');
      return (
        <SegmentedControl
          label="Tema"
          value={value}
          options={OPTIONS}
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
        />
      );
    }

    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Oscuro' }));

    expect(onChange).toHaveBeenCalledWith('dark');
    expect(screen.getByRole('button', { name: 'Oscuro' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Claro' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('un segmento deshabilitado no dispara onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <SegmentedControl
        label="Tema"
        value="light"
        options={[{ value: 'light', label: 'Claro' }, { value: 'dark', label: 'Oscuro', disabled: true }]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Oscuro' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
