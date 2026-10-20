'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { AuthShell } from '@/components/auth/auth-shell';
import { Alert, Button, Checkbox, Field, Input, PasswordInput, buttonVariants, useFieldA11y } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api';
import { deleteOwnAccount, getAccountDeletionAvailability } from '@/lib/api/account-deletion';
import { getAccessToken, getSessionEpoch } from '@/lib/api/token-storage';

const AUTH_ERROR = 'Revisá tu contraseña actual o volvé a iniciar sesión.';
const PASSWORD_ERROR = 'Usá entre 8 y 72 caracteres.';
const PASSWORD_CONTROL = '[&>div>button]:h-11 [&>div>button]:w-11 [&>input]:pr-14';
type Availability = 'checking' | 'available' | 'unavailable' | 'signed-out';
type Terminal = 'success' | 'unknown' | 'forbidden';

export function AccountDeletionExperience() {
  const { clearSession, isLoading, isAuthenticated } = useAuth();
  const [availability, setAvailability] = useState<Availability>('checking');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmationError, setConfirmationError] = useState<string | undefined>();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [waitAnnouncement, setWaitAnnouncement] = useState('');
  const flight = useRef(false);
  const mounted = useRef(false);
  const passwordA11y = useFieldA11y({ id: 'account-deletion-password', error: passwordError });
  const confirmationA11y = useFieldA11y({ id: 'account-deletion-confirmation', error: confirmationError });

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (terminal || isLoading) return;
    if (!isAuthenticated || !getAccessToken()) {
      queueMicrotask(() => { if (active) setAvailability('signed-out'); });
      return () => { active = false; };
    }
    queueMicrotask(() => { if (active) setAvailability('checking'); });
    void getAccountDeletionAvailability().then((result) => {
      if (active) setAvailability(result.available ? 'available' : 'unavailable');
    }).catch(() => { if (active) setAvailability('unavailable'); });
    return () => { active = false; };
  }, [isLoading, isAuthenticated, terminal]);

  useEffect(() => {
    const clearFields = () => { setPassword(''); setConfirmation(''); setAccepted(false); };
    // Una vuelta desde el historial no debe conservar una contraseña ingresada.
    window.addEventListener('pagehide', clearFields);
    window.addEventListener('pageshow', clearFields);
    return () => { window.removeEventListener('pagehide', clearFields); window.removeEventListener('pageshow', clearFields); };
  }, []);

  useEffect(() => {
    const heading = document.getElementById('auth-title');
    if (heading) { heading.tabIndex = -1; heading.focus(); }
  }, [availability, terminal]);

  useEffect(() => {
    if (retryAt === null) return;
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      const remaining = retryAt - performance.now();
      if (remaining <= 0) { setRetryAt(null); setWaitAnnouncement('Ya podés volver a intentar.'); }
      else timer = setTimeout(update, Math.min(remaining, 2_147_483_647));
    };
    update();
    return () => clearTimeout(timer);
  }, [retryAt]);

  const wait = (seconds: number) => {
    setWaitAnnouncement('');
    setRetryAt(performance.now() + seconds * 1000);
  };
  const current = (epoch: number) => mounted.current && getSessionEpoch() === epoch;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading || !isAuthenticated || availability !== 'available' || flight.current || pending || retryAt !== null || terminal) return;
    const nextPasswordError = !password ? 'Ingresá tu contraseña actual.'
      : Array.from(password).length < 8 || Array.from(password).length > 72 ? PASSWORD_ERROR : undefined;
    const nextConfirmationError = !accepted ? 'Confirmá que querés eliminar tu cuenta.'
      : confirmation !== 'ELIMINAR' ? 'Escribí ELIMINAR para confirmar.' : undefined;
    setPasswordError(nextPasswordError); setConfirmationError(nextConfirmationError); setMessage(null);
    if (nextPasswordError || nextConfirmationError) {
      document.getElementById(nextPasswordError ? 'account-deletion-password' : 'account-deletion-confirmation')?.focus();
      return;
    }

    const epoch = getSessionEpoch();
    flight.current = true;
    setPending(true);
    try {
      await deleteOwnAccount({ password, confirmation: 'ELIMINAR' }, (expectedEpoch) => clearSession(expectedEpoch));
      if (!mounted.current) return;
      setTerminal('success');
    } catch (error) {
      if (!mounted.current) return;
      if (!current(epoch)) {
        setTerminal('unknown');
      } else if (error instanceof ApiError && error.status === 401 && error.code === 'ACCOUNT_DELETION_AUTH_INVALID') {
        setPasswordError(AUTH_ERROR);
        document.getElementById('account-deletion-password')?.focus();
      } else if (error instanceof ApiError && error.status === 400 && error.code === 'INPUT_INVALID') {
        setConfirmationError('Revisá la confirmación e intentá de nuevo.');
        document.getElementById('account-deletion-confirmation')?.focus();
      } else if (error instanceof ApiError && error.status === 429 && error.code === 'ACCOUNT_DELETION_RATE_LIMITED') {
        setMessage('Esperá un poco antes de volver a intentar.');
        wait(error.safeRetryAfter ?? 60);
      } else if (error instanceof ApiError && error.status === 403 && error.code === 'SESSION_REQUEST_FORBIDDEN') {
        setTerminal('forbidden');
      } else {
        setTerminal('unknown');
      }
    } finally {
      flight.current = false;
      if (mounted.current) {
        setPassword('');
        setConfirmation('');
        setPending(false);
      }
    }
  }

  const loginLink = (primary = false) => (
    <Link replace href="/login" className={buttonVariants({ variant: primary ? 'primary' : 'secondary', size: primary ? 'lg' : 'md' })}>
      Iniciar sesión
    </Link>
  );
  const cancel = <Link href="/ajustes" className={buttonVariants({ variant: 'ghost', size: 'md' })}>Volver a Ajustes</Link>;

  if (terminal === 'success') {
    return <AuthShell title="Tu cuenta fue eliminada" description="La sesión se cerró. Podés crear otra cuenta si querés volver a usar PokéScan." footer={loginLink()}>
      <Link replace href="/registro" className={buttonVariants({ variant: 'primary', size: 'lg' })}>Crear otra cuenta</Link>
    </AuthShell>;
  }
  if (terminal === 'unknown') {
    return <AuthShell title="No confirmamos el resultado" description="No sabemos si la eliminación se completó. No vuelvas a enviarla a ciegas. Probá iniciar sesión para revisar el estado de tu cuenta.">
      {loginLink(true)}
    </AuthShell>;
  }
  if (terminal === 'forbidden') {
    return <AuthShell title="La sesión ya no está disponible" description="Iniciá sesión de nuevo para revisar tu cuenta.">
      {loginLink(true)}
    </AuthShell>;
  }
  if (isLoading || availability === 'checking') {
    return <AuthShell title="Eliminar cuenta" description="Estamos revisando si podés continuar."><p role="status" className="text-body text-secondary">Consultando disponibilidad…</p></AuthShell>;
  }
  if (availability === 'signed-out') {
    return <AuthShell title="Iniciá sesión para continuar" description="Necesitás una sesión activa para revisar esta solicitud.">{loginLink(true)}</AuthShell>;
  }
  if (availability === 'unavailable') {
    return <AuthShell title="Eliminación no disponible" description="La eliminación de cuentas no está disponible ahora.">{cancel}</AuthShell>;
  }

  return <AuthShell title="Eliminar cuenta" description="Esta acción retira tu cuenta, tus colecciones y los enlaces que compartiste.">
    <div className="flex flex-col gap-4">
      <Alert tone="warning" size="sm">
        Las copias cifradas pueden conservarse hasta 30 días desde su creación. Al recuperarlas, tu cuenta debe seguir eliminada antes de reabrir el servicio. La eliminación no retira archivos CSV ni capturas que otras personas ya hayan guardado.
      </Alert>
      <form method="post" onSubmit={submit} noValidate aria-busy={pending} className="flex flex-col gap-4">
        <Field {...passwordA11y} label="Contraseña actual" error={passwordError} required>
          <PasswordInput className={PASSWORD_CONTROL} id={passwordA11y.id} name="password" autoComplete="current-password" disabled={pending} value={password}
            onChange={(event) => { setPassword(event.target.value); setPasswordError(undefined); }} invalid={passwordA11y.invalid} aria-describedby={passwordA11y.describedBy} />
        </Field>
        <Field {...confirmationA11y} label="Escribí ELIMINAR" hint="Usá la palabra en mayúsculas para confirmar." error={confirmationError} required>
          <Input id={confirmationA11y.id} name="confirmation" autoComplete="off" disabled={pending} value={confirmation}
            onChange={(event) => { setConfirmation(event.target.value); setConfirmationError(undefined); }} invalid={confirmationA11y.invalid} aria-describedby={confirmationA11y.describedBy} />
        </Field>
        <Checkbox checked={accepted} disabled={pending} onCheckedChange={setAccepted}
          label="Confirmo que quiero eliminar mi cuenta" description="Se eliminarán mi cuenta, mis colecciones y mis enlaces compartidos." />
        {passwordError === AUTH_ERROR ? loginLink() : null}
        {message ? <Alert tone="warning" size="sm">{message}</Alert> : null}
        {retryAt !== null ? <p className="text-caption text-secondary">Podés volver a intentar cuando termine la espera.</p> : null}
        <Button type="submit" variant="destructive" size="lg" fullWidth loading={pending} disabled={retryAt !== null}
          pendingLabel="Procesando eliminación…">Eliminar mi cuenta</Button>
        {cancel}
      </form>
      <p role="status" aria-live="polite" className="sr-only">{waitAnnouncement}</p>
    </div>
  </AuthShell>;
}
