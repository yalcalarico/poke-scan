import { createHash } from 'node:crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/index.js';
import { parseProducts, TCGCSV_GROUPS } from './tcgcsv.adapter.js';
import { ProviderRateLimitError, retryAfterMilliseconds } from '../../common/errors/provider-rate-limit.error.js';

interface ProductCache {
  groupId: number;
  content: string;
  checksum: string;
  contentBytes: number;
  etag: string | null;
  lastModified: string | null;
}

function checksum(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function validator(value: string | null): string | null {
  return value && value.length <= 2048 && !/[\r\n]/.test(value) ? value : null;
}

@Injectable()
export class TcgcsvClient {
  private readonly logger = new Logger(TcgcsvClient.name);
  constructor(@Optional() private readonly prisma?: PrismaService) {}
  /** El harness privado reemplaza este método; producción conserva origen y rutas cerradas. */
  async fetchFeed(path: string, maxBytes: number): Promise<string> {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('Límite TCGCSV inválido');
    let groupId: number | null = null;
    let file = path === 'last-updated.txt' ? 'manifest' : 'groups';
    if (path !== 'last-updated.txt' && path !== 'tcgplayer/3/groups') {
      const match = /^tcgplayer\/3\/([1-9]\d{0,8})\/(products|prices)$/.exec(path);
      if (!match) throw new Error('Ruta TCGCSV inválida');
      groupId = Number(match[1]);
      file = match[2];
      if (!Object.values(TCGCSV_GROUPS).some((id) => id === groupId)) {
        const registered = this.prisma && await this.prisma.cardSetExternalId.findUnique({ where: { provider_externalId: { provider: 'tcgcsv', externalId: match[1] } } });
        const shared = !registered && this.prisma && await this.prisma.tcgcsvSetGroup.findFirst({ where: { groupId } });
        if (!registered && !shared) throw new Error('Ruta TCGCSV sin grupo validado');
      }
    }
    const cached = file === 'products' && groupId !== null ? await this.readProductCache(groupId, maxBytes) : null;
    const headers: Record<string, string> = {
      'User-Agent': 'PokemonCardsScanner/1.0 (daily comparison; tcgcsv)',
      Accept: path.endsWith('.txt') ? 'text/plain' : 'application/json',
    };
    const etag = validator(cached?.etag ?? null);
    const lastModified = validator(cached?.lastModified ?? null);
    if (etag) headers['If-None-Match'] = etag;
    else if (lastModified) headers['If-Modified-Since'] = lastModified;
    const conditional = Boolean(etag || lastModified);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const requestedAt = new Date();
    const startedAt = performance.now();
    let status: number | null = null;
    let receivedBytes = 0;
    let reusedCache = false;
    let retryAfterMs: number | null = null;
    let outcome = 'failed';
    try {
      const response = await fetch(`https://tcgcsv.com/${path}`, {
        signal: controller.signal, redirect: 'error', headers,
      });
      status = response.status;
      if (response.status === 429) {
        retryAfterMs = retryAfterMilliseconds(response.headers.get('retry-after'));
        throw new ProviderRateLimitError('tcgcsv', retryAfterMs);
      }
      if (response.status === 304) {
        if (!cached || !conditional) throw new Error('TCGCSV devolvió 304 sin copia válida');
        // Una validación remota no cambia la fecha en que recibimos el contenido.
        await this.prisma?.tcgcsvProductCache.updateMany({
          where: { groupId: cached.groupId, checksum: cached.checksum },
          data: { validatedAt: new Date() },
        });
        reusedCache = true;
        outcome = 'not-modified';
        return cached.content;
      }
      if (response.status !== 200) throw new Error('TCGCSV no respondió correctamente');
      const length = response.headers.get('content-length');
      if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new Error('Archivo TCGCSV demasiado grande');
      if (!response.body) throw new Error('Archivo TCGCSV vacío');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          receivedBytes += next.value.byteLength;
          if (receivedBytes > maxBytes) throw new Error('Archivo TCGCSV demasiado grande');
          chunks.push(next.value);
        }
      } finally { await reader.cancel(); }
      const receivedAt = new Date();
      const content = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
      if (file === 'products' && groupId !== null) {
        parseProducts(JSON.parse(content) as unknown, groupId);
        const data = {
          content, checksum: checksum(content), contentBytes: Buffer.byteLength(content),
          etag: validator(response.headers.get('etag')),
          lastModified: validator(response.headers.get('last-modified')),
          receivedAt, validatedAt: new Date(),
        };
        // El upsert reemplaza contenido y validadores juntos, después de validar el lote completo.
        await this.prisma?.tcgcsvProductCache.upsert({ where: { groupId }, create: { groupId, ...data }, update: data });
      }
      outcome = 'downloaded';
      return content;
    } finally {
      clearTimeout(timeout);
      const durationMs = Math.round(performance.now() - startedAt);
      try {
        await this.prisma?.tcgcsvHttpRequest.create({ data: {
          path, file, groupId, requestedAt, status, receivedBytes, durationMs,
          conditional, reusedCache, retryAfterMs, outcome,
        } });
      } catch {
        // La telemetría no debe ocultar un 429 ni convertir una descarga en un reintento.
        this.logger.warn('No se pudo guardar la telemetría HTTP de TCGCSV');
      }
    }
  }

  private async readProductCache(groupId: number, maxBytes: number): Promise<ProductCache | null> {
    const cached = await this.prisma?.tcgcsvProductCache.findUnique({ where: { groupId } });
    if (!cached) return null;
    try {
      if (cached.contentBytes > maxBytes || cached.contentBytes !== Buffer.byteLength(cached.content) || checksum(cached.content) !== cached.checksum) return null;
      // Revalidar permite reutilizar sólo copias compatibles con las reglas actuales del parser.
      parseProducts(JSON.parse(cached.content) as unknown, groupId);
      return cached;
    } catch {
      return null;
    }
  }
}
