import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

const LOG_TAG = 'RedisService';

/**
 * Ventana de rate para los avisos de degradación, por tipo de operación.
 *
 * Sin esto, una Redis que está *arriba pero fallando* —memoria llena, timeouts,
 * un socket colgado— produce un `warn` por cada `get`/`set` de cada request. Con
 * la app en 30 req/min son 30 líneas por minuto por operación, y lo que en
 * realidad pasó (Redis dejó de responder) queda enterrado.
 *
 * Un minuto es el orden de magnitud correcto: cukup para que un operador lo vea
 * sin picar, y bastante corto para que un problema de minutos no parezca de
 * horas.
 */
const DEGRADED_LOG_INTERVAL_MS = 60_000;

/**
 * Lo que el health endpoint expone de Redis.
 *
 * Deliberadamente **no** incluye la URL ni el mensaje del último error: el
 * health es una superficie de monitoring (un dashboard, un scraper, a veces un
 * proxy) y las credenciales no tienen por qué estar ahí. Para debuggear está el
 * log, que es donde corresponde.
 */
export interface RedisStatus {
  /** Hay `REDIS_URL` configurado. Distingue "no configurado" de "caído". */
  configured: boolean;
  available: boolean;
  /** Desde cuándo está caído. `null` si está sano o si nunca estuvo arriba. */
  degradedSince: string | null;
  lastErrorAt: string | null;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LOG_TAG);
  private client: Redis | null = null;
  private available = false;
  /** Se define en `onModuleInit`; sirve para no reportar "degradado" si nunca hubo Redis. */
  private configured = false;
  private degradedSince: Date | null = null;
  private lastErrorAt: Date | null = null;
  /** Último aviso por tipo de operación, para el rate limit. */
  private readonly warnedAt = new Map<string, { at: number; suppressed: number }>();

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const url = this.config.get<string>('REDIS_URL') ?? process.env.REDIS_URL;
    if (!url) {
      this.logger.warn('REDIS_URL no definido: se continúa sin caché Redis');
      return;
    }
    this.configured = true;
    // Optimista a propósito: se está por usar la caché, así que desde este
    // momento el proceso está degradado si no entra. Si entra, `setAvailable(true)`
    // lo limpia. Lo contrario —contar desde la primera pérdida— deja en `null`
    // el caso de un backend que arrancó con Redis ya caído.
    this.degradedSince = new Date();

    try {
      const client = new Redis(url, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 3000,
        retryStrategy: (times: number) => (times > 3 ? null : Math.min(times * 500, 2000)),
      });

      client.on('error', (error: Error) => {
        this.warnThrottled('conexión', `Error de Redis: ${error.message}`);
        this.noteError();
        this.setAvailable(false);
      });
      client.on('ready', () => {
        this.setAvailable(true);
      });
      client.on('end', () => {
        this.setAvailable(false);
      });

      client
        .connect()
        .then(() => {
          this.logger.log(`Conectado a Redis en ${url}`);
          this.setAvailable(true);
        })
        .catch((error: Error) => {
          this.logger.warn(
            `No se pudo conectar a Redis (${error.message}): se continúa sin caché`,
          );
          this.noteError();
          this.setAvailable(false);
        });

      this.client = client;
    } catch (error) {
      this.noteError();
      this.logger.warn(
        `Redis no disponible: ${(error as Error).message}. Se continúa sin caché`,
      );
      this.setAvailable(false);
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
    this.setAvailable(false);
  }

  isAvailable(): boolean {
    return this.available && this.client?.status === 'ready';
  }

  /**
   * El estado de Redis para el health endpoint.
   *
   * `degradedSince` se cuenta **desde que el proceso quiere usar la caché**, no
   * desde la primera conexión perdida. Un backend que arranca con Redis ya caído
   * está degradado desde que arrancó, y decir `null` ahí esconde el caso más
   * común. Lo que sí es `null` es cuando no hay `REDIS_URL`: eso no es
   * degradación, es no usar caché, y la distinción importa en una alerta.
   */
  status(): RedisStatus {
    return {
      configured: this.configured,
      available: this.isAvailable(),
      degradedSince: this.degradedSince?.toISOString() ?? null,
      lastErrorAt: this.lastErrorAt?.toISOString() ?? null,
    };
  }

  /**
   * Un solo camino para cambiar `available`, para que la transición sea la que
   * lleva la cuenta de `degradedSince`.
   *
   * Asignar el campo en los handlers directamente hacía que la transición se
   * perdiera en uno de los cuatro lados, y el síntoma es un `degradedSince` que
   * dice "nunca" con Redis claramente caído.
   */
  private setAvailable(value: boolean): void {
    if (this.available === value) return;
    this.available = value;
    if (value) {
      this.degradedSince = null;
    } else if (this.degradedSince === null) {
      this.degradedSince = new Date();
    }
  }

  private noteError(): void {
    this.lastErrorAt = new Date();
  }

  /**
   * Loguea un aviso de degradación como máximo una vez por ventana y por tipo.
   *
   * Los suprimidos no se pierden: el próximo aviso que sale de la ventana dice
   * cuántos había, así que "Redis falló 47 veces" sigue siendo visible sin que
   * el log crezca 47 veces.
   */
  private warnThrottled(kind: string, message: string): void {
    const now = Date.now();
    const previous = this.warnedAt.get(kind);
    if (previous && now - previous.at < DEGRADED_LOG_INTERVAL_MS) {
      previous.suppressed += 1;
      return;
    }
    const suppressed = previous?.suppressed ?? 0;
    this.warnedAt.set(kind, { at: now, suppressed: 0 });
    this.noteError();
    this.logger.warn(
      suppressed > 0 ? `${message} (+${suppressed} avisos suprimidos)` : message,
    );
  }

  async get(key: string): Promise<string | null> {
    if (!this.isAvailable()) return null;
    try {
      return await this.client!.get(key);
    } catch (error) {
      this.warnThrottled('get', `get(${key}) falló: ${(error as Error).message}`);
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
      this.warnThrottled('set', `set(${key}) falló: ${(error as Error).message}`);
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
      this.warnThrottled('del', `del falló: ${(error as Error).message}`);
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
      this.warnThrottled('acquireLock', `acquireLock(${key}) falló: ${(error as Error).message}`);
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
      this.warnThrottled('releaseLock', `releaseLock(${key}) falló: ${(error as Error).message}`);
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
      this.warnThrottled('extendLock', `extendLock(${key}) falló: ${(error as Error).message}`);
      return false;
    }
  }
}
