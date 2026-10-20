import { ConfigService } from '@nestjs/config';
import { performance } from 'node:perf_hooks';
import type { RecoveryMail, RecoveryMailPort } from './recovery-mail.port.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const MAX_DELIVERY_MS = 1_800;
const MAX_RESPONSE_BYTES = 4_096;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const EMAIL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/;

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface RecoveryMailConfiguration {
  readonly apiKey: string;
  readonly from: string;
  readonly frontendOrigin: string;
}

export function readResendRecoveryMailConfiguration(config: ConfigService): RecoveryMailConfiguration | null {
  if (config.get<string>('RECOVERY_MAIL_MODE') !== 'resend') return null;
  const apiKey = config.get<string>('RESEND_API_KEY')?.trim();
  const from = config.get<string>('RESEND_FROM')?.trim();
  const originInput = config.get<string>('FRONTEND_URL')?.trim();
  if (!apiKey || apiKey.length > 512 || /[\r\n\0]/.test(apiKey) || !from || !validSender(from) || !originInput) return null;
  try {
    const origin = new URL(originInput);
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash ||
        origin.pathname !== '/' || origin.origin === 'null') return null;
    return { apiKey, from, frontendOrigin: origin.origin };
  } catch { return null; }
}

export function createResendRecoveryMailPort(config: ConfigService): RecoveryMailPort {
  const settings = readResendRecoveryMailConfiguration(config);
  return settings ? new ResendRecoveryMailPort(settings) : new UnavailableResendRecoveryMailPort();
}

export class UnavailableResendRecoveryMailPort implements RecoveryMailPort {
  readonly available = false;
  readonly caseGeneration = 0;
  async deliver(_mail: RecoveryMail, _signal: AbortSignal, _authorizeHandoff: () => Promise<boolean>): Promise<void> {}
}

export class ResendRecoveryMailPort implements RecoveryMailPort {
  readonly available = true;
  readonly caseGeneration = 1;

  constructor(
    private readonly settings: RecoveryMailConfiguration,
    private readonly transport: FetchLike = fetch,
    private readonly monotonicNow: () => number = () => performance.now(),
  ) {}

  async deliver(mail: RecoveryMail, signal: AbortSignal, authorizeHandoff: () => Promise<boolean>): Promise<void> {
    const deadlineAt = this.monotonicNow() + MAX_DELIVERY_MS;
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const abort = (): void => controller.abort();
    const cleanup = (): void => {
      if (timer) clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      controller.abort();
    };
    const remaining = (): number => Math.max(0, deadlineAt - this.monotonicNow());
    const race = async <T>(promise: Promise<T>): Promise<T> => {
      const ms = remaining();
      if (signal.aborted || ms <= 0) throw new Error('RECOVERY_MAIL_CANCELLED');
      let rejectWait!: (reason: Error) => void;
      const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
      const onAbort = (): void => rejectWait(new Error('RECOVERY_MAIL_CANCELLED'));
      const stopTimer = setTimeout(() => rejectWait(new Error('RECOVERY_MAIL_DEADLINE')), ms);
      signal.addEventListener('abort', onAbort, { once: true });
      try { return await Promise.race([promise, stopped]); }
      finally { clearTimeout(stopTimer); signal.removeEventListener('abort', onAbort); }
    };

    try {
      if (signal.aborted || mail.caseGeneration !== this.caseGeneration || !validMailEnvelope(mail)) return;
      timer = setTimeout(abort, remaining());
      signal.addEventListener('abort', abort, { once: true });
      const authorized = await race(Promise.resolve().then(authorizeHandoff));
      if (!authorized || !liveEnvelope(mail, signal, this.caseGeneration, remaining)) return;
      // Esta es la única lectura del token y ocurre después de autorizar en PostgreSQL.
      const token = mail.token;
      if (!liveEnvelope(mail, signal, this.caseGeneration, remaining) || !TOKEN_PATTERN.test(token)) return;
      const url = `${this.settings.frontendOrigin}/recuperar#token=${token}`;
      const text = `Recibimos un pedido para recuperar el acceso a PokéScan.\n\nAbrí este enlace antes de ${mail.expiresAt.toISOString()}:\n${url}\n\nSi no hiciste este pedido, podés ignorar este mensaje.`;
      if (!liveEnvelope(mail, signal, this.caseGeneration, remaining)) return;
      const response = await race(this.transport(RESEND_ENDPOINT, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { authorization: `Bearer ${this.settings.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: this.settings.from, to: [mail.recipient], subject: 'Recuperá tu acceso a PokéScan', text }),
      }));
      if (response.body) await this.readBoundedBody(response, race);
      if (!response.ok) throw new Error('RECOVERY_MAIL_PROVIDER_REJECTED');
    } catch {
      // Los fallos del proveedor son opacos; luego del handoff la entrega puede ser incierta.
    } finally { cleanup(); }
  }

  private async readBoundedBody(response: Response, race: <T>(promise: Promise<T>) => Promise<T>): Promise<void> {
    const reader = response.body!.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const item = await race(reader.read());
        if (item.done) break;
        size += item.value.byteLength;
        if (size > MAX_RESPONSE_BYTES) throw new Error('RECOVERY_MAIL_RESPONSE_TOO_LARGE');
        chunks.push(item.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('RECOVERY_MAIL_BAD_RESPONSE');
      const id = (parsed as Record<string, unknown>).id;
      if (typeof id !== 'string' || id.length === 0 || id.length > 256) throw new Error('RECOVERY_MAIL_BAD_RESPONSE');
    } finally { void reader.cancel().catch(() => undefined); }
  }
}

function validEmail(value: string): boolean {
  return value.length <= 254 && !/[\r\n\0]/.test(value) && EMAIL_PATTERN.test(value);
}

function validSender(value: string): boolean {
  if (value.length > 254 || /[\r\n\0]/.test(value)) return false;
  const match = /^(?:([^<>"\\]{1,64})\s+)?<([^<>]+)>$/.exec(value);
  return match ? validEmail(match[2]!) && (!match[1] || !/[<>]/.test(match[1])) : validEmail(value);
}

function validMailEnvelope(mail: RecoveryMail): boolean {
  return validEmail(mail.recipient) && Number.isSafeInteger(mail.caseGeneration) &&
    Number.isFinite(mail.expiresAt.getTime()) && mail.expiresAt.getTime() > Date.now();
}

function liveEnvelope(mail: RecoveryMail, signal: AbortSignal, generation: number, remaining: () => number): boolean {
  return !signal.aborted && mail.caseGeneration === generation && remaining() > 0 && validMailEnvelope(mail);
}
