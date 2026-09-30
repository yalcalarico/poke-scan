import { House, Layers, ScanLine, Search, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Navegación de la app. Es la fuente única: no hay ningún `href` hardcodeado en
 * un componente de pantalla, así que cambiar el orden o los destinos es tocar
 * este archivo.
 *
 * La navegación móvil incluye Inicio para volver al dashboard. En desktop el
 * mismo destino es el wordmark de la barra, así que `BottomNav` lo oculta ahí y
 * deja cuatro secciones junto a la marca.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/inicio', label: 'Inicio', icon: House },
  { href: '/buscar', label: 'Buscar', icon: Search },
  { href: '/escanear', label: 'Escanear', icon: ScanLine },
  { href: '/colecciones', label: 'Colecciones', icon: Layers },
  { href: '/ajustes', label: 'Ajustes', icon: Settings },
] as const;

export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
