import { PrismaClient, Prisma } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { PrismaService } from '../../prisma/index.js';
import type { CollectionComparisonService } from '../collection-comparison.service.js';
import { TcgcsvService } from './tcgcsv.service.js';
import { TcgcsvClient } from './tcgcsv.client.js';

const CARD = 'test-tcgcsv-comparison-18';
const OTHER = 'test-tcgcsv-comparison-other';
const PRODUCT = 991716451;
const BUILD = '2026-10-12T20:05:44+0000';
const DYNAMIC_SET = 'test-tcgcsv-dynamic-set';
const DYNAMIC_GROUP = 991724123;
const products = JSON.stringify({ success: true, errors: [], totalItems: 1, results: [{ productId: PRODUCT, categoryId: 3, groupId: 24722, name: 'TestComparison - 018/128', extendedData: [{ name: 'Number', value: '018/128' }] }] });
const prices = (overrides: Record<string, unknown> = {}): string => JSON.stringify({ success: true, errors: [], results: [{ productId: PRODUCT, subTypeName: 'Holofoil', lowPrice: 0, midPrice: null, highPrice: 1, marketPrice: 0, ...overrides }] });
const checksum = (body: string): string => createHash('sha256').update(products).update('\n').update(body).digest('hex');

describe('TCGCSV: publicación SQL y presupuesto durable', () => {
  const prisma = new PrismaClient();
  const client = new TcgcsvClient();
  const snapshots = { capture: vi.fn(async () => undefined) };
  const service = new TcgcsvService(prisma as PrismaService, client, snapshots as unknown as CollectionComparisonService, () => new Date('2026-10-13T12:00:00Z'));
  const originalFlag = process.env.ENABLE_TCGCSV_INGESTION;
  let originalJob: Record<string, unknown> | undefined;
  let originalQuota: { requestCount: number; requestWindowStartedAt: Date; downloadCount: number; downloadWindowStartedAt: Date };
  let body = prices();
  let buildReads = 0;
  let changedBuild = false;
  let expireLease = false;
  let failSnapshot = false;

  beforeAll(async () => {
    [originalQuota] = await prisma.$queryRaw<typeof originalQuota[]>`SELECT "requestCount", "requestWindowStartedAt", "downloadCount", "downloadWindowStartedAt" FROM tcgcsv_discovery_state WHERE id = 'global'`;
    [originalJob] = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM tcgcsv_group_jobs WHERE "groupId" = 24722`;
    const set = await prisma.cardSet.findUnique({ where: { id: 'me55' } });
    expect(set?.printedTotal).toBe(128);
  });
  const clean = async (): Promise<void> => {
    const runIds = await prisma.$queryRaw<{ ingestionRunId: string | null }[]>`SELECT DISTINCT "ingestionRunId" FROM card_prices WHERE "cardId" IN (${CARD}, ${OTHER})`;
    await prisma.card.deleteMany({ where: { id: { in: [CARD, OTHER] } } });
    const ids = runIds.flatMap((row) => row.ingestionRunId ? [row.ingestionRunId] : []);
    if (ids.length > 0) await prisma.$executeRaw(Prisma.sql`DELETE FROM price_ingestion_runs WHERE id IN (${Prisma.join(ids)})`);
    // Una corrida abortada no deja filas. Los checksums contienen identidades exclusivas del spec.
    await prisma.$executeRaw`DELETE FROM price_ingestion_runs WHERE checksum IN (${checksum(prices())}, ${checksum(prices({ marketPrice: null }))})`;
    await prisma.$executeRaw`DELETE FROM price_ingestion_runs WHERE "groupId" = 24722 AND checksum = ${checksum(JSON.stringify({ success: true, errors: [], results: [{ productId: PRODUCT, subTypeName: 'Unknown Foil', lowPrice: null, midPrice: null, highPrice: null, marketPrice: null }] }))}`;
    await prisma.$executeRaw`DELETE FROM tcgcsv_group_jobs WHERE "groupId" = 24722`;
    await prisma.$executeRaw`DELETE FROM price_ingestion_runs WHERE "groupId" = ${DYNAMIC_GROUP}`;
    await prisma.$executeRaw`DELETE FROM tcgcsv_group_jobs WHERE "groupId" = ${DYNAMIC_GROUP}`;
    await prisma.cardSet.deleteMany({ where: { id: DYNAMIC_SET } });
  };
  beforeEach(async () => {
    vi.restoreAllMocks();
    await clean();
    process.env.ENABLE_TCGCSV_INGESTION = 'true';
    await prisma.$executeRaw`UPDATE tcgcsv_discovery_state SET "requestCount" = 0, "downloadCount" = 0, "requestWindowStartedAt" = NOW(), "downloadWindowStartedAt" = NOW() WHERE id = 'global'`;
    body = prices(); buildReads = 0; changedBuild = false; expireLease = false; failSnapshot = false;
    snapshots.capture.mockImplementation(async () => { if (failSnapshot) throw new Error('corte fallido'); });
    snapshots.capture.mockClear();
    vi.spyOn(client, 'fetchFeed').mockImplementation(async (path) => {
      if (path === 'last-updated.txt') {
        buildReads += 1;
        if (expireLease && buildReads === 2) await prisma.$executeRaw`UPDATE tcgcsv_group_jobs SET "leaseUntil" = NOW() - INTERVAL '1 second' WHERE "groupId" = 24722`;
        return changedBuild && buildReads > 1 ? '2026-10-13T01:00:00+0000' : BUILD;
      }
      if (path.endsWith('/products')) return products;
      if (path.endsWith('/prices')) return body;
      throw new Error('Ruta inesperada');
    });
    await prisma.card.create({ data: { id: CARD, name: 'TestComparison', number: '18', setId: 'me55', language: 'en', supertype: 'Pokémon', subtypes: [], types: [], imageSmall: '', imageLarge: '', rawJson: {} } });
  });
  afterAll(async () => {
    await clean();
    if (originalJob) await prisma.$executeRaw(Prisma.sql`
      INSERT INTO tcgcsv_group_jobs ("groupId", status, "availableAt", "lockedBy", "leaseUntil", "downloadStartedAt", "publishedBuild", "lastError", "updatedAt")
      VALUES (24722, ${originalJob.status as string}, ${originalJob.availableAt as Date}, ${originalJob.lockedBy as string | null}, ${originalJob.leaseUntil as Date | null},
        ${originalJob.downloadStartedAt as Date | null}, ${originalJob.publishedBuild as Date | null}, ${originalJob.lastError as string | null}, ${originalJob.updatedAt as Date})
    `);
    if (originalQuota) await prisma.$executeRaw`
      UPDATE tcgcsv_discovery_state SET "requestCount" = ${originalQuota.requestCount}, "requestWindowStartedAt" = ${originalQuota.requestWindowStartedAt},
        "downloadCount" = ${originalQuota.downloadCount}, "downloadWindowStartedAt" = ${originalQuota.downloadWindowStartedAt} WHERE id = 'global'
    `;
    if (originalFlag === undefined) delete process.env.ENABLE_TCGCSV_INGESTION; else process.env.ENABLE_TCGCSV_INGESTION = originalFlag;
    vi.restoreAllMocks();
    await prisma.$disconnect();
  });

  it('apagado no encola, consulta ni publica', async () => {
    process.env.ENABLE_TCGCSV_INGESTION = 'false';
    await service.enqueue(24722);
    expect(await service.runOne(24722)).toBe(false);
    expect(client.fetchFeed).not.toHaveBeenCalled();
  });
  it('dos consumidores publican una sola observación, cero conocido y metadata completa', async () => {
    await service.enqueue(24722);
    const outcomes = await Promise.all([service.runOne(24722), service.runOne(24722)]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    const rows = await prisma.cardPrice.findMany({ where: { cardId: CARD } });
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].market)).toBe(0);
    expect(rows[0].provider).toBe('tcgcsv');
    expect(rows[0].variant).toBe('holofoil');
    expect(rows[0].feedPublishedAt?.toISOString()).toBe('2026-10-12T20:05:44.000Z');
    expect(rows[0].externalProductId).toBe(PRODUCT);
    expect(rows[0].ingestionChecksum).toBe(checksum(body));
    expect(snapshots.capture).toHaveBeenCalledOnce();
    await service.enqueue(24722);
    expect(await service.runOne(24722)).toBe(false);
    expect(client.fetchFeed).toHaveBeenCalledTimes(4);
  });
  it('market null se guarda como observación sin precio', async () => {
    body = prices({ marketPrice: null });
    await service.enqueue(24722); await service.runOne(24722);
    expect((await prisma.cardPrice.findFirst({ where: { cardId: CARD } }))?.market).toBeNull();
  });
  it('publica un feed válido con cobertura parcial sin inventar ni renovar el precio ausente', async () => {
    const unquotedProduct = PRODUCT + 1;
    const missingProducts = JSON.parse(products) as { results: unknown[]; totalItems: number };
    missingProducts.results.push({ productId: unquotedProduct, categoryId: 3, groupId: 24722, name: 'UnquotedFixture - 019/128', extendedData: [{ name: 'Number', value: '019/128' }] });
    missingProducts.totalItems = 2;
    await prisma.card.create({ data: { id: OTHER, name: 'UnquotedFixture', number: '19', setId: 'me55', language: 'en', supertype: 'Pokémon', subtypes: [], types: [], imageSmall: '', imageLarge: '', rawJson: {} } });
    const oldAt = new Date('2026-10-11T12:00:00Z');
    await prisma.cardPrice.create({ data: { cardId: OTHER, variant: 'holofoil', market: 3.5, provider: 'tcgcsv', source: 'tcgplayer', currency: 'USD', fetchedAt: oldAt, feedPublishedAt: oldAt } });
    const original = vi.mocked(client.fetchFeed).getMockImplementation()!;
    vi.mocked(client.fetchFeed).mockImplementation((path, limit) => path.endsWith('/products') ? Promise.resolve(JSON.stringify(missingProducts)) : original(path, limit));
    await service.enqueue(24722);
    await service.runOne(24722);
    expect(await prisma.tcgcsvGroupJob.findUnique({ where: { groupId: 24722 } })).toMatchObject({ status: 'completed' });
    expect(await prisma.cardPrice.count({ where: { cardId: CARD } })).toBe(1);
    expect(await prisma.cardPrice.findMany({ where: { cardId: OTHER } })).toEqual([expect.objectContaining({ fetchedAt: oldAt })]);
    expect(await prisma.priceSyncCardDay.findUnique({ where: { provider_cardId_syncDate: { provider: 'tcgcsv', cardId: OTHER, syncDate: new Date('2026-10-13') } } })).toMatchObject({ status: 'no_quote', quoteCount: 0 });
  });
  it('un build repetido no vuelve a descargar contenido ni cambia fetchedAt', async () => {
    await service.enqueue(24722); await service.runOne(24722);
    const previous = await prisma.cardPrice.findFirstOrThrow({ where: { cardId: CARD } });
    await prisma.$executeRaw`UPDATE tcgcsv_group_jobs SET status = 'pending', "availableAt" = NOW(), "downloadStartedAt" = NOW() - INTERVAL '25 hours' WHERE "groupId" = 24722`;
    await service.runOne(24722);
    expect(client.fetchFeed).toHaveBeenCalledTimes(5);
    expect((await prisma.cardPrice.findFirstOrThrow({ where: { cardId: CARD } })).fetchedAt).toEqual(previous.fetchedAt);
    expect(await prisma.cardPrice.count({ where: { cardId: CARD } })).toBe(1);
  });
  it('cambio de build durante descarga conserva la cuota y no deja staging publicado', async () => {
    changedBuild = true;
    await service.enqueue(24722); await service.runOne(24722);
    expect(await prisma.cardPrice.count({ where: { cardId: CARD } })).toBe(0);
    const [job] = await prisma.$queryRaw<{ status: string; downloadStartedAt: Date; availableAt: Date }[]>`SELECT * FROM tcgcsv_group_jobs WHERE "groupId" = 24722`;
    expect(job.status).toBe('failed');
    expect(job.availableAt.getTime() - job.downloadStartedAt.getTime()).toBeGreaterThanOrEqual(86400000);
    await service.enqueue(24722);
    expect(await service.runOne(24722)).toBe(false);
  });
  it('contenido parcial y variantes desconocidas no publican un grupo como ready', async () => {
    body = JSON.stringify({ success: true, errors: [], results: [{ productId: PRODUCT, subTypeName: 'Unknown Foil', lowPrice: null, midPrice: null, highPrice: null, marketPrice: null }] });
    await service.enqueue(24722); await service.runOne(24722);
    expect(await prisma.cardPrice.count({ where: { cardId: CARD } })).toBe(0);
    const [job] = await prisma.$queryRaw<{ status: string; publishedBuild: Date | null }[]>`SELECT status, "publishedBuild" FROM tcgcsv_group_jobs WHERE "groupId" = 24722`;
    expect(job).toMatchObject({ status: 'failed', publishedBuild: null });
  });
  it('un fallo de red tras reservar contenido no publica ni devuelve el presupuesto', async () => {
    vi.mocked(client.fetchFeed).mockImplementation(async (path) => {
      if (path === 'last-updated.txt') return BUILD;
      throw new Error('fallo de red simulado');
    });
    await service.enqueue(24722); await service.runOne(24722);
    expect(await prisma.cardPrice.count({ where: { cardId: CARD } })).toBe(0);
    const [job] = await prisma.$queryRaw<{ status: string; downloadStartedAt: Date; availableAt: Date }[]>`SELECT * FROM tcgcsv_group_jobs WHERE "groupId" = 24722`;
    expect(job.status).toBe('failed');
    expect(job.availableAt.getTime() - job.downloadStartedAt.getTime()).toBeGreaterThanOrEqual(86400000);
    await service.enqueue(24722); expect(await service.runOne(24722)).toBe(false);
  });
  it('un build que retrocede conserva el lote anterior sin descargar products/prices', async () => {
    await service.enqueue(24722); await service.runOne(24722);
    await prisma.$executeRaw`UPDATE tcgcsv_group_jobs SET status = 'pending', "availableAt" = NOW(), "downloadStartedAt" = NOW() - INTERVAL '25 hours', "publishedBuild" = ${new Date('2026-10-13T00:00:00Z')} WHERE "groupId" = 24722`;
    await service.runOne(24722);
    expect(client.fetchFeed).toHaveBeenCalledTimes(5);
    expect(await prisma.cardPrice.count({ where: { cardId: CARD } })).toBe(1);
    const [job] = await prisma.$queryRaw<{ status: string; publishedBuild: Date }[]>`SELECT * FROM tcgcsv_group_jobs WHERE "groupId" = 24722`;
    expect(job.status).toBe('failed');
    expect(job.publishedBuild.toISOString()).toBe('2026-10-13T00:00:00.000Z');
  });
  it('un lease vencido no autoriza publicar; la recuperación conserva las 24 h', async () => {
    expireLease = true;
    await service.enqueue(24722); await service.runOne(24722);
    expect(await prisma.cardPrice.count({ where: { cardId: CARD } })).toBe(0);
    expect(await service.runOne(24722)).toBe(false);
    const [job] = await prisma.$queryRaw<{ status: string; downloadStartedAt: Date; availableAt: Date }[]>`SELECT * FROM tcgcsv_group_jobs WHERE "groupId" = 24722`;
    expect(job.status).toBe('pending');
    expect(job.availableAt.getTime() - job.downloadStartedAt.getTime()).toBeGreaterThanOrEqual(86400000);
  });
  it('una colisión de identidad revierte corrida y observaciones en una sola transacción', async () => {
    await prisma.card.create({ data: { id: OTHER, name: 'Otra identidad', number: '999', setId: 'me55', supertype: 'Pokémon', subtypes: [], types: [], imageSmall: '', imageLarge: '', rawJson: {} } });
    await prisma.cardExternalId.create({ data: { provider: 'tcgcsv', externalId: String(PRODUCT), cardId: OTHER } });
    await service.enqueue(24722); await service.runOne(24722);
    expect(await prisma.cardPrice.count({ where: { cardId: CARD } })).toBe(0);
    const runs = await prisma.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM price_ingestion_runs WHERE checksum = ${checksum(body)}`;
    expect(runs[0].count).toBe(0);
    expect((await prisma.cardExternalId.findUnique({ where: { provider_externalId: { provider: 'tcgcsv', externalId: String(PRODUCT) } } }))?.cardId).toBe(OTHER);
  });
  it('un corte de colecciones fallido no revierte ni marca fallida la publicación confirmada', async () => {
    failSnapshot = true;
    await service.enqueue(24722); await service.runOne(24722);
    const [job] = await prisma.$queryRaw<{ status: string }[]>`SELECT status FROM tcgcsv_group_jobs WHERE "groupId" = 24722`;
    expect(job.status).toBe('completed');
    expect(await prisma.cardPrice.count({ where: { cardId: CARD } })).toBe(1);
  });
  it('un registro dinámico habilita UI, encolado y publicación estricta por el worker', async () => {
    await prisma.cardSet.create({ data: { id: DYNAMIC_SET, name: 'Test Discovery Expansion', printedTotal: 128 } });
    await prisma.card.create({ data: { id: OTHER, name: 'TestComparison', number: '18', setId: DYNAMIC_SET, language: 'en', supertype: 'Pokémon', subtypes: [], types: [], imageSmall: '', imageLarge: '', rawJson: {} } });
    expect(await service.groupForSet(DYNAMIC_SET)).toBeNull();
    await service.enqueue(DYNAMIC_GROUP);
    expect(await prisma.$queryRaw`SELECT * FROM tcgcsv_group_jobs WHERE "groupId" = ${DYNAMIC_GROUP}`).toEqual([]);
    await prisma.cardSetExternalId.create({ data: { provider: 'tcgcsv', externalId: String(DYNAMIC_GROUP), setId: DYNAMIC_SET } });
    expect(await service.groupForSet(DYNAMIC_SET)).toBe(DYNAMIC_GROUP);
    vi.mocked(client.fetchFeed).mockImplementation(async (path) => path === 'last-updated.txt' ? BUILD : path.endsWith('/products') ? products.replaceAll('24722', String(DYNAMIC_GROUP)) : prices());
    await service.enqueue(DYNAMIC_GROUP);
    await service.runOne(DYNAMIC_GROUP);
    expect((await prisma.cardPrice.findFirstOrThrow({ where: { cardId: OTHER } })).externalGroupId).toBe(DYNAMIC_GROUP);
  });
  it('superar500requests no bloquea otra instancia ni impide publicar', async () => {
    await prisma.$executeRaw`UPDATE tcgcsv_discovery_state SET "requestCount" = 500 WHERE id = 'global'`;
    await service.enqueue(24722);
    const restarted = new TcgcsvService(prisma as PrismaService, client, snapshots as unknown as CollectionComparisonService, () => new Date('2026-10-13T12:00:00Z'));
    await restarted.runOne(24722);
    expect(client.fetchFeed).toHaveBeenCalledTimes(4);
    expect(await prisma.cardPrice.count({ where: { cardId: CARD } })).toBe(1);
    const [state] = await prisma.$queryRaw<{ requestCount: number }[]>`SELECT "requestCount" FROM tcgcsv_discovery_state WHERE id = 'global'`;
    expect(state.requestCount).toBe(504);
  });
  it('superar40grupos no limita el recorrido y conserva contadores informativos', async () => {
    await prisma.$executeRaw`UPDATE tcgcsv_discovery_state SET "downloadCount" = 40 WHERE id = 'global'`;
    await service.enqueue(24722); await service.runOne(24722);
    expect(client.fetchFeed).toHaveBeenCalledTimes(4);
    expect(await prisma.cardPrice.count({ where: { cardId: CARD } })).toBe(1);
    const [state] = await prisma.$queryRaw<{ downloadCount: number }[]>`SELECT "downloadCount" FROM tcgcsv_discovery_state WHERE id = 'global'`;
    expect(state.downloadCount).toBe(41);
  });
  it('un availableAt viejo nunca saltea las24h del último archivo, tampoco tras reinicio', async () => {
    await service.enqueue(24722); await service.runOne(24722);
    const [before] = await prisma.$queryRaw<{ downloadStartedAt: Date }[]>`SELECT "downloadStartedAt" FROM tcgcsv_group_jobs WHERE "groupId" = 24722`;
    await prisma.$executeRaw`UPDATE tcgcsv_group_jobs SET status = 'pending', "availableAt" = NOW() - INTERVAL '1 hour' WHERE "groupId" = 24722`;
    const restarted = new TcgcsvService(prisma as PrismaService, client, snapshots as unknown as CollectionComparisonService, () => new Date('2026-10-13T12:00:00Z'));
    expect(await restarted.runOne(24722)).toBe(false);
    expect(client.fetchFeed).toHaveBeenCalledTimes(4);
    const [after] = await prisma.$queryRaw<{ downloadStartedAt: Date }[]>`SELECT "downloadStartedAt" FROM tcgcsv_group_jobs WHERE "groupId" = 24722`;
    expect(after.downloadStartedAt).toEqual(before.downloadStartedAt);
    expect(await prisma.cardPrice.count({ where: { cardId: CARD } })).toBe(1);
  });
  it('las 24 horas se cuentan desde el final del archivo de precios, también con HTTP fallido', async () => {
    let priceFinishedAt: Date | undefined;
    vi.mocked(client.fetchFeed).mockImplementation(async (path) => {
      if (path === 'last-updated.txt') return BUILD;
      if (path.endsWith('/products')) return products;
      const [server] = await prisma.$queryRaw<{ at: Date }[]>`SELECT clock_timestamp() AS at`;
      priceFinishedAt = server.at;
      throw new Error('lectura fallida');
    });
    await service.enqueue(24722); await service.runOne(24722);
    const [job] = await prisma.$queryRaw<{ availableAt: Date }[]>`SELECT "availableAt" FROM tcgcsv_group_jobs WHERE "groupId" = 24722`;
    expect(priceFinishedAt).toBeDefined();
    expect(job.availableAt.getTime()).toBeGreaterThanOrEqual(priceFinishedAt!.getTime() + 86400000);
  });
});
