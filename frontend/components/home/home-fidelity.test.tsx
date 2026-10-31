// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import cardFixture from "@/e2e/catalog.json";
import HomePage from "@/app/(app)/inicio/page";
import { BottomNav } from "@/components/layout/bottom-nav";
import { PersonalShowcase } from "./personal-showcase";
import { HomeGallery } from "./home-gallery";
import { listCollections, listItems } from "@/lib/api/collections";

const { auth, showcase, motion, navigation } = vi.hoisted(() => ({
  auth: { user: null as { id: string } | null, isLoading: false, isAuthenticated: false },
  showcase: vi.fn(),
  motion: { paused: false },
  navigation: { pathname: "/inicio" },
}));
const cards = [0, 1, 2].map(index => ({ ...cardFixture, id: `home-${index}`, name: `Carta Home ${index}` }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => auth }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
vi.mock("@/hooks/use-currency", () => ({ useCurrency: () => ({ currency: "USD", formatMoney: () => "—" }) }));
vi.mock("@/lib/api/showcase", () => ({ getShowcase: showcase }));
vi.mock("@/lib/api/collections", () => ({
  listCollections: vi.fn().mockResolvedValue([]),
  listItems: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 4, totalPages: 0 }),
  getPortfolio: vi.fn().mockResolvedValue({ totalCards: 3, unpricedCards: 3, valueUsd: null, history: [], topCards: [] }),
}));
vi.mock("@/components/home", async () => ({
  HomeCta: (await import("./home-cta")).HomeCta,
  FeatureGrid: () => <section>A mano</section>,
  ScanSessionResume: () => null,
  fetchPreviewCards: async () => cards,
}));
vi.mock("@/components/visual-preview/visual-preview", async original => ({
  ...(await original<typeof import("@/components/visual-preview/visual-preview")>()),
  useVisualMotionPaused: () => motion.paused,
}));
beforeEach(() => {
  navigation.pathname = "/inicio";
  auth.user = null;
  auth.isAuthenticated = false;
  motion.paused = false;
  vi.mocked(listCollections).mockResolvedValue([]);
  vi.mocked(listItems).mockClear();
  showcase.mockReset().mockResolvedValue({
    preferences: { mode: "personal", cardIds: cards.map(card => card.id) },
    cards: cards.map(card => ({ card, variant: "normal", market: null, fetchedAt: null, isStale: false })),
  });
});
function signIn() {
  auth.user = { id: "home-owner" };
  auth.isAuthenticated = true;
}
describe("Home contra la referencia Viñeta", () => {
  it("presenta galería y compartir antes de la columna de referencia y objetivos", async () => {
    render(await HomePage());
    const gallery = screen.getByRole("heading", { name: "Cartas que cuentan algo." });
    const share = screen.getByRole("heading", { name: "Una vitrina para mostrar." });
    expect(gallery.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("link", { name: "Escanear carta" })).toHaveAttribute("href", "/escanear");
    expect(screen.getByRole("link", { name: "Ver todas" })).toHaveAttribute("href", "/buscar");
  });
  it("muestra cartas reales de una colección sin duplicarlas ni rellenar con inventario falso", async () => {
    signIn();
    vi.mocked(listCollections).mockResolvedValue([{
      id: "album", userId: "home-owner", name: "Álbum de prueba", isDefault: true,
      itemCount: 4, uniqueCount: 3, duplicateCount: 1, totalValueUsd: 0,
      totalValueArs: null, cover: [], createdAt: "2000-01-01T00:00:00Z",
    }]);
    vi.mocked(listItems).mockResolvedValue({
      data: [...cards, cards[0]!].map((card, index) => ({
        id: `item-${index}`, collectionId: "album", card, variant: "normal", condition: "NM",
        quantity: 1, isForTrade: false, notes: null, addedAt: "2000-01-01T00:00:00Z", price: null,
      })),
      total: 4, page: 1, pageSize: 4, totalPages: 1,
    });
    render(<HomeGallery guestCards={[]} />);
    expect(await screen.findByText("Álbum de prueba")).toBeVisible();
    expect(screen.getAllByRole("img")).toHaveLength(3);
    expect(screen.getByRole("link", { name: /Tu próximo hallazgo/ })).toHaveAttribute("href", "/escanear");
    expect(listItems).toHaveBeenCalledTimes(1);
    expect(listItems).toHaveBeenCalledWith("album", { pageSize: 4 }, expect.any(AbortSignal));
  });
  it("asigna tres poses de abanico sin duplicar cartas ni perder enlaces", async () => {
    signIn();
    render(<PersonalShowcase guestCards={[]} />);
    await screen.findByRole("img", { name: new RegExp(cards[0]!.name) });
    const fan = screen.getByRole("list", { name: "Cartas destacadas" });
    const items = [...fan.children] as HTMLElement[];
    expect(items).toHaveLength(3);
    expect(items.map(item => item.style.getPropertyValue("--fan-side"))).toEqual(["-1", "1", "0"]);
    expect(items.map(item => item.style.getPropertyValue("--fan-angle"))).toEqual(["-12deg", "12deg", "0deg"]);
    expect(items[2]!.style.getPropertyValue("--fan-rise")).toBe("-12px");
    expect(fan.querySelectorAll("a")).toHaveLength(3);
  });
  it("usa el trazado de Inicio del artboard sin sustituir la navegación real", () => {
    render(<BottomNav />);
    const home = screen.getByRole("link", { name: "Inicio" });
    expect(home).toHaveAttribute("href", "/inicio");
    expect(home.querySelector("path")).toHaveAttribute("d", "M3 10 12 3l9 7v11h-6v-7H9v7H3z");
  });
  it("conserva navegación e iconos previos fuera de Home", () => {
    navigation.pathname = "/buscar";
    render(<BottomNav />);
    expect(screen.getByRole("link", { name: "Buscar" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Inicio" }).querySelector("svg")).toHaveClass("lucide-house");
    expect(screen.getByRole("link", { name: "Colecciones" })).toHaveAttribute("href", "/colecciones");
  });
  it("la pausa alcanza el movimiento de las cartas sin ocultar su contenido", async () => {
    signIn();
    const view = render(<PersonalShowcase guestCards={[]} />);
    const image = await screen.findByRole("img", { name: new RegExp(cards[0]!.name) });
    const art = image.closest<HTMLElement>("[data-home-card-art]");
    expect(art).not.toBeNull();
    expect(art).toHaveStyle({ animationPlayState: "running" });
    motion.paused = true;
    view.rerender(<PersonalShowcase guestCards={[]} />);
    expect(image.closest("[data-home-card-art]")).toHaveStyle({ animationPlayState: "paused" });
    expect(image).toBeVisible();
  });
});
