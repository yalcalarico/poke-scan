from pathlib import Path
p=Path('frontend/components/auth/recovery-experience.tsx')
p.write_text('''\
'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { AuthShell } from '@/components/auth/auth-shell';
import { Alert, Button, Field, Input, PasswordInput, buttonVariants, useFieldA11y } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { ApiError, recoverPassword, requestPasswordRecovery } from '@/lib/api';
import { getSessionEpoch } from '@/lib/api/token-storage';
import { discardRecoveryLink, getRecoverySnapshot, getServerRecoverySnapshot, startRecoveryRequest, subscribeRecoveryView, type RecoveryViewSnapshot } from '@/lib/recovery/recovery-view';

const EMAIL_ERROR = 'Revisá el formato del email.';
const PASSWORD_ERROR = 'Usá entre 8 y 72 caracteres.';
const INPUT_ERROR = 'Revisá los datos ingresados.';
const LINK_ERROR = 'El enlace no es válido o venció. Pedí uno nuevo para continuar.';
const FORBIDDEN_ERROR = 'No pudimos procesar el pedido desde esta página. Volvé a empezar desde PokéScan.';
const PASSWORD_CONTROL = '[&>div>button]:h-11 [&>div>button]:w-11 [&>input]:pr-14';

export function RecoveryExperience() {
  const snapshot = useSyncExternalStore(subscribeRecoveryView, getRecoverySnapshot, getServerRecoverySnapshot);
  // Una entrada nueva, incluso en la misma ruta, pierde campos y resultados previos.
  return <RecoveryEntry key={snapshot.entry} snapshot={snapshot} />;
}

function RecoveryEntry({ snapshot }: { snapshot: RecoveryViewSnapshot }) {
  const { clearSession } = useAuth();
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<{ email?: string; newPassword?: string; confirmation?: string }>({});
  const [message, setMessage] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [terminal, setTerminal] = useState<'success' | 'unknown' | 'forbidden' | null>(null);
  const [linkRejected, setLinkRejected] = useState(false);
  const [pending, setPending] = useState(false);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [waitAnnouncement, setWaitAnnouncement] = useState('');
  const [invalidFocus, setInvalidFocus] = useState<{ id: string } | null>(null);
  const flight = useRef(false);
  const mounted = useRef(false);
  const emailA11y = useFieldA11y({ id: 'recovery-email', error: errors.email });
  const passwordA11y = useFieldA11y({ id: 'recovery-password', error: errors.newPassword });
  const confirmationA11y = useFieldA11y({ id: 'recovery-confirmation', error: errors.confirmation });
  const isChange = snapshot.mode === 'link' && Boolean(snapshot.token);
  const linkError = linkRejected || ['invalid', 'unavailable', 'blocked'].includes(snapshot.mode);
  const title = terminal === 'success' ? 'Cambiaste tu contraseña' : terminal === 'unknown' ? 'No confirmamos el cambio' : terminal === 'forbidden' ? 'Volvé a empezar' : isChange ? 'Elegí tu nueva contraseña' : linkError ? 'Enlace no disponible' : accepted ? 'Recibimos tu pedido' : 'Recuperá tu cuenta';
  const description = terminal === 'success' ? 'Iniciá sesión con la nueva clave.' : terminal === 'unknown' ? 'Intentá iniciar sesión con la clave que elegiste. Si no funciona, pedí otro enlace.' : terminal === 'forbidden' ? FORBIDDEN_ERROR : isChange ? 'Usá entre 8 y 72 caracteres. Después vas a tener que iniciar sesión.' : linkError ? snapshot.mode === 'unavailable' && !linkRejected ? 'Volvé a abrirlo desde el correo o pedí uno nuevo.' : LINK_ERROR : accepted ? 'Si corresponde y el envío puede completarse, vas a recibir instrucciones. Revisá también correo no deseado.' : 'Ingresá el email de tu cuenta. Te vamos a indicar cómo seguir si el pedido puede procesarse.';

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const heading = document.getElementById('auth-title');
    if (heading) { heading.tabIndex = -1; heading.focus(); }
  }, [title]);
  useEffect(() => { if (invalidFocus) document.getElementById(invalidFocus.id)?.focus(); }, [invalidFocus]);
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

  const current = () => mounted.current && getRecoverySnapshot().entry === snapshot.entry;
  const clearSecrets = () => { setNewPassword(''); setConfirmation(''); discardRecoveryLink(); };
  const wait = (seconds: number) => { setWaitAnnouncement(''); setRetryAt(performance.now() + seconds * 1000); };
  const invalid = (id: string) => setInvalidFocus({ id });
  const restart = () => startRecoveryRequest();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (flight.current || pending || retryAt !== null || terminal || linkError) return;
    const next: typeof errors = {};
    if (isChange) {
      const length = Array.from(newPassword).length;
      if (!newPassword) next.newPassword = 'Ingresá una contraseña.';
      else if (length < 8 || length > 72) next.newPassword = PASSWORD_ERROR;
      if (!confirmation) next.confirmation = 'Repetí la contraseña.';
      else if (confirmation !== newPassword) next.confirmation = 'Las contraseñas no coinciden.';
    } else {
      const normalized = email.trim();
      if (!normalized) next.email = 'Ingresá tu email.';
      else if (Array.from(normalized).length > 254) next.email = 'Usá hasta 254 caracteres.';
      else if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(normalized)) next.email = EMAIL_ERROR;
    }
    setMessage(null); setErrors(next);
    if (Object.keys(next).length) { invalid(next.email ? 'recovery-email' : next.newPassword ? 'recovery-password' : 'recovery-confirmation'); return; }
    flight.current = true; setPending(true);
    try {
      if (isChange) {
        await recoverPassword(snapshot.token!, newPassword, () => clearSession(getSessionEpoch()));
        if (!current()) return;
        setTerminal('success'); clearSecrets();
      } else {
        await requestPasswordRecovery(email.trim().toLowerCase());
        if (!current()) return;
        setAccepted(true); wait(60);
      }
    } catch (error) {
      if (!current()) return;
      const recognized = error instanceof ApiError ? error : null;
      if (recognized?.status === 400 && recognized.code === 'INPUT_INVALID') {
        if (isChange && recognized.fields?.newPassword) { setErrors({ newPassword: PASSWORD_ERROR }); invalid('recovery-password'); }
        else if (!isChange && recognized.fields?.email) { setErrors({ email: EMAIL_ERROR }); invalid('recovery-email'); }
        else setMessage(INPUT_ERROR);
      } else if (recognized?.status === 429 && recognized.code === 'RECOVERY_RATE_LIMITED') {
        setMessage('Esperá un poco antes de volver a intentar.'); wait(recognized.safeRetryAfter ?? 60);
      } else if (recognized?.status === 403 && recognized.code === 'SESSION_REQUEST_FORBIDDEN') {
        setTerminal('forbidden'); clearSecrets();
      } else if (isChange && recognized?.status === 400 && recognized.code === 'RECOVERY_LINK_INVALID') {
        setLinkRejected(true); clearSecrets();
      } else if (isChange) {
        setTerminal('unknown'); clearSecrets();
      } else if (recognized?.status === 503 && recognized.code === 'RECOVERY_UNAVAILABLE') {
        setMessage('No pudimos procesar el pedido ahora. Probá más tarde.');
      } else setMessage('No pudimos confirmar el pedido. Podés volver a intentarlo.');
    } finally {
      flight.current = false;
      if (current()) setPending(false);
    }
  }

  const login = (primary = false) => <Link replace href="/login" className={buttonVariants({ variant: primary ? 'primary' : 'ghost', size: primary ? 'lg' : 'md' })}>Iniciar sesión</Link>;
  const newLink = <Button type="button" variant="ghost" fullWidth onClick={restart}>Pedir otro enlace</Button>;
  return <AuthShell title={title} description={description} footer={terminal ? undefined : login()}>
    {terminal ? <div className="flex flex-col gap-3">{login(true)}{terminal === 'unknown' ? newLink : null}</div> : linkError ? <div className="flex flex-col gap-3">{snapshot.mode === 'blocked' ? <Alert tone="warning">No pudimos proteger el enlace. Volvé a empezar desde PokéScan.</Alert> : null}{newLink}</div> : accepted ? <div className="flex flex-col gap-3"><Button type="button" variant="secondary" fullWidth disabled={retryAt !== null} onClick={restart}>Pedir otro enlace</Button>{retryAt !== null ? <p className="text-caption text-secondary">Podés volver a intentar cuando termine la espera.</p> : null}</div> : <form onSubmit={submit} noValidate aria-busy={pending} className="flex flex-col gap-4">
      {isChange ? <>
        <Field {...passwordA11y} label="Nueva contraseña" required><PasswordInput className={PASSWORD_CONTROL} id={passwordA11y.id} name="newPassword" autoComplete="new-password" value={newPassword} onChange={(event) => { setNewPassword(event.target.value); setErrors((prev) => ({ ...prev, newPassword: undefined })); }} invalid={passwordA11y.invalid} aria-describedby={passwordA11y.describedBy} /></Field>
        <Field {...confirmationA11y} label="Repetí la contraseña" required><PasswordInput className={PASSWORD_CONTROL} showLabel="Mostrar confirmación" hideLabel="Ocultar confirmación" id={confirmationA11y.id} name="confirmation" autoComplete="new-password" value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setErrors((prev) => ({ ...prev, confirmation: undefined })); }} invalid={confirmationA11y.invalid} aria-describedby={confirmationA11y.describedBy} /></Field>
      </> : <Field {...emailA11y} label="Email" required><Input id={emailA11y.id} name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={email} onChange={(event) => { setEmail(event.target.value); setErrors((prev) => ({ ...prev, email: undefined })); }} invalid={emailA11y.invalid} aria-describedby={emailA11y.describedBy} /></Field>}
      {message ? <Alert tone="error">{message}</Alert> : null}
      <Button type="submit" fullWidth size="lg" loading={pending} disabled={retryAt !== null} pendingLabel={isChange ? 'Cambiando…' : 'Procesando…'}>{isChange ? 'Cambiar contraseña' : 'Pedir enlace'}</Button>
      {retryAt !== null ? <p className="text-caption text-secondary">Podés volver a intentar cuando termine la espera.</p> : null}
    </form>}
    <p role="status" aria-live="polite" className="sr-only">{waitAnnouncement}</p>
  </AuthShell>;
}
''')
