"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ErrorState,
  Field,
  Select,
  Surface,
  buttonVariants,
} from "@/components/ui";
import { useAuth } from "@/hooks/use-auth";
import { useAsync } from "@/hooks/use-async";
import { listCollections } from "@/lib/api/collections";
import { listGoals } from "@/lib/api/goals";
import type { CollectionDto } from "@/types/api";

export function CollectionGoalPanel({
  collectionId,
}: {
  collectionId: string;
}) {
  const { isLoading, isAuthenticated, user } = useAuth();
  if (isLoading) return <p role="status">Cargando objetivos…</p>;
  if (!isAuthenticated)
    return (
      <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
        Iniciar sesión
      </Link>
    );
  return (
    <OwnedGoalPanel
      key={`${user?.id ?? "session"}:${collectionId}`}
      collectionId={collectionId}
    />
  );
}

function OwnedGoalPanel({ collectionId }: { collectionId: string }) {
  const result = useAsync(
    (signal) => listGoals(collectionId, signal),
    [collectionId],
  );
  const next = result.data?.find((goal) => goal.isNext);
  return (
    <Surface
      as="section"
      aria-label="Tu próximo objetivo"
      className="flex min-w-0 flex-col gap-4"
    >
      <h2 className="text-h2 text-primary">Tu próximo objetivo</h2>
      {result.status === "loading" ? (
        <p role="status">Cargando objetivos…</p>
      ) : result.status === "error" ? (
        <ErrorState
          message={result.error ?? undefined}
          onRetry={result.reload}
        />
      ) : next ? (
        <p className="break-words text-body-strong text-primary">
          {next.title}
        </p>
      ) : (
        <p className="text-body text-secondary">
          {result.data?.length
            ? "Elegí cuál va a ser tu próximo objetivo."
            : "Esta colección todavía no tiene objetivos."}
        </p>
      )}
      <Link
        href={`/colecciones/${encodeURIComponent(collectionId)}/objetivos`}
        className={buttonVariants({ variant: "secondary" })}
      >
        Ver objetivos
      </Link>
      <p className="text-caption text-secondary">
        Objetivos elegidos por vos, sin progreso calculado.
      </p>
    </Surface>
  );
}

export function HomeGoalPanel() {
  const { isLoading, isAuthenticated, user } = useAuth();
  if (isLoading) return <p role="status">Cargando objetivos…</p>;
  if (!isAuthenticated)
    return (
      <Surface className="flex flex-col gap-4">
        <h2 className="text-h2 text-primary">Tu próximo objetivo</h2>
        <p className="text-body text-secondary">
          Iniciá sesión para darle rumbo a tus colecciones.
        </p>
        <Link
          href="/login"
          className={buttonVariants({ variant: "secondary" })}
        >
          Iniciar sesión
        </Link>
      </Surface>
    );
  return <HomeCollections key={user?.id ?? "session"} />;
}

function HomeCollections() {
  const result = useAsync(() => listCollections(), []);
  if (result.status === "loading")
    return <p role="status">Cargando objetivos…</p>;
  if (result.status === "error")
    return (
      <ErrorState
        title="No pudimos cargar tus colecciones"
        message={result.error ?? undefined}
        onRetry={result.reload}
      />
    );
  if (!result.data?.length)
    return (
      <Surface className="flex flex-col gap-4">
        <h2 className="text-h2 text-primary">Tu próximo objetivo</h2>
        <p className="text-body text-secondary">
          Creá una colección para guardar tus objetivos.
        </p>
        <Link
          href="/colecciones"
          className={buttonVariants({ variant: "secondary" })}
        >
          Ver colecciones
        </Link>
      </Surface>
    );
  return <HomeCollectionPicker collections={result.data} />;
}

function HomeCollectionPicker({
  collections,
}: {
  collections: CollectionDto[];
}) {
  const [selectedId, setSelectedId] = useState(
    (collections.find((collection) => collection.isDefault) ?? collections[0])!
      .id,
  );
  return (
    <div className="flex min-w-0 flex-col gap-4" data-vineta-home-goal>
      <Field id="home-goal-collection" label="Objetivos de la colección">
        <Select
          id="home-goal-collection"
          aria-label="Objetivos de la colección"
          value={selectedId}
          onChange={setSelectedId}
          options={collections.map((collection) => ({
            value: collection.id,
            label: collection.name,
          }))}
        />
      </Field>
      <CollectionGoalPanel key={selectedId} collectionId={selectedId} />
    </div>
  );
}
