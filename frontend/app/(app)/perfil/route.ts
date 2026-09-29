import { permanentRedirect } from 'next/navigation';

import { NAV_ITEMS } from '@/components/nav';

/**
 * `/perfil` → `/ajustes`.
 *
 * La pantalla se llama "Ajustes" desde que tiene el toggle de tema y la
 * configuración de moneda, y la tab de abajo ya decía "Ajustes": la ruta era el
 * único lugar del producto que seguía diciendo "perfil". Se renombró junto con
 * el resto de la migración, así que no hay link viejo en circulación — el
 * redirect existe por los links que se pudieron haber compartido antes.
 *
 * Es 308 y no 302 a propósito: la respuesta es permanente y el cliente tiene
 * que cachearla. Con un 302, cada visita a `/perfil` paga un round-trip y
 * Google nunca consolida las dos URLs.
 */
export function GET(): never {
  permanentRedirect(NAV_ITEMS[NAV_ITEMS.length - 1].href);
}
