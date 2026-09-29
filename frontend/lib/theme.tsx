'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import {
  DARK_MEDIA_QUERY,
  isTheme,
  SERVER_RESOLVED_THEME,
  SERVER_THEME,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type Theme,
} from '@/lib/theme-script';

export type { ResolvedTheme, Theme } from '@/lib/theme-script';

/**
 * OJO: re-exportar el script desde acá lo vuelve *client reference* para
 * cualquier modulo que no sea cliente. `app/layout.tsx` tiene que importarlo
 * de `@/lib/theme-script`.
 */
export { THEME_SCRIPT } from '@/lib/theme-script';

type Listener = () => void;

/**
 * El store vive AFUERA de React y la clase se aplica al `<html>` como efecto
 * directo. Dos motivos:
 *
 * 1. `useSyncExternalStore` compara el snapshot del server contra el del primer
 *    render del cliente: leer `localStorage` en el render rompería el
 *    hydration. El store arranca con el snapshot de servidor y adopta el valor
 *    real recién en un microtask, cuando el script anti-flash ya puso la clase
 *    correcta (o sea: sin flash).
 * 2. La clase del `<html>` es estado global. Si viviera en un `useState`,
 *    dos providers distintos pelearían por ella.
 */
let currentTheme: Theme = SERVER_THEME;
let currentResolved: ResolvedTheme = SERVER_RESOLVED_THEME;
let hydrated = false;
let mediaQuery: MediaQueryList | null = null;

const listeners = new Set<Listener>();

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return SERVER_RESOLVED_THEME;
  }
  return window.matchMedia(DARK_MEDIA_QUERY).matches ? 'dark' : 'light';
}

/** Devuelve `true` si el tema resuelto cambió (y por lo tanto hay que avisar). */
function applyResolved(theme: Theme): boolean {
  const resolved = theme === 'system' ? systemTheme() : theme;
  // El aviso es condicional, la sincronización del DOM no: el `return` temprano
  // dejaba la clase y el `theme-color` sin tocar, y con el SO en dark y la app
  // en light la barra del sistema quedaba del tema contrario para siempre.
  const changed = resolved !== currentResolved;
  currentResolved = resolved;
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    // El `theme-color` va ACÁ, y no en otro efecto, por la misma razón que la
    // clase: los dos son estado global del DOM, fuera de React. Si se
    // separaran, la barra del sistema dejaría de seguir al toggle de /ajustes.
    //
    // `layout.tsx` declara DOS `meta[name="theme-color"]`, uno por cada
    // `prefers-color-scheme`, y el navegador se queda con el primero que
    // matchee. Hay que pisar los dos: tocar solo el primero dejaría el otro
    // intacto, pero si el SO está en dark el que matchea sigue siendo ese, y
    // la barra queda desincronizada igual. Las media queries no pueden ver el
    // caso que las rompe: que el usuario eligió el tema a mano.
    //
    // Los hexes espejan `--canvas` de `globals.css` (`#f4f4f6` claro, `#0b0b0f`
    // oscuro). Un `meta` no puede leer un token de CSS, así que quedan
    // duplicados: si cambia la paleta, hay que cambiar los dos lados.
    document
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      .forEach((meta) =>
        meta.setAttribute('content', resolved === 'dark' ? '#0B0B0F' : '#F4F4F6'),
      );
  }
  return changed;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function onSystemChange(): void {
  if (currentTheme !== 'system') return;
  if (applyResolved(currentTheme)) emit();
}

function readStoredTheme(): Theme {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(raw) ? raw : 'system';
  } catch {
    // Safari en modo privado y `localStorage` bloqueado: el tema del sistema
    // es un default razonable, no un error.
    return 'system';
  }
}

function persist(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Sin persistencia igual funciona: el tema dura lo que dura la pestaña.
  }
}

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;

  currentTheme = readStoredTheme();

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    mediaQuery = window.matchMedia(DARK_MEDIA_QUERY);
    // Solo tiene sentido escuchar al sistema mientras la preferencia sea
    // `system`: si el usuario eligió `dark`, un cambio del SO no lo toca.
    mediaQuery.addEventListener('change', onSystemChange);
  }

  applyResolved(currentTheme);
  emit();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setTheme(theme: Theme): void {
  if (theme !== currentTheme) {
    currentTheme = theme;
    persist(theme);
    applyResolved(theme);
  }
  emit();
}

export interface ThemeContextValue {
  /** Lo que pidió el usuario: puede ser `system`. */
  theme: Theme;
  /** Lo que realmente se ve: nunca `system`. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // En una microtask, no en el cuerpo del efecto: adoptar el valor real del
    // store dispara un re-render, y hacerlo sincrónico lo encadena (gotchas #9).
    queueMicrotask(hydrate);
    return () => {
      mediaQuery?.removeEventListener('change', onSystemChange);
      mediaQuery = null;
    };
  }, []);

  const theme = useSyncExternalStore(subscribe, () => currentTheme, () => SERVER_THEME);
  const resolvedTheme = useSyncExternalStore(
    subscribe,
    () => currentResolved,
    () => SERVER_RESOLVED_THEME,
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme debe usarse dentro de <ThemeProvider>');
  }
  return context;
}

/**
 * Atajo para un toggle claro/oscuro: si el tema resuelto es `dark`, el botón
 * tiene que ofrecer pasar a `light`.
 */
export function useToggleTheme(): () => void {
  const { resolvedTheme, setTheme } = useTheme();
  return useCallback(
    () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'),
    [resolvedTheme, setTheme],
  );
}
