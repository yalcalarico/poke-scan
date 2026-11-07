import type { ReactNode } from 'react';
import Link from 'next/link';
import { ScreenContainer } from '@/components/layout/screen-container';
import { buttonVariants } from '@/components/ui';
import styles from './scanner.module.css';

/** Marco editorial compartido; la cámara viva permanece fuera de este árbol. */
export function ScannerLayout({ children, busy = false }: { children: ReactNode; busy?: boolean }) {
  return <div className={styles.canvas}>
    <ScreenContainer className={styles.page} labelledBy="titulo-escanear" aria-busy={busy || undefined}>
      <header className={styles.header}>
        <div className={styles.intro}>
          <span className={styles.eyebrow}>Recorrido de escaneo</span>
          <h1 id="titulo-escanear">De carta a colección.</h1>
          <p className={styles.subtitle}>Capturar, revisar y guardar son pasos distintos.</p>
        </div>
        <Link href="/inicio" className={`${buttonVariants({ variant: 'secondary' })} ${styles.back}`}>Volver</Link>
      </header>
      {children}
    </ScreenContainer>
  </div>;
}

export function ScannerCaptureLayout({ preview, children }: { preview: ReactNode; children: ReactNode }) {
  return <div className={styles.workspace} data-scanner-workspace>
    <section aria-label="Encuadre de captura" className={styles.stage}>{preview}</section>
    <section aria-label="Opciones de captura" className={styles.controls}>{children}</section>
  </div>;
}

export function ScannerProcess() {
  return <ol aria-label="Pasos del escaneo" className={styles.process}>
    <li><b>Capturá</b><span>Iniciá la lectura</span></li>
    <li><b>Revisá</b><span>Confirmá identidad</span></li>
    <li><b>Guardá</b><span>Elegí colección</span></li>
  </ol>;
}
