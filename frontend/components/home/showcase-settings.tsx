"use client";

import { useState } from "react";
import {
  Button,
  Checkbox,
  ErrorState,
  Field,
  Select,
  Surface,
} from "@/components/ui";
import { useAuth } from "@/hooks/use-auth";
import { useAsync } from "@/hooks/use-async";
import { listCollections, listItems } from "@/lib/api/collections";
import { getShowcase, updateShowcase } from "@/lib/api/showcase";
import { getSessionEpoch } from "@/lib/api/token-storage";
import type { ShowcaseDto } from "@/types/api";

export function ShowcaseSettings() {
  const { user, isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <p role="status">Cargando sesión…</p>;
  if (!isAuthenticated || !user)
    return <p>Iniciá sesión para personalizar tu vitrina.</p>;
  return <SettingsLoader key={user.id} />;
}
function SettingsLoader() {
  const result = useAsync((signal) => getShowcase(signal), []);
  if (result.status === "loading")
    return <p role="status">Cargando preferencias…</p>;
  if (result.status === "error" || !result.data)
    return (
      <ErrorState message={result.error ?? undefined} onRetry={result.reload} />
    );
  return <ShowcaseForm initial={result.data} />;
}
function ShowcaseForm({ initial }: { initial: ShowcaseDto }) {
  const [mode, setMode] = useState(initial.preferences.mode),
    [selected, setSelected] = useState(initial.preferences.cardIds);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const collections = useAsync(() => listCollections(), []);
  const [collectionId, setCollectionId] = useState("");
  async function save() {
    const epoch = getSessionEpoch();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const saved = await updateShowcase({
        mode,
        cardIds: mode === "value" ? [] : selected,
      });
      if (getSessionEpoch() !== epoch) return;
      setSelected(saved.preferences.cardIds);
      setMessage("Vitrina guardada en tu cuenta.");
    } catch {
      if (getSessionEpoch() === epoch)
        setError(
          "No pudimos confirmar el guardado. Tus cambios siguen acá; revisá la conexión.",
        );
    } finally {
      if (getSessionEpoch() === epoch) setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-6">
      <Surface className="flex flex-col gap-4">
        <Field label="Qué querés mostrar">
          <Select
            value={mode}
            onChange={(value) =>
              setMode(value === "personal" ? "personal" : "value")
            }
            disabled={busy}
            options={[
              { value: "value", label: "Mis más valiosas" },
              { value: "personal", label: "Mi selección" },
            ]}
          />
        </Field>
        <p className="text-body text-secondary">
          {mode === "value"
            ? "Hasta tres cartas según su referencia unitaria, sin duplicarlas entre álbumes. Sin precios no se inventa un ranking."
            : "Elegí hasta 60 cartas de tus colecciones. Tres se muestran por visita y rotan al recargar."}
        </p>
      </Surface>
      {mode === "personal" ? (
        <Surface className="flex flex-col gap-4">
          <h2 className="text-h2 text-primary">De tus colecciones</h2>
          <p className="text-body text-secondary">
            {selected.length} cartas seleccionadas
          </p>
          <Button
            variant="ghost"
            disabled={busy || !selected.length}
            onClick={() => setSelected([])}
          >
            Limpiar selección
          </Button>
          {collections.status === "loading" ? (
            <p role="status">Cargando colecciones…</p>
          ) : collections.status === "error" ? (
            <ErrorState
              message={collections.error ?? undefined}
              onRetry={collections.reload}
            />
          ) : !collections.data?.length ? (
            <p>Creá una colección y sumá cartas para elegirlas acá.</p>
          ) : (
            <Field label="Colección">
              <Select
                value={collectionId}
                onChange={setCollectionId}
                disabled={busy}
                options={[
                  { value: "", label: "Elegí una colección" },
                  ...collections.data.map((c) => ({
                    value: c.id,
                    label: c.name,
                  })),
                ]}
              />
            </Field>
          )}
          {collectionId ? (
            <Candidates
              key={collectionId}
              collectionId={collectionId}
              selected={selected}
              disabled={busy}
              onToggle={(id) =>
                setSelected((prev) =>
                  prev.includes(id)
                    ? prev.filter((value) => value !== id)
                    : prev.length < 60
                      ? [...prev, id]
                      : prev,
                )
              }
            />
          ) : null}
        </Surface>
      ) : null}
      {error ? (
        <p role="alert" className="text-body text-negative">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="text-body text-positive">
          {message}
        </p>
      ) : null}
      <Button
        loading={busy}
        pendingLabel="Guardando…"
        onClick={() => void save()}
      >
        Guardar vitrina
      </Button>
    </div>
  );
}
function Candidates({
  collectionId,
  selected,
  disabled,
  onToggle,
}: {
  collectionId: string;
  selected: string[];
  disabled: boolean;
  onToggle: (id: string) => void;
}) {
  const [page, setPage] = useState(1);
  const result = useAsync(
    (signal) => listItems(collectionId, { page, pageSize: 24 }, signal),
    [collectionId, page],
  );
  if (result.status === "loading") return <p role="status">Cargando cartas…</p>;
  if (result.status === "error")
    return (
      <ErrorState message={result.error ?? undefined} onRetry={result.reload} />
    );
  const cards = [
    ...new Map(
      result.data?.data.map((item) => [item.card.id, item.card]) ?? [],
    ).values(),
  ];
  return (
    <div className="flex flex-col gap-3">
      {cards.length ? (
        cards.map((card) => (
          <Checkbox
            key={card.id}
            id={`showcase-${card.id}`}
            label={card.name}
            checked={selected.includes(card.id)}
            disabled={
              disabled || (!selected.includes(card.id) && selected.length >= 60)
            }
            onChange={() => onToggle(card.id)}
          />
        ))
      ) : (
        <p>Esta colección todavía no tiene cartas.</p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          disabled={disabled || page === 1}
          onClick={() => setPage((value) => value - 1)}
        >
          Anterior
        </Button>
        <Button
          variant="secondary"
          disabled={disabled || !result.data || page >= result.data.totalPages}
          onClick={() => setPage((value) => value + 1)}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
