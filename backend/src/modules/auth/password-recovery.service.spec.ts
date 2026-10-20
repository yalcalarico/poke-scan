import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/index.js';
import type { RecoveryMailPort } from './recovery-mail.port.js';
import { PasswordRecoveryService } from './password-recovery.service.js';

describe('admisión y shutdown de recuperación con motor detenido', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('el ticket usa tiempo transcurrido aunque el reloj civil salte', async () => {
    vi.useFakeTimers();
    let release!: (value: null) => void;
    const pending = new Promise<null>((resolve) => { release = resolve; });
    const service = new PasswordRecoveryService({ $transaction: vi.fn(() => pending) } as unknown as PrismaService,
      {} as ConfigService, { available: true, caseGeneration: 1, deliver: async () => undefined });
    const internal = service as unknown as {
      admit(): Promise<{ ipRetry: number; globalRetry: number; identifierDenied: boolean }>;
      tickets: Map<object, { controller: AbortController }>;
      live(ticket: object, generation: number, signal: AbortSignal): boolean;
    };
    vi.spyOn(internal, 'admit').mockResolvedValue({ ipRetry: 0, globalRetry: 0, identifierDenied: false });
    await service.request(`${randomUUID()}@example.invalid`, 'fixture-ip');
    const [ticket, reservation] = [...internal.tickets.entries()][0]!;
    vi.spyOn(Date, 'now').mockReturnValue(9_000_000_000_000);
    expect(internal.live(ticket, 1, reservation.controller.signal)).toBe(true);
    await vi.advanceTimersByTimeAsync(2_001);
    expect(internal.live(ticket, 1, reservation.controller.signal)).toBe(false);
    release(null); await vi.advanceTimersByTimeAsync(0); await service.onModuleDestroy();
  });

  it('202 no espera lookup detenido, y el deadline de drain produce cuarentena observable', async () => {
    vi.useFakeTimers();
    let release!: (value: null) => void;
    const pending = new Promise<null>((resolve) => { release = resolve; });
    const prisma = { $transaction: vi.fn(() => pending) } as unknown as PrismaService;
    const mail: RecoveryMailPort = { available: true, caseGeneration: 1, deliver: async () => undefined };
    const service = new PasswordRecoveryService(prisma, {} as ConfigService, mail);
    const internal = service as unknown as { admit(): Promise<{ ipRetry: number; globalRetry: number; identifierDenied: boolean }> };
    vi.spyOn(internal, 'admit').mockResolvedValue({ ipRetry: 0, globalRetry: 0, identifierDenied: false });
    await service.request(`${randomUUID()}@example.invalid`, 'fixture-ip');
    expect(service.drainStatus().pendingJobs).toBe(1);
    const shutdown = service.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(2_101); await shutdown;
    expect(service.drainStatus()).toEqual({ pendingJobs: 1, tickets: 0, quarantined: true, deadlineExceeded: true });
    // El estado no se borra para fingir cancelación del driver: sólo settle real.
    release(null); await vi.advanceTimersByTimeAsync(0);
    expect(service.drainStatus().pendingJobs).toBe(0);
    expect(service.drainStatus().quarantined).toBe(false);
  });

  it('la capacidad común detiene más lookup aun si jobs previos no devolvieron', async () => {
    vi.useFakeTimers();
    let release!: (value: null) => void;
    const pending = new Promise<null>((resolve) => { release = resolve; });
    const transaction = vi.fn(() => pending);
    const service = new PasswordRecoveryService({ $transaction: transaction } as unknown as PrismaService,
      {} as ConfigService, { available: true, caseGeneration: 1, deliver: async () => undefined });
    const internal = service as unknown as { admit(): Promise<{ ipRetry: number; globalRetry: number; identifierDenied: boolean }> };
    vi.spyOn(internal, 'admit').mockResolvedValue({ ipRetry: 0, globalRetry: 0, identifierDenied: false });
    const replies: Array<{ message: string }> = [];
    for (let index = 0; index < 34; index += 1) replies.push(await service.request(`${randomUUID()}@example.invalid`, 'fixture-ip'));
    expect(transaction.mock.calls.length).toBe(32);
    expect(replies.every((reply) => reply.message === replies[0]?.message)).toBe(true);
    await vi.advanceTimersByTimeAsync(2_001);
    await service.request(`${randomUUID()}@example.invalid`, 'fixture-ip');
    expect(transaction.mock.calls.length).toBe(32);
    release(null); await vi.advanceTimersByTimeAsync(0);
    await service.onModuleDestroy();
    expect(service.drainStatus().pendingJobs).toBe(0);
  });
});
