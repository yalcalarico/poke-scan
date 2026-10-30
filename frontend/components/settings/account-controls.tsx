"use client";
import Link from "next/link";
import { ErrorState, Surface, buttonVariants } from "@/components/ui";
import { useAsync } from "@/hooks/use-async";
import { listCollections } from "@/lib/api/collections";

export function AccountControls() {
  return (
    <>
      <Surface className="flex flex-col gap-4">
        <h2 className="text-h2 text-primary">Perfil y seguridad</h2>
        <p className="text-body text-secondary">
          Revisá tus datos y mantené tu clave al día.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/ajustes/perfil"
            className={buttonVariants({ variant: "secondary" })}
          >
            Editar datos
          </Link>
          <Link
            href="/ajustes/clave"
            className={buttonVariants({ variant: "secondary" })}
          >
            Cambiar clave
          </Link>
        </div>
      </Surface>
      <AccountCollections />
      <Surface className="flex flex-col gap-4">
        <h2 className="text-h2 text-primary">Privacidad y políticas</h2>
        <p className="text-body text-secondary">
          Administrá los enlaces de tus colecciones desde Compartir. Las
          políticas legales todavía no están publicadas; no simulamos una
          aceptación ni permisos nuevos.
        </p>
        <Link
          href="/colecciones"
          className={buttonVariants({ variant: "secondary" })}
        >
          Ver colecciones
        </Link>
      </Surface>
      <Surface className="flex flex-col gap-3">
        <span className="text-overline text-secondary">PRO · Próximamente</span>
        <h2 className="text-h2 text-primary">Suscripción</h2>
        <p className="text-body text-secondary">
          La versión PRO todavía no está disponible. No hay planes, cobros ni
          beneficios activos para mostrar.
        </p>
      </Surface>
    </>
  );
}
function AccountCollections() {
  const result = useAsync(() => listCollections(), []);
  return (
    <Surface className="flex flex-col gap-4">
      <h2 className="text-h2 text-primary">Mis colecciones</h2>
      {result.status === "loading" ? (
        <p role="status">Cargando colecciones…</p>
      ) : result.status === "error" ? (
        <ErrorState
          message={result.error ?? undefined}
          onRetry={result.reload}
        />
      ) : result.data?.length ? (
        <ul className="flex flex-col gap-2">
          {result.data.map((collection) => (
            <li key={collection.id}>
              <Link
                href={`/colecciones/${encodeURIComponent(collection.id)}`}
                className={buttonVariants({ variant: "ghost" })}
              >
                {collection.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body text-secondary">
          Todavía no creaste una colección.
        </p>
      )}
      <Link
        href="/colecciones"
        className={buttonVariants({ variant: "secondary" })}
      >
        Administrar colecciones
      </Link>
    </Surface>
  );
}
