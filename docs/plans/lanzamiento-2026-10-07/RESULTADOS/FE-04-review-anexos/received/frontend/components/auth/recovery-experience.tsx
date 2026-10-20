'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';

import { AuthShell } from '@/components/auth/auth-shell';
import { Alert, Button, Field, Input, PasswordInput, buttonVariants, useFieldA11y } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { ApiError, recoverPassword, requestPasswordRecovery } from '@/lib/api';
import { getSessionEpoch } from '@/lib/api/token-storage';
import { getRecoverySnapshot, getServerRecoverySnapshot, startRecoveryRequest, subscribeRecoveryView } from '@/lib/recovery/recovery-view';

const EMAIL_ERROR = 'Ingresá un email válido.';
const PASSWORD_ERROR = 'Usá una contraseña de entre 8 y 72 caracteres.';

function recoveryMessage(error: unknown, step: 'request' | 'change'): string {
  if (!(error instanceof ApiError)) return step === 'request'
    ? 'No pudimos enviar la solicitud. Revisá tu conexión e intentá de nuevo.'
    : 'No confirmamos el cambio.';
  if (error.status === 429) return `Esperá ${error.safeRetryAfter ?? 60} segundos antes de volver a intentar.`;
  if (error.status === 503 && step === 'request') return 'No pudimos enviar la solicitud ahora. Podés reintentar manualmente.';
  if (error.status === 400 && error.code === 'INPUT_INVALID') return 'Revisá los datos marcados y volvé a intentar.';
  if (step === 'change' && error.code === 'RECOVERY_LINK_INVALID') return 'Este enlace no está disponible. Pedí uno nuevo para continuar.';
  if (error.status === 403) return 'No pudimos procesar la solicitud. Volvé a empezar desde PokéScan.';
  if (step === 'change') return 'No confirmamos el cambio.';
  return 'No pudimos enviar la solicitud. Revisá tu conexión e intentá de nuevo.';
}

export function RecoveryExperience() {
  const router = useRouter();
  const pathname = usePathname();
  const { clearSession } = useAuth();
  const snapshot = useSyncExternalStore(subscribeRecoveryView, getRecoverySnapshot, getServerRecoverySnapshot);
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; newPassword?: string; confirmation?: string }>({});
  const [message, setMessage] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const [pending, setPending] = useState(false);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const submitFlight = useRef(false);
  const lastFocusedMode = useRef<string>('');

  const emailA11y = useFieldA11y({ id: 'recovery-email', error: fieldErrors.email });
  const passwordA11y = useFieldA11y({ id: 'recovery-password', error: fieldErrors.newPassword });
  const confirmationA11y = useFieldA11y({ id: 'recovery-confirmation', error: fieldErrors.confirmation });

  const focusHeading = useCallback(() => {
    const heading = document.getElementById('auth-title');
    if (heading) { heading.tabIndex = -1; heading.focus(); }
  }, []);

  useEffect(() => {
    if (pathname === '/recuperar') window.__pcsRecoveryManager?.inspectEntry();
  }, [pathname]);

  useEffect(() => {
    if (outcomeUnknown) focusHeading();
  }, [outcomeUnknown, focusHeading]);

  useEffect(() => {
    if (snapshot.mode !== lastFocusedMode.current && ['invalid', 'unavailable', 'blocked'].includes(snapshot.mode)) {
      lastFocusedMode.current = snapshot.mode;
      focusHeading();
    }
  }, [snapshot.mode, focusHeading]);

  useEffect(() => {
    if (retryAt === null) return;
    const update = () => {
      const next = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
      setSecondsLeft(next);
      if (next === 0) setRetryAt(null);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  function focusInvalid(field: 'email' | 'newPassword' | 'confirmation') {
    window.requestAnimationFrame(() => document.getElementById(`recovery-${field === 'newPassword' ? 'password' : field}`)?.focus());
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitFlight.current || pending || secondsLeft > 0) return;
    submitFlight.current = true;
    setMessage(null);
    const errors: typeof fieldErrors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = EMAIL_ERROR;
    setFieldErrors(errors);
    if (Object.keys(errors).length) { focusInvalid('email'); submitFlight.current = false; return; }
    setPending(true);
    try {
      await requestPasswordRecovery(email.trim());
      setAccepted(true);
      setRetryAt(Date.now() + 60_000);
      setMessage('Si existe una cuenta con ese email, te enviaremos instrucciones para recuperar el acceso.');
      focusHeading();
    } catch (error) {
      const text = recoveryMessage(error, 'request');
      setMessage(text);
      if (error instanceof ApiError && error.status === 400 && error.code === 'INPUT_INVALID') {
        const next: typeof fieldErrors = {};
        if (error.fields?.email) next.email = EMAIL_ERROR;
        setFieldErrors(next);
        if (next.email) setMessage(null);
        if (next.email) focusInvalid('email');
      }
      if (error instanceof ApiError && error.status === 429) setRetryAt(Date.now() + (error.safeRetryAfter ?? 60) * 1000);
    } finally {
      submitFlight.current = false;
      setPending(false);
    }
  }

  async function submitChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitFlight.current || pending || secondsLeft > 0) return;
    submitFlight.current = true;
    setMessage(null);
    const errors: typeof fieldErrors = {};
    if (newPassword.length < 8 || newPassword.length > 72) errors.newPassword = PASSWORD_ERROR;
    if (confirmation !== newPassword) errors.confirmation = 'Las contraseñas no coinciden.';
    setFieldErrors(errors);
    const firstInvalid = errors.newPassword ? 'newPassword' : errors.confirmation ? 'confirmation' : null;
    if (firstInvalid) { focusInvalid(firstInvalid); submitFlight.current = false; return; }
    const token = snapshot.token;
    if (!token || snapshot.mode !== 'link') { setMessage('Este enlace no está disponible. Pedí uno nuevo para continuar.'); submitFlight.current = false; return; }
    setPending(true);
    try {
      await recoverPassword(token, newPassword);
      const epoch = getSessionEpoch();
      clearSession(epoch);
      setCompleted(true);
      setMessage('Cambiaste tu contraseña. Ya podés iniciar sesión.');
      focusHeading();
      window.setTimeout(() => router.replace('/login'), 900);
    } catch (error) {
      const knownChangeError = error instanceof ApiError && (
        error.status === 403 || error.status === 429 ||
        error.status === 400 && (error.code === 'INPUT_INVALID' || error.code === 'RECOVERY_LINK_INVALID')
      );
      if (!knownChangeError) {
        setOutcomeUnknown(true);
        setMessage(null);
        startRecoveryRequest();
        return;
      }
      const text = recoveryMessage(error, 'change');
      setMessage(text);
      if (error instanceof ApiError && error.status === 429) setRetryAt(Date.now() + (error.safeRetryAfter ?? 60) * 1000);
      if (error instanceof ApiError && error.status === 400 && error.code === 'INPUT_INVALID') {
        const safeFields = error.fields ?? {};
        const next: typeof fieldErrors = {};
        if (safeFields.newPassword) next.newPassword = PASSWORD_ERROR;
        setFieldErrors(next);
        if (next.newPassword) { setMessage(null); focusInvalid('newPassword'); }
      } else if (error instanceof ApiError && error.code === 'RECOVERY_LINK_INVALID') {
        startRecoveryRequest();
      }
    } finally {
      submitFlight.current = false;
      setPending(false);
    }
  }

  const linkError = snapshot.mode === 'invalid' || snapshot.mode === 'unavailable' || snapshot.mode === 'blocked';
  const isChange = snapshot.mode === 'link' && Boolean(snapshot.token);
  const title = completed ? 'Contraseña cambiada' : outcomeUnknown ? 'No confirmamos el cambio' : isChange ? 'Elegí una contraseña' : linkError ? 'Enlace no disponible' : accepted ? 'Revisá tu correo' : 'Recuperá tu cuenta';
  const description = completed
    ? 'Ya podés entrar con tu contraseña nueva.'
    : outcomeUnknown
      ? 'No sabemos si el cambio se completó. Iniciá sesión o pedí un enlace nuevo.'
    : isChange
    ? 'Creá una contraseña nueva para volver a entrar.'
    : linkError
      ? 'El enlace no se puede usar. Pedí uno nuevo para continuar.'
      : accepted
        ? 'Si existe una cuenta con ese email, te enviaremos los pasos para recuperar el acceso.'
        : 'Te vamos a enviar instrucciones si encontramos una cuenta con ese email.';

  const loginLink = <Link href="/login" className="text-label text-brand underline-offset-4 hover:underline">Volver a iniciar sesión</Link>;
  const newLink = <button type="button" onClick={() => { startRecoveryRequest(); setOutcomeUnknown(false); setFieldErrors({}); setMessage(null); }} className="min-h-11 text-label text-brand underline-offset-4 hover:underline">Pedir un enlace nuevo</button>;

  return (
    <AuthShell title={title} description={description} footer={outcomeUnknown ? undefined : loginLink}>
      {completed ? (
        <p className="text-body text-positive">Cambiaste tu contraseña. Ya podés iniciar sesión.</p>
      ) : outcomeUnknown ? (
        <div className="flex flex-col gap-3">
          <p className="text-body text-secondary">No confirmamos el cambio. No vuelvas a enviar este formulario.</p>
          <Link href="/login" className={`${buttonVariants({ variant: 'primary', size: 'lg' })} w-full`}>Volver a iniciar sesión</Link>
          {newLink}
        </div>
      ) : isChange ? (
        <form onSubmit={submitChange} noValidate className="flex flex-col gap-4">
          <Field {...passwordA11y} label="Contraseña nueva" required>
            <PasswordInput className="[&>div>button]:h-11 [&>div>button]:w-11 [&>input]:pr-14" id={passwordA11y.id} name="newPassword" autoComplete="new-password" minLength={8} maxLength={72} value={newPassword} onChange={(event) => { setNewPassword(event.target.value); setFieldErrors((prev) => ({ ...prev, newPassword: undefined })); }} invalid={passwordA11y.invalid} aria-describedby={passwordA11y.describedBy} />
          </Field>
          <Field {...confirmationA11y} label="Repetí la contraseña" required>
            <Input id={confirmationA11y.id} name="confirmation" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setFieldErrors((prev) => ({ ...prev, confirmation: undefined })); }} invalid={confirmationA11y.invalid} aria-describedby={confirmationA11y.describedBy} />
          </Field>
          {message ? <Alert tone={message.startsWith('Cambiaste') ? 'success' : 'error'}>{message}</Alert> : null}
          <Button type="submit" fullWidth size="lg" loading={pending} disabled={secondsLeft > 0} pendingLabel="Cambiando…">Cambiar contraseña</Button>
          {secondsLeft > 0 ? <p className="text-center text-caption text-secondary" aria-live="off">Podés volver a intentarlo en {secondsLeft} s.</p> : null}
          {message && !message.startsWith('Cambiaste') ? <div className="text-center">{newLink}</div> : null}
        </form>
      ) : linkError ? (
        <div className="flex flex-col gap-4">
          <p className="text-body text-negative">{snapshot.mode === 'blocked' ? 'No pudimos proteger el enlace en este navegador. Abrí el enlace nuevamente.' : 'Este enlace no está disponible. Pedí uno nuevo para continuar.'}</p>
          {newLink}
        </div>
      ) : accepted ? (
        <div className="flex flex-col gap-4">
          <p className="text-body text-secondary">{message ?? 'Si existe una cuenta con ese email, te enviaremos instrucciones para recuperar el acceso.'}</p>
          <Button type="button" variant="secondary" fullWidth onClick={() => { startRecoveryRequest(); setAccepted(false); setEmail(''); setMessage(null); }}>Usar otro email</Button>
          <Button type="button" variant="ghost" fullWidth disabled={secondsLeft > 0 || pending} onClick={() => { setAccepted(false); setMessage(null); }}>
            {secondsLeft > 0 ? `Podés volver a pedirlo en ${secondsLeft} s` : 'Volver al formulario para reenviar'}
          </Button>
        </div>
      ) : (
        <form onSubmit={submitRequest} noValidate className="flex flex-col gap-4">
          <Field {...emailA11y} label="Email" required>
            <Input id={emailA11y.id} name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="ash@pokemon.com" value={email} onChange={(event) => { setEmail(event.target.value); setFieldErrors((prev) => ({ ...prev, email: undefined })); }} invalid={emailA11y.invalid} aria-describedby={emailA11y.describedBy} />
          </Field>
          {message ? <Alert tone="error">{message}</Alert> : null}
          <Button type="submit" fullWidth size="lg" loading={pending} pendingLabel="Enviando…" disabled={secondsLeft > 0}>Enviar instrucciones</Button>
          {secondsLeft > 0 ? <p className="text-center text-caption text-secondary" aria-live="off">Podés volver a intentarlo en {secondsLeft} s.</p> : null}
        </form>
      )}
    </AuthShell>
  );
}
