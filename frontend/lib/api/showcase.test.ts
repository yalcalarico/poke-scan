import { describe, it, expect, vi, beforeEach } from "vitest";
import { getShowcase, updateShowcase } from "./showcase";
import { apiFetch } from "./api-client";
vi.mock("./api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api-client")>()),
  apiFetch: vi.fn(),
}));
const valid: import('@/types/api').ShowcaseDto = { preferences: { mode: "personal", cardIds: [] }, cards: [] };
beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});
describe("Cliente de vitrina", () => {
  it("lee preferencias reales sin caché", async () => {
    vi.mocked(apiFetch).mockResolvedValue(valid);
    expect(await getShowcase()).toEqual(valid);
    expect(apiFetch).toHaveBeenCalledWith(
      "/showcase",
      expect.objectContaining({ cache: "no-store" }),
    );
  });
  it("guarda sólo el payload explícito y propaga errores", async () => {
    vi.mocked(apiFetch).mockResolvedValue(valid);
    expect(await updateShowcase({ mode: "personal", cardIds: [] })).toEqual(
      valid,
    );
    expect(apiFetch).toHaveBeenCalledWith(
      "/showcase",
      expect.objectContaining({ method: "PATCH", body: valid.preferences }),
    );
    vi.mocked(apiFetch).mockRejectedValue(new Error("Sin red"));
    await expect(updateShowcase(valid.preferences)).rejects.toThrow("Sin red");
  });
  it.each([
    { ...valid, preferences: { mode: ["value"], cardIds: [] } },
    null,
    { ...valid, preferences: { mode: "other", cardIds: [] } },
    { ...valid, cards: [{ market: -1 }] },
  ])("rechaza respuestas inválidas sin inventar datos", async (raw) => {
    vi.mocked(apiFetch).mockResolvedValue(raw);
    await expect(getShowcase()).rejects.toThrow();
  });
});
