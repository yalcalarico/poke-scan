"use client";
import Link from "next/link";
import { Money } from "@/components/cards/money";
import { ErrorState, Surface, buttonVariants } from "@/components/ui";
import { useAuth } from "@/hooks/use-auth";
import { useAsync } from "@/hooks/use-async";
import { getPortfolio } from "@/lib/api/collections";
import { pluralize } from "@/lib/format";
const count = new Intl.NumberFormat("es-AR");
export function HomePortfolioSummary() {
  const { user, isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <p role="status">Cargando tu colección…</p>;
  if (!isAuthenticated || !user)
    return (
      <Surface className="flex flex-col gap-4">
        <h2 className="text-h2 text-primary">Tu colección, más clara</h2>
        <p className="text-body text-secondary">
          Guardá tus cartas, consultá referencias de valor y compartí lo que
          elegís mostrar.
        </p>
        <Link
          href="/colecciones"
          className={buttonVariants({ variant: "secondary" })}
        >
          Ver colecciones
        </Link>
      </Surface>
    );
  return <OwnedSummary key={user.id} />;
}
function OwnedSummary() {
  const result = useAsync(getPortfolio, []);
  return (
    <Surface className="flex flex-col gap-4">
      <h2 className="text-overline text-secondary">Valor de referencia</h2>
      {result.status === "loading" ? (
        <p role="status">Cargando valoración…</p>
      ) : result.status === "error" ? (
        <ErrorState
          message={result.error ?? undefined}
          onRetry={result.reload}
        />
      ) : result.data ? (
        <>
          <Money usd={result.data.valueUsd} tone="positive" size="lg" />
          <p className="text-body text-secondary">
            {count.format(result.data.totalCards)}{" "}
            {pluralize(result.data.totalCards, "carta", "cartas")}
            {result.data.unpricedCards > 0
              ? ` · ${count.format(result.data.unpricedCards)} sin referencia`
              : ""}
          </p>
          <p className="text-caption text-secondary">
            {result.data.unpricedCards > 0
              ? "Valor parcial: sólo suma copias con referencia."
              : "Referencia de las copias con precio disponible."}{" "}
            TCGplayer vía TCGCSV, no precio de venta local.
          </p>
        </>
      ) : null}
      <Link
        href="/colecciones"
        className={buttonVariants({ variant: "secondary" })}
      >
        Ver evolución
      </Link>
    </Surface>
  );
}
