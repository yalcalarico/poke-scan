"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ScreenContainer } from "@/components/layout/screen-container";
import { ScreenHeader } from "@/components/layout/screen-header";
import {
  Badge,
  Button,
  ErrorState,
  Surface,
  buttonVariants,
} from "@/components/ui";
import { useAuth } from "@/hooks/use-auth";
import { useAsync } from "@/hooks/use-async";
import { getCollection } from "@/lib/api/collections";
import { listGoals, setNextGoal } from "@/lib/api/goals";
import type { CollectionGoalDto } from "@/types/api";
import { GoalEditor } from "./goal-editor";

const suggestions = [
  "Elegir mis ilustraciones favoritas",
  "Reunir versiones de mi Pokémon favorito",
  "Armar una selección para compartir",
];

export function GoalsScreen({ collectionId }: { collectionId: string }) {
  const { isLoading, isAuthenticated, user } = useAuth();
  return (
    <>
      <ScreenHeader
        title="Objetivos"
        back={{
          href: `/colecciones/${encodeURIComponent(collectionId)}`,
          label: "la colección",
        }}
      />
      <ScreenContainer>
        {isLoading ? (
          <p role="status">Cargando objetivos…</p>
        ) : !isAuthenticated ? (
          <Surface className="flex flex-col gap-4">
            <p>Iniciá sesión para ver tus objetivos.</p>
            <Link
              href="/login"
              className={buttonVariants({ variant: "primary" })}
            >
              Iniciar sesión
            </Link>
          </Surface>
        ) : (
          <OwnedGoals
            key={`${user?.id ?? "session"}:${collectionId}`}
            collectionId={collectionId}
          />
        )}
      </ScreenContainer>
    </>
  );
}

function OwnedGoals({ collectionId }: { collectionId: string }) {
  const result = useAsync(
    async (signal) => {
      const [collection, goals] = await Promise.all([
        getCollection(collectionId),
        listGoals(collectionId, signal),
      ]);
      return { collection, goals };
    },
    [collectionId],
  );
  const [editor, setEditor] = useState<{
    goal?: CollectionGoalDto;
    title?: string;
  } | null>(null);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [savingNext, setSavingNext] = useState(false);
  const pendingNext = useRef(false);
  const [error, setError] = useState<string | null>(null);

  async function chooseNext(goal: CollectionGoalDto) {
    if (pendingNext.current) return;
    pendingNext.current = true;
    setSavingNext(true);
    setError(null);
    try {
      await setNextGoal(collectionId, goal.id);
      result.reload();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No pudimos elegir el próximo objetivo.",
      );
    } finally {
      pendingNext.current = false;
      setSavingNext(false);
    }
  }

  if (result.status === "loading")
    return <p role="status">Cargando objetivos…</p>;
  if (result.status === "error")
    return (
      <ErrorState
        title="No pudimos cargar los objetivos"
        message={result.error ?? undefined}
        onRetry={result.reload}
      />
    );
  if (!result.data) return null;
  const { collection, goals } = result.data;
  const suggestion = suggestions[suggestionIndex]!;

  return (
    <div data-vineta-goals className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-h1 text-primary">Dale rumbo al álbum.</h1>
          <p className="text-body text-secondary">
            Objetivos de {collection.name}
          </p>
        </div>
        {!editor ? (
          <Button onClick={() => setEditor({})}>Crear objetivo</Button>
        ) : null}
      </header>
      {editor ? (
        <GoalEditor
          collectionId={collectionId}
          goal={editor.goal}
          initialTitle={editor.title}
          onCancel={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            result.reload();
          }}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section
            aria-label="Objetivos de esta colección"
            className="flex min-w-0 flex-col gap-4"
          >
            {error ? (
              <ErrorState
                title="No pudimos cambiar el próximo objetivo"
                message={error}
              />
            ) : null}
            {goals.length === 0 ? (
              <Surface>
                <h2 className="text-h2 text-primary">
                  Elegí tu primer objetivo
                </h2>
                <p className="text-body text-secondary">
                  Esta colección todavía no tiene objetivos. Creá uno o adaptá
                  una sugerencia.
                </p>
              </Surface>
            ) : (
              goals.map((goal) => (
                <Surface
                  key={goal.id}
                  as="article"
                  className="flex min-w-0 flex-col gap-4"
                >
                  <Badge>
                    {goal.isNext ? "Próximo objetivo" : "Objetivo de colección"}
                  </Badge>
                  <h2 className="break-words text-h2 text-primary">
                    {goal.title}
                  </h2>
                  <p className="text-caption text-secondary">
                    {collection.name} · Sin progreso calculado
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      disabled={savingNext}
                      onClick={() => setEditor({ goal })}
                    >
                      Editar objetivo
                    </Button>
                    {!goal.isNext ? (
                      <Button
                        variant="secondary"
                        disabled={savingNext}
                        onClick={() => void chooseNext(goal)}
                      >
                        Elegir como próximo
                      </Button>
                    ) : null}
                  </div>
                </Surface>
              ))
            )}
          </section>
          <Surface
            as="aside"
            aria-label="Sugerencia editorial"
            className="flex flex-col gap-4"
          >
            <Badge>Sugerencia editorial</Badge>
            <h2 className="text-h2 text-primary" aria-live="polite">
              {suggestion}
            </h2>
            <p className="text-body text-secondary">
              Una idea para adaptar, no una recomendación de compra ni un
              objetivo ya aceptado.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => setEditor({ title: suggestion })}
              >
                Usar sugerencia
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  setSuggestionIndex(
                    (index) => (index + 1) % suggestions.length,
                  )
                }
              >
                Generar otra
              </Button>
            </div>
            <p className="text-caption text-secondary">
              Sólo se agrega cuando la guardás.
            </p>
          </Surface>
        </div>
      )}
      <Link
        href={`/colecciones/${encodeURIComponent(collectionId)}`}
        className={buttonVariants({ variant: "ghost" })}
      >
        Ver colección
      </Link>
    </div>
  );
}
