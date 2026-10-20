import { ConfigService } from '@nestjs/config';
import { confirmBorrowedCustody, type CustodyConstructor } from './suppression-custody-worker.js';
import { localCustodyConfig, validateConfirmation, type LocalCustodyConfig } from './suppression-custody.js';
import type { SuppressionSnapshot } from './suppression-journal.js';

const config: LocalCustodyConfig = {
  store: '/custody/store', anchor: '/anchor/current', key: 'custody-key-distinct-minimum-32-bytes',
  inventoryConfig: { repository: '/host/repository', inventory: '/host/inventory', checkpoint: '/host/inventory-checkpoint', key: 'inventory-key-distinct-minimum-32-bytes' },
  journalConfig: { journalDirectory: '/host/journal', checkpointDirectory: '/host/journal-checkpoint', hmacKey: 'journal-key-distinct-minimum-32-bytes' },
};
const snapshot: SuppressionSnapshot = { checkpoint: { version: 1, journalId: 'synthetic-journal', coverageStartsAt: '2026-10-01T00:00:00.000Z', sequence: 1, head: 'a'.repeat(64), mac: 'b'.repeat(64) }, entries: [] };
function fixture({ genesis = false, failAt = '' } = {}) {
  const events: string[] = [];
  class Custody {
    constructor(private readonly options: ConstructorParameters<CustodyConstructor>[0]) {}
    async step(event: string) { events.push(event); if (failAt === event) throw new Error('synthetic-failure'); }
    async open() { await this.step('open'); }
    async current() { await this.step('current'); return { body: { generation: genesis ? 0 : 3 } }; }
    async load() { await this.step('load'); }
    async publish() {
      await this.step('publish'); const borrowed = await this.options.journalFactory();
      await borrowed.open(); expect(await borrowed.snapshot()).toBe(snapshot); await borrowed.close();
      return { mode: 'local-simulated', published: true, restoreEligible: false, expiresAt: null };
    }
    async verify() { await this.step('verify'); return { mode: 'local-simulated', verified: true, restoreEligible: false, expiresAt: null }; }
    async close() { await this.step('close'); }
  }
  return { events, Custody };
}
describe('confirmación con journal prestado', () => {
  it('valida anchor actual antes de publicar, verifica y cierra antes de ack exacto', async () => {
    const f = fixture();
    const ack = await confirmBorrowedCustody(config, snapshot, f.Custody);
    expect(f.events).toEqual(['open', 'current', 'load', 'publish', 'verify', 'close']);
    expect(() => validateConfirmation(ack, snapshot)).not.toThrow();
    expect(() => validateConfirmation({ ...ack, head: 'c'.repeat(64) }, snapshot)).toThrow();
    expect(() => validateConfirmation({ ...ack, expiresAt: new Date(Date.now() - 1).toISOString() }, snapshot)).toThrow();
  });
  it('genesis no permite publicar ni reconciliar', async () => {
    const f = fixture({ genesis: true });
    await expect(confirmBorrowedCustody(config, snapshot, f.Custody)).rejects.toThrow();
    expect(f.events).toEqual(['open', 'current', 'close']);
  });
  it.each(['open', 'load', 'publish', 'verify', 'close'])('fallo en %s nunca entrega ack, con cierre intentado', async (failAt) => {
    const f = fixture({ failAt });
    await expect(confirmBorrowedCustody(config, snapshot, f.Custody)).rejects.toThrow();
    expect(f.events.at(-1)).toBe('close');
  });
  it('modo legado/disabled conserva configuración, modo inválido falla cerrado', () => {
    expect(localCustodyConfig(new ConfigService({ ACCOUNT_DELETION_MODE: 'disabled' }))).toBeUndefined();
    expect(() => localCustodyConfig(new ConfigService({ ACCOUNT_DELETION_CUSTODY_MODE: 'remote' }))).toThrow();
    expect(() => localCustodyConfig(new ConfigService({ ACCOUNT_DELETION_MODE: 'disabled', ACCOUNT_DELETION_CUSTODY_MODE: 'local-simulated' }))).toThrow();
  });
});
