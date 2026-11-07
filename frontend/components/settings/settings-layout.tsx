import type { ReactNode } from 'react';
import Link from 'next/link';
import { ScreenContainer } from '@/components/layout/screen-container';
import { buttonVariants } from '@/components/ui';
import styles from './settings.module.css';

/** La cuenta conserva sus controles reales dentro del marco editorial. */
export function SettingsLayout({ children, busy = false }: { children: ReactNode; busy?: boolean }) {
  return (
    <div className={styles.canvas}>
      <ScreenContainer className={styles.page} labelledBy="ajustes-titulo" aria-busy={busy || undefined}>
        <header className={styles.header}>
          <div className={styles.intro}>
            <span className={styles.eyebrow}>Cuenta y preferencias</span>
            <h1 id="ajustes-titulo">Tu cuenta, en orden.</h1>
            <p>Datos, seguridad, colecciones y privacidad reunidos.</p>
          </div>
          <Link href="/inicio" className={`${buttonVariants({ variant: 'secondary' })} ${styles.back}`}>Volver</Link>
        </header>
        {children}
      </ScreenContainer>
    </div>
  );
}
