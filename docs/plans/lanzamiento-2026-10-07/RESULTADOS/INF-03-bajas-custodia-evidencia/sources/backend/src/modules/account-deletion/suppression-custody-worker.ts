import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { custodyFailure, type CustodyConfirmation, type LocalCustodyConfig } from './suppression-custody.js';
import type { SuppressionSnapshot } from './suppression-journal.js';

interface CustodyCurrent { body: { generation: number } }
interface BorrowedJournal { open(): Promise<void>; close(): Promise<void>; snapshot(): Promise<SuppressionSnapshot> }
interface CustodyInstance {
  open(): Promise<unknown>; current(): Promise<CustodyCurrent>; load(current: CustodyCurrent): Promise<unknown>;
  publish(): Promise<unknown>; verify(): Promise<unknown>; close(): Promise<void>;
}
export type CustodyConstructor = new (config: LocalCustodyConfig & { journalFactory: () => Promise<BorrowedJournal> }) => CustodyInstance;
function confirmedResult(value: unknown, property: 'published' | 'verified'): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) custodyFailure();
  const result = value as Record<string, unknown>;
  if (result.mode !== 'local-simulated' || result[property] !== true || result.restoreEligible !== false) custodyFailure();
  const expires = result.expiresAt;
  if (expires !== null && (typeof expires !== 'string' || !Number.isFinite(Date.parse(expires)) || new Date(expires).toISOString() !== expires || Date.now() >= Date.parse(expires))) custodyFailure();
  return expires as string | null;
}
/** La cola del servicio impide accept/close hasta que este préstamo haya terminado. */
export async function confirmBorrowedCustody(config: LocalCustodyConfig, snapshot: SuppressionSnapshot, Constructor: CustodyConstructor): Promise<CustodyConfirmation> {
  const custody = new Constructor({ ...config, journalFactory: async () => ({ open: async () => undefined, close: async () => undefined, snapshot: async () => snapshot }) });
  let expiresAt: string | null;
  try {
    await custody.open();
    const current = await custody.current();
    // La API no transforma genesis en autoridad vigente ni admite un snapshot histórico como fallback.
    if (!Number.isSafeInteger(current.body.generation) || current.body.generation < 1) custodyFailure();
    await custody.load(current);
    confirmedResult(await custody.publish(), 'published');
    expiresAt = confirmedResult(await custody.verify(), 'verified');
  } finally { await custody.close(); }
  if (expiresAt !== null && Date.now() >= Date.parse(expiresAt)) custodyFailure();
  const c = snapshot.checkpoint;
  return { confirmed: true, journalId: c.journalId, coverageStartsAt: c.coverageStartsAt, sequence: c.sequence, head: c.head, expiresAt };
}
function readInput(value: unknown): { config: LocalCustodyConfig; snapshot: SuppressionSnapshot } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) custodyFailure();
  const input = value as Record<string, unknown>;
  if (!input.config || typeof input.config !== 'object' || !input.snapshot || typeof input.snapshot !== 'object') custodyFailure();
  const snapshot = input.snapshot as Record<string, unknown>;
  if (!snapshot.checkpoint || typeof snapshot.checkpoint !== 'object' || !Array.isArray(snapshot.entries) || snapshot.entries.length > 100_000) custodyFailure();
  // Proviene sólo del pipe privado del padre, que ya validó MAC/cadena bajo sus locks.
  // La biblioteca exige además igualdad byte a byte con las fuentes normales antes de publicar.
  return input as unknown as { config: LocalCustodyConfig; snapshot: SuppressionSnapshot };
}
async function main(): Promise<void> {
  try {
    let input = ''; for await (const chunk of process.stdin) { input += String(chunk); if (Buffer.byteLength(input) > 32 * 1024 * 1024) custodyFailure(); }
    const request = readInput(JSON.parse(input) as unknown);
    const imported: unknown = await import(new URL('../../../../scripts/inf03-custody-common.mjs', import.meta.url).href);
    if (!imported || typeof imported !== 'object' || !('LocalSimulatedCustody' in imported) || typeof imported.LocalSimulatedCustody !== 'function') custodyFailure();
    const result = await confirmBorrowedCustody(request.config, request.snapshot, imported.LocalSimulatedCustody as CustodyConstructor);
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch { process.stderr.write('ACCOUNT_DELETION_CUSTODY_UNVERIFIED\n'); process.exitCode = 1; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
