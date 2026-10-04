'use client';

import { useCurrency } from '@/hooks/use-currency';
import { cn } from '@/lib/cn';

/**
 * ─── ⛔ POR QUÉ ESTE COMPONENTE NO DISPARA NINGÚN FETCH ───
 *
 * La referencia de diseño muestra este chip *mientras se encuadra la carta*,
 * y esa es exactamente la tentación que hay que dejar escrita.
 *
 * pokemontcg.io v2 no tiene API key: **1.000 requests/día y 30/min**
 * (`AGENTS.md` §3.1). El catálogo de 20.670 cartas ya está espejado en
 * PostgreSQL y los precios se piden **bajo demanda**, con cache de dos capas
 * (Redis 1 h + Postgres 24 h) y una cola en background que pone 2,3 s entre
 * requests. Un chip que consulta el precio mientras se encuadra convertiría
 * cada carta-frame en un request: veinte cartas por sesión y el día se
 * agota, o se levanta el rate limit por minute y el escáner deja de funcionar.
 *
 * Por eso `usd` es un **número que ya está en memoria**: viene de
 * `RecognizedCard.price`, consultado para el ID visual elegido
 * **una vez por captura** y nunca desde el loop de cámara. Este
 * componente no importa `lib/api`, no tiene `useEffect` y no tiene estado.
 *
 * Las tres consecuencias son intencionales y no son un TODOs:
 *
 * 1. Sin precio en la respuesta, **el chip no aparece**. No hay estado de
 *    carga, ni spinner, ni reintento, ni un `—` flotando sobre la foto: no
 *    hay nada que pedir, así que no hay nada que mostrar.
 * 2. No hay recarga. Si el precio envejece, se actualiza la próxima vez que
 *    se escanea la carta, con la regla de 24 h del backend.
 * 3. No hay prop `onRefresh`. Si algún día alguien la agrega, está rompiendo
 *    el rate limit — y no va a fallar en local, va a fallar en producción con
 *    el catálogo de un usuario real.
 */
export interface PriceChipProps {
  /** Precio en USD que **ya vino** en la respuesta de identify. `null` = no hay precio. */
  usd: number | null;
  className?: string;
}

export function PriceChip({ usd, className }: PriceChipProps) {
  const { formatMoney } = useCurrency();

  if (usd === null || !Number.isFinite(usd)) return null;

  return (
    <div
      className={cn(
        'rounded-control bg-on-media px-3 py-1.5 text-on-media-text shadow-xl backdrop-blur-md',
        className,
      )}
    >
      {/* La cifra grande es `tabular-nums` + `tracking-tight` por §3.2. */}
      <p className="text-display-lg leading-none tracking-tight text-positive tabular-nums">
        {formatMoney(usd)}
      </p>
    </div>
  );
}
