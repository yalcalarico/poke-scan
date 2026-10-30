import type { Metadata } from "next";
import { AppMark } from "@/components/brand";
import { ScreenContainer } from "@/components/layout/screen-container";
import {
  FeatureGrid,
  HomeCta,
  ScanSessionResume,
  fetchPreviewCards,
} from "@/components/home";
import { PersonalShowcase } from "@/components/home/personal-showcase";
import { HomePortfolioSummary } from "@/components/home/home-portfolio-summary";
import { HomeGoalPanel } from "@/components/goals/home-goal-panel";
import { InstallCta } from "@/components/share";

export const metadata: Metadata = {
  title: "Inicio",
  description: "Tus cartas, tus colecciones y tu próximo objetivo.",
  robots: { index: false, follow: false },
};

/** El catálogo público se resuelve en servidor; la cuenta se consulta después del bootstrap cliente. */
export default async function HomePage() {
  const previewCards = await fetchPreviewCards();
  return (
    <ScreenContainer
      labelledBy="home-title"
      className="flex flex-col gap-6 sm:gap-8"
    >
      <ScanSessionResume />
      <section data-vineta-hero aria-labelledby="home-title">
        <div data-vineta-copy>
          <AppMark size={48} />
          <p className="text-overline text-secondary">Tu colección viva</p>
          <h1
            id="home-title"
            className="text-display text-primary sm:text-display-lg"
          >
            Tus cartas cuentan historias.
          </h1>
          <p className="text-body text-secondary">
            Escaneá, revisá y elegí una colección para guardar. Descubrí su
            valor y dale rumbo a tu próximo hallazgo.
          </p>
          <HomeCta />
        </div>
        <PersonalShowcase guestCards={previewCards} />
      </section>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <HomePortfolioSummary />
        <HomeGoalPanel />
      </div>
      <FeatureGrid />
      <footer className="flex flex-col items-center gap-5 border-t border-line-subtle pt-8">
        <p className="text-caption text-secondary">
          Escaneá, coleccioná y compartí con PokéScan.
        </p>
        <InstallCta />
      </footer>
    </ScreenContainer>
  );
}
