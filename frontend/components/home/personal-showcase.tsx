"use client";

import Link from "next/link";
import { CardTile } from "@/components/cards/card-tile";
import { Money } from "@/components/cards/money";
import { ErrorState, Surface, buttonVariants } from "@/components/ui";
import { useAuth } from "@/hooks/use-auth";
import { useAsync } from "@/hooks/use-async";
import { getShowcase } from "@/lib/api/showcase";
import { variantLabel } from "@/lib/variants";
import type { CardDto } from "@/types/api";
import { AppPreview } from "./app-preview";
import { rotateShowcase, showcaseVisit } from "./showcase-rotation";

export function PersonalShowcase({
  guestCards,
}: {
  guestCards: readonly CardDto[];
}) {
  const { user, isLoading, isAuthenticated } = useAuth();
  if (isLoading) return <p role="status">Cargando tu vitrina…</p>;
  if (!isAuthenticated || !user)
    return (
      <div data-vineta-showcase>
        <AppPreview cards={guestCards} />
        <p className="mt-3 text-caption text-secondary">
          Un vistazo al catálogo. Iniciá sesión para ver tu colección.
        </p>
      </div>
    );
  return <OwnedShowcase key={user.id} userId={user.id} />;
}
function OwnedShowcase({ userId }: { userId: string }) {
  const result = useAsync(
    async (signal) => {
      const data = await getShowcase(signal);
      return {
        ...data,
        cards:
          data.preferences.mode === "personal"
            ? rotateShowcase(data.cards, showcaseVisit(userId))
            : data.cards,
      };
    },
    [userId],
  );
  return (
    <section
      className="flex min-w-0 flex-col gap-4"
      data-vineta-showcase
      aria-label="Tu vitrina personal"
    >
      {result.status === "loading" ? (
        <p role="status">Cargando tus cartas…</p>
      ) : result.status === "error" ? (
        <ErrorState
          message={result.error ?? undefined}
          onRetry={result.reload}
        />
      ) : result.data?.cards.length ? (
        <ul className="grid grid-cols-3 gap-3" data-vineta-shelf>
          {result.data.cards.map((entry) => (
            <li key={entry.card.id} className="min-w-0">
              <CardTile card={entry.card} variant="collection" />
              <p className="mt-2 text-caption text-secondary">
                {variantLabel(entry.variant)}
              </p>
              <Money usd={entry.market} tone="positive" />
              {entry.market === null ? (
                <p className="text-caption text-secondary">Sin referencia</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <Surface className="flex flex-col gap-3">
          <h2 className="text-h2 text-primary">
            {result.data?.preferences.mode === "value"
              ? "Sin ranking disponible"
              : "Elegí tus destacadas"}
          </h2>
          <p className="text-body text-secondary">
            {result.data?.preferences.mode === "value"
              ? "Todavía no hay referencias de precio para tus cartas."
              : "Armá una selección con cartas de cualquiera de tus colecciones."}
          </p>
        </Surface>
      )}
      <p className="text-caption text-secondary">
        {result.data?.preferences.mode === "personal"
          ? "Tu selección rota al recargar, hasta tres cartas por visita."
          : "Tus tres cartas con mayor referencia unitaria disponible, sin multiplicar por cantidad."}
      </p>
      <p className="text-caption text-secondary">
        Referencia TCGplayer vía TCGCSV; no equivale a una oferta de compra.
      </p>
      <Link
        href="/inicio/vitrina"
        className={buttonVariants({ variant: "secondary" })}
      >
        Personalizar vitrina
      </Link>
    </section>
  );
}
