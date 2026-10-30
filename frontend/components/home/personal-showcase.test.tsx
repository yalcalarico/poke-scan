// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PersonalShowcase } from "./personal-showcase";
const { auth, getShowcase } = vi.hoisted(() => ({
  auth: {
    user: null as { id: string } | null,
    isLoading: false,
    isAuthenticated: false,
  },
  getShowcase: vi.fn(),
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api/showcase", () => ({ getShowcase }));
vi.mock("./app-preview", () => ({
  AppPreview: () => <p>Vista del catálogo</p>,
}));
beforeEach(() => {
  auth.user = null;
  auth.isLoading = false;
  auth.isAuthenticated = false;
  getShowcase.mockReset();
});
describe("Vitrina de inicio", () => {
  it("conserva el catálogo de invitado sin pedir datos privados", () => {
    render(<PersonalShowcase guestCards={[]} />);
    expect(screen.getByText("Vista del catálogo")).toBeInTheDocument();
    expect(getShowcase).not.toHaveBeenCalled();
  });
  it("espera el bootstrap de sesión", () => {
    auth.isLoading = true;
    render(<PersonalShowcase guestCards={[]} />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando");
    expect(getShowcase).not.toHaveBeenCalled();
  });
  it("no finge un ranking sin referencias y permite personalizar", async () => {
    auth.user = { id: "showcase-user" };
    auth.isAuthenticated = true;
    getShowcase.mockResolvedValue({
      preferences: { mode: "value", cardIds: [] },
      cards: [],
    });
    render(<PersonalShowcase guestCards={[]} />);
    expect(
      await screen.findByText("Sin ranking disponible"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Personalizar vitrina" }),
    ).toHaveAttribute("href", "/inicio/vitrina");
  });
});
