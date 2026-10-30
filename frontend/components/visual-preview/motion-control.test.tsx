// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AppVisualsProvider, MotionControl } from "./visual-preview";
let reduced = false;
const listeners = new Set<() => void>();
beforeEach(() => {
  reduced = false;
  listeners.clear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      get matches() {
        return reduced;
      },
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: (_event: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_event: string, cb: () => void) =>
        listeners.delete(cb),
    })),
  });
});
describe("Pausa de efectos", () => {
  it("pausa sin cambiar navegación o contenido y conserva la decisión al renderizar", () => {
    const view = render(
      <AppVisualsProvider>
        <MotionControl />
        <p>Contenido real</p>
      </AppVisualsProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Pausar efectos" }));
    expect(
      screen.getByRole("button", { name: "Activar efectos" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      view.container.querySelector("[data-visual-preview]"),
    ).toHaveAttribute("data-paused", "true");
    expect(screen.getByText("Contenido real")).toBeVisible();
    view.rerender(
      <AppVisualsProvider>
        <MotionControl />
        <p>Otra pantalla</p>
      </AppVisualsProvider>,
    );
    expect(
      screen.getByRole("button", { name: "Activar efectos" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Activar efectos" }));
    expect(
      screen.getByRole("button", { name: "Pausar efectos" }),
    ).toHaveAttribute("aria-pressed", "false");
  });
  it("respeta movimiento reducido y no permite forzarlo desde la app", () => {
    reduced = true;
    render(
      <AppVisualsProvider>
        <MotionControl />
      </AppVisualsProvider>,
    );
    expect(
      screen.getByRole("button", { name: "Movimiento reducido" }),
    ).toBeDisabled();
    act(() => {
      reduced = false;
      listeners.forEach((cb) => cb());
    });
    expect(
      screen.getByRole("button", { name: "Pausar efectos" }),
    ).toBeEnabled();
  });
});
