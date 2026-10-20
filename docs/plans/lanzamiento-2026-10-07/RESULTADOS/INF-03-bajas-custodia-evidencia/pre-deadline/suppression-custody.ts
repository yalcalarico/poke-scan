import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { ConfigService } from '@nestjs/config';
import type { LocalJournalConfig, SuppressionSnapshot } from './suppression-journal.js';

export const SUPPRESSION_CUSTODY = Symbol('SUPPRESSION_CUSTODY');
export interface SuppressionCustody {
  /** Publica y verifica contra el anchor vigente; no provisiona una autoridad vacía. */
  confirm(snapshot: SuppressionSnapshot): Promise<void>;
}
export interface LocalCustodyConfig {
  store: string; anchor: string; key: string;
  inventoryConfig: { repository: string; inventory: string; checkpoint: string; key: string };
  journalConfig: LocalJournalConfig;
}
export interface CustodyConfirmation {
  confirmed: true; journalId: string; coverageStartsAt: string; sequence: number; head: string; expiresAt: string | null;
}
const DEADLINE_MS = 8_000;
const MAX_ACK = 4096;
export function custodyFailure(): never { throw new Error('ACCOUNT_DELETION_CUSTODY_UNVERIFIED'); }
export function localCustodyConfig(config: ConfigService): LocalCustodyConfig | undefined {
  const mode = config.get<string>('ACCOUNT_DELETION_CUSTODY_MODE', 'local-private');
  if (!['local-private', 'local-simulated'].includes(mode)) custodyFailure();
  if (mode === 'local-private') return undefined;
  if (config.get<string>('ACCOUNT_DELETION_MODE', 'disabled') !== 'local-private') custodyFailure();
  const result: LocalCustodyConfig = {
    store: config.getOrThrow<string>('ACCOUNT_DELETION_CUSTODY_STORE_DIR'),
    anchor: config.getOrThrow<string>('ACCOUNT_DELETION_CUSTODY_ANCHOR_DIR'),
    key: config.getOrThrow<string>('ACCOUNT_DELETION_CUSTODY_HMAC_KEY'),
    inventoryConfig: {
      repository: config.getOrThrow<string>('ACCOUNT_DELETION_BACKUP_REPOSITORY_DIR'),
      inventory: config.getOrThrow<string>('ACCOUNT_DELETION_BACKUP_INVENTORY_DIR'),
      checkpoint: config.getOrThrow<string>('ACCOUNT_DELETION_BACKUP_CHECKPOINT_DIR'),
      key: config.getOrThrow<string>('ACCOUNT_DELETION_INVENTORY_HMAC_KEY'),
    },
    journalConfig: {
      journalDirectory: config.getOrThrow<string>('ACCOUNT_DELETION_JOURNAL_DIR'),
      checkpointDirectory: config.getOrThrow<string>('ACCOUNT_DELETION_CHECKPOINT_DIR'),
      hmacKey: config.getOrThrow<string>('ACCOUNT_DELETION_HMAC_KEY'),
    },
  };
  const secrets = [result.key, result.inventoryConfig.key, result.journalConfig.hmacKey];
  if (secrets.some((key) => Buffer.byteLength(key) < 32) || new Set(secrets).size !== secrets.length) custodyFailure();
  return result;
}
export function validateConfirmation(value: unknown, snapshot: SuppressionSnapshot): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) custodyFailure();
  const ack = value as Record<string, unknown>, checkpoint = snapshot.checkpoint;
  if (Object.keys(ack).sort().join(',') !== 'confirmed,coverageStartsAt,expiresAt,head,journalId,sequence' || ack.confirmed !== true || ack.journalId !== checkpoint.journalId || ack.coverageStartsAt !== checkpoint.coverageStartsAt || ack.sequence !== checkpoint.sequence || ack.head !== checkpoint.head) custodyFailure();
  if (ack.expiresAt !== null && (typeof ack.expiresAt !== 'string' || !Number.isFinite(Date.parse(ack.expiresAt)) || new Date(ack.expiresAt).toISOString() !== ack.expiresAt || Date.now() >= Date.parse(ack.expiresAt))) custodyFailure();
}

/** El hijo sólo presta el snapshot: los locks del journal siguen perteneciendo al servicio vivo. */
export class LocalSimulatedSuppressionCustody implements SuppressionCustody {
  constructor(private readonly config: LocalCustodyConfig) {}
  async confirm(snapshot: SuppressionSnapshot): Promise<void> {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./suppression-custody-worker.js', import.meta.url))], { env: {}, stdio: ['pipe', 'pipe', 'pipe'] });
    await new Promise<void>((resolve, reject) => {
      let output = '', failed = false, expired = false;
      const stop = () => { failed = true; child.kill('SIGKILL'); };
      // No Promise.race: el resultado sólo se entrega después de drenar el proceso y sus pipes.
      const timer = setTimeout(() => { expired = true; stop(); }, DEADLINE_MS);
      child.stdout.on('data', (chunk: Buffer) => { if (Buffer.byteLength(output) + chunk.length > MAX_ACK) stop(); else output += chunk.toString('utf8'); });
      child.stderr.on('data', () => { stop(); });
      child.stdin.on('error', stop);
      child.on('error', () => { failed = true; });
      child.on('close', (code) => {
        clearTimeout(timer);
        try {
          if (failed || expired || code !== 0 || !output.endsWith('\n') || output.trim().includes('\n')) custodyFailure();
          const ack: unknown = JSON.parse(output); validateConfirmation(ack, snapshot); resolve();
        } catch { reject(new Error('ACCOUNT_DELETION_CUSTODY_UNVERIFIED')); }
      });
      child.stdin.end(JSON.stringify({ config: this.config, snapshot }));
    });
  }
}
