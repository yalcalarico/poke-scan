import {
  Injectable,
  Logger,
  Inject,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export type DatabaseReadiness = 'ready' | 'unavailable';

const RESULT_CACHE_MS = 1_000;
const HTTP_DEADLINE_MS = 4_000;
export const HEALTH_PRISMA_CLIENT = Symbol('HEALTH_PRISMA_CLIENT');

export interface HealthPrismaClient {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
  $disconnect(): Promise<void>;
}

/** Probe DB aislado: sus límites no alteran el pool de las consultas de negocio. */
@Injectable()
export class ReadinessService implements OnModuleDestroy {
  private readonly logger = new Logger(ReadinessService.name);
  private cached: { state: DatabaseReadiness; expiresAt: number } | undefined;
  private inFlight: Promise<DatabaseReadiness> | undefined;
  private response: Promise<DatabaseReadiness> | undefined;
  private cancelDeadline: (() => void) | undefined;
  private stopping = false;

  constructor(
    @Inject(HEALTH_PRISMA_CLIENT)
    private readonly prisma: HealthPrismaClient,
  ) {}

  async databaseState(): Promise<DatabaseReadiness> {
    if (this.stopping) return 'unavailable';
    const now = performance.now();
    if (this.cached && this.cached.expiresAt > now) return this.cached.state;

    let query = this.inFlight;
    if (!query) {
      query = this.runProbe();
      this.inFlight = query;
      this.response = this.withDeadline(query);
      void query.then(() => {
        if (this.inFlight === query) {
          this.inFlight = undefined;
          this.response = undefined;
        }
      });
    }
    return this.response!;
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    this.cached = undefined;
    this.cancelDeadline?.();
    await this.prisma.$disconnect();
  }

  private async runProbe(): Promise<DatabaseReadiness> {
    try {
      await this.prisma.$queryRaw<Array<{ ok: number }>>(
        Prisma.sql`SELECT 1 AS ok`,
      );
      return 'ready';
    } catch (error: unknown) {
      // El endpoint es público; el detalle de Prisma queda solamente en logs.
      this.logger.warn(`La probe de PostgreSQL falló: ${safeErrorName(error)}`);
      return 'unavailable';
    }
  }

  private withDeadline(
    query: Promise<DatabaseReadiness>,
  ): Promise<DatabaseReadiness> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (state: DatabaseReadiness) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.cancelDeadline = undefined;
        if (!this.stopping) {
          this.cached = {
            state,
            expiresAt: performance.now() + RESULT_CACHE_MS,
          };
        }
        resolve(state);
      };
      const timer = setTimeout(() => finish('unavailable'), HTTP_DEADLINE_MS);
      this.cancelDeadline = () => finish('unavailable');
      void query.then(finish, () => finish('unavailable'));
    });
  }
}

export function boundedDatabaseUrl(
  raw = process.env.DATABASE_URL,
): string | undefined {
  if (!raw) return undefined;

  const url = new URL(raw);
  url.searchParams.set('connection_limit', '1');
  url.searchParams.set('connect_timeout', '1');
  url.searchParams.set('pool_timeout', '1');
  url.searchParams.set('socket_timeout', '1');
  const options = url.searchParams.get('options');
  url.searchParams.set(
    'options',
    `${options ? `${options} ` : ''}-c statement_timeout=750`,
  );
  return url.toString();
}

export function createHealthPrismaClient(): PrismaClient {
  return new PrismaClient({ datasourceUrl: boundedDatabaseUrl() });
}

function safeErrorName(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error) {
    const name = error.name;
    if (typeof name === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(name)) {
      return name;
    }
  }
  return 'DatabaseProbeError';
}
