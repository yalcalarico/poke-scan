import { Inject, Injectable, Optional, ServiceUnavailableException, UnauthorizedException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/index.js';
import { SUPPRESSION_JOURNAL, type SuppressionJournal } from './suppression-journal.js';
import { applyAndVerifySuppressions } from './account-deletion-restore.js';

@Injectable()
export class AccountSuppressionService implements OnModuleInit, OnModuleDestroy {
  private ready = false;
  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService,
    @Optional() @Inject(SUPPRESSION_JOURNAL) private readonly journal?: SuppressionJournal) {}
  get enabled(): boolean { return this.config.get<string>('ACCOUNT_DELETION_MODE') === 'local-private'; }
  async onModuleInit(): Promise<void> {
    if (!this.enabled) { this.ready = true; return; }
    if (!this.journal) throw this.unavailable();
    try { await this.journal.open(); await this.reconcile(); this.ready = true; }
    catch { this.ready = false; throw this.unavailable(); }
  }
  async onModuleDestroy(): Promise<void> { this.ready = false; await this.journal?.close(); }
  async isAvailable(): Promise<boolean> {
    if (!this.enabled || !this.ready) return false;
    try { await this.snapshot(); return true; } catch { return false; }
  }
  async assertAllowed(userId: string): Promise<void> {
    if (!this.enabled) return;
    const snapshot = await this.snapshot();
    if (snapshot.entries.some((entry) => entry.userId === userId)) throw new UnauthorizedException('La sesión ya no está disponible');
  }
  async accept(userId: string): Promise<void> {
    if (!this.enabled || !this.ready || !this.journal) throw this.unavailable();
    try { await this.journal.accept(userId); } catch { this.ready = false; throw this.unavailable(); }
  }
  async reconcile(): Promise<void> {
    if (!this.journal) throw this.unavailable();
    await applyAndVerifySuppressions(this.prisma, await this.journal.snapshot());
  }
  private async snapshot() {
    if (!this.ready || !this.journal) throw this.unavailable();
    try { return await this.journal.snapshot(); } catch { this.ready = false; throw this.unavailable(); }
  }
  private unavailable(): ServiceUnavailableException { return new ServiceUnavailableException('No pudimos validar la protección de la cuenta'); }
}
