import { cn } from '@/lib/cn';
import { pluralize } from '@/lib/format';
import { formatReferenceTime } from '@/lib/prices/format';
import type { ValueAggregateDto } from '@/types/api';

/** Metadata compartida con la vista pública: no depende de sesión, moneda ni reloj cliente. */
export function ValuationMetadata({ valuation, emptyMessage = 'Todavía no hay cartas en esta colección.', className, announceChanges = false }: {
  valuation: ValueAggregateDto | undefined;
  emptyMessage?: string;
  className?: string;
  announceChanges?: boolean;
}) {
  if (!valuation) return <p className="text-caption text-warning" role={announceChanges ? 'status' : undefined}>Valuación, cobertura y antigüedad no disponibles.</p>;
  const { coverage, recency } = valuation;
  const coverageText = coverage.totalCopies === 0
    ? emptyMessage
    : coverage.pricedCopies === 0
      ? `Sin referencia de precio para estas ${coverage.totalCopies} ${pluralize(coverage.totalCopies, 'copia', 'copias')}.`
      : coverage.pricedCopies < coverage.totalCopies
        ? `Valor parcial · ${coverage.pricedCopies} de ${coverage.totalCopies} copias con precio.`
        : `${coverage.pricedCopies} de ${coverage.totalCopies} copias con precio.`;
  return <div className={cn('flex flex-col gap-1 text-caption text-secondary', className)} role={announceChanges ? 'status' : undefined}>
    <p>{coverageText}</p>
    <details>
      <summary className="flex min-h-11 cursor-pointer items-center rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]">Ver detalles del valor</summary>
      <div className="flex flex-col gap-1">
    {valuation.evaluatedAt ? <p>Evaluado el {formatReferenceTime(valuation.evaluatedAt)}</p> : <p>Evaluación: antigüedad no disponible</p>}
    {recency ? <>
      <p>Al evaluar{valuation.evaluatedAt ? ` el ${formatReferenceTime(valuation.evaluatedAt)}` : ''}: {recency.freshCopies} {pluralize(recency.freshCopies, 'copia', 'copias')} con consulta reciente, {recency.staleCopies} con consulta anterior u otra API y {recency.unknownFreshnessCopies} sin antigüedad disponible.</p>
      {recency.freshness === 'mixed' ? <p>Consultas con distinta antigüedad.</p> : null}
      {recency.oldestFetchedAt && recency.newestFetchedAt ? <p>Consultas incluidas entre {formatReferenceTime(recency.oldestFetchedAt)} y {formatReferenceTime(recency.newestFetchedAt)}.</p> : null}
      {recency.upstreamFreshness === 'unknown' ? <p>Fecha de actualización de la fuente no disponible.</p> : recency.upstreamFreshness === 'mixed' ? <p>Las referencias no comparten la misma antigüedad de fuente; alguna puede no tener fecha disponible.</p> : recency.upstreamFreshness === 'stale' ? <p>Hay referencias con fecha de fuente anterior.</p> : <p>La fuente informa fechas recientes al evaluar.</p>}
    </> : <p>Antigüedad de las referencias no registrada.</p>}
      </div>
    </details>
  </div>;
}
