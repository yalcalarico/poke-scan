import { apiFetch } from "./api-client";
import type {
  VisualIdentifyRequestDto,
  VisualIdentifyResponseDto,
} from "@/types/api";
export function identifyVisual(
  body: VisualIdentifyRequestDto,
  signal: AbortSignal,
): Promise<VisualIdentifyResponseDto> {
  return apiFetch("/cards/identify-visual", { method: "POST", body, signal });
}
