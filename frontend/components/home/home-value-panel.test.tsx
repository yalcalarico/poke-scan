// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CurrencyProvider } from "@/hooks/use-currency";
import { getUsdArsRate, updateCurrencyPreference, type UsdArsRate } from "@/lib/api/currency";
import { getPortfolio } from "@/lib/api/collections";
import type { PortfolioDto } from "@/types/api";
import { HomePortfolioSummary } from "./home-portfolio-summary";

const auth = vi.hoisted(() => ({
  user: null as { id: string; preferredCurrency?: "USD" | "ARS" } | null,
  isAuthenticated: false,
  isLoading: false,
  refreshUser: vi.fn(),
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api/collections", () => ({ getPortfolio: vi.fn() }));
vi.mock("@/lib/api/currency", async original => ({
  ...(await original<typeof import("@/lib/api/currency")>()),
  getUsdArsRate: vi.fn(),
  updateCurrencyPreference: vi.fn(),
}));
const rate: UsdArsRate = {
  rate: 1000, rateType: "blue", fetchedAt: "2000-01-01T00:00:00Z", stale: false,
  blue: { rate: 1000, rateType: "blue", fetchedAt: "2000-01-01T00:00:00Z", stale: false },
  oficial: null,
};
const portfolio: PortfolioDto = {
  totalCards: 3, unpricedCards: 1, valueUsd: 25, history: [], topCards: [],
};
function mount() {
  return render(<CurrencyProvider><HomePortfolioSummary /></CurrencyProvider>);
}
function signIn() {
  auth.user = { id: "value-panel-owner" };
  auth.isAuthenticated = true;
}
beforeEach(() => {
  vi.clearAllMocks();
  auth.user = null;
  auth.isAuthenticated = false;
  auth.isLoading = false;
  vi.mocked(getUsdArsRate).mockResolvedValue(rate);
  vi.mocked(getPortfolio).mockResolvedValue(portfolio);
});

describe("Panel de valor Home · S2/S4", () => {
  it("cambia USD/ARS con la conversión y persistencia existentes, sin volver a pedir el portfolio", async () => {
    signIn();
    mount();
    expect(await screen.findByText("$25.00")).toBeVisible();
    fireEvent.click(await screen.findByRole("button", { name: "Cambiar a ARS" }));
    expect(screen.getByText("$25.000")).toBeVisible();
    expect(screen.getByRole("button", { name: "Cambiar a USD" })).toHaveTextContent("ARS");
    expect(updateCurrencyPreference).toHaveBeenLastCalledWith({ preferredCurrency: "ARS", preferredRateType: "blue" });
    fireEvent.click(screen.getByRole("button", { name: "Cambiar a USD" }));
    expect(screen.getByText("$25.00")).toBeVisible();
    expect(updateCurrencyPreference).toHaveBeenLastCalledWith({ preferredCurrency: "USD", preferredRateType: "blue" });
    expect(getPortfolio).toHaveBeenCalledTimes(1);
    expect(getUsdArsRate).toHaveBeenCalledTimes(1);
  });

  it("mantiene el guion cuando el valor es desconocido aun al cambiar a ARS", async () => {
    signIn();
    vi.mocked(getPortfolio).mockResolvedValue({ ...portfolio, valueUsd: null, unpricedCards: 3 });
    mount();
    await screen.findByText("3 cartas · 3 sin referencia");
    fireEvent.click(await screen.findByRole("button", { name: "Cambiar a ARS" }));
    expect(screen.getByLabelText("Sin referencia de valor")).toHaveTextContent("—");
    expect(screen.queryByText(/\$0/)).not.toBeInTheDocument();
  });

  it("comunica ARS no disponible y no permite seleccionarlo sin cotización", async () => {
    vi.mocked(getUsdArsRate).mockResolvedValue(null);
    mount();
    expect(await screen.findByText("ARS no disponible: no hay cotización.")).toBeVisible();
    const button = screen.getByRole("button", { name: "Cambiar a ARS" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("ARS no disponible: no hay cotización.");
    fireEvent.click(button);
    expect(button).toHaveTextContent("USD");
    expect(updateCurrencyPreference).not.toHaveBeenCalled();
    expect(getPortfolio).not.toHaveBeenCalled();
  });

  it("no habilita ARS mientras carga la cotización y comunica si la disponible es anterior", async () => {
    let resolveRate!: (value: UsdArsRate) => void;
    vi.mocked(getUsdArsRate).mockReturnValue(new Promise(resolve => { resolveRate = resolve; }));
    mount();
    expect(screen.getByRole("button", { name: "Cambiar a ARS" })).toBeDisabled();
    expect(screen.getByText("Cargando cotización…")).toBeVisible();
    await act(async () => resolveRate({ ...rate, blue: { ...rate.blue!, stale: true } }));
    fireEvent.click(screen.getByRole("button", { name: "Cambiar a ARS" }));
    expect(screen.getByText(/Cotización blue anterior/)).toBeVisible();
    expect(updateCurrencyPreference).not.toHaveBeenCalled();
  });

  it("ofrece el panel y el cálculo al visitante sin pedir datos privados", async () => {
    mount();
    expect(screen.getByRole("heading", { name: "Valor de referencia" })).toBeVisible();
    expect(screen.getByLabelText("Sin referencia de valor")).toHaveTextContent("—");
    expect(screen.getByText(/Guardá tus cartas/)).toBeVisible();
    const summary = screen.getByText("Cómo se calcula");
    const disclosure = summary.closest("details")!;
    expect(disclosure).not.toHaveAttribute("open");
    fireEvent.click(summary);
    expect(disclosure).toHaveAttribute("open");
    expect(screen.getByText(/Sólo se suman copias con precio para su variante/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Ver colecciones" })).toHaveAttribute("href", "/colecciones");
    expect(screen.getByText(/TCGplayer vía TCGCSV, no precio de venta local/)).toBeVisible();
    await waitFor(() => expect(getUsdArsRate).toHaveBeenCalledTimes(1));
    expect(getPortfolio).not.toHaveBeenCalled();
  });

  it("conserva bootstrap sin consulta privada aunque aparezca un usuario transitorio", async () => {
    signIn();
    auth.isLoading = true;
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("Cargando tu colección…");
    await waitFor(() => expect(getUsdArsRate).toHaveBeenCalledTimes(1));
    expect(getPortfolio).not.toHaveBeenCalled();
  });

  it("preserva carga, error y reintento del portfolio", async () => {
    signIn();
    let rejectPortfolio!: (error: Error) => void;
    vi.mocked(getPortfolio).mockReturnValueOnce(new Promise((_, reject) => { rejectPortfolio = reject; }));
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("Cargando valoración…");
    await waitFor(() => expect(getPortfolio).toHaveBeenCalledTimes(1));
    await act(async () => rejectPortfolio(new Error("No pudimos valorar tu colección")));
    expect(await screen.findByText("No pudimos valorar tu colección")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("$25.00")).toBeVisible();
    expect(getPortfolio).toHaveBeenCalledTimes(2);
  });

  it("preserva cobertura parcial real y acceso a la evolución", async () => {
    signIn();
    mount();
    expect(await screen.findByText("3 cartas · 1 sin referencia")).toBeVisible();
    expect(screen.getByText(/Valor parcial: sólo suma copias con referencia/)).toBeVisible();
    fireEvent.click(screen.getByText("Cómo se calcula"));
    expect(screen.getByRole("link", { name: "Ver evolución" })).toHaveAttribute("href", "/colecciones");
  });

  it("preserva el total completo y el singular sin inventar cobertura faltante", async () => {
    signIn();
    vi.mocked(getPortfolio).mockResolvedValue({ ...portfolio, totalCards: 1, unpricedCards: 0 });
    mount();
    expect(await screen.findByText("1 carta")).toBeVisible();
    expect(screen.getByText(/Referencia de las copias con precio disponible/)).toBeVisible();
    expect(screen.queryByText(/^1 carta ·/)).not.toBeInTheDocument();
  });
});
