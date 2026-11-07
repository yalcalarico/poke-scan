import type { ReactNode } from 'react';
import { ScreenContainer } from '@/components/layout/screen-container';
import styles from './collections.module.css';

/** Marco local: no altera el shell ni los proveedores compartidos. */
export function CollectionsFrame({ title, label, description, actions, busy, children }: {
  title: ReactNode;
  label: string;
  description?: ReactNode;
  actions?: ReactNode;
  busy?: boolean;
  children: ReactNode;
}) {
  return <div className={styles.canvas}>
    <ScreenContainer bleed className={styles.page} labelledBy="titulo-colecciones" aria-busy={busy || undefined}>
      <header className={styles.header}>
        <div className={styles.stack}>
          <p className={styles.eyebrow}>{label}</p>
          <h1 id="titulo-colecciones">{title}</h1>
          {description ? <p className="text-secondary">{description}</p> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </header>
      {children}
    </ScreenContainer>
  </div>;
}

/** Los slots mantienen montada la lista durante sus requests y refrescos. */
export function CollectionWorkspace({ children, sidebar }: { children: ReactNode; sidebar?: ReactNode }) {
  return <div className={sidebar ? styles.workspace : styles.stack}>
    <div className={styles.stack}>{children}</div>
    {sidebar ? <aside className={styles.stack} aria-label="Objetivos, valor e intercambio">{sidebar}</aside> : null}
  </div>;
}
