import type { Metadata } from "next";
import Link from "next/link";
import { AppMark } from "@/components/brand";
import { ScreenContainer } from "@/components/layout/screen-container";
import { HomeCta, ScanSessionResume, fetchPreviewCards } from "@/components/home";
import { PersonalShowcase } from "@/components/home/personal-showcase";
import { HomeGallery } from "@/components/home/home-gallery";
import { HomePortfolioSummary } from "@/components/home/home-portfolio-summary";
import { HomeGoalPanel } from "@/components/goals/home-goal-panel";
import { InstallCta } from "@/components/share";
import { buttonVariants } from "@/components/ui";
import styles from "@/components/home/home-screen.module.css";

export const metadata: Metadata = {
  title: "Inicio",
  description: "Tus cartas, tus colecciones y tu próximo objetivo.",
  robots: { index: false, follow: false },
};

export default async function HomePage() {
  const previewCards = await fetchPreviewCards();
  return (
    <ScreenContainer labelledBy="home-title" className={styles.home}>
      <header className={styles.mobileHeader}><AppMark size={36} /><span>PokéScan</span></header>
      <ScanSessionResume />
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.copy}>
          <div className={styles.intro}>
          <span className={styles.eyebrow}>VIÑETA / Tu colección viva</span>
          <h1 id="home-title">Tus cartas<br />cuentan historias.</h1>
          <p>Guardalas en un lugar propio. Descubrí su valor y elegí cuál va a ser tu próximo hallazgo.</p>
          </div>
          <HomeCta />
          <p className="text-caption text-secondary">Tu colección y tus acciones, conectadas a tu cuenta.</p>
        </div>
        <PersonalShowcase guestCards={previewCards} />
      </section>
      <div className={styles.columns}>
        <div className={styles.stack}>
          <section className={styles.stack}>
            <header className={styles.sectionLabel}>
              <div><span className="text-overline text-secondary">Tu vitrina</span><h2>Cartas que cuentan algo.</h2></div>
              <Link href="/buscar" className={buttonVariants({ variant: "secondary" })}>Ver todas</Link>
            </header>
            <HomeGallery guestCards={previewCards} />
          </section>
          <section className={styles.share}>
            <div className={styles.stack}>
              <span className={styles.badge}>Compartir con intención</span>
              <h2>Una vitrina para mostrar.</h2>
              <p>Elegí una colección y revisá qué querés compartir antes de publicar su enlace.</p>
            </div>
            <Link href="/colecciones" className={buttonVariants({ variant: "secondary" })}>Elegir colección</Link>
          </section>
        </div>
        <aside className={styles.sidebar}><HomePortfolioSummary /><HomeGoalPanel /></aside>
      </div>
      <footer className={styles.footer}><InstallCta /></footer>
    </ScreenContainer>
  );
}
