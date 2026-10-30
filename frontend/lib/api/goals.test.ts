import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api-client";
import { createGoal, listGoals, setNextGoal, updateGoal } from "./goals";

vi.mock("./api-client", async (original) => ({
  ...(await original<typeof import("./api-client")>()),
  apiFetch: vi.fn(),
}));
const goal = {
  id: "g/1",
  collectionId: "c/1",
  title: "Mi objetivo",
  isNext: true,
  createdAt: "2026-10-29T00:00:00.000Z",
  updatedAt: "2026-10-29T00:00:00.000Z",
};
beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});
describe("Cliente de objetivos", () => {
  it.each(["⚡".repeat(59) + "😀".repeat(31), "😀".repeat(120)])(
    "lee títulos Unicode aceptados por el backend",
    async (title) => {
      vi.mocked(apiFetch).mockResolvedValue([{ ...goal, title }]);
      await expect(listGoals("c/1")).resolves.toEqual([{ ...goal, title }]);
    },
  );

  it("codifica IDs y conserva el contrato de lectura/alta/edición/próximo", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce([goal]).mockResolvedValue(goal);
    expect(await listGoals("c/1")).toEqual([goal]);
    expect(await createGoal("c/1", "Mi objetivo")).toEqual(goal);
    expect(await updateGoal("c/1", "g/1", "Otro")).toEqual(goal);
    expect(await setNextGoal("c/1", "g/1")).toEqual(goal);
    expect(apiFetch).toHaveBeenNthCalledWith(1, "/collections/c%2F1/goals", {
      signal: undefined,
      cache: "no-store",
    });
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/collections/c%2F1/goals", {
      method: "POST",
      body: { title: "Mi objetivo" },
    });
    expect(apiFetch).toHaveBeenNthCalledWith(
      3,
      "/collections/c%2F1/goals/g%2F1",
      { method: "PATCH", body: { title: "Otro" } },
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      4,
      "/collections/c%2F1/goals/g%2F1/next",
      { method: "PATCH" },
    );
  });
  it("propaga errores sin confirmar éxito", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("Sin conexión"));
    await expect(createGoal("c/1", "Mi objetivo")).rejects.toThrow(
      "Sin conexión",
    );
  });
  it.each([
    null,
    {},
    [{ ...goal, isNext: "yes" }],
    [{ ...goal, collectionId: "foreign" }],
  ])("rechaza respuesta ilegible %j", async (value) => {
    vi.mocked(apiFetch).mockResolvedValue(value);
    await expect(listGoals("c/1")).rejects.toThrow(
      "No pudimos leer los objetivos",
    );
  });
});
