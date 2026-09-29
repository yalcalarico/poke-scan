'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Alert, Button, Field, Input, PasswordInput, useFieldA11y } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api';

/**
 * A dónde se va después de entrar. `buscar` y no `colecciones` porque es la raíz
 * de la `BottomNav` y el punto de arranque del producto (`components/nav.ts`).
 */
const POST_LOGIN_PATH = `/buscar`;

interface LoginFieldErrors {
  email?: string;
  password?: string;
}

/**
 * El formulario de login.
 *
 * - **`Field` + `Input`/`PasswordInput` en los dos campos** (§8.3), con
 *   `useFieldA11y` para que el label, el `aria-describedby` y el `aria-invalid`
 *   digan lo mismo que se ve.
 * - **`PasswordInput`**: el toggle de mostrar contraseña era un gap conocido del
 *   login anterior, que no lo tenía.
 * - **`noValidate`**: la validación es la de este archivo, no la del browser, y
 *   por eso los mensajes son los de §10.2 y no "Please fill out this field".
 * - **El `Alert` es para el error de submit, no el de campo**: un 401 no
 *   pertenece a ningún input en particular, y ponerlo debajo del formulario es
 *   lo que lo hace legible sin que el lector salte de campo en campo.
 */
export function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const emailField = useFieldA11y({ id: 'login-email', error: fieldErrors.email });
  const passwordField = useFieldA11y({ id: 'login-password', error: fieldErrors.password });

  function validate(): LoginFieldErrors {
    const errors: LoginFieldErrors = {};
    if (email.trim() === '') errors.email = 'Ingresá tu email.';
    if (password === '') errors.password = 'Ingresá tu contraseña.';
    return errors;
  }

  function clearFieldError(field: keyof LoginFieldErrors) {
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    const nextErrors = validate();
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsPending(true);
    try {
      await login(email.trim(), password);
      // `replace` y no `push`: la pantalla de login no es una pantalla de la que
      // se vuelva con el botón de atrás. Es el mismo criterio que usa
      // `RequireAuth` para mandar a `/login`.
      router.replace(POST_LOGIN_PATH);
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(
          err.status === 401 || err.status === 400
            ? err.message || 'Credenciales inválidas. Revisá tu email y contraseña.'
            : err.message,
        );
      } else {
        setSubmitError('No pudimos iniciar sesión. Revisá tu conexión e intentá de nuevo.');
      }
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <Field {...emailField} label="Email" required>
        <Input
          id={emailField.id}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="ash@pokemon.com"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            clearFieldError('email');
          }}
          invalid={emailField.invalid}
          aria-describedby={emailField.describedBy}
        />
      </Field>

      <Field {...passwordField} label="Contraseña" required>
        <PasswordInput
          id={passwordField.id}
          name="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            clearFieldError('password');
          }}
          invalid={passwordField.invalid}
          aria-describedby={passwordField.describedBy}
        />
      </Field>

      {submitError ? <Alert tone="error">{submitError}</Alert> : null}

      <Button type="submit" fullWidth size="lg" loading={isPending} pendingLabel="Entrando…">
        Entrar
      </Button>
    </form>
  );
}
