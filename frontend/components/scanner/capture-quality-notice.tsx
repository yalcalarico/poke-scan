import { Alert } from '@/components/ui';
import type { CaptureQuality } from '@/lib/scanner/capture-quality';

export function CaptureQualityNotice({ quality }: { quality: CaptureQuality | undefined }) {
  if (!quality?.warnings.length) return null;

  return (
    <Alert tone="warning" size="sm" title="Revisá la foto · experimental">
      <div className="flex flex-col gap-2">
        {quality.warnings.includes('blur') ? (
          <p>Puede faltar enfoque. Sostené el teléfono quieto y esperá a que se vea nítida.</p>
        ) : null}
        {quality.warnings.includes('glare') ? (
          <p>Puede haber reflejos o zonas muy claras. Cambiá la luz o incliná apenas la carta.</p>
        ) : null}
        <p>Son señales orientativas: el diseño de la carta puede activarlas. Podés seguir revisando.</p>
      </div>
    </Alert>
  );
}
