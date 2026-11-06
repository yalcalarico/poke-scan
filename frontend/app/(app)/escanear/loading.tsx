import { ScannerCaptureLayout, ScannerLayout } from '@/components/scanner/scanner-layout';
import { Skeleton } from '@/components/ui';

/** Misma composición sin simular permiso, foto ni reconocimiento. */
export default function ScanLoading() {
  return <ScannerLayout busy>
    <span role="status" aria-label="Preparando el escáner" className="sr-only">Preparando el escáner</span>
    <ScannerCaptureLayout preview={<Skeleton variant="block" className="h-64 w-44" />}>
      <Skeleton variant="text" className="w-40" />
      <Skeleton variant="text" className="h-6 w-full" />
      <Skeleton variant="text" className="w-full" />
      <div className="flex flex-col gap-3" aria-hidden="true">
        <Skeleton variant="block" className="h-12 w-full" />
        <Skeleton variant="block" className="h-12 w-full" />
      </div>
    </ScannerCaptureLayout>
  </ScannerLayout>;
}
