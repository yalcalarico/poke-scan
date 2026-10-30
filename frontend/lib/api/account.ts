import { ApiError, apiFetch, getApiBaseUrl } from "./api-client";
import { clearTokens, getAccessToken, getSessionEpoch } from "./token-storage";
import { withSessionMutation } from "./session-mutations";
import type { PasswordChangeResponseDto, UserDto } from "@/types/api";

export async function updateProfile(displayName: string): Promise<UserDto> {
  const result = await apiFetch<UserDto>("/users/me", {
    method: "PATCH",
    body: { displayName },
  });
  if (
    !result ||
    typeof result.id !== "string" ||
    typeof result.displayName !== "string" ||
    typeof result.email !== "string" ||
    typeof result.username !== "string" ||
    "passwordHash" in result ||
    "authVersion" in result
  )
    throw new ApiError(502, "No pudimos confirmar tus datos");
  return result;
}
export async function changePassword(
  payload: { currentPassword: string; newPassword: string },
  confirmed?: () => void,
  signal?: AbortSignal,
): Promise<PasswordChangeResponseDto> {
  const epoch = getSessionEpoch();
  return withSessionMutation(async () => {
    const token = getAccessToken();
    if (getSessionEpoch() !== epoch || !token || signal?.aborted)
      throw new ApiError(401, "La sesión cambió. Volvé a iniciar sesión.");
    // Sin apiFetch: un 401, error de red o resultado incierto nunca reenvía la clave.
    const response = await fetch(`${getApiBaseUrl()}/auth/password-changes`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      signal,
      headers: {
        "Content-Type": "application/json",
        "X-Session-Request": "1",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (getSessionEpoch() !== epoch)
      throw new ApiError(
        401,
        "La sesión cambió. Revisá tu cuenta antes de continuar.",
      );
    if (response.status !== 200)
      throw new ApiError(
        response.status,
        response.status === 429
          ? "Esperá un poco antes de volver a intentar."
          : "No pudimos cambiar la clave. Revisá tu sesión y los datos.",
      );
    const result: unknown = await response.json().catch(() => null);
    if (getSessionEpoch() !== epoch)
      throw new ApiError(401, "La sesión cambió. Volvé a iniciar sesión.");
    if (
      !result ||
      typeof result !== "object" ||
      Array.isArray(result) ||
      Object.keys(result).length !== 1 ||
      !("success" in result) ||
      result.success !== true
    )
      throw new ApiError(
        502,
        "No pudimos confirmar el resultado. Probá iniciar sesión antes de repetirlo.",
      );
    // Dentro de la cola: una sesión posterior no debe borrarse por esta respuesta.
    if (confirmed) confirmed();
    else clearTokens(epoch);
    return { success: true };
  });
}
