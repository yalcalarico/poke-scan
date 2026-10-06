'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ScreenContainer } from '@/components/layout/screen-container';
import { ScreenHeader } from '@/components/layout/screen-header';
import { CameraView, IdlePanel, MAX_SESSION_ENTRIES, OrganizeSheet, PHASE_DETAIL, PHASE_HEADLINE,
  ScanPreview, appendSessionEntry, cameraNoticeCopy, clearSession, formatCount,
  isCameraStage, readSession, writeSession, type CameraNoticeKind, type CaptureSource,
  type ScanPhase, type ScanStage, type SessionEntry } from '@/components/scanner';
import { Alert, Button, Sheet, Surface, useToast } from '@/components/ui';
import { isCameraSupported, isSecureContextForCamera } from '@/lib/scanner/camera';
import { useAuth } from '@/hooks/use-auth';
import { useMobileCamera } from '@/hooks/use-mobile-camera';
import { recognizeCameraCard } from '@/lib/scanner/camera-visual';
import { prepareVisualPhoto } from '@/lib/scanner/visual-photo';
import { getCardPrices } from '@/lib/api/cards';
import { ScanMatchSheet } from '@/components/scanner/scan-match-sheet';
import { CaptureReviewActions } from '@/components/scanner/capture-review';
import type { CaptureReview } from '@/lib/scanner/capture-review';
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
  const [exitPending, setExitPending] = useState(false);
  const router = useRouter();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const toast = useToast();
  const mobileCamera = useMobileCamera();
  const env = useSyncExternalStore(subscribeToEnv, getBrowserEnv, () => null);
  const [stage, setStage] = useState<ScanStage>('idle');
  const [cameraNotice, setCameraNotice] = useState<Notice | null>(null);
  const errorTitle = 'No pudimos reconocer la carta';
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [phase, setPhase] = useState<ScanPhase>('preparing');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [captureReview, setCaptureReview] = useState<CaptureReview | null>(null);
  const reviewsRef = useRef(new Map<number, CaptureReview>());
  const [organizeReview, setOrganizeReview] = useState<CaptureReview | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [matchPending, setMatchPending] = useState(false);
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
    if (isAuthLoading) return;
    if (!isAuthenticated) { router.push('/login?next=escanear'); return; }
    const runId = ++runIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setCaptureMode(from);
    setStage('processing');
    setPhase('preparing');
    setErrorMessage(null);
    setCaptureReview(null);
    setReviewOpen(false);
    try {
      const image = await load();
      controller.signal.throwIfAborted();
      const review: CaptureReview = { image, source: from, capturedAt: new Date().toISOString(), runId, result: null, error: null };
      setCaptureReview(review);
      setPhase('searching');
      const candidate = await recognizeCameraCard(image,
        AbortSignal.any([controller.signal, AbortSignal.timeout(35_000)]),
        (result) => {
          if (runIdRef.current !== runId) return;
          review.result = result;
          setCaptureReview({ ...review });
        });
      if (runIdRef.current !== runId || controller.signal.aborted) return;
      if (!candidate) throw new Error('No encontramos una carta. Probá sin reflejos y con la carta llenando el marco.');
      reviewsRef.current.set(runId, review);
      if (reviewsRef.current.size > MAX_SESSION_ENTRIES) {
        const oldest = reviewsRef.current.keys().next().value;
        if (oldest !== undefined) reviewsRef.current.delete(oldest);
      }
      setSession((current) => appendSessionEntry(current, { runId, candidate }));
      setStage(from === 'camera' ? 'camera' : 'idle');
    } catch (error) {
      if (runIdRef.current !== runId || controller.signal.aborted) return;
      setErrorMessage(error instanceof Error ? error.message : 'No pudimos reconocer la carta. Volvé a intentar.');
      setCaptureReview((current) => current?.runId === runId ? { ...current, error: error instanceof Error ? error.message : 'No pudimos reconocer la carta.' } : current);
      setStage(from === 'camera' ? 'camera' : 'error');
    }
  }, [isAuthLoading, isAuthenticated, router]);

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
    if (isAuthLoading) return;
    if (!isAuthenticated) { router.push('/login?next=escanear'); return; }
    if (!cameraAvailable) return;
    setCameraNotice(null);
    setErrorMessage(null);
    setCaptureMode('camera');
    setStage('camera');
  }, [cameraAvailable, isAuthLoading, isAuthenticated, router]);
  const handleCameraError = useCallback((kind: CameraError, detail?: string) => {
    setCameraNotice({ kind, detail: detail ?? null });
    setStage('idle');
  }, []);

  const discardLast = useCallback(() => {
    setSession((current) => current.slice(0, -1));
    setCaptureReview(null);
    setReviewOpen(false);
    toast.info('Descartamos la última lectura.');
  }, [toast]);

  const handleSaved = useCallback((runIds: number[]) => {
    const saved = new Set(runIds);
    for (const id of runIds) reviewsRef.current.delete(id);
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
    reviewsRef.current.clear();
    setSession([]);
    setCaptureReview(null);
    setReviewOpen(false);
  }, []);

  const handleRemove = useCallback((runId: number) => {
    reviewsRef.current.delete(runId);
    setSession((current) => current.filter((entry) => entry.runId !== runId));
  }, []);

  const openOrganize = useCallback(
    (from: 'camera' | 'idle') => {
      setOrganizeReturn(from);
      setStage('organizing');
    },
    [],
  );

  const confirmMatch = async (match: VisualIdentifyResponseDto['candidates'][number]) => {
    const review = organizeReview ?? captureReview;
    if (!review || matchPending) return;
    const runId = review.runId;
    setMatchPending(true);
    try {
      const existing = session.find((entry) => entry.runId === runId)?.candidate;
      const prices = existing?.card.id === match.card.id ? existing.prices ?? []
        : await getCardPrices(match.card.id, AbortSignal.timeout(5000)).then((response) => response.prices).catch(() => []);
      setSession((current) => current.map((entry) => entry.runId === runId ? { ...entry, candidate: {
        card: match.card, score: Math.max(0, Math.min(1, match.similarity)), rawScore: match.similarity,
        price: prices[0] ?? (existing?.card.id === match.card.id ? existing.price : null), prices,
      } } : entry));
      setReviewOpen(false);
      setOrganizeReview(null);
      toast.success('Actualizamos la carta de esta lectura.');
    } finally { setMatchPending(false); }
  };

  const progress = null;
  const headline = PHASE_HEADLINE[phase];
  const showShell = !showCamera;
  const reviewActions = captureReview && !detected && stage !== 'processing'
    ? <CaptureReviewActions review={captureReview} open={reviewOpen} onOpenChange={setReviewOpen} /> : null;
  return <>
    {showShell ? <>
      <ScreenHeader title="Escanear" back={{ href: '/buscar', label: 'buscar' }} />
      <ScreenContainer className="flex flex-col gap-4">
        {stage === 'idle' ? <>
          {!isAuthLoading && !isAuthenticated ? <Alert tone="info" title="Iniciá sesión para reconocer cartas">Podés explorar el catálogo sin cuenta. Para usar el escáner, entrá a tu cuenta primero.</Alert> : null}
          <IdlePanel visualCamera showCamera={mobileCamera} cameraAvailable={cameraAvailable}
            sessionCount={session.length} onScan={openCamera}
            onPickFromGallery={() => { if (isAuthLoading) return; if (!isAuthenticated) { router.push('/login?next=escanear'); return; } fileInputRef.current?.click(); }}
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
          {detected && captureMode === 'gallery' && captureReview?.runId === detected.runId ?
            <Button variant="secondary" onClick={() => setReviewOpen(true)}>Revisar última foto</Button> : null}
          {session.length > 0 ? <div className="flex flex-col gap-1">
            <p className="text-caption text-tertiary">{formatCount(session.length)} {session.length === 1 ? 'carta leída pendiente' : 'cartas leídas pendientes'} de guardar en una colección.</p>
            {session.length >= MAX_SESSION_ENTRIES ? <p className="text-caption text-tertiary">Esta sesión conserva hasta {formatCount(MAX_SESSION_ENTRIES)} cartas. Organizá estas antes de seguir escaneando.</p> : null}
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
        {reviewActions}
      </ScreenContainer>
    </> : null}
    {showCamera ? <CameraView autoVisual reviewOpen={reviewOpen || exitPending} onReview={captureReview?.runId === detected?.runId ? () => setReviewOpen(true) : undefined} autoCapturePaused={reviewOpen || matchPending || exitPending} reviewActions={reviewActions} liveResult={errorMessage} busy={stage === 'processing'} detected={detected}
      headline={headline} detail={PHASE_DETAIL[phase]} progress={progress} previewUrl={previewUrl}
      sessionCount={session.length} onCapture={handleCapture} onError={handleCameraError}
      onClose={() => { if (session.length > 0) setExitPending(true); else { abortRef.current?.abort(); runIdRef.current += 1; setStage('idle'); } }}
      onPickFromGallery={() => { if (isAuthLoading) return; if (!isAuthenticated) { router.push('/login?next=escanear'); return; } fileInputRef.current?.click(); }} onDiscard={discardLast}
      onOrganize={() => openOrganize('camera')} /> : null}
    {(() => {
      const review = organizeReview ?? captureReview;
      const entry = session.find((item) => item.runId === review?.runId);
      return review && entry ? <ScanMatchSheet
        key={`${review.runId}-${entry.candidate.card.id}`} review={review} candidate={entry.candidate}
        open={Boolean(organizeReview) || reviewOpen} pending={matchPending}
        onOpenChange={(open) => { if (!matchPending) { setReviewOpen(open); if (!open) setOrganizeReview(null); } }}
        onConfirm={(match) => void confirmMatch(match)} onManualSearch={() => { setReviewOpen(false); setOrganizeReview(null); goManualSearch(); }} /> : null;
    })()}
    <OrganizeSheet open={stage === 'organizing' && !organizeReview} entries={session} onClose={() => setStage(organizeReturn)}
      onSaved={handleSaved} onRemove={handleRemove}
      onReview={(runId) => {
        const review = reviewsRef.current.get(runId);
        if (review) setOrganizeReview(review);
        else toast.info('Esta captura ya no está disponible. Volvé a escanear la carta para comparar las opciones.');
      }} />
    <Sheet open={exitPending} onClose={() => setExitPending(false)} title="¿Salir del escáner?"
      footer={<div className="flex gap-3">
        <Button variant="secondary" onClick={() => setExitPending(false)} className="flex-1">Seguir escaneando</Button>
        <Button onClick={() => { abortRef.current?.abort(); runIdRef.current += 1; setExitPending(false); setStage('idle'); }} className="flex-1">Salir</Button>
      </div>}>
      <p className="text-body text-secondary">Todavía no agregaste estos escaneos a una colección. Si salís, quedan pendientes para organizar después.</p>
    </Sheet>
    <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" aria-label="Elegir una foto de la carta"
      onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; handleFile(file); }} />
  </>;
}
