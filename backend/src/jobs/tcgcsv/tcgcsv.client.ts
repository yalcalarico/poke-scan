import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/index.js';
import { TCGCSV_GROUPS } from './tcgcsv.adapter.js';
import { ProviderRateLimitError, retryAfterMilliseconds } from '../../common/errors/provider-rate-limit.error.js';

@Injectable()
export class TcgcsvClient {
  constructor(@Optional() private readonly prisma?: PrismaService) {}
  /** El harness privado reemplaza este método; producción conserva origen y rutas cerradas. */
  async fetchFeed(path: string, maxBytes: number): Promise<string> {
    if (path !== 'last-updated.txt' && path !== 'tcgplayer/3/groups') {
      const match = /^tcgplayer\/3\/([1-9]\d{0,8})\/(products|prices)$/.exec(path);
      if (!match) throw new Error('Ruta TCGCSV inválida');
      const groupId = Number(match[1]);
      if (!Object.values(TCGCSV_GROUPS).some((id) => id === groupId)) {
        const registered = this.prisma && await this.prisma.cardSetExternalId.findUnique({ where: { provider_externalId: { provider: 'tcgcsv', externalId: match[1] } } });
        if (!registered) throw new Error('Ruta TCGCSV sin grupo validado');
      }
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`https://tcgcsv.com/${path}`, {
        signal: controller.signal, redirect: 'error',
        headers: { 'User-Agent': 'PokemonCardsScanner/1.0 (daily comparison; tcgcsv)', Accept: path.endsWith('.txt') ? 'text/plain' : 'application/json' },
      });
      if (response.status === 429) {
        throw new ProviderRateLimitError('tcgcsv', retryAfterMilliseconds(response.headers.get('retry-after')));
      }
      if (!response.ok) throw new Error('TCGCSV no respondió correctamente');
      const length = response.headers.get('content-length');
      if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new Error('Archivo TCGCSV demasiado grande');
      if (!response.body) throw new Error('Archivo TCGCSV vacío');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.byteLength;
          if (size > maxBytes) throw new Error('Archivo TCGCSV demasiado grande');
          chunks.push(next.value);
        }
      } finally { await reader.cancel(); }
      return Buffer.concat(chunks).toString('utf8');
    } finally { clearTimeout(timeout); }
  }
}
