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
  /** Desde cuándo se quiso usar la caché sin conexión. `null` si está sana o no configurada. */
  degradedSince: string | null;
  lastErrorAt: string | null;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LOG_TAG);
  private client: Redis | null = null;
  private shuttingDown = false;
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
        // La cola offline no cubre comandos enviados cuya respuesta se perdió.
        // No repetir escrituras inciertas, y limitar la espera de su respuesta.
        autoResendUnfulfilledCommands: false,
        commandTimeout: 3000,
        connectTimeout: 3000,
        // Redis es una caché opcional: acotar la espera entre reintentos permite
        // recuperarla sin reiniciar la API, incluso tras una caída larga.
        retryStrategy: (times: number) => Math.min(500 * 2 ** Math.min(times - 1, 5), 15_000),
      });

      client.on('error', () => {
        if (this.shuttingDown) return;
        this.warnThrottled('conexión', 'Error de conexión con Redis; se continúa sin caché');
        this.setAvailable(false);
      });
      client.on('ready', () => {
        if (this.shuttingDown) return;
        this.setAvailable(true);
      });
      client.on('close', () => {
        if (this.shuttingDown) return;
        this.setAvailable(false);
      });
      client.on('reconnecting', () => {
        if (this.shuttingDown) return;
        this.setAvailable(false);
      });
      client.on('end', () => {
        if (this.shuttingDown) return;
        this.setAvailable(false);
      });

      this.client = client;
      client
        .connect()
        .then(() => {
          if (this.shuttingDown || client.status !== 'ready') return;
          this.logger.log('Conectado a Redis');
        })
        .catch(() => {
          if (this.shuttingDown || client.status === 'ready') return;
          this.warnThrottled('conexión', 'No se pudo conectar a Redis; se continúa sin caché');
        });
    } catch {
      this.noteError();
      this.warnThrottled('conexión', 'Redis no disponible; se continúa sin caché');
      this.setAvailable(false);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) return;
    this.shuttingDown = true;
    this.setAvailable(false);
    const client = this.client;
    this.client = null;
    // ioredis posee listeners ready/close que resuelven connect(): no quitarlos.
    // Los nuestros ignoran eventos tardíos y conservan el handler de error.
    // disconnect() cancela el timer de reconexión sin esperar una respuesta.
    client.disconnect();
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
    if (this.shuttingDown) return;
    this.noteError();
    const now = Date.now();
    const previous = this.warnedAt.get(kind);
    if (previous && now - previous.at < DEGRADED_LOG_INTERVAL_MS) {
      previous.suppressed += 1;
      return;
    }
    const suppressed = previous?.suppressed ?? 0;
    this.warnedAt.set(kind, { at: now, suppressed: 0 });
    this.logger.warn(
      suppressed > 0 ? `${message} (+${suppressed} avisos suprimidos)` : message,
    );
  }

  async get(key: string): Promise<string | null> {
    if (!this.isAvailable()) return null;
    try {
      return await this.client!.get(key);
    } catch {
      this.warnThrottled('get', 'Falló una lectura de Redis; se continúa sin caché');
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
    } catch {
      this.warnThrottled('set', 'Falló una escritura de Redis; se continúa sin caché');
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }

  async del(...keys: string[]): Promise<void> {
    if (!this.isAvailable() || keys.length === 0) return;
    try {
      await this.client!.del(...keys);
    } catch {
      this.warnThrottled('del', 'Falló una eliminación en Redis; se continúa sin caché');
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
    } catch {
      this.warnThrottled('acquireLock', 'Falló la adquisición del lock Redis');
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
    } catch {
      this.warnThrottled('releaseLock', 'Falló la liberación del lock Redis');
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
    } catch {
      this.warnThrottled('extendLock', 'Falló la renovación del lock Redis');
      return false;
    }
  }
}
