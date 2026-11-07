"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ErrorState, Surface, buttonVariants } from "@/components/ui";
import { useAsync } from "@/hooks/use-async";
import { listCollections } from "@/lib/api/collections";
import styles from "./settings.module.css";

export function AccountControls({ sharing, preferences }: { sharing?: ReactNode; preferences?: ReactNode }) {
  return (
    <div className={styles.columns}>
      <section aria-label="Cuenta y colecciones" className={styles.stack}>
        <Surface className={styles.panel}>
          <span className={styles.eyebrow}>Perfil y seguridad</span>
          <div className={styles.row}>
            <div><h2>Datos personales</h2><p className={styles.caption}>Nombre visible y correo de la cuenta.</p></div>
            <Link href="/ajustes/perfil" className={buttonVariants({ variant: "secondary" })}>Editar datos</Link>
          </div>
          <div className={styles.row}>
            <div><h3>Clave de acceso</h3><p className={styles.caption}>Actualizá tu contraseña desde un flujo protegido.</p></div>
            <Link href="/ajustes/clave" className={buttonVariants({ variant: "secondary" })}>Cambiar clave</Link>
          </div>
          <div className={styles.row}>
            <div><h3>Sesiones y dispositivos</h3><p className={styles.caption}>Podés cerrar tu sesión desde Preferencias y cuenta. No se consulta una lista de dispositivos.</p></div>
          </div>
        </Surface>
        <AccountCollections />
      </section>
      <section aria-label="Preferencias y privacidad" className={styles.stack}>
        <Surface className={`${styles.panel} ${styles.pro}`}>
          <div className={styles.between}><span className={styles.eyebrow}>Suscripción</span><span className={styles.badge}>PRO · Próximamente</span></div>
          <h2>Un lugar para PRO</h2>
          <p className={styles.description}>Acá verías tu plan, suscripción y facturación cuando estén disponibles.</p>
          <p className={styles.caption}>La versión PRO todavía no está disponible. No hay planes, cobros ni beneficios activos para mostrar.</p>
          <details><summary>Ver suscripción</summary><p className={styles.caption}>Plan no disponible. Todavía no se puede gestionar una suscripción.</p></details>
        </Surface>
        <Surface as="section" aria-labelledby="privacidad-politicas" className={styles.panel}>
          <h2 id="privacidad-politicas">Privacidad y políticas</h2>
          <p className={styles.description}>Administrá los enlaces compartidos de tus colecciones.</p>
          <details><summary>Ver políticas</summary><p className={styles.caption}>Las políticas legales todavía no están publicadas; no simulamos una aceptación ni permisos nuevos.</p></details>
          {sharing ? <div className={styles.embedded}>{sharing}</div> : <Link href="/colecciones" className={buttonVariants({ variant: "secondary" })}>Ver colecciones</Link>}
        </Surface>
        {preferences ? <Surface as="section" aria-labelledby="preferencias-cuenta" className={styles.panel}>
          <h2 id="preferencias-cuenta">Preferencias y cuenta</h2>
          <div className={styles.embedded}>{preferences}</div>
        </Surface> : null}
      </section>
    </div>
  );
}

function AccountCollections() {
  const result = useAsync(() => listCollections(), []);
  return (
    <Surface className={styles.panel}>
      <div className={styles.between}><h2>Mis colecciones</h2>{result.status === "ready" ? <span className={styles.badge}>{result.data?.length ?? 0} álbumes</span> : null}</div>
      {result.status === "loading" ? <p role="status">Cargando colecciones…</p>
        : result.status === "error" ? <ErrorState message={result.error ?? undefined} onRetry={result.reload} />
          : result.data?.length ? <ul className={styles.collectionList}>
            {result.data.map((collection) => <li key={collection.id}>
              <Link href={`/colecciones/${encodeURIComponent(collection.id)}`} className={buttonVariants({ variant: "secondary" })}>
                <span>{collection.name}</span><span aria-hidden="true">→</span>
              </Link>
            </li>)}
          </ul> : <p className={styles.description}>Todavía no creaste una colección.</p>}
      <Link href="/colecciones" className={buttonVariants({ variant: "secondary" })}>Administrar colecciones</Link>
    </Surface>
  );
}
