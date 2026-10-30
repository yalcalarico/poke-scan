"use client";
import { useState, type FormEvent } from "react";
import { Button, Field, Input, Surface } from "@/components/ui";
import { useAuth } from "@/hooks/use-auth";
import { updateProfile } from "@/lib/api/account";
import { getSessionEpoch } from "@/lib/api/token-storage";

export function ProfileEditor() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <p role="status">Cargando cuenta…</p>;
  if (!user) return <p>Iniciá sesión para editar tu cuenta.</p>;
  return (
    <ProfileForm
      key={user.id}
      displayName={user.displayName}
      email={user.email}
    />
  );
}
function ProfileForm({
  displayName,
  email,
}: {
  displayName: string;
  email: string;
}) {
  const { refreshUser } = useAuth();
  const [name, setName] = useState(displayName),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || Array.from(name.trim()).length > 80) {
      setError("Usá un nombre de 1 a 80 caracteres.");
      return;
    }
    const epoch = getSessionEpoch();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await updateProfile(name);
      if (getSessionEpoch() !== epoch) return;
      await refreshUser();
      if (getSessionEpoch() === epoch)
        setMessage("Datos guardados en tu cuenta.");
    } catch {
      if (getSessionEpoch() === epoch)
        setError("No pudimos confirmar el guardado. Revisá la conexión.");
    } finally {
      if (getSessionEpoch() === epoch) setBusy(false);
    }
  }
  return (
    <Surface>
      <form
        method="post"
        onSubmit={(event) => void submit(event)}
        className="flex flex-col gap-4"
      >
        <Field label="Nombre visible" required>
          <Input
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
            autoComplete="nickname"
          />
        </Field>
        <Field
          label="Correo de la cuenta"
          hint="El cambio de correo requiere verificación y todavía no está disponible."
        >
          <Input value={email} disabled type="email" />
        </Field>
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
        <Button type="submit" loading={busy} pendingLabel="Guardando…">
          Guardar datos
        </Button>
      </form>
    </Surface>
  );
}
