import type { ReactNode } from 'react';
import Link from 'next/link';
import { ScreenContainer } from '@/components/layout/screen-container';
import { Surface, buttonVariants } from '@/components/ui';
import styles from './card-detail.module.css';

/** Marco de la ficha y su carga; los slots conservan sus fronteras interactivas. */
export function CardDetailLayout({ title, subtitle, backHref, image, prices, actions, data, children, busy = false }: {
  title: ReactNode;
  subtitle: ReactNode;
  backHref: string;
  image: ReactNode;
  prices: ReactNode;
  actions: ReactNode;
  data: ReactNode;
  children?: ReactNode;
  busy?: boolean;
}) {
  return (
    <div className={styles.canvas}>
      <ScreenContainer className={styles.page} labelledBy="titulo-carta" aria-busy={busy || undefined}>
        <header className={styles.header}>
          <div className={styles.intro}>
            <span className={styles.eyebrow}>Ficha editorial</span>
            <h1 id="titulo-carta">{title}</h1>
            <div className={styles.subtitle}>{subtitle}</div>
          </div>
          <Link href={backHref} className={`${buttonVariants({ variant: 'secondary' })} ${styles.back}`}>Volver</Link>
        </header>
        {busy ? <span role="status" aria-label="Cargando la ficha de la carta" className="sr-only">Cargando la ficha de la carta</span> : null}
        <div className={styles.workspace}>
          <Surface as="section" padded={false} aria-label="Imagen de la carta" className={`${styles.panel} ${styles.imagePanel}`}>
            {image}
          </Surface>
          <div className={styles.content}>
            <div data-card-detail-prices className={styles.prices}>{prices}</div>
            <Surface as="section" padded={false} aria-labelledby="guardar-carta" className={styles.panel}>
              <h2 id="guardar-carta" className={styles.sectionTitle}>Elegí dónde guardarla</h2>
              {actions}
            </Surface>
            <Surface as="section" padded={false} aria-labelledby="datos-carta" className={styles.panel}>
              <h2 id="datos-carta" className={styles.sectionTitle}>Datos de la carta</h2>
              {data}
            </Surface>
          </div>
        </div>
        {children}
      </ScreenContainer>
    </div>
  );
}
