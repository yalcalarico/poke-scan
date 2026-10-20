import { Inject, Injectable, Optional, ServiceUnavailableException, UnauthorizedException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/index.js';
import { SUPPRESSION_JOURNAL, type SuppressionJournal } from './suppression-journal.js';
import { SUPPRESSION_CUSTODY, type SuppressionCustody } from './suppression-custody.js';
import { applyAndVerifySuppressions } from './account-deletion-restore.js';

@Injectable()
export class AccountSuppressionService implements OnModuleInit, OnModuleDestroy {
  private ready = false;
  private closing = false;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService,
    @Optional() @Inject(SUPPRESSION_JOURNAL) private readonly journal?: SuppressionJournal,
    @Optional() @Inject(SUPPRESSION_CUSTODY) private readonly custody?: SuppressionCustody) {}
  get enabled(): boolean { return this.config.get<string>('ACCOUNT_DELETION_MODE') === 'local-private'; }
  private get custodyRequired(): boolean { return this.config.get<string>('ACCOUNT_DELETION_CUSTODY_MODE', 'local-private') === 'local-simulated'; }
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work); this.queue = result.catch(() => undefined); return result;
  }
  async onModuleInit(): Promise<void> {
    if (!this.enabled) { this.ready = true; return; }
    if (!this.journal || (this.custodyRequired && !this.custody)) throw this.unavailable();
    await this.serial(async () => {
      try {
        await this.journal!.open();
        if (this.custodyRequired) await this.custody!.confirm(await this.journal!.snapshot());
        await applyAndVerifySuppressions(this.prisma, await this.journal!.snapshot());
        this.ready = true;
      } catch {
        this.ready = false;
        await this.journal!.close().catch(() => undefined);
        throw this.unavailable();
      }
    });
  }
  async onModuleDestroy(): Promise<void> {
    this.closing = true; this.ready = false;
    await this.serial(async () => { await this.journal?.close(); });
  }
  async isAvailable(): Promise<boolean> {
    if (!this.enabled || !this.ready || this.closing) return false;
    try { await this.snapshot(); return true; } catch { return false; }
  }
  async assertAllowed(userId: string): Promise<void> {
    if (!this.enabled) return;
    const snapshot = await this.snapshot();
    if (snapshot.entries.some((entry) => entry.userId === userId)) throw new UnauthorizedException('La sesión ya no está disponible');
  }
  /** Reserva antes de validar la contraseña bajo el lock PG, nunca después de abrir esa transacción. */
  async withDeletionTurn<T>(work: (accept: (userId: string) => Promise<void>) => Promise<T>): Promise<T> {
    let cancelled = false, started = false;
    let rejectWait: (error: Error) => void = () => undefined;
    const waiting = new Promise<never>((_resolve, reject) => { rejectWait = reject; });
    const timer = setTimeout(() => { if (!started) { cancelled = true; rejectWait(this.unavailable()); } }, 5_000);
    const turn = this.serial(async () => {
      started = true; clearTimeout(timer);
      if (cancelled || !this.enabled || !this.ready || this.closing) throw this.unavailable();
      return work((userId) => this.acceptCurrent(userId));
    });
    try { return await Promise.race([turn, waiting]); } finally { clearTimeout(timer); }
  }
  async accept(userId: string): Promise<void> { await this.withDeletionTurn((accept) => accept(userId)); }
  private async acceptCurrent(userId: string): Promise<void> {
    if (!this.enabled || !this.ready || !this.journal || this.closing) throw this.unavailable();
    try {
      await this.journal.accept(userId);
      if (this.custodyRequired) {
        if (!this.custody) throw this.unavailable();
        await this.custody.confirm(await this.journal.snapshot());
      }
    } catch { this.ready = false; throw this.unavailable(); }
  }
  async reconcile(): Promise<void> {
    await this.serial(async () => {
      if (!this.journal || !this.ready || this.closing) throw this.unavailable();
      try {
        const snapshot = await this.journal.snapshot();
        if (this.custodyRequired) await this.custody!.confirm(snapshot);
        await applyAndVerifySuppressions(this.prisma, snapshot);
      } catch { this.ready = false; throw this.unavailable(); }
    });
  }
  private async snapshot() {
    if (!this.ready || !this.journal || this.closing) throw this.unavailable();
    try { return await this.journal.snapshot(); } catch { this.ready = false; throw this.unavailable(); }
  }
  private unavailable(): ServiceUnavailableException { return new ServiceUnavailableException('No pudimos validar la protección de la cuenta'); }
}
