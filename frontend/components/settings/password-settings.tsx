"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Button,
  Field,
  PasswordInput,
  Surface,
  buttonVariants,
} from "@/components/ui";
import { useAuth } from "@/hooks/use-auth";
import { changePassword } from "@/lib/api/account";
import { getSessionEpoch } from "@/lib/api/token-storage";

export function PasswordSettings() {
  const { user, isAuthenticated, isLoading, clearSession } = useAuth();
  const [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false),
    [success, setSuccess] = useState(false),
    [error, setError] = useState("");
  const form = useRef<HTMLFormElement>(null),
    controller = useRef<AbortController | null>(null);
  const [ownerId, setOwnerId] = useState(user?.id);
  if (ownerId !== user?.id) {
    setOwnerId(user?.id);
    setCurrent("");
    setNext("");
    setConfirmation("");
    setError("");
  }
  const clearInputs = () => {
    setCurrent("");
    setNext("");
    setConfirmation("");
    form.current?.querySelectorAll("input").forEach((input) => {
      input.value = "";
    });
  };
  useEffect(() => {
    const clear = () => {
      controller.current?.abort();
      setCurrent("");
      setNext("");
      setConfirmation("");
      setSuccess(false);
      setError("");
      form.current?.querySelectorAll("input").forEach((input) => {
        input.value = "";
      });
    };
    window.addEventListener("pagehide", clear);
    window.addEventListener("popstate", clear);
    return () => {
      controller.current?.abort();
      window.removeEventListener("pagehide", clear);
      window.removeEventListener("popstate", clear);
    };
  }, [user?.id]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const length = Array.from(next).length;
    if (
      !current ||
      Array.from(current).length > 72 ||
      length < 8 ||
      length > 72
    ) {
      setError(
        "Revisá la clave actual y usá entre 8 y 72 caracteres para la nueva.",
      );
      return;
    }
    if (next !== confirmation) {
      setError("Las contraseñas nuevas no coinciden.");
      return;
    }
    const epoch = getSessionEpoch();
    controller.current = new AbortController();
    setBusy(true);
    try {
      await changePassword(
        { currentPassword: current, newPassword: next },
        () => {
          clearInputs();
          setSuccess(true);
          clearSession(epoch);
        },
        controller.current.signal,
      );
    } catch {
      setError(
        "No pudimos confirmar el cambio. Probá iniciar sesión antes de repetir el pedido.",
      );
    } finally {
      clearInputs();
      setBusy(false);
    }
  }
  if (success)
    return (
      <Surface className="flex flex-col gap-4">
        <h2 className="text-h2 text-primary">Clave actualizada</h2>
        <p role="status" className="text-body text-secondary">
          Cerramos las sesiones anteriores. Iniciá sesión con tu nueva clave.
        </p>
        <Link href="/login" className={buttonVariants({ variant: "primary" })}>
          Iniciar sesión
        </Link>
      </Surface>
    );
  if (isLoading) return <p role="status">Verificando sesión…</p>;
  if (!isAuthenticated || !user)
    return (
      <Surface className="flex flex-col gap-4">
        <p>Iniciá sesión para cambiar tu clave.</p>
        <Link
          href="/login"
          className={buttonVariants({ variant: "secondary" })}
        >
          Iniciar sesión
        </Link>
      </Surface>
    );
  return (
    <Surface>
      <form
        ref={form}
        method="post"
        onSubmit={(event) => void submit(event)}
        className="flex flex-col gap-4"
      >
        <p className="text-body text-secondary">
          El cambio cierra las sesiones anteriores. No guardamos contraseñas en
          este dispositivo.
        </p>
        <Field label="Contraseña actual" required>
          <PasswordInput
            value={current}
            autoComplete="current-password"
            disabled={busy}
            onChange={(event) => setCurrent(event.target.value)}
          />
        </Field>
        <Field
          label="Nueva contraseña"
          required
          hint="Entre 8 y 72 caracteres; no recortamos espacios."
        >
          <PasswordInput
            value={next}
            autoComplete="new-password"
            disabled={busy}
            onChange={(event) => setNext(event.target.value)}
          />
        </Field>
        <Field label="Repetir nueva contraseña" required>
          <PasswordInput
            value={confirmation}
            autoComplete="new-password"
            disabled={busy}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </Field>
        {error ? (
          <div className="flex flex-col gap-3">
            <p role="alert" className="text-body text-negative">
              {error}
            </p>
            <Link
              href="/login"
              className={buttonVariants({ variant: "secondary" })}
            >
              Probar inicio de sesión
            </Link>
          </div>
        ) : null}
        <Button type="submit" loading={busy} pendingLabel="Actualizando…">
          Actualizar clave
        </Button>
      </form>
    </Surface>
  );
}
