import { Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/index.js';
import type { CollectionComparisonService } from '../collection-comparison.service.js';
import { TcgcsvClient } from './tcgcsv.client.js';
import { TcgcsvService } from './tcgcsv.service.js';

const BUILD = '2026-10-12T20:05:44Z';
const envelope = { success: true, errors: [], totalItems: 1, results: [{ groupId: 23286, categoryId: 3, name: 'SV04: Paradox Rift', isSupplemental: false }] };
function sqlText(query: TemplateStringsArray | Prisma.Sql): string { return Array.isArray(query) ? query.join('?') : (query as Prisma.Sql).sql; }
describe('TCGCSV: ciclo de descubrimiento y cache por build', () => {
  const originalFlag = process.env.ENABLE_TCGCSV_INGESTION;
  afterEach(() => { if (originalFlag === undefined) delete process.env.ENABLE_TCGCSV_INGESTION; else process.env.ENABLE_TCGCSV_INGESTION = originalFlag; });
  const harness = (cached = false, claimed = true) => {
    process.env.ENABLE_TCGCSV_INGESTION = 'true';
    const execute = vi.fn(async (_query: TemplateStringsArray | Prisma.Sql, ..._values: unknown[]) => 1);
    const query = vi.fn(async (sql: TemplateStringsArray | Prisma.Sql): Promise<unknown[]> => {
      const text = sqlText(sql);
      if (text.includes('UPDATE tcgcsv_discovery_state SET "lockedBy"')) return claimed ? [{ groupsBuild: cached ? new Date(BUILD) : null, groupsJson: cached ? envelope : null }] : [];
      if (text.includes('provider_rate_limits')) return [{ waitMs: 0 }];
      if (text.includes('BOOL_AND')) return [{ id: 'sv4', name: 'Paradox Rift', series: 'Scarlet & Violet', englishOnly: true }];
      if (text.includes('FOR UPDATE')) return [{ id: 'global' }];
      if (text.includes('tcgcsv_set_mappings') && text.includes(' IN ')) return [{ setId: 'sv4', groupId: 23286 }];
      return [];
    });
    const tx = { $queryRaw: query, $executeRaw: execute };
    const transaction = vi.fn(async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx));
    const prisma = { ...tx, $transaction: transaction } as unknown as PrismaService;
    const client = new TcgcsvClient();
    const fetch = vi.spyOn(client, 'fetchFeed').mockImplementation(async (path) => path === 'last-updated.txt' ? BUILD : JSON.stringify(envelope));
    const service = new TcgcsvService(prisma, client, {} as CollectionComparisonService, () => new Date('2026-10-13T12:00:00Z'));
    return { service, query, execute, fetch, transaction };
  };
  it('bootstrap registra mappings sin encolar contenido de ningún grupo', async () => {
    const h = harness();
    await h.service.onModuleInit();
    expect(h.fetch.mock.calls.map(([path]) => path)).toEqual(['last-updated.txt', 'tcgplayer/3/groups', 'last-updated.txt']);
    const statements = h.execute.mock.calls.map(([query]) => sqlText(query));
    expect(statements.some((sql) => sql.includes('INSERT INTO tcgcsv_set_groups'))).toBe(true);
    expect(statements.some((sql) => sql.includes('INSERT INTO tcgcsv_group_jobs'))).toBe(false);
  });
  it('build igual usa catálogo cacheado sin encolar el backlog', async () => {
    const h = harness(true);
    expect(await h.service.discover(true)).toBe(true);
    expect(h.fetch.mock.calls.map(([path]) => path)).toEqual(['last-updated.txt']);
    expect(h.transaction).toHaveBeenCalledOnce();
  });
  it('lease/cooldown no concedido no hace requests ni registra nada', async () => {
    const h = harness(true, false);
    expect(await h.service.discover()).toBe(false);
    expect(h.fetch).not.toHaveBeenCalled(); expect(h.transaction).not.toHaveBeenCalled();
  });
  it('manifest distinto antes/después o anterior conserva cache y no publica mapeos', async () => {
    const changed = harness();
    changed.fetch.mockResolvedValueOnce(BUILD).mockResolvedValueOnce(JSON.stringify(envelope)).mockResolvedValueOnce('2026-10-13T01:00:00Z');
    expect(await changed.service.discover()).toBe(false);
    expect(changed.transaction).not.toHaveBeenCalled();
    const previous = harness(true);
    previous.fetch.mockResolvedValueOnce('2026-10-11T20:05:44Z');
    expect(await previous.service.discover()).toBe(false);
    expect(previous.fetch).toHaveBeenCalledOnce(); expect(previous.transaction).not.toHaveBeenCalled();
  });
});
