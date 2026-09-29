'use client';

import {
  Children,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import { cn } from '@/lib/cn';

import { IconButton } from './icon-button';

/**
 * ─── Capas de overlay (backdrop + panel) ───
 *
 * Backdrop en `z-overlay` y panel en `z-sheet` (§6). El scroll lock y el `inert`
 * son de la capa, no del componente: por eso viven acá y no en el `useEffect`
 * del `Sheet`. Con un booleano por componente, dos sheets anidados se
 * desbloquean mal entre sí (el que cierra primero saca el lock del que sigue
 * abierto); con una pila, el lock se devuelve recién cuando la pila queda
 * vacía.
 */

/** `160ms`: el valor de `--duration-fast` (§5.1). */
const EXIT_DURATION_MS = 160;

/** Umbral de cierre por gesto, en px. Un tirón corto y rápido también cierra. */
const DRAG_CLOSE_DISTANCE = 120;
/** px por ms. */
const DRAG_CLOSE_VELOCITY = 0.5;
/** Por debajo de esto fue un click, no un arrastre: hay que dejar pasar el click. */
const DRAG_SLOP = 4;

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface OpenLayer {
  /** Identidad de la instancia: el doble montaje de StrictMode la comparte. */
  token: string;
  container: HTMLElement | null;
  panel: HTMLElement | null;
  onClose: () => void;
}

const openLayers: OpenLayer[] = [];
/** Valores previos de los hermanos, para devolverlos tal cual estaban. */
let inertSnapshot: Map<Element, { inert: boolean; ariaHidden: string | null }> | null = null;
let previousBodyOverflow: string | null = null;

function topLayer(): OpenLayer | null {
  return openLayers.length > 0 ? openLayers[openLayers.length - 1] : null;
}

/**
 * Deja inerte todo lo que no es un panel abierto. Es idempotente: volver a
 * aplicarla sobre elementos ya snapshoteados no pisa el snapshot, así que el
 * doble montaje de StrictMode no pierde el valor original.
 */
function applyInert() {
  const snapshot = inertSnapshot ?? new Map();
  inertSnapshot = snapshot;

  for (const child of Array.from(document.body.children)) {
    if (openLayers.some((layer) => layer.container === child)) continue;
    if (!snapshot.has(child)) {
      snapshot.set(child, {
        inert: child instanceof HTMLElement ? child.inert : false,
        ariaHidden: child.getAttribute('aria-hidden'),
      });
    }
    if (child instanceof HTMLElement) child.inert = true;
    child.setAttribute('aria-hidden', 'true');
  }
}

function restoreInert() {
  if (!inertSnapshot) return;
  for (const [element, previous] of inertSnapshot) {
    if (element instanceof HTMLElement) element.inert = previous.inert;
    if (previous.ariaHidden === null) element.removeAttribute('aria-hidden');
    else element.setAttribute('aria-hidden', previous.ariaHidden);
  }
  inertSnapshot = null;
}

function registerLayer(layer: OpenLayer) {
  const top = topLayer();
  // Solo un `Sheet` a la vez (§8.9). El `token` evita que el doble montaje de
  // StrictMode se cierre a sí mismo: las dos pasadas comparten token.
  if (top && top.token !== layer.token) top.onClose();

  openLayers.push(layer);
  if (openLayers.length === 1) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  applyInert();
}

function unregisterLayer(token: string) {
  const index = openLayers.findIndex((layer) => layer.token === token);
  if (index !== -1) openLayers.splice(index, 1);

  if (openLayers.length === 0) {
    document.body.style.overflow = previousBodyOverflow ?? '';
    previousBodyOverflow = null;
    restoreInert();
  } else {
    applyInert();
  }
}

export type SheetSize = 'sm' | 'md' | 'lg' | 'full';

const SHEET_SIZES = {
  sm: 'sm:max-w-[380px]',
  md: 'sm:max-w-[480px]',
  lg: 'sm:max-w-[600px]',
  // `full` pisa el `max-h` de mobile: sin esto el cap de 92dvh ganaría por
  // orden de clases y "todo el alto" sería 92%.
  full: 'h-dvh max-h-dvh sm:h-[85dvh] sm:max-w-2xl',
} as const;

interface SheetContextValue {
  titleId: string;
  subtitleId: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
  isDragging: boolean;
  hasFooter: boolean;
}

const SheetContext = createContext<SheetContextValue | null>(null);

function useSheetContext(component: string): SheetContextValue {
  const context = useContext(SheetContext);
  if (!context) {
    throw new Error(`<Sheet.${component}> tiene que usarse adentro de un <Sheet>.`);
  }
  return context;
}

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Máximo 4 palabras (§10.1). El `id` del `h2` lo genera el componente. */
  title: string;
  subtitle?: string;
  /** Zona fija de abajo: se devuelve envuelto en un `Sheet.Footer`. */
  footer?: ReactNode;
  size?: SheetSize;
  children?: ReactNode;
  className?: string;
}

type SheetStatus = 'closed' | 'open' | 'closing';

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  footer,
  size = 'md',
  children,
  className,
}: SheetProps) {
  const reactId = useId();
  const titleId = `${reactId}-title`;
  const subtitleId = `${reactId}-subtitle`;
  // `useId()` es estable por instancia y sobrevive el doble montaje de
  // StrictMode, así que sirve de identidad de capa: dos pasadas del mismo
  // `Sheet` se reconocen y no se cierran entre sí.
  const layerToken = reactId;

  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  const [status, setStatus] = useState<SheetStatus>(open ? 'open' : 'closed');
  const [canPortal, setCanPortal] = useState(false);
  const [drag, setDrag] = useState<{ offset: number; settling: boolean } | null>(null);
  const dragRef = useRef<{ startY: number; startAt: number; offset: number } | null>(null);
  const didDragRef = useRef(false);

  // `onClose` llega como arrow inline casi siempre: meterlo en las deps del
  // efecto de la capa re-registraría la capa en cada render. Va en un ref.
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // `createPortal` necesita `document`, que no existe en el render del server.
  // El `queueMicrotask` saca el setter del camino sincrónico del efecto: si no,
  // dispara un render en cascada (docs/gotchas.md #9).
  useEffect(() => {
    queueMicrotask(() => setCanPortal(true));
  }, []);

  // Abrir y cerrar durante el mismo render en vez de hacerlo en un efecto: el
  // nodo tiene que volver a existir (o caerse) antes de que se pinte.
  if (open && status === 'closed') setStatus('open');
  else if (!open && status === 'open') setStatus('closing');

  // El nodo queda montado hasta que termina la transición de salida (§5.1).
  useEffect(() => {
    if (status !== 'closing') return;
    const id = setTimeout(() => setStatus('closed'), EXIT_DURATION_MS);
    return () => clearTimeout(id);
  }, [status]);

  useEffect(() => {
    // Sin `canPortal` el panel todavía no existe: registrar la capa acá dejaría
    // refs en `null` y el foco nunca llegaría al diálogo.
    if (!open || !canPortal) return;
    didDragRef.current = false;

    // El elemento con el foco se captura ANTES de cerrar el sheet anterior:
    // registrarlo primero movería el foco y perderíamos el trigger real.
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    registerLayer({
      token: layerToken,
      container: containerRef.current,
      panel: panelRef.current,
      onClose: () => onCloseRef.current(),
    });

    // Foco al panel y no al primer control: lo que el lector de pantalla
    // necesita primero es el nombre accesible del diálogo (el `title`), no un
    // input que el usuario no pidió abrir.
    panelRef.current?.focus();

    return () => {
      unregisterLayer(layerToken);

      // Si hay otro `Sheet` vivo, el foco es suyo: devolverlo al trigger
      // original lo dejaría fuera del diálogo de arriba.
      const top = topLayer();
      if (top && top.token !== layerToken && top.panel?.isConnected) {
        top.panel.focus();
        return;
      }

      const previous = previouslyFocusedRef.current;
      if (previous && previous.isConnected) {
        previous.focus();
        return;
      }

      // El trigger se desmontó (una tarjeta que salió de la grilla, un sheet
      // que cerró a otro). `body` no es enfocable por defecto, así que se le
      // da un `tabindex` que después se saca.
      const { body } = document;
      const hadTabIndex = body.hasAttribute('tabindex');
      if (!hadTabIndex) body.setAttribute('tabindex', '-1');
      body.focus();
      if (!hadTabIndex) body.removeAttribute('tabindex');
    };
  }, [open, canPortal, layerToken]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (topLayer()?.token !== layerToken) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusables = getFocusableElements(panel);
      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && panel.contains(active);

      // `!inside` cubre el foco que se fue por otro lado (un click en otro
      // overlay, un `autofocus`): el trap lo recupera.
      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    },
    [layerToken],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open, handleKeyDown]);

  const handleDragStart = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    // El gesto es solo de mobile: en `sm:` el panel es un diálogo y arrastrarlo
    // no significa nada.
    if (window.matchMedia('(min-width: 640px)').matches) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    didDragRef.current = false;
    dragRef.current = { startY: event.clientY, startAt: Date.now(), offset: 0 };
    setDrag({ offset: 0, settling: false });
  }, []);

  const handleDragMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const start = dragRef.current;
    if (!start) return;
    // Hacia arriba no hay arrastre: el panel ya está pegado al tope y dejarlo
    // flotar en el medio se ve roto.
    const offset = Math.max(0, event.clientY - start.startY);
    start.offset = offset;
    setDrag({ offset, settling: false });
  }, []);

  const handleDragEnd = useCallback(() => {
    const start = dragRef.current;
    dragRef.current = null;
    if (!start) return;

    const elapsed = Math.max(1, Date.now() - start.startAt);
    const velocity = start.offset / elapsed;
    didDragRef.current = start.offset > DRAG_SLOP;

    if (start.offset >= DRAG_CLOSE_DISTANCE || velocity >= DRAG_CLOSE_VELOCITY) {
      setDrag(null);
      onCloseRef.current();
      return;
    }
    // No llegó al umbral: vuelve con `--duration-fast` (§8.9).
    setDrag({ offset: 0, settling: true });
  }, []);

  // Un arrastre que termina sobre el botón de cerrar no debe disparar su
  // click: se descarta el click que el browser sintetiza al soltar.
  const handleClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!didDragRef.current) return;
    didDragRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleBackdropClick = useCallback(() => {
    onCloseRef.current();
  }, []);

  const { header, body, footer: footerSlot, loose } = splitSheetChildren(children);
  const resolvedFooter = footerSlot ?? (footer ? <SheetFooter>{footer}</SheetFooter> : null);
  const hasFooter = resolvedFooter !== null;

  const contextValue = useMemo<SheetContextValue>(
    () => ({
      titleId,
      subtitleId,
      title,
      subtitle,
      onClose,
      isDragging: drag !== null && !drag.settling,
      hasFooter,
    }),
    [titleId, subtitleId, title, subtitle, onClose, drag, hasFooter],
  );

  const closing = status === 'closing';
  const dragOffset = drag?.offset ?? 0;
  const panelStyle: CSSProperties | undefined =
    dragOffset > 0 ? { transform: `translateY(${dragOffset}px)` } : undefined;

  if (!canPortal || status === 'closed') return null;

  return (
    <SheetContext.Provider value={contextValue}>
      {createPortal(
        <div
          ref={containerRef}
          data-slot="sheet"
          className="fixed inset-0 z-overlay flex items-end justify-center sm:items-center sm:p-4"
        >
          <div
            data-slot="sheet-backdrop"
            onClick={handleBackdropClick}
            className={cn(
              'absolute inset-0 bg-overlay backdrop-blur-sm',
              closing && 'opacity-0 transition-opacity duration-fast ease-exit',
            )}
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={subtitle ? subtitleId : undefined}
            tabIndex={-1}
            onClickCapture={handleClickCapture}
            style={panelStyle}
            className={cn(
              'relative z-sheet flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-sheet border-line bg-surface shadow-lg outline-none',
              'sm:max-h-[85dvh] sm:rounded-panel sm:border',
              SHEET_SIZES[size],
              !closing && 'animate-sheet-up sm:animate-pop-in',
              drag !== null && !drag.settling && 'transition-none',
              drag?.settling && 'transition-transform duration-fast ease-exit',
              closing &&
                'translate-y-4 opacity-0 transition-[opacity,transform] duration-fast ease-exit sm:translate-y-0',
              className,
            )}
          >
            <div
              data-slot="sheet-grab"
              onPointerDown={handleDragStart}
              onPointerMove={handleDragMove}
              onPointerUp={handleDragEnd}
              onPointerCancel={handleDragEnd}
              className="touch-none sm:touch-auto"
            >
              <div
                aria-hidden="true"
                data-slot="sheet-handle"
                className="flex justify-center pt-3 sm:hidden"
              >
                <span className="h-1 w-10 rounded-full bg-line-strong" />
              </div>
              {header ?? <SheetHeader />}
            </div>

            {body ?? <SheetBody>{loose}</SheetBody>}

            {resolvedFooter}
          </div>
        </div>,
        document.body,
      )}
    </SheetContext.Provider>
  );
}

function getFocusableElements(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.offsetParent !== null || element === document.activeElement,
  );
}

/**
 * Reparte los hijos en las tres zonas por introspección, no por `Context`: los
 * slots son fijos, no hay estado que compartir entre ellos, y escanear el árbol
 * no depende de que el `Body` se monte antes que el contexto. El `Context`
 * queda solo para lo que el subcomponente no puede tener por props (`titleId`,
 * `onClose`, si hay footer).
 *
 * `loose` es lo que no es un slot: si el consumidor no usó `<Sheet.Body>`, eso
 * es el body.
 */
function splitSheetChildren(children: ReactNode): {
  header: ReactNode;
  body: ReactNode;
  footer: ReactNode;
  loose: ReactNode;
} {
  let header: ReactNode = null;
  let body: ReactNode = null;
  let footer: ReactNode = null;
  const loose: ReactNode[] = [];

  Children.forEach(children, (child) => {
    if (child === null || child === undefined || typeof child === 'boolean') return;
    if (isValidElement(child)) {
      if (child.type === SheetHeader) {
        header = child;
        return;
      }
      if (child.type === SheetBody) {
        body = child;
        return;
      }
      if (child.type === SheetFooter) {
        footer = child;
        return;
      }
    }
    loose.push(child);
  });

  return { header, body, footer, loose };
}

export interface SheetHeaderProps {
  /** Acción a la izquierda del título, del mismo tamaño que la `X`. */
  action?: ReactNode;
  className?: string;
}

/**
 * Header propio con el `title`, el `subtitle` opcional y la `IconButton` de
 * cerrar. Esta forma estaba copiada 3 veces con el SVG de la `X` inline (§8.9).
 */
export function SheetHeader({ action, className }: SheetHeaderProps) {
  const { titleId, subtitleId, title, subtitle, onClose } = useSheetContext('Header');

  return (
    <div
      data-slot="sheet-header"
      className={cn('flex shrink-0 items-start gap-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-5', className)}
    >
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className="text-h2 text-primary">
          {title}
        </h2>
        {subtitle ? (
          <p id={subtitleId} className="mt-1 text-caption text-tertiary">
            {subtitle}
          </p>
        ) : null}
      </div>
      {action}
      <IconButton icon={X} label="Cerrar" size="md" onClick={onClose} />
    </div>
  );
}

export interface SheetBodyProps {
  className?: string;
  /** Sin padding, para contenido full-bleed (una grilla de cartas). */
  bleed?: boolean;
  children?: ReactNode;
}

/** Zona que scrollea. Es la única con `overflow-y-auto`. */
export function SheetBody({ className, bleed = false, children }: SheetBodyProps) {
  const { isDragging, hasFooter } = useSheetContext('Body');

  return (
    <div
      data-slot="sheet-body"
      className={cn(
        'flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5',
        // Sin footer, el safe area lo aporta el body; con footer, el footer.
        !hasFooter && 'pb-[calc(1rem+env(safe-area-inset-bottom))]',
        // Mientras se arrastra, el body no scrollea: el gesto va primero.
        isDragging && 'overflow-hidden',
        bleed && 'px-0',
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface SheetFooterProps {
  className?: string;
  children?: ReactNode;
}

/** Zona fija de abajo: `border-t` + safe area. Ahí van las acciones. */
export function SheetFooter({ className, children }: SheetFooterProps) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        // `shrink-0` es lo que la hace fija: sin esto el flex la aplasta cuando
        // el body scrollea.
        'flex shrink-0 items-center gap-3 border-t border-line bg-surface px-4 py-3',
        'pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-5',
        className,
      )}
    >
      {children}
    </div>
  );
}

Sheet.Header = SheetHeader;
Sheet.Body = SheetBody;
Sheet.Footer = SheetFooter;
