import { Skeleton } from '@/components/ui';
import { SettingsLayout } from '@/components/settings/settings-layout';
import styles from '@/components/settings/settings.module.css';

/** Conserva el encabezado y las columnas sin inventar una cuenta cargada. */
export default function SettingsLoading() {
  return (
    <SettingsLayout busy>
      <div role="status" aria-label="Cargando tus ajustes" className={styles.stack}>
        <div className={`${styles.panel} ${styles.identity}`} aria-hidden="true">
          <Skeleton variant="avatar" className="size-16" />
          <div className="flex min-w-0 flex-1 flex-col gap-2"><Skeleton className="h-6 w-40" /><Skeleton className="h-4 w-52" /></div>
        </div>
        <div className={styles.columns}>
          <section aria-label="Cuenta y colecciones" className={styles.stack}>
            {[0, 1].map((index) => <div className={styles.panel} aria-hidden="true" key={index}><Skeleton className="h-6 w-40" /><Skeleton className="h-24" /></div>)}
          </section>
          <section aria-label="Preferencias y privacidad" className={styles.stack}>
            {[0, 1, 2].map((index) => <div className={styles.panel} aria-hidden="true" key={index}><Skeleton className="h-6 w-40" /><Skeleton className="h-24" /></div>)}
          </section>
        </div>
      </div>
    </SettingsLayout>
  );
}
