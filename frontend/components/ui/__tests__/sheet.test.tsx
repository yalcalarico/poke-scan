// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { Sheet } from '../sheet';

/**
 * Shim de layout para jsdom.
 *
 * `getFocusableElements` (`sheet.tsx:473`) filtra los candidatos con
 * `element.offsetParent !== null`, que es la forma barata de descartar lo
 * escondido. jsdom no hace layout y devuelve **`null` siempre** en
 * `offsetParent`, así que sin este shim la lista de enfocables del trap sería
 * siempre vacía y el `Tab` caería en la rama `focusables.length === 0`: el
 * handler enfocaría el panel y el test pasaría sin haber probado el trap.
 *
 * Con el shim, "tiene offsetParent" se aproxima con "está montado en un árbol",
 * que es la condición equivalente para todo lo que este test renderiza.
 */
const originalOffsetParent = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'offsetParent',
);

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get(this: HTMLElement) {
      return this.parentElement;
    },
  });
});

afterAll(() => {
  if (originalOffsetParent) {
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', originalOffsetParent);
  } else {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetParent;
  }
});

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      {/*
        `data-testid` y no un `getByRole('button', { name: 'Abrir' })` para
        encontrarlo: mientras el `Sheet` está abierto, este botón está dentro del
        subárbol `aria-hidden`/`inert`, y `getByRole` —que solo mira el árbol de
        accesibilidad— deja de encontrarlo. Eso es exactamente lo que tiene que
        pasar, y por eso el test lo pide por id en vez de pelearse con la query.
      */}
      <button type="button" data-testid="trigger" onClick={() => setOpen(true)}>
        Abrir
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Ordenar colección" subtitle="Tocá para cambiar">
        <button type="button">Primero</button>
        <button type="button">Segundo</button>
        <button type="button">Tercero</button>
      </Sheet>
    </div>
  );
}

/**
 * El trigger real, el que tiene que recuperar el foco al cerrar.
 *
 * Va por `testid` y no por rol a propósito: con el `Sheet` abierto, el botón
 * está bajo `aria-hidden`, así que `getByRole` no lo ve. Usar el rol acá
 * estaría probando que el `Sheet` **no** inertiza el contenido de atrás.
 */
function trigger() {
  return screen.getByTestId('trigger');
}

function panel() {
  return screen.getByRole('dialog');
}

/** Lee `inert` como propiedad, no como atributo. Ver la nota del test de abajo. */
function isInert(element: Element): boolean {
  return (element as Element & { inert?: boolean }).inert === true;
}

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(trigger());
  // El panel se monta por portal recién después de un `queueMicrotask`: sin
  // el `findByRole` la primera aserción correría contra un árbol vacío.
  return screen.findByRole('dialog');
}

describe('Sheet: apertura', () => {
  it('no renderiza nada mientras está cerrado', () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('es un diálogo modal con nombre y descripción', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await open(user);

    const dialog = panel();
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    // El nombre tiene que entrar por `aria-labelledby`, no por el `h2` suelto:
    // un lector necesita el nombre **antes** de leer el contenido del diálogo.
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).not.toBeNull();
    expect(document.getElementById(labelledBy!)).toHaveTextContent('Ordenar colección');

    const describedBy = dialog.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy!)).toHaveTextContent('Tocá para cambiar');
  });

  it('el foco entra al panel, no al primer control', async () => {
    // Lo que el lector necesita primero es el nombre del diálogo, no un input
    // que el usuario no pidió abrir.
    const user = userEvent.setup();
    render(<Harness />);
    await open(user);

    const dialog = panel();
    expect(dialog).toHaveFocus();
    expect(dialog).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('button', { name: 'Cerrar' })).not.toHaveFocus();
  });

  it('trae el diálogo al final del body, por portal', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await open(user);

    // Un overlay dentro del flujo del contenido quedaría debajo del `BottomNav`
    // por orden de árbol, sin importar el `z-index`.
    expect(panel().closest('body')).toBe(document.body);
    expect(document.body.lastElementChild?.contains(panel())).toBe(true);
  });
});

describe('Sheet: foco atrapado', () => {
  it('Tab desde el último control vuelve al primero', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await open(user);

    // El primer enfocable del panel es el `IconButton` de cerrar, después
    // "Primero", "Segundo", "Tercero".
    const last = screen.getByRole('button', { name: 'Tercero' });
    last.focus();
    expect(last).toHaveFocus();

    await user.tab();
    // El handler corrió en fase de captura y `preventDefault`eó, así que el
    // default del browser (y el tab de user-event) no mueven nada más.
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus();
  });

  it('Shift+Tab desde el primer control vuelve al último', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await open(user);

    screen.getByRole('button', { name: 'Cerrar' }).focus();
    await user.tab({ shift: true });

    expect(screen.getByRole('button', { name: 'Tercero' })).toHaveFocus();
  });

  it('el foco no se escapa hacia el contenido de atrás', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await open(user);

    // El botón "Abrir" es alcanzable por Tab en el documento, pero no desde
    // adentro del diálogo.
    for (let i = 0; i < 8; i += 1) {
      await user.tab();
      expect(panel()).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it('un Tab con el foco afuera del panel lo recupera', async () => {
    // Cubre el caso de un `autofocus` o un click en otro overlay: el trap no
    // solo cycla, también reencuentra el foco que se fugó.
    const user = userEvent.setup();
    render(<Harness />);
    await open(user);

    trigger().focus();
    await user.tab();

    expect(panel()).toContainElement(document.activeElement as HTMLElement);
  });
});

describe('Sheet: cierre', () => {
  it('Escape cierra', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await open(user);

    await user.keyboard('{Escape}');
    await waitForElementToBeRemoved(() => panel());
  });

  it('el botón de cerrar también cierra', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await open(user);

    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    await waitForElementToBeRemoved(() => panel());
  });

  it('el foco vuelve al trigger', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await open(user);

    expect(trigger()).not.toHaveFocus();
    await user.keyboard('{Escape}');
    await waitForElementToBeRemoved(() => panel());

    expect(trigger()).toHaveFocus();
  });

  /*
   * `inert` se asserta por **propiedad** y no por atributo, a propósito: jsdom
   * no implementa `HTMLElement.inert` como atributo reflejado, así que
   * `element.inert = true` deja una propiedad de JS sin atributo detrás. En un
   * browser real es un atributo booleano reflejado, y el componente depende de
   * la propiedad (que es la que el browser honra). El `aria-hidden` sí se
   * asserta por atributo, y ese sí es el backup para lectores de pantalla que no
   * implementan `inert`.
   */
  it('el contenido de atrás queda inert y aria-hidden mientras el sheet está abierto', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const app = container;

    expect(isInert(app)).toBe(false);
    expect(app).not.toHaveAttribute('aria-hidden');

    await open(user);

    expect(isInert(app)).toBe(true);
    expect(app).toHaveAttribute('aria-hidden', 'true');
    // Y el panel en sí **no** está inert: si lo estuviera, el trap no podría
    // enfocarlo y el `Sheet` sería inusable.
    expect(isInert(panel())).toBe(false);
    expect(panel().closest('[aria-hidden="true"]')).toBeNull();
  });

  it('al cerrar, el contenido de atrás se devuelve tal cual estaba', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const app = container;
    await open(user);

    await user.keyboard('{Escape}');
    await waitForElementToBeRemoved(() => panel());

    // Se restauran del snapshot, no a un valor fijo: si el call site ya tenía
    // un `aria-hidden` propio, tiene que volver **ese**, no desaparecer.
    expect(isInert(app)).toBe(false);
    expect(app).not.toHaveAttribute('aria-hidden');
    expect(trigger()).toBeInTheDocument();
  });

  it('restaura un aria-hidden que el call site ya tenía', async () => {
    // `applyInert` es idempotente y snapshotea el valor previo: si no, al
    // cerrar un `Sheet` se perdería un `aria-hidden="true"` legítimo de la
    // pantalla de atrás, y quedaría contenido visible para el lector que
    // debería estar escondido.
    const user = userEvent.setup();

    function WithHiddenRoot() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button type="button" data-testid="trigger" onClick={() => setOpen(true)}>
            Abrir
          </button>
          <Sheet open={open} onClose={() => setOpen(false)} title="Ordenar">
            <button type="button">Contenido</button>
          </Sheet>
        </div>
      );
    }

    // El `container` que Testing Library crea **es** el hijo de `body` sobre el
    // que `applyInert` itera, así que el `aria-hidden` previo tiene que ir ahí
    // para estar en el snapshot. Va en el container y no en un `div` del JSX
    // porque un `div` anidado ni siquiera es hijo de `body`.
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    document.body.appendChild(host);

    render(<WithHiddenRoot />, { container: host });
    expect(host).toHaveAttribute('aria-hidden', 'true');

    await user.click(screen.getByTestId('trigger'));
    await screen.findByRole('dialog');
    expect(host).toHaveAttribute('aria-hidden', 'true');

    await user.keyboard('{Escape}');
    await waitForElementToBeRemoved(() => screen.getByRole('dialog'));

    // Si `restoreInert` no guardara el valor previo, esto sería `null`: el
    // `aria-hidden` legítimo de la pantalla de atrás se perdería y quedaría
    // contenido anunciable que el call site escondió a propósito.
    expect(host).toHaveAttribute('aria-hidden', 'true');
  });

  it('el scroll del body se bloquea mientras está abierto y se devuelve al cerrar', async () => {
    const user = userEvent.setup();
    document.body.style.overflow = 'scroll';
    render(<Harness />);

    await open(user);
    expect(document.body.style.overflow).toBe('hidden');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.body.style.overflow).toBe('scroll'));
  });

  it('un segundo Sheet abierto no deja el body bloqueado para siempre', async () => {
    // La pila de capas: si dos sheets se registran y solo uno se desregistra, el
    // `overflow` y el `inert` quedan puestos para siempre.
    const user = userEvent.setup();
    const onClose = vi.fn();

    function Two() {
      const [first, setFirst] = useState(false);
      const [second, setSecond] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setFirst(true)}>
            Abrir el primero
          </button>
          <Sheet
            open={first}
            onClose={() => setFirst(false)}
            title="Primero"
            footer={
              <button type="button" onClick={() => setSecond(true)}>
                Abrir el segundo
              </button>
            }
          >
            <button type="button">Contenido</button>
          </Sheet>
          <Sheet open={second} onClose={onClose} title="Segundo">
            <button type="button">Otro</button>
          </Sheet>
        </div>
      );
    }

    render(<Two />);
    await user.click(screen.getByRole('button', { name: 'Abrir el primero' }));
    await screen.findByRole('dialog', { name: 'Primero' });

    await user.click(screen.getByRole('button', { name: 'Abrir el segundo' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Primero' })).toBeNull());
    await screen.findByRole('dialog', { name: 'Segundo' });

    // Solo uno a la vez (§8.9): el primero se cerró al abrir el segundo.
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
});

it('el botón de cerrar no inicia el arrastre ni captura su puntero en mobile', async () => {
  const onClose = vi.fn();
  render(<Sheet open onClose={onClose} title="Revisión"><p>Una carta</p></Sheet>);
  const close = await screen.findByRole('button', { name: 'Cerrar' });
  const grab = close.closest('[data-slot="sheet-grab"]');
  const capture = vi.fn();
  if (!grab) throw new Error('No encontramos el encabezado');
  Object.defineProperty(grab, 'setPointerCapture', { value: capture, configurable: true });
  fireEvent.pointerDown(close, { pointerId: 1, pointerType: 'touch' });
  expect(capture).not.toHaveBeenCalled();
  fireEvent.click(close);
  expect(onClose).toHaveBeenCalledOnce();
});
