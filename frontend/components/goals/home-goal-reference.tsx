"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Target } from "lucide-react";
import { Badge, Button, ErrorState, Surface, buttonVariants } from "@/components/ui";
import { useAsync } from "@/hooks/use-async";
import { listGoals } from "@/lib/api/goals";
import type { CollectionDto, CollectionGoalDto } from "@/types/api";
import { GoalEditor } from "./goal-editor";
import styles from "./home-goal-reference.module.css";

// Mismo contenido editorial de GoalsScreen, con la primera idea de la referencia.
// Se mantiene local porque esa pantalla no expone sus sugerencias como contrato.
const suggestions = [
  "Reunir versiones de mi Pokémon favorito",
  "Armar una selección para compartir",
  "Elegir mis ilustraciones favoritas",
];

export function HomeGoalReference({
  collection,
  picker,
}: {
  collection: CollectionDto;
  picker: ReactNode;
}) {
  const result = useAsync(
    (signal) => listGoals(collection.id, signal),
    [collection.id],
  );
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [editor, setEditor] = useState<{
    goal?: CollectionGoalDto;
    title?: string;
  } | null>(null);
  const next = result.data?.find((goal) => goal.isNext);
  const hasGoals = Boolean(result.data?.length);
  const ready = result.status === "ready";
  const suggestion = suggestions[suggestionIndex]!;

  return (
    <Surface
      as="section"
      aria-label="Tu próximo objetivo"
      className={styles.panel}
      data-vineta-home-goal
    >
      <header className={styles.header}>
        <h2 className={styles.heading}>Tu próximo objetivo</h2>
        {ready ? <Badge>{next ? "Objetivo" : hasGoals ? "Sin próximo objetivo" : "Sugerencia"}</Badge> : null}
      </header>
      <p className={styles.caption}>En {collection.name}</p>
      {picker}
      {result.status === "loading" ? (
        <p role="status">Cargando objetivos…</p>
      ) : result.status === "error" ? (
        <ErrorState message={result.error ?? undefined} onRetry={result.reload} />
      ) : editor ? (
        <GoalEditor
          collectionId={collection.id}
          goal={editor.goal}
          initialTitle={editor.title}
          onCancel={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            result.reload();
          }}
        />
      ) : (
        <>
          <div className={styles.goal}>
            <span className={styles.mark} aria-hidden="true">
              <Target aria-hidden="true" size={24} strokeWidth={1.75} />
            </span>
            <div className={styles.copy}>
              <h3 className={styles.headline} aria-live="polite">
                {next ? next.title : hasGoals ? "Elegí tu próximo objetivo" : suggestion}
              </h3>
              <p className={styles.caption}>
                {next ? "Objetivo elegido por vos." : hasGoals
                  ? "Elegí cuál va a ser tu próximo objetivo."
                  : "Sugerencia editorial; todavía no es un objetivo."}
              </p>
            </div>
          </div>
          {!hasGoals ? <p className={styles.caption}>Esta colección todavía no tiene objetivos.</p> : null}
          <div className={styles.actions}>
            {next ? (
              <Button variant="secondary" onClick={() => setEditor({ goal: next })}>
                Editar objetivo
              </Button>
            ) : !hasGoals ? (
              <>
                <Button variant="secondary" onClick={() => setEditor({ title: suggestion })}>
                  Usar sugerencia
                </Button>
                <Button variant="secondary" onClick={() => setSuggestionIndex((index) => (index + 1) % suggestions.length)}>
                  Generar otra
                </Button>
              </>
            ) : null}
            <Link
              href={`/colecciones/${encodeURIComponent(collection.id)}/objetivos`}
              className={buttonVariants({ variant: "secondary" })}
            >
              Ver objetivos
            </Link>
          </div>
        </>
      )}
      <p className={styles.caption}>
        Podés crear y modificar objetivos desde cada colección. Sin progreso inventado.
      </p>
    </Surface>
  );
}
