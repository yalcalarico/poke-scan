'use client';

import { Button, useToast } from '@/components/ui';
import { downloadCaptureReview, type CaptureReview } from '@/lib/scanner/capture-review';

export function CaptureReviewActions({ review, open, onOpenChange }: {
  review: CaptureReview;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const toast = useToast();
  const download = (kind: 'image' | 'diagnostic') => {
    try { downloadCaptureReview(review, kind); }
    catch { toast.error('No pudimos descargar la captura. Probá de nuevo.'); }
  };
  const first = review.result?.candidates[0]?.card;
  return <details open={open} onToggle={(event) => onOpenChange(event.currentTarget.open)}
    className="rounded-panel bg-surface p-3 text-primary">
    <summary className="min-h-11 cursor-pointer py-3 text-label focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]">
      ¿No coincidió? Guardá el recorte
    </summary>
    <div className="flex flex-col gap-2">
      <p className="text-caption text-secondary">
        {first ? `Esta captura predijo ${first.name} · ${first.set?.name ?? first.setId} · #${first.number}.` : 'Esta captura no tiene una predicción disponible.'}
        {' '}Descargá el recorte y su diagnóstico para indicar después cuál era la carta correcta.
      </p>
      <p className="text-caption text-secondary">Sólo se descargan cuando los elegís. La próxima captura reemplaza esta revisión. No se guardan en el servidor ni se recuperan al recargar.</p>
      {review.source === 'camera' ? <p className="text-caption text-secondary">La captura automática queda pausada mientras esta revisión esté abierta.</p> : null}
      <Button variant="secondary" onClick={() => download('image')} fullWidth>Descargar recorte</Button>
      <Button variant="secondary" onClick={() => download('diagnostic')} fullWidth>Descargar diagnóstico</Button>
    </div>
  </details>;
}
