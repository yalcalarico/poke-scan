import Link from 'next/link';
import type { ReactNode } from 'react';
import { ScreenContainer } from '@/components/layout/screen-container';
import { buttonVariants } from '@/components/ui';
import { cn } from '@/lib/cn';
import styles from './search.module.css';

/** Marco compartido por la ruta y su loading; no depende de la URL ni de la API. */
export function SearchPage({ children, busy = false }: { children: ReactNode; busy?: boolean }) {
  return (
    <div className={styles.canvas}>
      <ScreenContainer className={styles.page} aria-busy={busy || undefined}>
        <header className={styles.header}>
          <div className={styles.intro}>
            <span className={styles.eyebrow}>Catálogo Pokémon</span>
            <h1>Buscá tu próximo hallazgo.</h1>
            <p>Combiná nombre y set. Explorá por número, artista o rareza y elegí cómo ordenar los resultados.</p>
          </div>
          <Link href="/escanear" prefetch={false} className={cn(buttonVariants(), styles.action)}>Escanear carta</Link>
        </header>
        {children}
      </ScreenContainer>
    </div>
  );
}

export function SearchOptionsCard({ children }: { children: ReactNode }) {
  return (
    <section className={cn(styles.panel, styles.options)} aria-label="Más opciones">
      <h2>Más opciones</h2>
      {children}
    </section>
  );
}

export function SearchWorkspace({ children, className, sidebar, results }: {
  children: ReactNode;
  className?: string;
  sidebar?: ReactNode;
  results?: ReactNode;
}) {
  return (
    <div className={cn(styles.workspace, className)}>
      <section className={styles.content} aria-label="Búsqueda y filtros">{children}</section>
      <div className={styles.sidebar}>
        <aside className={cn(styles.panel, styles.guide)} aria-label="Explorar con intención">
          <span className={styles.eyebrow}>Explorar con intención</span>
          <h2>Encontrá la indicada</h2>
          <p className={styles.caption}>Set es la expansión a la que pertenece una carta.</p>
          <p className={styles.caption}>Los filtros se combinan; el orden no descarta resultados.</p>
          <Link href="/colecciones" prefetch={false} className={cn(buttonVariants({ variant: 'secondary' }), styles.action)}>Ver objetivos</Link>
        </aside>
        {sidebar}
      </div>
      {results ? <div className={styles.results}>{results}</div> : null}
    </div>
  );
}
