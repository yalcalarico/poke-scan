'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ScreenContainer } from '@/components/layout/screen-container';
import { ScreenHeader } from '@/components/layout/screen-header';
import { CameraView, IdlePanel, MAX_SESSION_ENTRIES, OrganizeSheet, PHASE_DETAIL, PHASE_HEADLINE,
  ScanPreview, DetectedCardBar, appendSessionEntry, cameraNoticeCopy, clearSession, formatCount,
  isCameraStage, readSession, writeSession, type CameraNoticeKind, type CaptureSource,
  type ScanPhase, type ScanStage, type SessionEntry } from '@/components/scanner';
import { Alert, Button, Surface, useToast } from '@/components/ui';
import { isCameraSupported, isSecureContextForCamera } from '@/lib/scanner/camera';
import { useMobileCamera } from '@/hooks/use-mobile-camera';
import { recognizeCameraCard } from '@/lib/scanner/camera-visual';
import { prepareVisualPhoto } from '@/lib/scanner/visual-photo';
import { VisualDiagnostics } from '@/components/scanner/visual-diagnostics';
import type { CameraError, ScannedCapture } from '@/lib/scanner/types';
import type { VisualIdentifyResponseDto } from '@/types/api';

const AUTO_IDENTIFY_INTERVAL_MS = 2500;
interface BrowserEnv { supported: boolean; secure: boolean }
let cachedEnv: BrowserEnv | null = null;
function getBrowserEnv(): BrowserEnv {
  cachedEnv ??= { supported: isCameraSupported(), secure: isSecureContextForCamera() };
  return cachedEnv;
}
function subscribeToEnv(): () => void { return () => {}; }
interface Notice { kind: CameraNoticeKind; detail: string | null }

export default function ScanPage() {
  const router = useRouter();
  const toast = useToast();
  const mobileCamera = useMobileCamera();
  const env = useSyncExternalStore(subscribeToEnv, getBrowserEnv, () => null);
  const [stage, setStage] = useState<ScanStage>('idle');
  const [cameraNotice, setCameraNotice] = useState<Notice | null>(null);
  const errorTitle = 'No pudimos reconocer la carta';
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [phase, setPhase] = useState<ScanPhase>('preparing');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [visualResult, setVisualResult] = useState<VisualIdentifyResponseDto | null>(null);
  const [session, setSession] = useState<SessionEntry[]>([]);
  /**
   * `true` cuando el primer render ya leyó el storage. Antes de eso el guardado
   * está **desactivado**, por la misma razón del punto anterior: sin este flag,
   * el primer efecto que corre escribe `[]` y borra la sesión del usuario antes
   * de haberla leído.
   */
  const [isSessionRestored, setIsSessionRestored] = useState(false);
  const runIdRef = useRef(0);

  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => {
      if (disposed) return;
      const stored = readSession();
      if (stored.length > 0) {
        setSession(stored);
        runIdRef.current = Math.max(runIdRef.current, ...stored.map((entry) => entry.runId));
      }
      setIsSessionRestored(true);
    });
    return () => {
      disposed = true;
    };
  }, []);

  /**
   * Guardar la sesión en cada cambio, una vez restaurada.
   *
   * Es un efecto de **escritura**, no de sincronización: no lee nada de React
   * para decidir qué hacer, solo escribe. Por eso no dispara el lint de
   * `set-state-in-effect` y por eso no necesita la microtask.
   *
   * Se escribe en el estado vacío para **borrar** la clave, y no para dejar un
   * `[]`: un `sessionStorage` con un array vacío se lee distinto de una clave
   * ausente, y la home usa "hay sesión" para decidir si muestra la fila de
   * "Continuás donde quedaste". Con `0` cartas la fila no va, y el espacio
   * guardado por un `[]` no vale nada.
   */
  useEffect(() => {
    if (!isSessionRestored) return;
    writeSession(session);
  }, [isSessionRestored, session]);


  const [captureMode, setCaptureMode] = useState<'camera' | 'gallery'>('camera');
  const [organizeReturn, setOrganizeReturn] = useState<'camera' | 'idle'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const lastAutoIdentifyRef = useRef(0);
  useEffect(() => () => {
    abortRef.current?.abort();
    runIdRef.current += 1;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);
  const cameraAvailable = mobileCamera && !!env?.supported && !!env?.secure;
  const detected = session.at(-1) ?? null;
  const showCamera = mobileCamera && isCameraStage(stage) && captureMode === 'camera';
  const goManualSearch = useCallback(() => router.push('/buscar'), [router]);

  // La cámara ya entrega el recorte del marco. Solo la galería detecta y orienta.
  const runRecognition = useCallback(async (load: () => Promise<string>, from: 'camera' | 'gallery') => {
    const runId = ++runIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setCaptureMode(from);
    setStage('processing');
    setPhase('preparing');
    setErrorMessage(null);
    setVisualResult(null);
    try {
      const image = await load();
      controller.signal.throwIfAborted();
      setPhase('searching');
      const candidate = await recognizeCameraCard(image,
        AbortSignal.any([controller.signal, AbortSignal.timeout(35_000)]),
        (result) => { if (runIdRef.current === runId) setVisualResult(result); });
      if (runIdRef.current !== runId || controller.signal.aborted) return;
      if (!candidate) throw new Error('No encontramos una carta. Probá sin reflejos y con la carta llenando el marco.');
      setSession((current) => appendSessionEntry(current, { runId, candidate }));
      setStage(from === 'camera' ? 'camera' : 'idle');
    } catch (error) {
      if (runIdRef.current !== runId || controller.signal.aborted) return;
      setErrorMessage(error instanceof Error ? error.message : 'No pudimos reconocer la carta. Volvé a intentar.');
      setStage(from === 'camera' ? 'camera' : 'error');
    }
  }, []);

  const handleCapture = useCallback((capture: ScannedCapture, source: CaptureSource) => {
    const now = Date.now();
    if (source === 'auto' && now - lastAutoIdentifyRef.current < AUTO_IDENTIFY_INTERVAL_MS) return;
    lastAutoIdentifyRef.current = now;
    setPreviewUrl(capture.dataUrl ?? null);
    void runRecognition(async () => {
      if (!capture.dataUrl) throw new Error('No pudimos preparar la captura.');
      return capture.dataUrl;
    }, 'camera');
  }, [runRecognition]);

  const handleFile = useCallback((file: File | undefined) => {
    if (!file) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setPreviewUrl(url);
    void runRecognition(async () => {
      const photo = await prepareVisualPhoto(file);
      try { return photo.image; }
      finally { photo.source.highResolutionSource.close(); }
    }, 'gallery');
  }, [runRecognition]);

  const openCamera = useCallback(() => {
    if (!cameraAvailable) return;
    setCameraNotice(null);
    setErrorMessage(null);
    setCaptureMode('camera');
    setStage('camera');
  }, [cameraAvailable]);
  const handleCameraError = useCallback((kind: CameraError, detail?: string) => {
    setCameraNotice({ kind, detail: detail ?? null });
    setStage('idle');
  }, []);

  const discardLast = useCallback(() => {
    setSession((current) => current.slice(0, -1));
    toast.info('Descartamos la última lectura.');
  }, [toast]);

  const handleSaved = useCallback((runIds: number[]) => {
    const saved = new Set(runIds);
    setSession((current) => current.filter((entry) => !saved.has(entry.runId)));
  }, []);

  /**
   * Descartar la sesión entera.
   *
   * El `clearSession()` explícito es por el efecto de guardado: el `setSession`
   * vacío ya dispara el `writeSession([])` que borra la clave, así que la llamada
   * es redundante. Va explícita igual porque el reader de este archivo debería
   * ver que "descartar todo" toca el storage, no solo el estado de React: si
   * mañana el efecto de guardado cambia, el descarte explícito sigue siendo
   * cierto.
   */
  const handleDiscardAll = useCallback(() => {
    clearSession();
    setSession([]);
  }, []);

  const handleRemove = useCallback((runId: number) => {
    setSession((current) => current.filter((entry) => entry.runId !== runId));
  }, []);

  const openOrganize = useCallback(
    (from: 'camera' | 'idle') => {
      setOrganizeReturn(from);
      setStage('organizing');
    },
    [],
  );

  const progress = null;
  const headline = PHASE_HEADLINE[phase];
  const showShell = !showCamera;
  return <>
    {showShell ? <>
      <ScreenHeader title="Escanear" back={{ href: '/buscar', label: 'buscar' }} />
      <ScreenContainer className="flex flex-col gap-4">
        {stage === 'idle' ? <>
          <IdlePanel visualCamera showCamera={mobileCamera} cameraAvailable={cameraAvailable}
            sessionCount={session.length} onScan={openCamera}
            onPickFromGallery={() => fileInputRef.current?.click()}
            onManualSearch={goManualSearch} onOrganize={() => openOrganize('idle')} />
          {cameraNotice ? <Alert tone="error" title={cameraNoticeCopy(cameraNotice.kind).title}>
            <p>{cameraNoticeCopy(cameraNotice.kind).hint}</p>
            {cameraNotice.detail ? <details className="mt-2"><summary className="cursor-pointer text-caption">Detalle técnico</summary>
              <p className="mt-1 break-words font-mono text-caption">{cameraNotice.detail}</p></details> : null}
          </Alert> : null}
          {mobileCamera && env && !env.supported ? <Alert tone="warning" title={cameraNoticeCopy('unsupported').title}>
            {cameraNoticeCopy('unsupported').hint}</Alert> : null}
          {mobileCamera && env && env.supported && !env.secure ? <Alert tone="warning" title={cameraNoticeCopy('insecure-context').title}>
            {cameraNoticeCopy('insecure-context').hint}</Alert> : null}
          {detected ? <DetectedCardBar candidate={detected.candidate} /> : null}
          {visualResult ? <VisualDiagnostics result={visualResult} /> : null}
          {session.length > 0 ? <div className="flex flex-col gap-1">
            <p className="text-caption text-tertiary">{formatCount(session.length)} {session.length === 1 ? 'carta leída' : 'cartas leídas'} en esta sesión.</p>
            {session.length >= MAX_SESSION_ENTRIES ? <p className="text-caption text-tertiary">Guardamos hasta {formatCount(MAX_SESSION_ENTRIES)} cartas. Agregá estas y seguí escaneando.</p> : null}
            <Button variant="ghost" onClick={handleDiscardAll} fullWidth>Descartar la sesión</Button>
          </div> : null}
        </> : null}
        {stage === 'processing' ? <Surface className="flex flex-col items-center gap-4 rounded-panel px-4 py-8">
          <ScanPreview url={previewUrl} className="h-40 w-32" />
          <div role="status" aria-live="polite" className="flex w-full max-w-sm flex-col gap-2">
            <p className="text-body-strong text-primary">{headline}</p>
            <p className="text-caption text-secondary">{PHASE_DETAIL[phase]}</p>
          </div>
        </Surface> : null}
        {stage === 'error' ? <>
          <Alert tone="error" title={errorTitle}><p>{errorMessage}</p></Alert>
          <div className="flex flex-col gap-2 sm:flex-row">
            {cameraAvailable && captureMode === 'camera' ? <Button size="lg" onClick={openCamera} className="flex-1">Volver a escanear</Button>
              : <Button size="lg" onClick={() => fileInputRef.current?.click()} className="flex-1">Subir una foto</Button>}
            <Button variant="secondary" size="lg" onClick={goManualSearch} className="flex-1">Buscar a mano</Button>
          </div>
        </> : null}
      </ScreenContainer>
    </> : null}
    {showCamera ? <CameraView autoVisual liveResult={errorMessage} busy={stage === 'processing'} detected={detected}
      headline={headline} detail={PHASE_DETAIL[phase]} progress={progress} previewUrl={previewUrl}
      sessionCount={session.length} onCapture={handleCapture} onError={handleCameraError}
      onClose={() => { abortRef.current?.abort(); runIdRef.current += 1; setStage('idle'); }}
      onPickFromGallery={() => fileInputRef.current?.click()} onDiscard={discardLast}
      onOrganize={() => openOrganize('camera')} /> : null}
    <OrganizeSheet open={stage === 'organizing'} entries={session} onClose={() => setStage(organizeReturn)}
      onSaved={handleSaved} onRemove={handleRemove} />
    <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" aria-label="Elegir una foto de la carta"
      onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; handleFile(file); }} />
  </>;
}
