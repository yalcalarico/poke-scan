'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, Check, Info, X, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';

import { IconButton } from './icon-button';

/** `4s` de vida por defecto (§8.10). */
const DEFAULT_DURATION_MS = 4000;
/** Más de 3 a la vez tapa la pantalla; el cuarto descarta el más viejo. */
const MAX_VISIBLE = 3;
/** `160ms`: el valor de `--duration-fast` (§5.1). */
const EXIT_DURATION_MS = 160;

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

const TONE_ICONS: Record<ToastTone, LucideIcon> = {
  success: Check,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const TONE_ACCENTS = {
  success: 'text-positive',
  error: 'text-negative',
  warning: 'text-warning',
  info: 'text-info',
} as const;

const TONE_SURFACES = {
  success: 'border-positive-border bg-positive-soft',
  error: 'border-negative-border bg-negative-soft',
  warning: 'border-warning-border bg-warning-soft',
  info: 'border-info-border bg-info-soft',
} as const;

export interface ToastOptions {
  tone?: ToastTone;
  /** Línea fuerte. Sin título, el `description` es el mensaje principal. */
  title?: string;
  description?: ReactNode;
  /** `0` (o `Infinity`) deja el toast pegado: no se cierra solo. */
  duration?: number;
  /** Un `<Button size="sm">`. El hover pausa el timer, así que no se pierde. */
  action?: ReactNode;
  /** Para el caso persistente o para deduplicar. `show` genera uno si no viene. */
  id?: string;
}

interface ToastItem {
  id: string;
  tone: ToastTone;
  title?: string;
  description?: ReactNode;
  duration: number;
  action?: ReactNode;
  exiting: boolean;
}

export interface ToastApi {
  /** Caso completo. Devuelve el `id` para poder descartarlo a mano. */
  show: (options: ToastOptions) => string;
  success: (description: ReactNode, options?: ToastOptions) => string;
  error: (description: ReactNode, options?: ToastOptions) => string;
  warning: (description: ReactNode, options?: ToastOptions) => string;
  info: (description: ReactNode, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
  /**
   * El aviso offline: un toast `warning` persistente, que no empuja el layout
   * como hacía la banda de 32 px (§7.6). Idempotente, así el guard puede llamarla
   * en cada `online`/`offline` sin acumular toasts. Espera el estado, no un
   * evento.
   */
  connection: (isOffline: boolean) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Id fijo del toast de conexión: uno solo, no uno por evento. */
const CONNECTION_ID = 'pokescan:offline';

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast() necesita un <ToastProvider> en el árbol.');
  }
  return context;
}

export interface ToastProviderProps {
  children?: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [items, setItems] = useState<ToastItem[]>([]);
  // Espejo de `items`: leer el estado dentro de un callback sin stale closure
  // obliga a leer de un ref. Los updates pasan por `commit`, así que el ref y
  // el estado nunca divergen.
  const itemsRef = useRef<ToastItem[]>([]);
  const removalTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const idCounter = useRef(0);
  const [canPortal, setCanPortal] = useState(false);

  // El provider puede montarse desde un layout de Server Component, así que el
  // `document` del portal no existe en el primer render del server. El
  // `queueMicrotask` saca el setter del camino sincrónico del efecto
  // (docs/gotchas.md #9).
  useEffect(() => {
    queueMicrotask(() => setCanPortal(true));
  }, []);

  const commit = useCallback((next: ToastItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const scheduleRemoval = useCallback((id: string) => {
    if (removalTimers.current.has(id)) return;
    const timer = setTimeout(() => {
      removalTimers.current.delete(id);
      commit(itemsRef.current.filter((item) => item.id !== id));
    }, EXIT_DURATION_MS);
    removalTimers.current.set(id, timer);
  }, [commit]);

  const dismiss = useCallback(
    (id: string) => {
      if (!itemsRef.current.some((item) => item.id === id && !item.exiting)) return;
      commit(
        itemsRef.current.map((item) =>
          item.id === id && !item.exiting ? { ...item, exiting: true } : item,
        ),
      );
      scheduleRemoval(id);
    },
    [commit, scheduleRemoval],
  );

  const show = useCallback(
    (options: ToastOptions) => {
      idCounter.current += 1;
      const id = options.id ?? `toast-${idCounter.current}`;
      const item: ToastItem = {
        id,
        tone: options.tone ?? 'info',
        title: options.title,
        description: options.description,
        duration: options.duration ?? DEFAULT_DURATION_MS,
        action: options.action,
        exiting: false,
      };

      const current = itemsRef.current;
      const visible = current.filter((entry) => !entry.exiting);
      // Los persistentes no se descartan: un aviso de "sin conexión" no puede
      // caer porque llegó un "carta añadida".
      const evictable = visible.filter((entry) => entry.duration > 0);
      let next = [...current, item];

      if (evictable.length >= MAX_VISIBLE) {
        const oldest = evictable[0];
        next = next.map((entry) =>
          entry.id === oldest.id ? { ...entry, exiting: true } : entry,
        );
        scheduleRemoval(oldest.id);
      }
      commit(next);
      return id;
    },
    [commit, scheduleRemoval],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      dismiss,
      success: (description, options) => show({ ...options, tone: 'success', description }),
      error: (description, options) => show({ ...options, tone: 'error', description }),
      warning: (description, options) => show({ ...options, tone: 'warning', description }),
      info: (description, options) => show({ ...options, tone: 'info', description }),
      connection: (isOffline) => {
        if (!isOffline) {
          dismiss(CONNECTION_ID);
          return;
        }
        if (itemsRef.current.some((item) => item.id === CONNECTION_ID)) return;
        show({
          id: CONNECTION_ID,
          tone: 'warning',
          title: 'Sin conexión',
          description: 'Te mostramos el contenido guardado.',
          duration: 0,
        });
      },
    }),
    [show, dismiss],
  );

  // Los timers de descarte se limpian al desmontar: un provider que se baja
  // con toasts visibles no debe setear estado en un árbol muerto.
  useEffect(() => {
    const timers = removalTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {canPortal
        ? createPortal(
            <div
              role="region"
              aria-label="Notificaciones"
              className={cn(
                'pointer-events-none fixed z-sheet flex flex-col gap-2',
                // Mobile: abajo a la izquierda, por encima de la `BottomNav`
                // (h-16 + safe area). Nunca la tapa.
                'inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] items-start',
                'sm:inset-x-auto sm:bottom-auto sm:right-4 sm:items-end',
                'sm:top-[calc(1rem+env(safe-area-inset-top))]',
              )}
            >
              {items.map((item) => (
                <Toast key={item.id} toast={item} onDismiss={dismiss} />
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

export interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

function Toast({ toast, onDismiss }: ToastProps) {
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(toast.duration);
  const startedAtRef = useRef<number | null>(null);

  // El tiempo restante se descuenta en el arranque del efecto pausado, no en el
  // cleanup: así el cleanup puede correr las dos veces de StrictMode sin
  // descontar dos veces.
  useEffect(() => {
    if (toast.duration <= 0 || paused) {
      if (startedAtRef.current !== null) {
        remainingRef.current = Math.max(
          0,
          remainingRef.current - (Date.now() - startedAtRef.current),
        );
        startedAtRef.current = null;
      }
      return;
    }
    startedAtRef.current = Date.now();
    const timer = setTimeout(() => onDismiss(toast.id), remainingRef.current);
    return () => clearTimeout(timer);
  }, [toast.duration, toast.id, paused, onDismiss]);

  const Icon = TONE_ICONS[toast.tone];

  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        'pointer-events-auto flex w-full items-start gap-3 rounded-surface border px-4 py-3 shadow-xl',
        'sm:w-96',
        TONE_SURFACES[toast.tone],
        toast.exiting
          ? 'scale-[0.97] opacity-0 transition-[opacity,scale] duration-fast ease-exit'
          : 'animate-pop-in',
      )}
    >
      <Icon
        aria-hidden="true"
        focusable="false"
        strokeWidth={1.75}
        className={cn('mt-0.5 h-5 w-5 shrink-0', TONE_ACCENTS[toast.tone])}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {toast.title ? <p className="text-body-strong text-primary">{toast.title}</p> : null}
        {toast.description ? (
          <p className={cn(toast.title ? 'text-caption text-secondary' : 'text-body text-primary')}>
            {toast.description}
          </p>
        ) : null}
        {toast.action ? <div className="mt-1 flex">{toast.action}</div> : null}
      </div>
      <IconButton
        icon={X}
        label="Cerrar aviso"
        size="sm"
        onClick={() => onDismiss(toast.id)}
        className="-mt-1 -mr-1.5"
      />
    </div>
  );
}
