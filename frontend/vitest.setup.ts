/**
 * Marcador de módulo. Sin esto el archivo no es un módulo y los `await` de
 * nivel superior de abajo dan TS1375. No exporta nada: existe solo por el
 * efecto de convertir el scope.
 */
export {};

/**
 * Setup global de Vitest. Corre **antes** de cada archivo, en los dos
 * entornos.
 *
 * ## Por qué está condicionado a que exista `document`
 *
 * El `environment` default es `node` (`vitest.config.ts`), así que la mayoría de
 * los tests de este proyecto no tienen DOM: son lógica pura de la cámara, del reconocimiento visual
 * y de los helpers de imagen. Importar `@testing-library/react` o
 * `@testing-library/jest-dom` sin `document` revienta, y arrancar jsdom para
 * todos ellos solo para poder importar dos módulos sería pagar el costo de la
 * parte cara de la suite por un guard.
 *
 * Por eso el archivo pregunta primero. Los tests de `node` no pagan nada de lo
 * de abajo; los que declaran `// @vitest-environment jsdom` lo reciben entero.
 */
if (typeof document !== 'undefined') {
  // Los matchers de jest-dom (`toBeInTheDocument`, `toHaveAttribute`,
  // `toHaveAccessibleName`, …). Van por el entrypoint `/vitest` y no el de
  // `/extend-expect` porque este último se patchea el `expect` de Jest y no el
  // de Vitest.
  await import('@testing-library/jest-dom/vitest');

  const { cleanup } = await import('@testing-library/react');
  const { afterEach } = await import('vitest');

  /*
   * `scrollIntoView` no existe en jsdom: no hay layout, así que no hay a qué
   * scrollear. `select-option-list.tsx:78` lo llama en cada cambio de
   * `aria-activedescendant`, y sin el stub el popover del `Select` revienta con
   * "scrollIntoView is not a function" al abrirse — un fallo del entorno, no del
   * componente.
   *
   * Se instala solo si falta, y es un no-op: no hay nada que scrollear, y
   * `getBoundingClientRect` devuelve ceros, que es coherente con eso.
   */
  if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
    Element.prototype.scrollIntoView = function scrollIntoView() {};
  }

  /*
   * `window.matchMedia` no existe en jsdom. `sheet.tsx:334` lo usa para decidir
   * si el gesto de arrastrar aplica (es solo mobile, se corta en `sm:`), así que
   * sin el shim cualquier `pointerdown` sobre el grab del `Sheet` revienta.
   *
   * El default es `matches: false`, o sea "estamos en mobile": es la rama que
   * hace más trabajo (arrastre, `setPointerCapture`) y por lo tanto la que más
   * vale tener cubierta.
   */
  /*
   * `setPointerCapture` / `releasePointerCapture` tampoco existen en jsdom (son
   * Pointer Events, y jsdom implementa solo Events y MouseEvents). `sheet.tsx`
   * los usa en el gesto de arrastrar el panel para cerrar, así que sin el shim
   * cualquier `pointerdown` sobre el grab revienta con "is not a function".
   *
   * No-op: no hay compositing real, y la captura solo sirve para que el
   * `pointerup` siga llegando al nodo aunque el dedo se vaya de la pantalla, que
   * en un test sintético no llega a pasar.
   */
  if (typeof Element !== 'undefined') {
    if (typeof Element.prototype.setPointerCapture !== 'function') {
      Element.prototype.setPointerCapture = function setPointerCapture() {};
    }
    if (typeof Element.prototype.releasePointerCapture !== 'function') {
      Element.prototype.releasePointerCapture = function releasePointerCapture() {};
    }
    if (typeof Element.prototype.hasPointerCapture !== 'function') {
      Element.prototype.hasPointerCapture = function hasPointerCapture() {
        return false;
      };
    }
  }

  if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }

  /*
   * El auto-cleanup de `@testing-library/react` no alcanza: solo se registra si
   * encuentra un `afterEach` **global**, y Vitest no expone ninguno con
   * `globals: false`, que es el default de este proyecto. Sin este `afterEach`
   * explícito, el container de cada `render` se acumularía en el `document` y un
   * `getByRole` del test siguiente encontraría los nodos del anterior.
   */
  afterEach(() => {
    cleanup();
  });
}
