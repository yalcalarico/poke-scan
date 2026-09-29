// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Switch } from '../switch';

function Harness({ initial = false }: { initial?: boolean }) {
  const [checked, setChecked] = useState(initial);
  return <Switch checked={checked} onCheckedChange={setChecked} label="Modo oscuro" />;
}

describe('Switch: semántica', () => {
  it('es un switch con aria-checked, y aria-checked refleja el estado', async () => {
    // `aria-checked` va explícito (y no derivado del color): un toggle apagado
    // que solo se distinguiera por el color sería invisible para un lector.
    const user = userEvent.setup();
    render(<Harness initial={false} />);

    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');

    await user.click(screen.getByRole('switch'));
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('no es un checkbox', () => {
    // El criterio de §11: un `checkbox` anunciaría "marcado" y una lista de
    // checks, que es otra cosa a la que el usuario está acostumbrado.
    render(<Harness />);

    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(document.querySelector('input')).toBeNull();
  });

  it('el label es un <label htmlFor> real, no un label envolviendo', () => {
    // La forma importa: un `<label>` envolviendo el control daría el mismo
    // nombre por otra vía, y este test no detectaría que se hubiera pasado a la
    // forma que no nombra. Con `htmlFor` hay un `id` compartido que se puede
    // verificar.
    const { container } = render(<Harness />);

    const control = screen.getByRole('switch');
    const label = container.querySelector('label');

    expect(label).not.toBeNull();
    expect(label).toHaveAttribute('for', control.id);
    expect(label?.contains(control)).toBe(false);
    expect(control).toHaveAccessibleName('Modo oscuro');
  });

  it('sin label ni description el switch queda sin nombre', () => {
    // Estado real: el `Switch` no obliga a tener label. Se anota para que el
    // día que se agregue un warning en dev no parezca un test que se rompió.
    render(<Switch checked={false} onCheckedChange={() => {}} />);

    expect(screen.getByRole('switch')).toHaveAccessibleName('');
  });

  /*
   * BUG CONOCIDO — `components/ui/switch.tsx:73-85`.
   *
   * Con `description`, el `<label htmlFor>` envuelve **los dos** `<span>`: el del
   * label y el de la description. El nombre accesible de un elemento sale del
   * texto de su `<label>`, así que la description se concatena al nombre y
   * queda así:
   *
   *   "Modo oscuroSigue la preferencia del sistema"
   *
   * O sea que la description se anuncia **dos veces** (una pegada al nombre y
   * otra por el `aria-describedby`), y el nombre del control ya no es el texto
   * que el usuario lee arriba. Un lector anuncia "Modo oscuroSigue la
   * preferencia del sistema, switch, apagado".
   *
   * El arreglo fue dejar el `<span>` de la description **fuera** del `<label>`:
   * el `<label>` envuelve solo el texto del label, y la description queda como
   * hermana apuntada por `aria-describedby`. Así el nombre es el texto que el
   * usuario ve y la descripción se oye una sola vez.
   */
  it('con description, la description no se concatena al nombre accesible', () => {
    render(
      <Switch
        checked={false}
        onCheckedChange={() => {}}
        label="Modo oscuro"
        description="Sigue la preferencia del sistema"
      />,
    );

    expect(screen.getByRole('switch')).toHaveAccessibleName('Modo oscuro');
  });

  it('la description sí llega por aria-describedby', () => {
    // Esta parte está bien: aunque el nombre esté contaminado, el
    // `aria-describedby` apunta al `id` correcto y no cuelga.
    render(
      <Switch
        checked={false}
        onCheckedChange={() => {}}
        label="Modo oscuro"
        description="Sigue la preferencia del sistema"
      />,
    );

    const control = screen.getByRole('switch');
    const description = document.getElementById(
      control.getAttribute('aria-describedby') ?? '',
    );

    expect(description).not.toBeNull();
    expect(description).toHaveTextContent('Sigue la preferencia del sistema');
  });
});

describe('Switch: interacción', () => {
  it('un click alterna y actualiza aria-checked', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();

    function Tracked() {
      const [checked, setChecked] = useState(false);
      return (
        <Switch
          checked={checked}
          onCheckedChange={(next) => {
            onCheckedChange(next);
            setChecked(next);
          }}
          label="Modo oscuro"
        />
      );
    }

    render(<Tracked />);

    await user.click(screen.getByRole('switch'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('switch'));
    expect(onCheckedChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('un switch deshabilitado no dispara onCheckedChange', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();

    render(
      <Switch checked={false} onCheckedChange={onCheckedChange} label="Modo oscuro" disabled />,
    );

    await user.click(screen.getByRole('switch'));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('el knob es decorativo: el estado no aparece dos veces', () => {
    // El knob es un `<span aria-hidden>`: si no, el lector anunciaría el estado
    // del switch por el color del knob *y* por `aria-checked`.
    const { container } = render(<Harness />);

    const knob = container.querySelector('span[aria-hidden="true"]');
    expect(knob).not.toBeNull();
    expect(knob?.textContent).toBe('');
  });
});
