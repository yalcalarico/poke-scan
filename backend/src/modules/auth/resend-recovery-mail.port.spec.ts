import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import type { RecoveryMail } from './recovery-mail.port.js';
import {
  createResendRecoveryMailPort, readResendRecoveryMailConfiguration, ResendRecoveryMailPort,
} from './resend-recovery-mail.port.js';

const TOKEN = 'a'.repeat(43);
const SETTINGS = { apiKey: 're_test_key', from: 'PokéScan <recovery@example.com>', frontendOrigin: 'https://pokescan.example' };

function config(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function mail(overrides: Partial<RecoveryMail> = {}): RecoveryMail {
  return { recipient: 'person@example.com', recipientUserId: 'private-user-id', token: TOKEN,
    expiresAt: new Date(Date.now() + 60_000), caseGeneration: 1, ...overrides };
}

function guardedMail(read: () => string, overrides: Partial<RecoveryMail> = {}): RecoveryMail {
  const value = mail(overrides);
  return { recipient: value.recipient, recipientUserId: value.recipientUserId, expiresAt: value.expiresAt,
    caseGeneration: value.caseGeneration, get token() { return read(); } };
}

function response(status = 200, body = '{"id":"provider-id"}'): Response {
  return new Response(body, { status, headers: { 'content-type': 'application/json' } });
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const validSettings = {
  RECOVERY_MAIL_MODE: 'resend', RESEND_API_KEY: 're_test_key',
  RESEND_FROM: SETTINGS.from, FRONTEND_URL: 'https://pokescan.example',
};

describe('ResendRecoveryMailPort', () => {
  it('queda apagado por defecto, falla cerrado y acepta una configuración válida', () => {
    expect(createResendRecoveryMailPort(config({})).available).toBe(false);
    expect(createResendRecoveryMailPort(config(validSettings)).available).toBe(true);
    const unsafe = [
      { FRONTEND_URL: 'http://localhost:3000' },
      { FRONTEND_URL: 'https://user:password@example.com' },
      { FRONTEND_URL: 'https://example.com?token=x' },
      { FRONTEND_URL: 'https://example.com#fragment' },
      { RESEND_API_KEY: 'key\r\nX-Test: injected' },
    ];
    for (const override of unsafe) {
      expect(readResendRecoveryMailConfiguration(config({ ...validSettings, ...override }))).toBeNull();
    }
    expect(readResendRecoveryMailConfiguration(config({ ...validSettings, RESEND_FROM: 'bad\r\nBcc: x@example.org' }))).toBeNull();
    expect(readResendRecoveryMailConfiguration(config({ ...validSettings, FRONTEND_URL: 'https://example.com/path' }))).toBeNull();
  });

  it('autoriza antes de leer el token y envía sólo los campos permitidos con el fragmento del frontend', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const transport = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init }); return response();
    });
    let authorized = false;
    const envelope = guardedMail(() => { expect(authorized).toBe(true); return TOKEN; });
    await new ResendRecoveryMailPort(SETTINGS, transport).deliver(envelope, new AbortController().signal, async () => {
      authorized = true; return true;
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.resend.com/emails');
    const init = calls[0]!.init!;
    expect(init.redirect).toBe('error');
    const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['from', 'subject', 'text', 'to']);
    expect(payload.from).toBe(SETTINGS.from);
    expect(payload.to).toEqual(['person@example.com']);
    expect(payload.text).toContain(`https://pokescan.example/recuperar#token=${TOKEN}`);
    expect(payload.text).not.toContain('private-user-id');
    expect(payload).not.toHaveProperty('tags');
  });

  it('no autoriza con abort previo, destinatario inválido o generación vencida; descarta token inválido tras autorizar', async () => {
    const transport = vi.fn(async () => response());
    const authorize = vi.fn(async () => true);
    const port = new ResendRecoveryMailPort(SETTINGS, transport);
    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    await port.deliver(mail(), alreadyAborted.signal, authorize);
    await port.deliver(mail({ recipient: 'bad\r\nBcc:x@example.org' }), new AbortController().signal, authorize);
    await port.deliver(guardedMail(() => TOKEN, { caseGeneration: 2 }), new AbortController().signal, authorize);
    expect(authorize).toHaveBeenCalledTimes(0);
    expect(transport).not.toHaveBeenCalled();

    const tokenReads = vi.fn(() => 'invalid-token');
    await port.deliver(guardedMail(tokenReads), new AbortController().signal, authorize);
    expect(tokenReads).toHaveBeenCalledTimes(1);
    expect(transport).not.toHaveBeenCalled();
  });

  it('revalida vencimiento al volver de autorizar y después de leer el token', async () => {
    const transport = vi.fn(async () => response());
    const reads = vi.fn(() => TOKEN);
    const expiresDuringAuth = guardedMail(reads);
    const mutableExpiry = expiresDuringAuth as unknown as { expiresAt: Date };
    await new ResendRecoveryMailPort(SETTINGS, transport).deliver(expiresDuringAuth, new AbortController().signal, async () => {
      mutableExpiry.expiresAt = new Date(Date.now() - 1); return true;
    });
    expect(reads).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();

    const controller = new AbortController();
    const abortingGetter = guardedMail(() => { controller.abort(); return TOKEN; });
    await new ResendRecoveryMailPort(SETTINGS, transport).deliver(abortingGetter, controller.signal, async () => true);
    expect(transport).not.toHaveBeenCalled();

    let expiresDuringRead!: RecoveryMail;
    expiresDuringRead = guardedMail(() => {
      (expiresDuringRead as unknown as { expiresAt: Date }).expiresAt = new Date(Date.now() - 1);
      return TOKEN;
    });
    await new ResendRecoveryMailPort(SETTINGS, transport).deliver(expiresDuringRead, new AbortController().signal, async () => true);
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([401, 429, 500, 302])('no reintenta rechazo HTTP %s', async (status) => {
    const transport = vi.fn(async () => response(status));
    await new ResendRecoveryMailPort(SETTINGS, transport).deliver(mail(), new AbortController().signal, async () => true);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('trata como incierta una respuesta exitosa con JSON inválido y limita el cuerpo', async () => {
    const invalid = vi.fn(async () => response(200, 'not-json'));
    await new ResendRecoveryMailPort(SETTINGS, invalid).deliver(mail(), new AbortController().signal, async () => true);
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(5_000)); controller.close(); } });
    const oversized = vi.fn(async () => new Response(stream, { status: 200 }));
    await new ResendRecoveryMailPort(SETTINGS, oversized).deliver(mail(), new AbortController().signal, async () => true);
    expect(invalid).toHaveBeenCalledTimes(1);
    expect(oversized).toHaveBeenCalledTimes(1);
  });

  it('cancela en las fases de autorización, envío y lectura del cuerpo', async () => {
    const duringAuthorization = new AbortController();
    const authStarted = deferred<void>();
    const neverAuthorized = new Promise<boolean>(() => undefined);
    const authWait = new ResendRecoveryMailPort(SETTINGS).deliver(mail(), duringAuthorization.signal, () => {
      authStarted.resolve(); return neverAuthorized;
    });
    await authStarted.promise;
    duringAuthorization.abort();
    await authWait;

    const duringSend = new AbortController();
    const sendStarted = deferred<void>();
    let sendSignal: AbortSignal | undefined;
    const slowTransport = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      sendSignal = init?.signal as AbortSignal;
      sendStarted.resolve();
      return new Promise<Response>((_resolve, reject) => sendSignal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
    });
    const sending = new ResendRecoveryMailPort(SETTINGS, slowTransport).deliver(mail(), duringSend.signal, async () => true);
    await sendStarted.promise;
    duringSend.abort();
    await sending;
    expect(sendSignal?.aborted).toBe(true);

    const duringBody = new AbortController();
    const bodyReadStarted = deferred<void>();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull() { return new Promise<void>(() => undefined); },
      cancel() { cancelled = true; },
    });
    const getReader = stream.getReader.bind(stream);
    Object.defineProperty(stream, 'getReader', { value: () => {
      const reader = getReader();
      const read = reader.read.bind(reader);
      reader.read = () => { bodyReadStarted.resolve(); return read(); };
      return reader;
    } });
    const bodyTransport = vi.fn(async () => new Response(stream, { status: 200 }));
    const reading = new ResendRecoveryMailPort(SETTINGS, bodyTransport).deliver(mail(), duringBody.signal, async () => true);
    await bodyReadStarted.promise;
    duringBody.abort();
    await reading;
    expect(cancelled).toBe(true);
  });

  it('aborta el transporte al alcanzar el plazo monotónico de 1.8 segundos', async () => {
    vi.useFakeTimers();
    let now = 100;
    const sendStarted = deferred<void>();
    let sendSignal: AbortSignal | undefined;
    const transport = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      sendSignal = init?.signal as AbortSignal;
      sendStarted.resolve();
      return new Promise<Response>((_resolve, reject) => sendSignal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
    });
    try {
      const delivery = new ResendRecoveryMailPort(SETTINGS, transport, () => now).deliver(mail(), new AbortController().signal, async () => true);
      await sendStarted.promise;
      now += 1_800;
      await vi.advanceTimersByTimeAsync(1_800);
      await delivery;
      expect(sendSignal?.aborted).toBe(true);
      expect(transport).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});
