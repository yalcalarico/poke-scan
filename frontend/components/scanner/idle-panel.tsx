'use client';

import { CircleAlert, ImageUp, Search } from 'lucide-react';
import { Button } from '@/components/ui';
import { ScannerCaptureLayout, ScannerProcess } from './scanner-layout';
import { ScannerIllustration } from './scanner-illustration';
import styles from './scanner.module.css';

export interface IdlePanelProps {
  visualCamera?: boolean;
  showCamera?: boolean;
  cameraAvailable: boolean;
  sessionCount: number;
  onScan: () => void;
  onPickFromGallery: () => void;
  onManualSearch: () => void;
  onOrganize: () => void;
}

/** Los botones conservan sus gates en la ruta; el encuadre es sólo editorial. */
export function IdlePanel({
  visualCamera = true, showCamera = true, cameraAvailable, sessionCount,
  onScan, onPickFromGallery, onManualSearch, onOrganize,
}: IdlePanelProps) {
  return <ScannerCaptureLayout preview={<ScannerIllustration />}>
    <span className={styles.badge}>{showCamera ? 'Cámara en teléfono' : 'Reconocimiento por foto'}</span>
    <h2>Una captura. Una decisión clara.</h2>
    <p className={styles.description}>
      {showCamera && visualCamera
        ? 'Encuadrá la carta y mantenela quieta. La primera coincidencia se suma a esta sesión para que la revises.'
        : 'Subí una foto nítida, sin reflejos y con una sola carta. La primera coincidencia se suma a esta sesión para que la revises.'}
    </p>
    <div className={styles.actions}>
      {showCamera ? <Button size="lg" onClick={onScan} disabled={!cameraAvailable} className={styles.primary}>Escanear carta</Button> : null}
      <Button variant={showCamera ? 'secondary' : 'primary'} size="lg" onClick={onPickFromGallery}>
        <ImageUp aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-5 w-5" />Subir una foto
      </Button>
      <Button variant="secondary" size="lg" onClick={onManualSearch}>
        <Search aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-5 w-5" />Buscar a mano
      </Button>
    </div>
    {showCamera && !cameraAvailable ? <p className={styles.hint}>La cámara no está disponible en este dispositivo o conexión. Subí una foto o buscá a mano.</p> : null}
    <ScannerProcess />
    {sessionCount > 0 ? <div role="status" className="flex w-full flex-col gap-3 rounded-panel border border-warning-border bg-warning-soft p-4">
      <p className="flex items-center gap-2 text-body-strong text-warning">
        <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
        {sessionCount} {sessionCount === 1 ? 'carta pendiente de organizar' : 'cartas pendientes de organizar'}
      </p>
      <Button variant="secondary" size="lg" onClick={onOrganize} fullWidth>Organizar la sesión ({sessionCount})</Button>
    </div> : null}
  </ScannerCaptureLayout>;
}
