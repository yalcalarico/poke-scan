'use client';
import Link from 'next/link';
import type { VisualIdentifyResponseDto } from '@/types/api';

/** El ranking se puede inspeccionar sin interrumpir la selección automática. */
export function VisualDiagnostics({ result }: { result: VisualIdentifyResponseDto }) {
  return <details className="min-w-0 rounded-panel bg-surface-2 p-4">
    <summary className="cursor-pointer text-label text-primary">Predicciones y tiempos · DINOv2</summary>
    <div className="mt-3 flex flex-col gap-2 text-caption text-secondary">
      <p>{result.retrievalLimit} candidatos evaluados · {result.references} referencias · {result.collections} colecciones · índice {result.indexVersion.slice(0, 12)}</p>
      <p>Índice {Math.round(result.indexMs)} ms · modelo {Math.round(result.modelMs)} ms · inferencia {Math.round(result.inferenceMs)} ms · API {Math.round(result.totalMs)} ms</p>
      {result.indexStale ? <p>El índice tiene cambios pendientes de actualizar.</p> : null}
      <p>La similitud coseno no es un porcentaje de certeza. La primera predicción de DINOv2 se suma a la sesión. Revisá la edición al organizar la sesión.</p>
      <ol className="flex flex-col gap-3">
        {result.candidates.map((candidate, index) => <li key={candidate.card.id}>
          <Link className="text-brand hover:underline" href={`/carta/${encodeURIComponent(candidate.card.id)}`}>
            {index + 1}. {candidate.card.name} · {candidate.card.set?.name ?? candidate.card.setId} · #{candidate.card.number}
          </Link>
          <p>Similitud {candidate.similarity.toFixed(3)} · posición DINOv2 original {candidate.retrievalRank}</p>
        </li>)}
      </ol>
    </div>
  </details>;
}
