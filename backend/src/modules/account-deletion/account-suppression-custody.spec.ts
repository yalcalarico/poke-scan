import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/index.js';
import { AccountSuppressionService } from './account-suppression.service.js';
import type { SuppressionCustody } from './suppression-custody.js';
import type { SuppressionJournal, SuppressionSnapshot } from './suppression-journal.js';

const config = new ConfigService({ ACCOUNT_DELETION_MODE: 'local-private', ACCOUNT_DELETION_CUSTODY_MODE: 'local-simulated' });
function fixture(initialIds: string[] = []) {
  const events: string[] = [], ids = [...initialIds];
  const snapshot = (): SuppressionSnapshot => ({ checkpoint: { version: 1, journalId: 'synthetic-journal', coverageStartsAt: '2026-10-01T00:00:00.000Z', sequence: ids.length, head: String(ids.length).padStart(64, '0'), mac: 'b'.repeat(64) }, entries: ids.map((userId, index) => ({ sequence: index + 1, userId, acceptedAt: '2026-10-02T00:00:00.000Z', previous: '0'.repeat(64), mac: 'a'.repeat(64) })) });
  const journal: SuppressionJournal = { open: vi.fn(async () => { events.push('journal-open'); }), close: vi.fn(async () => { events.push('journal-close'); }), snapshot: vi.fn(async () => snapshot()), accept: vi.fn(async (id) => { events.push(`accept-${id}`); if (!ids.includes(id)) ids.push(id); }) };
  const custody: SuppressionCustody = { confirm: vi.fn(async (s) => { events.push(`confirmed-${s.checkpoint.sequence}`); }) };
  const replay = vi.fn(async () => { events.push('PG-replay'); return { count: ids.length }; });
  const prisma = { $transaction: async (work: (tx: unknown) => Promise<unknown>) => work({ user: { deleteMany: replay }, $queryRaw: async () => [{ remaining: 0n }] }) } as unknown as PrismaService;
  const service = new AccountSuppressionService(config, prisma, journal, custody);
  return { service, journal, custody, events, ids, prisma, replay };
}
describe('baja con custodia local simulada', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  it('startup publica/verifica antes de replay y cada turno confirma antes de delete/commit', async () => {
    const f = fixture(['pending']); await f.service.onModuleInit();
    expect(f.events).toEqual(['journal-open', 'confirmed-1', 'PG-replay']);
    await f.service.withDeletionTurn(async (accept) => { await accept('target'); f.events.push('PG-delete'); });
    expect(f.events.slice(3)).toEqual(['accept-target', 'confirmed-2', 'PG-delete']);
    await expect(f.service.assertAllowed('target')).rejects.toBeInstanceOf(UnauthorizedException);
    await f.service.onModuleDestroy();
  });
  it('custodia indisponible en startup no reproduce PG ni deja journal abierto', async () => {
    const f = fixture(['pending']); vi.mocked(f.custody.confirm).mockRejectedValue(new Error('synthetic-unavailable'));
    await expect(f.service.onModuleInit()).rejects.toThrow();
    expect(f.replay).not.toHaveBeenCalled(); expect(f.journal.close).toHaveBeenCalledOnce();
    expect(await f.service.isAvailable()).toBe(false);
  });
  it('ack perdido conserva intent irrevocable, no PG; restart publica pendiente antes de replay', async () => {
    const f = fixture(); await f.service.onModuleInit();
    vi.mocked(f.custody.confirm).mockRejectedValueOnce(new Error('synthetic-lost-ack'));
    const commit = vi.fn();
    await expect(f.service.withDeletionTurn(async (accept) => { await accept('target'); commit(); })).rejects.toThrow();
    expect(commit).not.toHaveBeenCalled(); expect(f.ids).toEqual(['target']);
    expect(await f.service.isAvailable()).toBe(false); await expect(f.service.assertAllowed('other')).rejects.toThrow();
    await f.service.onModuleDestroy();
    const restarted = new AccountSuppressionService(config, f.prisma, f.journal, f.custody);
    await restarted.onModuleInit(); expect(f.events.slice(-3)).toEqual(['journal-open', 'confirmed-1', 'PG-replay']);
    await expect(restarted.assertAllowed('target')).rejects.toBeInstanceOf(UnauthorizedException);
    await restarted.onModuleDestroy();
  });
  it('PG fallido después de confirmación no reactiva cuenta ni repite publicación en request', async () => {
    const f = fixture(); await f.service.onModuleInit();
    await expect(f.service.withDeletionTurn(async (accept) => { await accept('target'); throw new Error('synthetic-PG-failure'); })).rejects.toThrow('synthetic-PG-failure');
    expect(f.custody.confirm).toHaveBeenCalledTimes(2);
    await expect(f.service.assertAllowed('target')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(f.service.assertAllowed('other')).resolves.toBeUndefined();
    await f.service.onModuleDestroy();
  });
  it('concurrencia reserva turno antes de callback PG y shutdown drena confirmación + commit', async () => {
    const f = fixture(); await f.service.onModuleInit();
    let release: () => void = () => undefined;
    vi.mocked(f.custody.confirm).mockImplementationOnce(async () => { f.events.push('publication-start'); await new Promise<void>((resolve) => { release = resolve; }); f.events.push('publication-closed'); });
    const first = f.service.withDeletionTurn(async (accept) => { f.events.push('PG-first'); await accept('first'); f.events.push('commit-first'); });
    await vi.waitFor(() => expect(f.events).toContain('publication-start'));
    const secondWork = vi.fn(async () => undefined); const second = f.service.withDeletionTurn(secondWork);
    // Attach rejection before shutdown settles the queued request.
    const secondFailure = expect(second).rejects.toThrow();
    const closing = f.service.onModuleDestroy();
    expect(secondWork).not.toHaveBeenCalled(); expect(f.journal.close).not.toHaveBeenCalled();
    release(); await first; await secondFailure; await closing;
    expect(f.events.slice(-3)).toEqual(['publication-closed', 'commit-first', 'journal-close']);
  });
  it('turno que vence esperando nunca abre callback PG aunque se libere luego', async () => {
    vi.useFakeTimers(); const f = fixture(); await f.service.onModuleInit();
    let release: () => void = () => undefined;
    const first = f.service.withDeletionTurn(async () => new Promise<void>((resolve) => { release = resolve; }));
    await Promise.resolve(); await Promise.resolve();
    const work = vi.fn(async () => undefined), second = f.service.withDeletionTurn(work);
    const rejected = expect(second).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(5_001); await rejected;
    release(); await first; await f.service.onModuleDestroy(); expect(work).not.toHaveBeenCalled();
  });
  it('reloj vencido cancela turno aunque el callback del timer siga pendiente', async () => {
    vi.useFakeTimers(); const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
    const f = fixture(); await f.service.onModuleInit();
    let release: () => void = () => undefined;
    const first = f.service.withDeletionTurn(async () => new Promise<void>((resolve) => { release = resolve; }));
    await Promise.resolve(); await Promise.resolve();
    const work = vi.fn(async () => undefined), second = f.service.withDeletionTurn(work);
    const rejection = expect(second).rejects.toThrow();
    clock.mockReturnValue(5_001); release(); await first; await rejection;
    expect(work).not.toHaveBeenCalled(); await f.service.onModuleDestroy();
  });

});
