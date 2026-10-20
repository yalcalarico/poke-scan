import { randomBytes } from 'node:crypto';
import { mkdtemp, realpath, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeLocalSuppressionJournal, LocalSuppressionJournal } from './suppression-journal.js';
import { confirmBorrowedCustody, type CustodyConstructor } from './suppression-custody-worker.js';
import type { LocalCustodyConfig } from './suppression-custody.js';

type FullConfig = LocalCustodyConfig & { journalFactory: (config: LocalCustodyConfig['journalConfig']) => Promise<LocalSuppressionJournal>; transferKey: string };
interface OperationalCustody {
  open(): Promise<unknown>; publish(): Promise<unknown>; close(): Promise<void>; recover(options: { objects: string }): Promise<unknown>;
}
interface CustodyLibrary { initializeCustody(config: FullConfig): Promise<unknown>; LocalSimulatedCustody: new (config: FullConfig) => OperationalCustody }
async function library<T>(name: string, exports: string[]): Promise<T> {
  const value: unknown = await import(new URL(`../../../../scripts/${name}.mjs`, import.meta.url).href);
  if (!value || typeof value !== 'object' || exports.some((key) => typeof (value as Record<string, unknown>)[key] !== 'function')) throw new Error('Módulo del fixture inválido');
  return value as T;
}
describe('custodia prestada con autoridad MAC/cadena genuina', () => {
  let root: string, config: FullConfig, live: LocalSuppressionJournal, custodyLibrary: CustodyLibrary, paths: string[];
  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'pcs-custody-authority-spec-')));
    const host = join(root, 'lost-host'); await mkdir(host, { mode: 0o700 });
    paths = ['repository', 'inventory', 'inventory-checkpoint', 'journal', 'journal-checkpoint'].map((part) => join(host, part));
    for (const dir of [...paths, join(root, 'store'), join(root, 'anchor'), join(root, 'objects')]) await mkdir(dir, { mode: 0o700 });
    const key = () => randomBytes(32).toString('hex');
    config = { store: join(root, 'store'), anchor: join(root, 'anchor'), key: key(), inventoryConfig: { repository: paths[0]!, inventory: paths[1]!, checkpoint: paths[2]!, key: key() }, journalConfig: { journalDirectory: paths[3]!, checkpointDirectory: paths[4]!, hmacKey: key() }, transferKey: key(), journalFactory: async (c) => new LocalSuppressionJournal(c) };
    const inventory = await library<{ initializeInventory(config: FullConfig['inventoryConfig']): Promise<unknown> }>('inf03-inventory-common', ['initializeInventory']);
    const transfer = await library<{ initializeTransfer(config: FullConfig['inventoryConfig'] & { objects: string }): Promise<unknown> }>('inf03-transfer-common', ['initializeTransfer']);
    custodyLibrary = await library<CustodyLibrary>('inf03-custody-common', ['initializeCustody', 'LocalSimulatedCustody']);
    await inventory.initializeInventory(config.inventoryConfig);
    await transfer.initializeTransfer({ ...config.inventoryConfig, objects: join(root, 'objects'), key: config.transferKey });
    await initializeLocalSuppressionJournal(config.journalConfig, new Date(Date.now() - 3600_000).toISOString());
    await custodyLibrary.initializeCustody(config);
    const first = new custodyLibrary.LocalSimulatedCustody(config);
    try { await first.open(); await first.publish(); } finally { await first.close(); }
    live = new LocalSuppressionJournal(config.journalConfig); await live.open();
  });
  afterEach(async () => { await live?.close(); await rm(root, { recursive: true, force: true }); });
  it('publica dos cabezas genuinas manteniendo locks; snapshot firmado anterior no reemplaza anchor', async () => {
    const entriesPath = join(config.journalConfig.journalDirectory, 'entries.jsonl');
    const checkpointPath = join(config.journalConfig.checkpointDirectory, 'checkpoint.json');
    const initialEntries = await readFile(entriesPath), initialCheckpoint = await readFile(checkpointPath);
    const writerPath = join(config.journalConfig.journalDirectory, 'writer.lock'), owner = await readFile(writerPath);
    await live.accept('synthetic-A');
    await confirmBorrowedCustody(config, await live.snapshot(), custodyLibrary.LocalSimulatedCustody as unknown as CustodyConstructor);
    await live.accept('synthetic-B');
    await confirmBorrowedCustody(config, await live.snapshot(), custodyLibrary.LocalSimulatedCustody as unknown as CustodyConstructor);
    expect(await readFile(writerPath)).toEqual(owner); expect((await live.snapshot()).checkpoint.sequence).toBe(2);
    const currentPath = join(config.anchor, 'current.json'), current = await readFile(currentPath);
    await writeFile(entriesPath, initialEntries); await writeFile(checkpointPath, initialCheckpoint);
    // Rollback entero firmado válido: el journal local aislado lo admite, la autoridad anclada lo rechaza.
    const oldSnapshot = await live.snapshot(); expect(oldSnapshot.checkpoint.sequence).toBe(0);
    await expect(confirmBorrowedCustody(config, oldSnapshot, custodyLibrary.LocalSimulatedCustody as unknown as CustodyConstructor)).rejects.toThrow();
    expect(await readFile(currentPath)).toEqual(current); expect(await readFile(writerPath)).toEqual(owner);
  });
  it('aceptación publicada sobrevive pérdida total de originales con mismos bytes y claves', async () => {
    await live.accept('synthetic-deleted');
    const accepted = await live.snapshot();
    await confirmBorrowedCustody(config, accepted, custodyLibrary.LocalSimulatedCustody as unknown as CustodyConstructor);
    const checkpoint = await readFile(join(config.journalConfig.checkpointDirectory, 'checkpoint.json'));
    const entries = await readFile(join(config.journalConfig.journalDirectory, 'entries.jsonl'));
    await live.close(); for (const dir of paths) await rm(dir, { recursive: true });
    const recovery = new custodyLibrary.LocalSimulatedCustody(config);
    try { await recovery.open(); await recovery.recover({ objects: join(root, 'objects') }); } finally { await recovery.close(); }
    expect(await readFile(join(config.journalConfig.checkpointDirectory, 'checkpoint.json'))).toEqual(checkpoint);
    expect(await readFile(join(config.journalConfig.journalDirectory, 'entries.jsonl'))).toEqual(entries);
    live = new LocalSuppressionJournal(config.journalConfig); await live.open();
    expect(await live.snapshot()).toEqual(accepted);
  });
});
