"use client";

import { useRef, useState } from "react";
import { Button, Field, Input, Surface, useFieldA11y } from "@/components/ui";
import { createGoal, updateGoal } from "@/lib/api/goals";
import type { CollectionGoalDto } from "@/types/api";

export function GoalEditor({
  collectionId,
  goal,
  initialTitle = "",
  onSaved,
  onCancel,
}: {
  collectionId: string;
  goal?: CollectionGoalDto;
  initialTitle?: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(goal?.title ?? initialTitle);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const hint =
    "De 1 a 120 caracteres. Podés adaptar la sugerencia antes de guardarla.";
  const field = useFieldA11y({ error, hint });

  async function save() {
    if (pending.current) return;
    const trimmed = title.trim();
    const length = Array.from(trimmed).length;
    if (length < 1 || length > 120) {
      setError("Escribí un objetivo de 1 a 120 caracteres.");
      return;
    }
    pending.current = true;
    setSaving(true);
    setError(null);
    try {
      if (goal) await updateGoal(collectionId, goal.id, trimmed);
      else await createGoal(collectionId, trimmed);
      onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No pudimos guardar el objetivo.",
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <Surface as="section" className="flex flex-col gap-4">
      <h2 className="text-h2 text-primary">
        {goal ? "Editar objetivo" : "Un nuevo objetivo"}
      </h2>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field
          {...field}
          label="Qué querés conseguir"
          hint={hint}
          error={error}
        >
          <Input
            id={field.id}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
            disabled={saving}
            invalid={field.invalid}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={saving} pendingLabel="Guardando…">
            Guardar objetivo
          </Button>
          <Button variant="ghost" disabled={saving} onClick={onCancel}>
            Cancelar
          </Button>
        </div>
        <p className="text-caption text-secondary">
          Se guarda en esta colección. No calculamos progreso ni compras
          pendientes.
        </p>
      </form>
    </Surface>
  );
}
