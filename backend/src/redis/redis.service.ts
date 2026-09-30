import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

const LOG_TAG = 'RedisService';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LOG_TAG);
  private client: Redis | null = null;
  private available = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const url = this.config.get<string>('REDIS_URL') ?? process.env.REDIS_URL;
    if (!url) {
      this.logger.warn('REDIS_URL no definido: se continúa sin caché Redis');
      return;
    }

    try {
      const client = new Redis(url, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 3000,
        retryStrategy: (times: number) => (times > 3 ? null : Math.min(times * 500, 2000)),
      });

      client.on('error', (error: Error) => {
        if (this.available) {
          this.logger.warn(`Error de Redis: ${error.message}`);
        }
        this.available = false;
      });
      client.on('ready', () => {
        this.available = true;
      });
      client.on('end', () => {
        this.available = false;
      });

      client
        .connect()
        .then(() => {
          this.available = true;
          this.logger.log(`Conectado a Redis en ${url}`);
        })
        .catch((error: Error) => {
          this.available = false;
          this.logger.warn(
            `No se pudo conectar a Redis (${error.message}): se continúa sin caché`,
          );
        });

      this.client = client;
    } catch (error) {
      this.available = false;
      this.logger.warn(
        `Redis no disponible: ${(error as Error).message}. Se continúa sin caché`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
    this.client = null;
    this.available = false;
  }

  isAvailable(): boolean {
    return this.available && this.client?.status === 'ready';
  }

  async get(key: string): Promise<string | null> {
    if (!this.isAvailable()) return null;
    try {
      return await this.client!.get(key);
    } catch (error) {
      this.logger.warn(`get(${key}) falló: ${(error as Error).message}`);
      return null;
    }
  }

  async getNumber(key: string): Promise<number | null> {
    const value = await this.get(key);
    if (value === null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    if (value === null) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client!.set(key, value, 'EX', Math.floor(ttlSeconds));
      } else {
        await this.client!.set(key, value);
      }
    } catch (error) {
      this.logger.warn(`set(${key}) falló: ${(error as Error).message}`);
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }

  async del(...keys: string[]): Promise<void> {
    if (!this.isAvailable() || keys.length === 0) return;
    try {
      await this.client!.del(...keys);
    } catch (error) {
      this.logger.warn(`del falló: ${(error as Error).message}`);
    }
  }

  /**
   * Toma un lock distribuido. Devuelve el token si lo consiguió, `null` si ya
   * lo tiene otro.
   *
   * El token es lo que hace seguro el par `acquire`/`release`: es lo único que
   * distingue "mi lock" de "el lock de otro". Un `del` a secas no puede, y por
   * eso `releaseLock` compara antes de borrar.
   *
   * `SET NX EX` es atómico en Redis: o se escribe con TTL, o no se escribe. Por
   * eso no hace falta `SETNX` + `EXPIRE`, que dejaría una ventana sin TTL si el
   * proceso muere entre las dos.
   */
  async acquireLock(key: string, token: string, ttlSeconds: number): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      const result = await this.client!.set(key, token, 'EX', Math.floor(ttlSeconds), 'NX');
      return result === 'OK';
    } catch (error) {
      this.logger.warn(`acquireLock(${key}) falló: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Suelta el lock **solo si el token es el nuestro**.
   *
   * El `EVAL` con compare-and-delete es una operación: entre el `GET` y el
   * `DEL` un TTL podría expirar y otro proceso tomar el lock, y el `DEL` le
   * borraría el lock ajeno. Devuelve `true` solo si efectivamente lo soltamos.
   */
  async releaseLock(key: string, token: string): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      const result = (await this.client!.eval(
        'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
        1,
        key,
        token,
      )) as number;
      return result === 1;
    } catch (error) {
      this.logger.warn(`releaseLock(${key}) falló: ${(error as Error).message}`);
      return false;
    }
  }

  /** Renueva el TTL de un lock que sigue siendo nuestro. */
  async extendLock(key: string, token: string, ttlSeconds: number): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      const result = (await this.client!.eval(
        'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("expire", KEYS[1], ARGV[2]) else return 0 end',
        1,
        key,
        token,
        String(Math.floor(ttlSeconds)),
      )) as number;
      return result === 1;
    } catch (error) {
      this.logger.warn(`extendLock(${key}) falló: ${(error as Error).message}`);
      return false;
    }
  }
}
