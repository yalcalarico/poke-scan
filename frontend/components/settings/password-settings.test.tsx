// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PasswordSettings } from "./password-settings";
const { auth, changePassword } = vi.hoisted(() => ({
  auth: {
    user: { id: "account-fixture" } as { id: string } | null,
    isLoading: false,
    isAuthenticated: true,
    clearSession: vi.fn(),
  },
  changePassword: vi.fn(),
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api/account", () => ({ changePassword }));
beforeEach(() => {
  auth.user = { id: "account-fixture" };
  auth.isLoading = false;
  auth.isAuthenticated = true;
  auth.clearSession.mockReset();
  changePassword.mockReset();
});
function fill(confirm = "Replacement fixture 2") {
  fireEvent.change(screen.getByLabelText(/Contraseña actual/), {
    target: { value: "Current fixture 1" },
  });
  fireEvent.change(screen.getByLabelText(/^Nueva contraseña/), {
    target: { value: "Replacement fixture 2" },
  });
  fireEvent.change(screen.getByLabelText(/Repetir nueva/), {
    target: { value: confirm },
  });
}
describe("Cambio de clave visible", () => {
  it("no envía si la confirmación difiere", () => {
    render(<PasswordSettings />);
    fill("different");
    fireEvent.click(screen.getByRole("button", { name: "Actualizar clave" }));
    expect(screen.getByRole("alert")).toHaveTextContent("no coinciden");
    expect(changePassword).not.toHaveBeenCalled();
  });
  it("confirma cierre de sesión sólo tras éxito y ofrece login manual", async () => {
    changePassword.mockImplementation(async (_payload, confirmed) => {
      confirmed();
      return { success: true };
    });
    render(<PasswordSettings />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Actualizar clave" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Cerramos las sesiones",
    );
    expect(auth.clearSession).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("link", { name: "Iniciar sesión" }),
    ).toHaveAttribute("href", "/login");
    expect(
      screen.queryByLabelText(/Contraseña actual/),
    ).not.toBeInTheDocument();
  });
  it("un resultado incierto borra campos, no declara éxito ni repite", async () => {
    changePassword.mockRejectedValue(new Error("offline"));
    render(<PasswordSettings />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Actualizar clave" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos confirmar",
    );
    expect(changePassword).toHaveBeenCalledTimes(1);
    expect(auth.clearSession).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Contraseña actual/)).toHaveValue("");
    expect(screen.getByLabelText(/^Nueva contraseña/)).toHaveValue("");
  });
  it("descarta secretos al salir y al cambiar la cuenta", async () => {
    const view = render(<PasswordSettings />);
    fill();
    fireEvent(window, new Event("pagehide"));
    expect(screen.getByLabelText(/Contraseña actual/)).toHaveValue("");
    fill();
    auth.user = { id: "different-account" };
    view.rerender(<PasswordSettings />);
    await waitFor(() =>
      expect(screen.getByLabelText(/Contraseña actual/)).toHaveValue(""),
    );
    expect(changePassword).not.toHaveBeenCalled();
  });
});
