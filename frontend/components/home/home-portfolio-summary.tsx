"use client";

import type { ReactNode } from "react";
import { useId } from "react";
import Link from "next/link";
import { Money } from "@/components/cards/money";
import { ErrorState, Surface, buttonVariants } from "@/components/ui";
import { useAuth } from "@/hooks/use-auth";
import { useAsync } from "@/hooks/use-async";
import { useCurrency } from "@/hooks/use-currency";
import { getPortfolio } from "@/lib/api/collections";
import { pluralize } from "@/lib/format";
import styles from "./home-value-panel.module.css";

const count = new Intl.NumberFormat("es-AR");

export function HomePortfolioSummary() {
  const { user, isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <p role="status">Cargando tu colección…</p>;
  if (!isAuthenticated || !user) {
    return (
      <ValuePanel>
        <ReferenceValue usd={null} />
        <p>
          Guardá tus cartas, consultá referencias de valor y compartí lo que
          elegís mostrar.
        </p>
      </ValuePanel>
    );
  }
  return <OwnedSummary key={user.id} />;
}

function ValuePanel({ children, owned = false }: { children: ReactNode; owned?: boolean }) {
  const { currency, setCurrency, isAvailable, isLoading, activeRate, isStale } = useCurrency();
  const currencyHintId = useId();
  const nextCurrency = currency === "USD" ? "ARS" : "USD";
  const unavailable = nextCurrency === "ARS" && (isLoading || !isAvailable || !activeRate);
  const currencyHint = isLoading
    ? "Cargando cotización…"
    : !isAvailable || !activeRate
      ? "ARS no disponible: no hay cotización."
      : currency === "ARS"
        ? `Cotización ${activeRate.rateType}${isStale ? " anterior" : " disponible"}.`
        : null;

  return (
    <Surface as="section" className={styles.panel} aria-label="Valor de referencia">
      <div className={styles.header}>
        <h2>Valor de referencia</h2>
        <button
          type="button"
          className={styles.currency}
          aria-label={`Cambiar a ${nextCurrency}`}
          aria-describedby={currencyHint ? currencyHintId : undefined}
          disabled={unavailable}
          onClick={() => setCurrency(nextCurrency)}
        >
          <span>{currency}</span>
        </button>
      </div>
      {children}
      {currencyHint ? <p id={currencyHintId} className={styles.caption}>{currencyHint}</p> : null}
      <div className={styles.warning}>
        TCGplayer vía TCGCSV, no precio de venta local. Una conversión a ARS
        no equivale a un precio de venta local.
      </div>
      <details className={styles.calculation}>
        <summary>Cómo se calcula</summary>
        <div className={styles.explanation}>
          <p className={styles.caption}>
            Sólo se suman copias con precio para su variante. Un total parcial
            indica cartas sin referencia; la condición registrada no ajusta
            esa referencia. La conversión a ARS usa la cotización disponible
            elegida en tu configuración.
          </p>
          <Link href="/colecciones" className={buttonVariants({ variant: "secondary" })}>
            {owned ? "Ver evolución" : "Ver colecciones"}
          </Link>
        </div>
      </details>
    </Surface>
  );
}

function ReferenceValue({ usd }: { usd: number | null }) {
  return (
    <Money
      usd={usd}
      tone="positive"
      size="lg"
      className={styles.value}
      aria-label={usd === null ? "Sin referencia de valor" : undefined}
    />
  );
}

function OwnedSummary() {
  const result = useAsync(getPortfolio, []);
  return (
    <ValuePanel owned>
      {result.status === "loading" ? (
        <p role="status">Cargando valoración…</p>
      ) : result.status === "error" ? (
        <ErrorState message={result.error ?? undefined} onRetry={result.reload} />
      ) : result.data ? (
        <>
          <ReferenceValue usd={result.data.valueUsd} />
          <p>
            {count.format(result.data.totalCards)}{" "}
            {pluralize(result.data.totalCards, "carta", "cartas")}
            {result.data.unpricedCards > 0
              ? ` · ${count.format(result.data.unpricedCards)} sin referencia`
              : ""}
          </p>
          <p className={styles.caption}>
            {result.data.unpricedCards > 0
              ? "Valor parcial: sólo suma copias con referencia."
              : "Referencia de las copias con precio disponible."}
          </p>
        </>
      ) : null}
    </ValuePanel>
  );
}
