import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth/auth.service.js';
import { PasswordRecoveryService } from '../auth/password-recovery.service.js';
import { ShareService, publicCacheKey } from '../share/share.service.js';
import type { RedisService } from '../../redis/index.js';
import type { PriceProvider } from '../providers/card-provider.interface.js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, realpath, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, type Prisma } from '@prisma/client';
import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AccountDeletionService } from './account-deletion.service.js';
import { AccountSuppressionService } from './account-suppression.service.js';
import { initializeLocalSuppressionJournal, LocalSuppressionJournal } from './suppression-journal.js';
import { restoreWithSuppressions } from './account-deletion-restore.js';
import type { PrismaService } from '../../prisma/index.js';

const password = 'synthetic-password-123';
describe('baja propia y restauración en DB aislada', () => {
  const prisma = new PrismaClient();
  const ownedIds: string[] = [];
  let root: string; let journal: LocalSuppressionJournal; let suppression: AccountSuppressionService; let service: AccountDeletionService;
  let target: { id: string; authVersion: number; email: string; username: string; displayName: string; passwordHash: string };
  const config = new ConfigService({ ACCOUNT_DELETION_MODE: 'local-private' });
  async function createOwnUser() {
    const id = randomUUID(); ownedIds.push(id);
    return prisma.user.create({ data: { id, email: `synthetic-deletion-${id}@example.invalid`, username: `syn_${id.replaceAll('-', '').slice(0, 18)}`, displayName: 'Cuenta sintética propia', passwordHash: await argon2.hash(password) } });
  }
  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'pcs-deletion-db-spec-')));
    await mkdir(join(root, 'journal'), { mode: 0o700 }); await mkdir(join(root, 'checkpoint'), { mode: 0o700 });
    const settings = { journalDirectory: join(root, 'journal'), checkpointDirectory: join(root, 'checkpoint'), hmacKey: 'synthetic-private-journal-key-only-for-tests' };
    await initializeLocalSuppressionJournal(settings, new Date(Date.now() - 86400_000).toISOString());
    journal = new LocalSuppressionJournal(settings);
    suppression = new AccountSuppressionService(config, prisma as PrismaService, journal);
    await suppression.onModuleInit(); service = new AccountDeletionService(prisma as PrismaService, suppression); target = await createOwnUser();
  });
  afterEach(async () => {
    vi.restoreAllMocks(); await suppression.onModuleDestroy();
    await prisma.user.deleteMany({ where: { id: { in: ownedIds } } });
    await rm(root, { recursive: true });
  });
  afterAll(async () => { await prisma.$disconnect(); });
  const dto = { password, confirmation: 'ELIMINAR' as const };
  it('contraseña/version incorrecta no acepta registro ni borra otra cuenta', async () => {
    const other = await createOwnUser();
    await expect(service.deleteOwnAccount({ sub: target.id, email: other.email, authVersion: 0 }, { ...dto, password: 'incorrect-pass' })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.deleteOwnAccount({ sub: target.id, email: target.email, authVersion: 1 }, dto)).rejects.toBeInstanceOf(UnauthorizedException);
    expect((await journal.snapshot()).entries).toHaveLength(0);
    expect(await prisma.user.count({ where: { id: { in: [target.id, other.id] } } })).toBe(2);
  });
  it('suprime cascadas personales, conserva otro usuario y catálogo/globales', async () => {
    const other = await createOwnUser(); const card = await prisma.card.findFirstOrThrow();
    const counts = [await prisma.card.count(), await prisma.cardSet.count(), await prisma.cardPrice.count(), await prisma.priceRefreshJob.count()];
    const collection = await prisma.collection.create({ data: { userId: target.id, name: 'Colección sintética' } });
    const item = await prisma.collectionItem.create({ data: { collectionId: collection.id, cardId: card.id, notes: 'Dato sintético' } });
    const share = await prisma.shareLink.create({ data: { userId: target.id, collectionId: collection.id, slug: randomUUID() } });
    await prisma.refreshToken.create({ data: { userId: target.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60_000) } });
    await prisma.passwordRecoveryToken.create({ data: { userId: target.id, tokenHash: randomUUID(), issuedAuthVersion: 0, expiresAt: new Date(Date.now() + 60_000) } });
    await prisma.portfolioSnapshot.create({ data: { userId: target.id, day: new Date(), totalCards: 1, unpricedCards: 1 } });
    await prisma.collectionItemAddOperation.create({ data: { userId: target.id, key: randomUUID(), payloadHash: 'synthetic', expiresAt: new Date(Date.now() + 60_000) } });
    await prisma.friendship.create({ data: { requesterId: target.id, addresseeId: other.id } });
    await prisma.scanJob.create({ data: { userId: target.id } });
    await expect(service.deleteOwnAccount({ sub: target.id, email: target.email, authVersion: 0 }, dto)).resolves.toEqual({ success: true });
    expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: other.id } })).not.toBeNull();
    expect(await prisma.collectionItem.findUnique({ where: { id: item.id } })).toBeNull();
    expect(await prisma.shareLink.findUnique({ where: { id: share.id } })).toBeNull();
    expect([await prisma.card.count(), await prisma.cardSet.count(), await prisma.cardPrice.count(), await prisma.priceRefreshJob.count()]).toEqual(counts);
    await expect(suppression.assertAllowed(target.id)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(suppression.assertAllowed(other.id)).resolves.toBeUndefined();
    expect(await suppression.reconcile()).toBeUndefined();
  });
  it('invalida las claves conocidas después del commit y confirma aun con Redis degradado', async () => {
    const del = vi.fn().mockRejectedValue(new Error('synthetic-cache-unavailable'));
    const slug = randomUUID();
    await prisma.shareLink.create({ data: { userId: target.id, slug } });
    const cached = new AccountDeletionService(prisma as PrismaService, suppression,
      { del } as unknown as RedisService, { id: 'synthetic-provider' } as PriceProvider);
    await expect(cached.deleteOwnAccount({ sub: target.id, email: target.email, authVersion: 0 }, dto)).resolves.toEqual({ success: true });
    expect(del).toHaveBeenCalledWith(publicCacheKey('synthetic-provider', slug));
    expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
  });
  it('registro denegado nunca borra PG', async () => {
    vi.spyOn(journal, 'accept').mockRejectedValue(new Error('synthetic-disk-denied'));
    await expect(service.deleteOwnAccount({ sub: target.id, email: target.email, authVersion: 0 }, dto)).rejects.toThrow();
    expect(await prisma.user.findUnique({ where: { id: target.id } })).not.toBeNull();
  });
  it('intent durable con fallo PG bloquea sólo cuenta y reconcilia al reiniciar', async () => {
    const other = await createOwnUser();
    const failing = { $transaction: async (work: (tx: Prisma.TransactionClient) => Promise<unknown>) => prisma.$transaction(async (tx) => work({ ...tx, user: { ...tx.user, deleteMany: async () => { throw new Error('synthetic-commit-failure'); } } } as unknown as Prisma.TransactionClient)) } as unknown as PrismaService;
    const broken = new AccountDeletionService(failing, suppression);
    await expect(broken.deleteOwnAccount({ sub: target.id, email: target.email, authVersion: 0 }, dto)).rejects.toThrow();
    expect(await prisma.user.findUnique({ where: { id: target.id } })).not.toBeNull();
    await expect(suppression.assertAllowed(target.id)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(suppression.assertAllowed(other.id)).resolves.toBeUndefined();
    await suppression.onModuleDestroy();
    // El proceso nuevo usa misma custodia, sin tráfico hasta replay.
    journal = new LocalSuppressionJournal({ journalDirectory: join(root, 'journal'), checkpointDirectory: join(root, 'checkpoint'), hmacKey: 'synthetic-private-journal-key-only-for-tests' });
    suppression = new AccountSuppressionService(config, prisma as PrismaService, journal); await suppression.onModuleInit();
    expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
  });
  it('bajas concurrentes sólo aceptan una supresión, sin éxito ficticio del perdedor', async () => {
    const session = { sub: target.id, email: target.email, authVersion: 0 };
    const results = await Promise.allSettled([service.deleteOwnAccount(session, dto), service.deleteOwnAccount(session, dto)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await journal.snapshot()).entries).toHaveLength(1);
  });
  it('snapshot anterior no reactiva usuario; replay es idempotente', async () => {
    const originalCreatedAt = new Date().toISOString();
    await service.deleteOwnAccount({ sub: target.id, email: target.email, authVersion: 0 }, dto);
    // Simula exclusivamente el usuario sintético de un snapshot viejo en el destino aislado.
    await prisma.user.create({ data: { id: target.id, email: target.email, username: target.username, displayName: target.displayName, passwordHash: target.passwordHash } });
    const currentCheckpoint = (await journal.snapshot()).checkpoint;
    expect(await restoreWithSuppressions(prisma, journal, { originalCreatedAt, currentCheckpoint })).toBe(1);
    expect(await restoreWithSuppressions(prisma, journal, { originalCreatedAt, currentCheckpoint })).toBe(0);
    expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
  });
  it('intención pendiente impide login, refresh, reset y share aunque Redis tenga caché caliente', async () => {
    const authConfig = new ConfigService({ ACCOUNT_DELETION_MODE: 'local-private', RECOVERY_IDENTIFIER_HMAC_KEY: 'synthetic-recovery-key-only-for-tests' });
    const auth = new AuthService(prisma as PrismaService, new JwtService({ secret: 'synthetic-test-jwt-secret' }), authConfig, suppression);
    const session = await auth.login({ email: target.email, password });
    const token = randomBytes(32).toString('base64url');
    await prisma.passwordRecoveryToken.create({ data: { userId: target.id, tokenHash: createHash('sha256').update(token).digest('hex'), issuedAuthVersion: 0, expiresAt: new Date(Date.now() + 60_000) } });
    const link = await prisma.shareLink.create({ data: { userId: target.id, slug: randomUUID() } });
    const getJson = vi.fn().mockResolvedValue({ ownerDisplayName: 'Caché sintética' });
    const share = new ShareService(prisma as PrismaService, { getJson } as unknown as RedisService, { id: 'synthetic-provider' } as PriceProvider, suppression);
    const recovery = new PasswordRecoveryService(prisma as PrismaService, authConfig, { available: false, caseGeneration: 1, deliver: async () => undefined }, suppression);
    await journal.accept(target.id);
    await expect(auth.login({ email: target.email, password })).rejects.toThrow();
    await expect(auth.refresh({ refreshToken: session.refreshToken })).rejects.toThrow();
    await expect(recovery.recover(token, 'synthetic-new-password', 'synthetic-deletion-ip')).rejects.toThrow();
    await expect(share.getPublic(link.slug)).rejects.toThrow('Este enlace no está disponible');
    expect(getJson).not.toHaveBeenCalled();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).authVersion).toBe(0);
    await recovery.onModuleDestroy();
  });
  it('login y reset en carrera se ordenan por User lock y no reactivan la baja', async () => {
    const authConfig = new ConfigService({ ACCOUNT_DELETION_MODE: 'local-private', RECOVERY_IDENTIFIER_HMAC_KEY: 'synthetic-recovery-key-only-for-tests' });
    const auth = new AuthService(prisma as PrismaService, new JwtService({ secret: 'synthetic-test-jwt-secret' }), authConfig, suppression);
    const recovery = new PasswordRecoveryService(prisma as PrismaService, authConfig, { available: false, caseGeneration: 1, deliver: async () => undefined }, suppression);
    const token = randomBytes(32).toString('base64url');
    await prisma.passwordRecoveryToken.create({ data: { userId: target.id, tokenHash: createHash('sha256').update(token).digest('hex'), issuedAuthVersion: 0, expiresAt: new Date(Date.now() + 60_000) } });
    const results = await Promise.allSettled([
      service.deleteOwnAccount({ sub: target.id, email: target.email, authVersion: 0 }, dto),
      auth.login({ email: target.email, password }), recovery.recover(token, 'synthetic-new-password', 'synthetic-racing-ip'),
    ]);
    if (results[0]!.status === 'fulfilled') {
      expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
      expect(await prisma.refreshToken.count({ where: { userId: target.id } })).toBe(0);
      expect(await prisma.passwordRecoveryToken.count({ where: { userId: target.id } })).toBe(0);
    } else {
      // Si reset ganó el lock, cambia versión y baja debe requerir nueva sesión/clave.
      expect(results[2]!.status).toBe('fulfilled');
      expect((await journal.snapshot()).entries).toHaveLength(0);
    }
    await recovery.onModuleDestroy();
  });

});
