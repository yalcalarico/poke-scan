// @vitest-environment jsdom
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GoalsScreen } from "./goals-screen";
import { HomeGoalPanel } from "./home-goal-panel";
import { CollectionCard } from "@/components/collections/collection-card";
import { CollectionDetailScreen } from "@/components/collections/collection-detail";
import { useAuth } from "@/hooks/use-auth";
import {
  createGoal,
  listGoals,
  setNextGoal,
  updateGoal,
} from "@/lib/api/goals";
import { listCollections, getCollection } from "@/lib/api/collections";
import type { CollectionDto, CollectionGoalDto } from "@/types/api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: vi.fn() }));
vi.mock("@/lib/api/goals", () => ({
  listGoals: vi.fn(),
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  setNextGoal: vi.fn(),
}));
vi.mock("@/lib/api/collections", () => ({
  listCollections: vi.fn(),
  getCollection: vi.fn(),
}));
vi.mock("@/components/cards/money", () => ({
  Money: () => <span>Referencia</span>,
}));
const collection: CollectionDto = {
  id: "c1",
  userId: "u1",
  name: "Álbum propio",
  isDefault: true,
  itemCount: 0,
  uniqueCount: 0,
  duplicateCount: 0,
  totalValueUsd: 0,
  totalValueArs: null,
  cover: [],
  createdAt: "2026-10-29T00:00:00.000Z",
};
const goal: CollectionGoalDto = {
  id: "g1",
  collectionId: "c1",
  title: "Mi hallazgo",
  isNext: true,
  createdAt: "2026-10-29T00:00:00.000Z",
  updatedAt: "2026-10-29T00:00:00.000Z",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useAuth).mockReturnValue({
    isLoading: false,
    isAuthenticated: true,
  } as ReturnType<typeof useAuth>);
  vi.mocked(getCollection).mockResolvedValue(collection);
  vi.mocked(listCollections).mockResolvedValue([collection]);
  vi.mocked(listGoals).mockResolvedValue([]);
  vi.mocked(createGoal).mockResolvedValue(goal);
  vi.mocked(updateGoal).mockResolvedValue(goal);
  vi.mocked(setNextGoal).mockResolvedValue(goal);
});

describe("Objetivos reales", () => {
  it.each(["⚡".repeat(59) + "😀".repeat(31), "😀".repeat(120)])(
    "guarda Unicode sin truncar ni contar unidades UTF-16",
    async (title) => {
      render(<GoalsScreen collectionId="c1" />);
      await screen.findByText("Elegí tu primer objetivo");
      fireEvent.click(screen.getByRole("button", { name: "Crear objetivo" }));
      const input = screen.getByRole("textbox");
      expect(input).not.toHaveAttribute("maxlength");
      fireEvent.change(input, { target: { value: title } });
      fireEvent.submit(input.closest("form")!);
      await waitFor(() => expect(createGoal).toHaveBeenCalledWith("c1", title));
    },
  );

  it("reemplaza sugerencias, permite adaptarlas y sólo guarda con confirmación", async () => {
    render(<GoalsScreen collectionId="c1" />);
    await screen.findByText("Elegí tu primer objetivo");
    const suggestion = screen.getByRole("complementary", {
      name: "Sugerencia editorial",
    });
    const before = within(suggestion).getByRole("heading").textContent;
    fireEvent.click(screen.getByRole("button", { name: "Generar otra" }));
    expect(within(suggestion).getByRole("heading").textContent).not.toBe(
      before,
    );
    fireEvent.click(screen.getByRole("button", { name: "Usar sugerencia" }));
    const input = screen.getByRole("textbox", { name: "Qué querés conseguir" });
    expect(input).not.toHaveValue("");
    expect(createGoal).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "  Mi idea propia  " } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar objetivo" }));
    await waitFor(() =>
      expect(createGoal).toHaveBeenCalledWith("c1", "Mi idea propia"),
    );
  });

  it("edita y elige próximo sin inventar progreso", async () => {
    vi.mocked(listGoals).mockResolvedValue([
      goal,
      { ...goal, id: "g2", title: "Otra idea", isNext: false },
    ]);
    render(<GoalsScreen collectionId="c1" />);
    await screen.findByText("Mi hallazgo");
    fireEvent.click(
      screen.getAllByRole("button", { name: "Editar objetivo" })[0]!,
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Nuevo texto" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar objetivo" }));
    await waitFor(() =>
      expect(updateGoal).toHaveBeenCalledWith("c1", "g1", "Nuevo texto"),
    );
    await waitFor(() =>
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument(),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Elegir como próximo" }),
    );
    await waitFor(() => expect(setNextGoal).toHaveBeenCalledWith("c1", "g2"));
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("rechaza texto vacío y largo sin enviar y conserva borrador ante error", async () => {
    vi.mocked(createGoal).mockRejectedValue(new Error("No se pudo guardar"));
    render(<GoalsScreen collectionId="c1" />);
    await screen.findByText("Elegí tu primer objetivo");
    fireEvent.click(screen.getByRole("button", { name: "Crear objetivo" }));
    const input = screen.getByRole("textbox");
    for (const value of ["   ", "x".repeat(121), "😀".repeat(121)]) {
      fireEvent.change(input, { target: { value } });
      fireEvent.submit(input.closest("form")!);
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Escribí un objetivo de 1 a 120 caracteres.",
      );
      expect(createGoal).not.toHaveBeenCalled();
    }
    fireEvent.change(input, { target: { value: "Conservar borrador" } });
    fireEvent.submit(input.closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo guardar",
    );
    expect(input).toHaveValue("Conservar borrador");
  });

  it("distingue carga, error y visitante sin peticiones privadas", async () => {
    vi.mocked(useAuth).mockReturnValue({
      isLoading: true,
      isAuthenticated: false,
    } as ReturnType<typeof useAuth>);
    const view = render(<GoalsScreen collectionId="c1" />);
    expect(screen.getByText("Cargando objetivos…")).toBeInTheDocument();
    expect(listGoals).not.toHaveBeenCalled();
    view.unmount();
    vi.mocked(useAuth).mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
    } as ReturnType<typeof useAuth>);
    const guest = render(<GoalsScreen collectionId="c1" />);
    expect(
      screen.getByRole("link", { name: "Iniciar sesión" }),
    ).toHaveAttribute("href", "/login");
    expect(listGoals).not.toHaveBeenCalled();
    guest.unmount();
    vi.mocked(useAuth).mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
    } as ReturnType<typeof useAuth>);
    vi.mocked(listGoals).mockRejectedValue(new Error("Sin conexión"));
    render(<GoalsScreen collectionId="c1" />);
    await screen.findByText("Sin conexión");
    expect(
      screen.queryByText("Elegí tu primer objetivo"),
    ).not.toBeInTheDocument();
  });

  it("el panel de inicio elige colección y muestra sólo su próximo objetivo", async () => {
    vi.mocked(listCollections).mockResolvedValue([
      collection,
      { ...collection, id: "c2", name: "Otro álbum", isDefault: false },
    ]);
    vi.mocked(listGoals).mockImplementation(async (id) =>
      id === "c1" ? [goal] : [],
    );
    render(<HomeGoalPanel />);
    await screen.findByText("Mi hallazgo");
    fireEvent.click(
      screen.getByRole("combobox", { name: "Objetivos de la colección" }),
    );
    fireEvent.click(await screen.findByRole("option", { name: "Otro álbum" }));
    await screen.findByText("Esta colección todavía no tiene objetivos.");
    expect(screen.queryByText("Mi hallazgo")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver objetivos" })).toHaveAttribute(
      "href",
      "/colecciones/c2/objetivos",
    );
  });

  it("conserva el detalle sin sesión, sin consultar datos privados ni objetivos", () => {
    vi.mocked(useAuth).mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
    } as ReturnType<typeof useAuth>);
    render(<CollectionDetailScreen collectionId="c1" />);
    expect(
      screen.getByText("Iniciá sesión para ver tu colección"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Iniciar sesión" }),
    ).toHaveAttribute("href", "/login");
    expect(listGoals).not.toHaveBeenCalled();
    expect(getCollection).not.toHaveBeenCalled();
  });

  it("conserva los enlaces existentes de la tarjeta y agrega objetivos sin anidarlos", () => {
    render(<CollectionCard collection={collection} />);
    expect(screen.getByRole("link", { name: "Álbum propio" })).toHaveAttribute(
      "href",
      "/colecciones/c1",
    );
    expect(
      screen.getByRole("link", { name: "Progreso por set de Álbum propio" }),
    ).toHaveAttribute("href", "/colecciones/c1/sets");
    expect(
      screen.getByRole("link", { name: "Ver objetivos de Álbum propio" }),
    ).toHaveAttribute("href", "/colecciones/c1/objetivos");
    for (const link of screen.getAllByRole("link"))
      expect(link.querySelector("a")).toBeNull();
  });
});
