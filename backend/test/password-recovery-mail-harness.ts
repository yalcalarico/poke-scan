import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { PrismaClient } from '@prisma/client';
import type { RecoveryMail, RecoveryMailPort } from '../src/modules/auth/recovery-mail.port.js';

export function assertOwnedLoopbackDatabase(rawUrl: string, expectedDatabase: string): void {
  const url = new URL(rawUrl);
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname) || url.port !== '55432' ||
      url.username !== 'pokemon' || url.pathname.slice(1) !== expectedDatabase ||
      !(/^(pokemon_cards_be05_test_[a-z0-9]+|be05_review_[a-f0-9]+_test)$/i.test(expectedDatabase))) {
    throw new Error('RECOVERY_HARNESS_DATABASE_GUARD');
  }
}

type DeliveryMode = 'deliver' | 'reject' | 'reject-after-handoff' | 'drop' | 'never-resolve';
type DeliveryGate = { entered(): void; released: boolean; listeners: Set<() => void> };

class HarnessMail implements RecoveryMailPort {
  private armed = false;
  private listenerVerified = false;
  get available(): boolean { return this.armed; }
  constructor(private readonly fixtures: ReadonlyMap<string, string>) {}
  private generation = 1;
  private sequence = 0;
  private readonly messages = new Map<number, RecoveryMail>();
  private readonly leases = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly activeCancels = new Set<() => void>();
  private readonly waiters = new Set<{ recipient: string; finish(mail: RecoveryMail): void; fail(): void }>();
  private suppressionWaiters = new Set<() => void>();
  private suppressed = 0;
  private candidateToken: string | null = null;
  private candidateCancel: (() => void) | null = null;
  private candidateLease: ReturnType<typeof setTimeout> | null = null;
  private captureRejected = false;
  private nextDelayMs = 0;
  private nextMode: DeliveryMode = 'deliver';
  private nextGate: DeliveryGate | null = null;
  private receiverLeaseMs = 120_000;

  get caseGeneration(): number { return this.generation; }
  bindVerifiedListener(server: Server): void {
    const address = server.address();
    if (!server.listening || !address || typeof address === 'string' || address.address !== '127.0.0.1' || address.port <= 0) {
      this.armed = false; throw new Error('RECOVERY_HARNESS_LOOPBACK_LISTENER_GUARD');
    }
    this.listenerVerified = true; this.armed = true;
  }
  unavailableForCase(unavailable: boolean): void { if (!this.listenerVerified) throw new Error('RECOVERY_HARNESS_NOT_ARMED'); this.armed = !unavailable; }
  mode(mode: DeliveryMode): void { this.nextMode = mode; }
  allowDelay(milliseconds: number): void { this.nextDelayMs = milliseconds; }
  useReceiverLease(milliseconds: number): void { this.receiverLeaseMs = milliseconds; }
  counts(): { messages: number; leases: number; waits: number; candidate: boolean; gate: boolean } {
    return { messages: this.messages.size, leases: this.leases.size, waits: this.activeCancels.size + this.waiters.size,
      candidate: this.candidateToken !== null, gate: this.nextGate !== null };
  }
  holdNextDelivery(captureRejected = false): { entered: Promise<void>; release(): void } {
    let entered!: () => void;
    const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
    const gate: DeliveryGate = { entered, released: false, listeners: new Set() };
    this.nextGate = gate;
    this.captureRejected = captureRejected;
    return { entered: enteredPromise, release: () => { gate.released = true; for (const listener of gate.listeners) listener(); gate.listeners.clear(); } };
  }
  async waitForSuppression(): Promise<void> {
    if (this.suppressed > 0) return;
    await new Promise<void>((resolve, reject) => {
      const finish = (): void => { clearTimeout(timer); this.suppressionWaiters.delete(finish); resolve(); };
      const timer = setTimeout(() => { this.suppressionWaiters.delete(finish); reject(new Error('RECOVERY_SUPPRESSION_DEADLINE')); }, 1_700);
      this.suppressionWaiters.add(finish);
    });
  }
  takeCandidateToken(): string {
    const candidate = this.candidateToken;
    this.clearCandidate();
    if (!candidate) throw new Error('RECOVERY_HARNESS_NO_CANDIDATE');
    return candidate;
  }

  async deliver(mail: RecoveryMail, signal: AbortSignal, authorizeHandoff: () => Promise<boolean>): Promise<void> {
    // Instancia inerte hasta acreditar DB/marker/listener. El id y destinatario
    // exactos se verifican antes de leer o copiar el secreto del envelope.
    if (!this.available || this.fixtures.get(mail.recipientUserId) !== mail.recipient || signal.aborted ||
        mail.caseGeneration !== this.generation || this.messages.size >= 32) return;
    const mode = this.nextMode; this.nextMode = 'deliver';
    const workDelay = this.nextDelayMs; this.nextDelayMs = 0;
    const gate = this.nextGate; this.nextGate = null;
    const capture = this.captureRejected; this.captureRejected = false;
    if (workDelay > 0 && !await this.wait(signal, workDelay)) return;
    if (mode === 'never-resolve') { await this.wait(signal); return; }
    if (mode === 'reject') throw new Error('RECOVERY_MAIL_REJECTED');
    if (mode === 'drop') return;
    if (gate) { gate.entered(); if (!await this.wait(signal, undefined, gate)) return; }
    if (signal.aborted || mail.caseGeneration !== this.generation) return;
    if (capture) {
      // Sólo el caso de enlace tardío conserva una copia en memoria para el POST
      // negativo. Tiene lease 2 s y cancelación; no existe en entrega normal.
      this.clearCandidate(); this.candidateToken = mail.token;
      const clear = (): void => { this.clearCandidate(); };
      this.candidateCancel = () => signal.removeEventListener('abort', clear);
      this.candidateLease = setTimeout(clear, 2_000);
      signal.addEventListener('abort', clear, { once: true });
    }
    if (!await authorizeHandoff()) {
      this.suppressed += 1;
      for (const finish of this.suppressionWaiters) finish();
      return;
    }
    if (signal.aborted || mail.caseGeneration !== this.generation || !mail.token) return;
    const copy: RecoveryMail = { ...mail, token: mail.token };
    const id = ++this.sequence;
    this.messages.set(id, copy);
    this.leases.set(id, setTimeout(() => this.discard(id), this.receiverLeaseMs));
    const waiter = [...this.waiters].find((candidate) => candidate.recipient === mail.recipient);
    if (waiter) { this.discard(id); waiter.finish(copy); }
    if (mode === 'reject-after-handoff') throw new Error('RECOVERY_MAIL_UNCERTAIN_AFTER_HANDOFF');
  }

  async take(recipient: string): Promise<RecoveryMail> {
    const existing = [...this.messages].find(([, mail]) => mail.recipient === recipient);
    if (existing) { this.discard(existing[0]); return existing[1]; }
    return new Promise<RecoveryMail>((resolve, reject) => {
      const waiter = {
        recipient,
        finish: (mail: RecoveryMail): void => { clearTimeout(timer); this.waiters.delete(waiter); resolve(mail); },
        fail: (): void => { clearTimeout(timer); this.waiters.delete(waiter); reject(new Error('RECOVERY_MAIL_DEADLINE')); },
      };
      const timer = setTimeout(waiter.fail, 1_700);
      this.waiters.add(waiter);
    });
  }

  teardown(): void {
    this.generation += 1;
    for (const cancel of this.activeCancels) cancel();
    for (const id of this.messages.keys()) this.discard(id);
    for (const waiter of this.waiters) waiter.fail();
    this.nextDelayMs = 0; this.nextMode = 'deliver'; this.nextGate = null;
    this.captureRejected = false; this.clearCandidate(); this.suppressed = 0; this.receiverLeaseMs = 120_000;
    for (const finish of this.suppressionWaiters) finish();
  }

  private clearCandidate(): void {
    this.candidateCancel?.(); this.candidateCancel = null;
    if (this.candidateLease) clearTimeout(this.candidateLease);
    this.candidateLease = null; this.candidateToken = null;
  }
  private discard(id: number): void {
    this.messages.delete(id);
    const timer = this.leases.get(id);
    if (timer) clearTimeout(timer);
    this.leases.delete(id);
  }
  private async wait(signal: AbortSignal, milliseconds?: number, gate?: DeliveryGate): Promise<boolean> {
    if (signal.aborted) return false;
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (complete: boolean): void => {
        if (timer) clearTimeout(timer);
        signal.removeEventListener('abort', cancel); gate?.listeners.delete(released);
        this.activeCancels.delete(cancel); resolve(complete);
      };
      const cancel = (): void => finish(false);
      const released = (): void => finish(true);
      this.activeCancels.add(cancel); signal.addEventListener('abort', cancel, { once: true });
      if (gate) { gate.listeners.add(released); if (gate.released) released(); }
      else if (milliseconds !== undefined) timer = setTimeout(released, milliseconds);
      if (signal.aborted) cancel();
    });
  }
}

export interface RecoveryHarnessAuthority {
  databaseUrl: string;
  expectedDatabase: string;
  markerPath: string;
  fixtures: ReadonlyArray<{ id: string; email: string }>;
}

// Única entrada pública al receptor: no existe constructor exportado habilitado.
export async function createOwnedRecoveryMailHarness(prisma: PrismaClient, authority: RecoveryHarnessAuthority): Promise<HarnessMail> {
  assertOwnedLoopbackDatabase(authority.databaseUrl, authority.expectedDatabase);
  const marker = readFileSync(authority.markerPath, 'utf8').trim();
  if (!marker || !authority.fixtures.length || new Set(authority.fixtures.map((fixture) => fixture.id)).size !== authority.fixtures.length ||
      authority.fixtures.some((fixture) => !fixture.id || !fixture.email || !/\.(test|invalid)$/.test(fixture.email))) {
    throw new Error('RECOVERY_HARNESS_FIXTURE_GUARD');
  }
  const rows = await prisma.$queryRaw<Array<{ count: bigint; total: bigint }>>`SELECT
    count(*) FILTER (WHERE marker = ${marker})::bigint AS count, count(*)::bigint AS total FROM be05_harness_owner`;
  const identity = await prisma.$queryRaw<Array<{ database: string; role: string; owner: string; marker: string | null }>>`SELECT
    current_database() AS database, current_user AS role, pg_get_userbyid(datdba) AS owner,
    shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = current_database()`;
  const users = await prisma.user.count();
  if (rows[0]?.count !== 1n || rows[0]?.total !== 1n || users !== 0 || identity[0]?.database !== authority.expectedDatabase ||
      identity[0]?.role !== 'pokemon' || identity[0]?.owner !== 'pokemon' || identity[0]?.marker !== marker) {
    throw new Error('RECOVERY_HARNESS_OWNERSHIP_GUARD');
  }
  return new HarnessMail(new Map(authority.fixtures.map((fixture) => [fixture.id, fixture.email])));
}

export type RecoveryMailHarness = Awaited<ReturnType<typeof createOwnedRecoveryMailHarness>>;
