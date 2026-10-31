// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionGoalPanel, HomeGoalPanel } from "./home-goal-panel";
import { useAuth } from "@/hooks/use-auth";
import { listCollections } from "@/lib/api/collections";
import { createGoal, listGoals, setNextGoal, updateGoal } from "@/lib/api/goals";
import type { CollectionDto, CollectionGoalDto } from "@/types/api";

vi.mock("@/hooks/use-auth", () => ({ useAuth: vi.fn() }));
vi.mock("@/lib/api/collections", () => ({ listCollections: vi.fn() }));
vi.mock("@/lib/api/goals", () => ({
  listGoals: vi.fn(), createGoal: vi.fn(), updateGoal: vi.fn(), setNextGoal: vi.fn(),
}));
const suggestion = "Reunir versiones de mi Pokémon favorito";
const collection: CollectionDto = {
  id: "c1", userId: "u1", name: "Álbum sintético", isDefault: true,
  itemCount: 0, uniqueCount: 0, duplicateCount: 0, totalValueUsd: 0,
  totalValueArs: null, cover: [], createdAt: "2026-10-29T00:00:00.000Z",
};
const goal: CollectionGoalDto = {
  id: "g1", collectionId: "c1", title: "Mi objetivo real", isNext: true,
  createdAt: "2026-10-29T00:00:00.000Z", updatedAt: "2026-10-29T00:00:00.000Z",
};
function mutationsUnchanged() {
  expect(createGoal).not.toHaveBeenCalled();
  expect(updateGoal).not.toHaveBeenCalled();
  expect(setNextGoal).not.toHaveBeenCalled();
}
async function switchCollection() {
  fireEvent.click(screen.getByRole("combobox", { name: "Objetivos de la colección" }));
  fireEvent.click(await screen.findByRole("option", { name: "Otro álbum" }));
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useAuth).mockReturnValue({ isLoading: false, isAuthenticated: true } as ReturnType<typeof useAuth>);
  vi.mocked(listCollections).mockResolvedValue([collection]);
  vi.mocked(listGoals).mockResolvedValue([]);
  vi.mocked(createGoal).mockResolvedValue({ ...goal, title: suggestion, isNext: false });
  vi.mocked(updateGoal).mockResolvedValue(goal);
});

describe("Objetivo de Home — S3/S4", () => {
  it("compone título, badge veraz, colección y selector dentro del panel, marca y acciones", async () => {
    render(<HomeGoalPanel />);
    const panel = await screen.findByRole("region", { name: "Tu próximo objetivo" });
    expect(within(panel).getByRole("heading", { name: "Tu próximo objetivo" })).toBeInTheDocument();
    expect(await within(panel).findByText("Sugerencia", { exact: true })).toBeInTheDocument();
    expect(within(panel).getByText("En Álbum sintético")).toBeInTheDocument();
    expect(within(panel).getByRole("combobox", { name: "Objetivos de la colección" })).toBeInTheDocument();
    expect(panel.querySelector('svg.lucide-target[aria-hidden="true"]')).toBeInTheDocument();
    expect(within(panel).getByRole("heading", { name: suggestion })).toBeInTheDocument();
    expect(within(panel).getByText("Sugerencia editorial; todavía no es un objetivo.")).toBeInTheDocument();
    expect(within(panel).getByText("Esta colección todavía no tiene objetivos.")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Usar sugerencia" })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Generar otra" })).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Ver objetivos" })).toHaveAttribute("href", "/colecciones/c1/objetivos");
    expect(within(panel).getByText("Podés crear y modificar objetivos desde cada colección. Sin progreso inventado.")).toBeInTheDocument();
    expect(screen.queryByText(/demo/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    mutationsUnchanged();
  });

  it("genera sólo ideas editoriales localmente y vuelve a la primera sin mutar", async () => {
    render(<HomeGoalPanel />);
    await screen.findByRole("heading", { name: suggestion });
    for (const title of ["Armar una selección para compartir", "Elegir mis ilustraciones favoritas", suggestion]) {
      fireEvent.click(screen.getByRole("button", { name: "Generar otra" }));
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(listGoals).toHaveBeenCalledTimes(1);
    mutationsUnchanged();
  });

  it("abre el editor precargado, cancela sin cambios y guarda sólo al confirmar; recarga sin inventar próximo", async () => {
    render(<HomeGoalPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Usar sugerencia" }));
    expect(screen.getByRole("textbox", { name: "Qué querés conseguir" })).toHaveValue(suggestion);
    mutationsUnchanged();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    mutationsUnchanged();
    fireEvent.click(screen.getByRole("button", { name: "Usar sugerencia" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Mi idea guardada" } });
    vi.mocked(listGoals).mockResolvedValue([{ ...goal, title: "Mi idea guardada", isNext: false }]);
    fireEvent.click(screen.getByRole("button", { name: "Guardar objetivo" }));
    await waitFor(() => expect(createGoal).toHaveBeenCalledExactlyOnceWith("c1", "Mi idea guardada"));
    await screen.findByText("Elegí cuál va a ser tu próximo objetivo.");
    expect(listGoals).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(setNextGoal).not.toHaveBeenCalled();
    expect(updateGoal).not.toHaveBeenCalled();
  });

  it("muestra y edita el próximo real, sin reemplazarlo por sugerencias", async () => {
    vi.mocked(listGoals).mockResolvedValue([goal]);
    render(<HomeGoalPanel />);
    await screen.findByRole("heading", { name: goal.title });
    expect(screen.getByText("Objetivo", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText(suggestion)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generar otra" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Editar objetivo" }));
    expect(screen.getByRole("textbox")).toHaveValue(goal.title);
    mutationsUnchanged();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Título editado" } });
    vi.mocked(listGoals).mockResolvedValue([{ ...goal, title: "Título editado" }]);
    fireEvent.click(screen.getByRole("button", { name: "Guardar objetivo" }));
    await screen.findByRole("heading", { name: "Título editado" });
    expect(updateGoal).toHaveBeenCalledExactlyOnceWith("c1", "g1", "Título editado");
    expect(createGoal).not.toHaveBeenCalled();
    expect(setNextGoal).not.toHaveBeenCalled();
  });

  it("tras crear muestra el próximo real que devuelve la recarga", async () => {
    render(<HomeGoalPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Usar sugerencia" }));
    vi.mocked(listGoals).mockResolvedValue([goal]);
    fireEvent.click(screen.getByRole("button", { name: "Guardar objetivo" }));
    await screen.findByRole("heading", { name: goal.title });
    expect(screen.getByText("Objetivo", { exact: true })).toBeInTheDocument();
    expect(setNextGoal).not.toHaveBeenCalled();
  });

  it("cambiar colección descarta editor y una respuesta tardía de guardado no contamina la nueva", async () => {
    vi.mocked(listCollections).mockResolvedValue([collection, { ...collection, id: "c2", name: "Otro álbum", isDefault: false }]);
    let finish!: (value: CollectionGoalDto) => void;
    vi.mocked(createGoal).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<HomeGoalPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Usar sugerencia" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar objetivo" }));
    await waitFor(() => expect(createGoal).toHaveBeenCalledTimes(1));
    await switchCollection();
    await screen.findByRole("heading", { name: suggestion });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await act(async () => { finish(goal); });
    expect(screen.getByText("En Otro álbum")).toBeInTheDocument();
    expect(screen.queryByText(goal.title)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver objetivos" })).toHaveAttribute("href", "/colecciones/c2/objetivos");
    expect(listGoals).toHaveBeenCalledTimes(2);
    expect(createGoal).toHaveBeenCalledWith("c1", suggestion);
  });

  it("ignora una lectura tardía de la colección anterior", async () => {
    vi.mocked(listCollections).mockResolvedValue([collection, { ...collection, id: "c2", name: "Otro álbum", isDefault: false }]);
    let finish!: (value: CollectionGoalDto[]) => void;
    vi.mocked(listGoals).mockImplementation((id) => id === "c1" ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve([]));
    render(<HomeGoalPanel />);
    await screen.findByRole("combobox");
    await waitFor(() => expect(listGoals).toHaveBeenCalledTimes(1));
    await switchCollection();
    await screen.findByText("Esta colección todavía no tiene objetivos.");
    await act(async () => { finish([goal]); });
    expect(screen.queryByText(goal.title)).not.toBeInTheDocument();
    mutationsUnchanged();
  });

  it("preserva bootstrap, visitante, error de colecciones y colección vacía", async () => {
    vi.mocked(useAuth).mockReturnValue({ isLoading: true, isAuthenticated: false } as ReturnType<typeof useAuth>);
    const view = render(<HomeGoalPanel />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando objetivos…");
    expect(listCollections).not.toHaveBeenCalled();
    vi.mocked(useAuth).mockReturnValue({ isLoading: false, isAuthenticated: false } as ReturnType<typeof useAuth>);
    view.rerender(<HomeGoalPanel />);
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", "/login");
    expect(listCollections).not.toHaveBeenCalled();
    vi.mocked(useAuth).mockReturnValue({ isLoading: false, isAuthenticated: true } as ReturnType<typeof useAuth>);
    vi.mocked(listCollections).mockRejectedValue(new Error("Sin conexión"));
    view.rerender(<HomeGoalPanel />);
    await screen.findByText("Sin conexión");
    vi.mocked(listCollections).mockResolvedValue([]);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await screen.findByText("Creá una colección para guardar tus objetivos.");
    expect(listGoals).not.toHaveBeenCalled();
    mutationsUnchanged();
  });

  it("error de objetivos no ofrece sugerencias ni escritura y permite reintentar", async () => {
    vi.mocked(listGoals).mockRejectedValue(new Error("Objetivos no disponibles"));
    render(<HomeGoalPanel />);
    await screen.findByText("Objetivos no disponibles");
    expect(screen.queryByRole("button", { name: "Usar sugerencia" })).not.toBeInTheDocument();
    vi.mocked(listGoals).mockResolvedValue([]);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await screen.findByRole("heading", { name: suggestion });
    mutationsUnchanged();
  });

  it("CollectionGoalPanel conserva próximo, vacío y enlace sin editor ni sugerencias", async () => {
    vi.mocked(listGoals).mockResolvedValue([goal]);
    const view = render(<CollectionGoalPanel collectionId="c1" />);
    await screen.findByText(goal.title);
    expect(screen.queryByRole("button", { name: "Editar objetivo" })).not.toBeInTheDocument();
    expect(screen.queryByText(suggestion)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver objetivos" })).toHaveAttribute("href", "/colecciones/c1/objetivos");
    vi.mocked(listGoals).mockResolvedValue([]);
    view.rerender(<CollectionGoalPanel collectionId="c2" />);
    await screen.findByText("Esta colección todavía no tiene objetivos.");
    expect(screen.getByText("Objetivos elegidos por vos, sin progreso calculado.")).toBeInTheDocument();
    mutationsUnchanged();
  });
});
