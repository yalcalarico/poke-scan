import { EventEmitter } from 'node:events';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { LocalSimulatedSuppressionCustody, type LocalCustodyConfig } from './suppression-custody.js';
import type { SuppressionSnapshot } from './suppression-journal.js';
vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
const snapshot: SuppressionSnapshot = { checkpoint: { version: 1, journalId: 'synthetic', coverageStartsAt: '2026-10-01T00:00:00.000Z', sequence: 0, head: '0'.repeat(64), mac: 'a'.repeat(64) }, entries: [] };
const config = { store: '/synthetic/store', anchor: '/synthetic/anchor', key: 'synthetic-only-memory' } as LocalCustodyConfig;
function processFixture() {
  const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), stdin: Object.assign(new EventEmitter(), { end: vi.fn() }), kill: vi.fn(() => true) });
  vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcessWithoutNullStreams);
  return child;
}
describe('deadline y confirmación del proceso custodio', () => {
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); vi.restoreAllMocks(); });
  it('ack prematuro no confirma hasta close0; claves por stdin y entorno vacío', async () => {
    const child = processFixture(), adapter = new LocalSimulatedSuppressionCustody(config); let confirmed = false;
    const confirmation = adapter.confirm(snapshot).then(() => { confirmed = true; });
    const c = snapshot.checkpoint;
    child.stdout.emit('data', Buffer.from(JSON.stringify({ confirmed: true, journalId: c.journalId, coverageStartsAt: c.coverageStartsAt, sequence: c.sequence, head: c.head, expiresAt: null }) + '\n'));
    await Promise.resolve(); expect(confirmed).toBe(false);
    expect(vi.mocked(spawn).mock.calls[0]?.[2]).toEqual({ env: {}, stdio: ['pipe', 'pipe', 'pipe'] });
    expect(child.stdin.end).toHaveBeenCalledWith(JSON.stringify({ config, snapshot }));
    child.emit('close', 0); await confirmation; expect(confirmed).toBe(true);
  });
  it('deadline mata al hijo y drena close antes de rechazar sin trabajo publicado después', async () => {
    vi.useFakeTimers(); const child = processFixture(); let settled = false;
    const result = new LocalSimulatedSuppressionCustody(config).confirm(snapshot).catch(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(8_001); expect(child.kill).toHaveBeenCalledWith('SIGKILL'); expect(settled).toBe(false);
    child.emit('close', null); await result; expect(settled).toBe(true);
  });
  it.each(['lost-ack', 'bad-ack', 'error-close'])('%s no acepta resultado incierto', async (kind) => {
    const child = processFixture(), result = new LocalSimulatedSuppressionCustody(config).confirm(snapshot);
    const rejection = expect(result).rejects.toThrow('ACCOUNT_DELETION_CUSTODY_UNVERIFIED');
    if (kind === 'bad-ack') child.stdout.emit('data', Buffer.from('{"confirmed":true}\n'));
    if (kind === 'error-close') child.stderr.emit('data', Buffer.from('private-error'));
    child.emit('close', kind === 'error-close' ? 1 : 0); await rejection;
  });
  it('reloj vencido rechaza close0 aunque el callback del timer siga pendiente', async () => {
    vi.useFakeTimers(); const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
    const child = processFixture(), result = new LocalSimulatedSuppressionCustody(config).confirm(snapshot);
    const rejection = expect(result).rejects.toThrow('ACCOUNT_DELETION_CUSTODY_UNVERIFIED');
    const c = snapshot.checkpoint;
    child.stdout.emit('data', Buffer.from(JSON.stringify({ confirmed: true, journalId: c.journalId, coverageStartsAt: c.coverageStartsAt, sequence: c.sequence, head: c.head, expiresAt: null }) + '\n'));
    clock.mockReturnValue(8_001); child.emit('close', 0); await rejection;
  });

});
