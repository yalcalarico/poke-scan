'use client';

import { useRouter } from 'next/navigation';
import { useState, type ChangeEvent, type FormEvent } from 'react';

import {
  Alert,
  Button,
  Field,
  Input,
  PasswordInput,
  useFieldA11y,
} from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api';

/** A dónde se va después de registrarse: el mismo lugar que después de entrar. */
const POST_REGISTER_PATH = `/buscar`;

/*
 * Los patrones y la función de validación son **lógica, no diseño**: se conservan
 * tal cual, con dos correcciones de copy que el design system exige (§10):
 *   - "Las contraseñas no coinciden" → con tilde y punto.
 *   - "Entrando..." / "Creando cuenta..." → "…" (no tres puntos ASCII).
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

type FieldName = 'displayName' | 'username' | 'email' | 'password' | 'confirmPassword';

type FieldErrors = Partial<Record<FieldName, string>>;

interface RegisterForm {
  displayName: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

const INITIAL_FORM: RegisterForm = {
  displayName: '',
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
};

function validate(form: RegisterForm): FieldErrors {
  const errors: FieldErrors = {};

  if (form.displayName.trim().length < 2) {
    errors.displayName = 'Ingresá un nombre de al menos 2 caracteres.';
  }

  if (!USERNAME_PATTERN.test(form.username)) {
    errors.username = 'Solo letras, números y guion bajo (3 a 20 caracteres).';
  }

  if (!EMAIL_PATTERN.test(form.email.trim())) {
    errors.email = 'Ingresá un email válido.';
  }

  if (form.password.length < 8) {
    errors.password = 'La contraseña debe tener al menos 8 caracteres.';
  }

  if (form.password !== form.confirmPassword) {
    errors.confirmPassword = 'Las contraseñas no coinciden.';
  }

  return errors;
}

/**
 * El formulario de registro: cinco `Field`, y el error del 409 del backend
 * mapeado al campo de email.
 *
 * El **409 es un error de campo, no de formulario**: el backend responde
 * "ya existe una cuenta con ese email" y el email es el input al que pertenece
 * el problema. Va en el `Field` del email, con su `role="alert"` y su
 * `aria-invalid`, y no en un `Alert` arriba de todo, que es lo que hacía el
 * registro anterior con `FormField` y `FormAlert` como dos piezas sueltas.
 *
 * `noValidate` por lo mismo que en el login: la validación es la de este archivo
 * y sus mensajes son los de §10.2, no los del browser.
 */
export function RegisterForm() {
  const router = useRouter();
  const { register } = useAuth();

  const [form, setForm] = useState<RegisterForm>(INITIAL_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const displayNameField = useFieldA11y({ id: 'register-display-name', error: errors.displayName });
  const usernameField = useFieldA11y({
    id: 'register-username',
    hint: '3 a 20 caracteres: letras, números y guion bajo.',
    error: errors.username,
  });
  const emailField = useFieldA11y({ id: 'register-email', error: errors.email });
  const passwordField = useFieldA11y({
    id: 'register-password',
    hint: 'Mínimo 8 caracteres.',
    error: errors.password,
  });
  const confirmPasswordField = useFieldA11y({
    id: 'register-confirm-password',
    error: errors.confirmPassword,
  });

  function updateField(field: FieldName) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
      // El error se borra al escribir: dejarlo pegado mientras el usuario corrige
      // hace que el mensaje describa algo que ya no está pasando.
      setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsPending(true);
    try {
      await register({
        email: form.email.trim(),
        password: form.password,
        username: form.username.trim(),
        displayName: form.displayName.trim(),
      });
      router.replace(POST_REGISTER_PATH);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setErrors((prev) => ({
            ...prev,
            email: err.message || 'Ya existe una cuenta con ese email.',
          }));
        } else {
          setSubmitError(err.message);
        }
      } else {
        setSubmitError('No pudimos crear la cuenta. Revisá tu conexión e intentá de nuevo.');
      }
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <Field {...displayNameField} label="Nombre" required>
        <Input
          id={displayNameField.id}
          name="name"
          autoComplete="name"
          placeholder="Ash Ketchum"
          value={form.displayName}
          onChange={updateField('displayName')}
          invalid={displayNameField.invalid}
          aria-describedby={displayNameField.describedBy}
        />
      </Field>

      <Field {...usernameField} label="Usuario" required>
        <Input
          id={usernameField.id}
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="ash_ketchum"
          value={form.username}
          onChange={updateField('username')}
          invalid={usernameField.invalid}
          aria-describedby={usernameField.describedBy}
        />
      </Field>

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
          value={form.email}
          onChange={updateField('email')}
          invalid={emailField.invalid}
          aria-describedby={emailField.describedBy}
        />
      </Field>

      <Field {...passwordField} label="Contraseña" required>
        <PasswordInput
          id={passwordField.id}
          name="new-password"
          autoComplete="new-password"
          placeholder="••••••••"
          value={form.password}
          onChange={updateField('password')}
          invalid={passwordField.invalid}
          aria-describedby={passwordField.describedBy}
        />
      </Field>

      <Field {...confirmPasswordField} label="Confirmar contraseña" required>
        <PasswordInput
          id={confirmPasswordField.id}
          name="confirm-password"
          autoComplete="new-password"
          placeholder="••••••••"
          value={form.confirmPassword}
          onChange={updateField('confirmPassword')}
          invalid={confirmPasswordField.invalid}
          aria-describedby={confirmPasswordField.describedBy}
        />
      </Field>

      {submitError ? <Alert tone="error">{submitError}</Alert> : null}

      <Button type="submit" fullWidth size="lg" loading={isPending} pendingLabel="Creando cuenta…">
        Crear cuenta
      </Button>
    </form>
  );
}
