import { ApiError, apiFetch } from "./api-client";
import { toCardDto } from "./schema";
import { VARIANT_OPTIONS } from "@/lib/variants";
import type {
  CardVariant,
  ShowcaseDto,
  ShowcasePreferenceDto,
} from "@/types/api";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parse(raw: unknown): ShowcaseDto {
  const invalid = () => new ApiError(502, "No pudimos leer tu vitrina");
  if (
    !record(raw) ||
    !record(raw.preferences) ||
    (raw.preferences.mode !== "value" && raw.preferences.mode !== "personal") ||
    !Array.isArray(raw.preferences.cardIds) ||
    !raw.preferences.cardIds.every(
      (id): id is string => typeof id === "string" && id.length > 0,
    ) ||
    new Set(raw.preferences.cardIds).size !== raw.preferences.cardIds.length ||
    !Array.isArray(raw.cards)
  )
    throw invalid();
  const mode = raw.preferences.mode === "personal" ? "personal" : "value";
  const cardIds = raw.preferences.cardIds;
  const cards = raw.cards.map((entry: unknown) => {
    if (!record(entry)) throw invalid();
    const card = toCardDto(entry.card);
    if (
      !card ||
      !VARIANT_OPTIONS.some((option) => option.value === entry.variant) ||
      entry.currency !== "USD" ||
      !(
        entry.market === null ||
        (typeof entry.market === "number" &&
          Number.isFinite(entry.market) &&
          entry.market >= 0)
      ) ||
      !(
        entry.fetchedAt === null ||
        (typeof entry.fetchedAt === "string" &&
          Number.isFinite(Date.parse(entry.fetchedAt)))
      )
    )
      throw invalid();
    if (mode === "personal" && !cardIds.includes(card.id)) throw invalid();
    if (entry.market !== null && entry.fetchedAt === null) throw invalid();
    return {
      card,
      variant: entry.variant as CardVariant,
      market: entry.market,
      currency: "USD" as const,
      fetchedAt: entry.fetchedAt,
    };
  });
  if (
    new Set(cards.map((c) => c.card.id)).size !== cards.length ||
    (mode === "value" &&
      (cards.length > 3 || cards.some((c) => c.market === null)))
  )
    throw invalid();
  return { preferences: { mode, cardIds }, cards };
}
export async function getShowcase(signal?: AbortSignal): Promise<ShowcaseDto> {
  return parse(
    await apiFetch<unknown>("/showcase", { signal, cache: "no-store" }),
  );
}
export async function updateShowcase(
  preferences: ShowcasePreferenceDto,
): Promise<ShowcaseDto> {
  return parse(
    await apiFetch<unknown>("/showcase", {
      method: "PATCH",
      body: preferences,
    }),
  );
}
