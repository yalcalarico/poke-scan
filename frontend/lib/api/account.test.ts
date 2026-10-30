import { beforeEach, describe, it, expect, vi } from "vitest";
import { changePassword } from "./account";
import { clearTokens, getAccessToken, setTokens } from "./token-storage";
const payload = {
  currentPassword: "Current fixture 1",
  newPassword: "Replacement fixture 2",
};
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  clearTokens();
  setTokens("old-access-fixture");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
describe("Cambio de clave sin replay", () => {
  it("envía un POST único y confirma antes de limpiar sólo su sesión", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    await expect(changePassword(payload)).resolves.toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/auth\/password-changes$/);
    expect(options).toMatchObject({
      method: "POST",
      cache: "no-store",
      redirect: "error",
      credentials: "include",
      body: JSON.stringify(payload),
    });
    expect(new Headers(options?.headers).get("X-Session-Request")).toBe("1");
    expect(new Headers(options?.headers).get("Authorization")).toBe(
      "Bearer old-access-fixture",
    );
    expect(getAccessToken()).toBeNull();
  });
  it.each([401, 429, 500])("no refresca ni reenvía ante %i", async (status) => {
    fetchMock.mockResolvedValue(new Response("{}", { status }));
    await expect(changePassword(payload)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBe("old-access-fixture");
  });
  it("no declara éxito con un resultado incierto", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: false }), { status: 200 }),
    );
    const confirmed = vi.fn();
    await expect(changePassword(payload, confirmed)).rejects.toThrow();
    expect(confirmed).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe("old-access-fixture");
  });
  it("una respuesta vieja no borra una sesión nueva", async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockReturnValue(
      new Promise<Response>((done) => {
        resolve = done;
      }),
    );
    const confirmed = vi.fn();
    const pending = changePassword(payload, confirmed);
    const observed = pending.then(
      (value) => ({ value, error: null }),
      (error) => ({ value: null, error: error as Error }),
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    setTokens("newer-access-fixture");
    resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
    expect((await observed).error?.message).toContain("sesión");
    expect(confirmed).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe("newer-access-fixture");
  });
});
