'use client';

import { readMaxSessionRunId, sessionRecoveryNotice } from '@/components/scanner/session-storage';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ScreenContainer } from '@/components/layout/screen-container';
import { ScreenHeader } from '@/components/layout/screen-header';
import { CameraView, IdlePanel, OrganizeSheet, PHASE_DETAIL, PHASE_HEADLINE,
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
import { analyzeCaptureQuality, type CaptureQuality } from '@/lib/scanner/capture-quality';
import { fileToImageData, DEFAULT_CAPTURE_WIDTH } from '@/components/scanner/image-input';
import { CaptureQualityNotice } from '@/components/scanner/capture-quality-notice';
import { VisualScanResult } from '@/components/scanner/visual-result';
import { DiagnosticPanel } from '@/components/scanner/diagnostic-panel';
import { addDiagnosticReading, appendDiagnosticEvent, beginDiagnosticOperation, confirmDiagnosticIdentity, diagnosticRankForIdentity, endDiagnosticOperation, failDiagnosticRecognition, receiveDiagnosticPrediction, recordDiagnosticPreparationFailure, selectDiagnosticAlternative, type DiagnosticSession } from '@/lib/scanner/diagnostic-session';
import { playCoinSound, unlockCoinSound } from '@/lib/scanner/coin-sound';
import { shownPriceReference, shownPriceValue } from '@/lib/scanner/price-reference';

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
  const { isAuthenticated, isLoading: isAuthLoading, user } = useAuth();
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
  const [manualReviewRunId, setManualReviewRunId] = useState<number | null>(null);
  const [persistenceNotice, setPersistenceNotice] = useState<string | null>(null);
  const [session, setSession] = useState<SessionEntry[]>([]);
  const diagnosticRef = useRef<DiagnosticSession | null>(null);
  const [diagnosticState, setDiagnosticState] = useState<{ session: DiagnosticSession | null }>({ session: null });
  const diagnosticView = diagnosticState.session;
  const publishDiagnostic = useCallback(() => setDiagnosticState({ session: diagnosticRef.current }), []);
  const logDiagnostic = useCallback((runId: number, type: Parameters<typeof appendDiagnosticEvent>[2], metadata?: Parameters<typeof appendDiagnosticEvent>[3]) => {
    const active = diagnosticRef.current;
    const reading = active?.readings.find((item) => item.runId === runId);
    if (!active || !reading || active.finalized) return;
    appendDiagnosticEvent(active, reading.id, type, metadata);
    publishDiagnostic();
  }, [publishDiagnostic]);
  const changeDiagnostic = useCallback((next: DiagnosticSession | null) => { diagnosticRef.current = next; publishDiagnostic(); }, [publishDiagnostic]);
  const diagnosticOwnerRef = useRef(user?.id);
  useEffect(() => {
    if (diagnosticOwnerRef.current === user?.id) return;
    diagnosticOwnerRef.current = user?.id;
    abortRef.current?.abort();
    runIdRef.current += 1;
    diagnosticRef.current = null;
    reviewsRef.current.clear();
    queueMicrotask(() => {
      setStage('idle');
      setCaptureReview(null);
      setOrganizeReview(null);
      setManualReviewRunId(null);
      publishDiagnostic();
    });
  }, [publishDiagnostic, user?.id]);
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
      setPersistenceNotice(sessionRecoveryNotice());
      runIdRef.current = Math.max(runIdRef.current, readMaxSessionRunId());
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
    if (!writeSession(session)) queueMicrotask(() => setPersistenceNotice(sessionRecoveryNotice() ?? 'El borrador dura mientras esta pantalla siga abierta. No pudimos guardarlo en esta pestaña.'));
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
    diagnosticRef.current = null;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);
  const cameraAvailable = mobileCamera && !!env?.supported && !!env?.secure;
  const detected = session.at(-1) ?? null;
  const showCamera = mobileCamera && isCameraStage(stage) && captureMode === 'camera';
  const soundedRunIdsRef = useRef(new Set<number>());
  useEffect(() => {
    if (!showCamera || !detected || captureReview?.runId !== detected.runId || soundedRunIdsRef.current.has(detected.runId)) return;
    const reference = shownPriceReference(detected.candidate);
    if (!reference || shownPriceValue(reference) === null) return;
    soundedRunIdsRef.current.add(detected.runId);
    playCoinSound();
  }, [captureReview?.runId, detected, showCamera]);
  const goManualSearch = useCallback(() => router.push('/buscar'), [router]);

  // La cámara ya entrega el recorte del marco. Solo la galería detecta y orienta.
  const runRecognition = useCallback(async (load: () => Promise<{ image: string; quality?: CaptureQuality }>, from: 'camera' | 'gallery') => {
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
    let diagnosticReadingId: string | null = null;
    let capturePrepared = false;
    const diagnosticAtStart = diagnosticRef.current;
    const trackedDiagnostic = diagnosticAtStart && !diagnosticAtStart.finalized ? diagnosticAtStart : null;
    if (trackedDiagnostic) { beginDiagnosticOperation(trackedDiagnostic); publishDiagnostic(); }
    try {
      const { image, quality } = await load();
      capturePrepared = true;
      controller.signal.throwIfAborted();
      const review: CaptureReview = { image, quality, source: from, capturedAt: new Date().toISOString(), runId, result: null, error: null };
      const diagnosticReading = diagnosticRef.current === diagnosticAtStart && diagnosticAtStart && !diagnosticAtStart.finalized
        ? addDiagnosticReading(diagnosticAtStart, review) : null;
      diagnosticReadingId = diagnosticReading?.id ?? null;
      if (diagnosticReading) publishDiagnostic();
      else if (diagnosticAtStart?.suspended && diagnosticRef.current === diagnosticAtStart) publishDiagnostic();
      setCaptureReview(review);
      setPhase('searching');
      const candidate = await recognizeCameraCard(image,
        AbortSignal.any([controller.signal, AbortSignal.timeout(35_000)]),
        (result) => {
          if (runIdRef.current !== runId) return;
          review.result = result;
          if (diagnosticReading && diagnosticRef.current === diagnosticAtStart && diagnosticAtStart && !diagnosticAtStart.finalized) {
            receiveDiagnosticPrediction(diagnosticAtStart, diagnosticReading.id, result);
            publishDiagnostic();
          }
          setCaptureReview({ ...review });
        });
      if (runIdRef.current !== runId || controller.signal.aborted) return;
      if (!candidate) throw new Error('No encontramos una carta. Probá sin reflejos y con la carta llenando el marco.');
      reviewsRef.current.set(runId, review);
      if (reviewsRef.current.size > 30) {
        const oldest = reviewsRef.current.keys().next().value;
        if (oldest !== undefined) reviewsRef.current.delete(oldest);
      }
      setSession((current) => appendSessionEntry(current, { runId, candidate }));
      setStage(from === 'camera' ? 'camera' : 'idle');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No pudimos reconocer la carta. Volvé a intentar.';
      if (!capturePrepared && trackedDiagnostic && !trackedDiagnostic.finalized) {
        recordDiagnosticPreparationFailure(trackedDiagnostic, controller.signal.aborted);
        if (diagnosticRef.current === trackedDiagnostic) publishDiagnostic();
      }
      if (diagnosticRef.current === diagnosticAtStart && diagnosticAtStart && !diagnosticAtStart.finalized && diagnosticReadingId) {
        failDiagnosticRecognition(diagnosticAtStart, diagnosticReadingId, message, controller.signal.aborted);
        publishDiagnostic();
      }
      if (runIdRef.current !== runId) return;
      if (controller.signal.aborted) return;
      setErrorMessage(message);
      setCaptureReview((current) => current?.runId === runId ? { ...current, error: error instanceof Error ? error.message : 'No pudimos reconocer la carta.' } : current);
      setStage(from === 'camera' ? 'camera' : 'error');
    } finally {
      if (trackedDiagnostic && !trackedDiagnostic.finalized) {
        if (diagnosticReadingId && (controller.signal.aborted || runIdRef.current !== runId)) {
          failDiagnosticRecognition(trackedDiagnostic, diagnosticReadingId, 'La lectura se canceló antes de terminar.', true);
        }
        endDiagnosticOperation(trackedDiagnostic);
        if (diagnosticRef.current === trackedDiagnostic) publishDiagnostic();
      }
    }
  }, [isAuthLoading, isAuthenticated, router, publishDiagnostic]);

  const handleCapture = useCallback((capture: ScannedCapture, source: CaptureSource) => {
    const now = Date.now();
    if (source === 'auto' && now - lastAutoIdentifyRef.current < AUTO_IDENTIFY_INTERVAL_MS) return;
    lastAutoIdentifyRef.current = now;
    setPreviewUrl(capture.dataUrl ?? null);
    void runRecognition(async () => {
      if (!capture.dataUrl) throw new Error('No pudimos preparar la captura.');
      // La métrica orienta; un fallo al decodificarla no impide reconocer los
      // bytes originales de cámara ni modifica el recorte que se puede descargar.
      let quality: CaptureQuality | undefined;
      try {
        const source = await fileToImageData(new File([capture.blob], 'captura', { type: capture.blob.type }), DEFAULT_CAPTURE_WIDTH);
        try { quality = analyzeCaptureQuality(source.imageData); }
        finally { source.highResolutionSource.close(); }
      } catch { /* La consulta sigue disponible sin diagnóstico de calidad. */ }
      return { image: capture.dataUrl, quality };
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
      try { return { image: photo.image, quality: photo.quality }; }
      finally { photo.source.highResolutionSource.close(); }
    }, 'gallery');
  }, [runRecognition]);

  const openCamera = useCallback(() => {
    if (isAuthLoading) return;
    if (!isAuthenticated) { router.push('/login?next=escanear'); return; }
    if (!cameraAvailable) return;
    void unlockCoinSound();
    setCameraNotice(null);
    setErrorMessage(null);
    setCaptureMode('camera');
    setStage('camera');
  }, [cameraAvailable, isAuthLoading, isAuthenticated, router]);
  const handleCameraError = useCallback((kind: CameraError, detail?: string) => {
    setCameraNotice({ kind, detail: detail ?? null });
    setStage('idle');
  }, []);

  const handleSaved = useCallback((runIds: number[]) => {
    const saved = new Set(runIds);
    for (const runId of saved) {
      const reading = diagnosticRef.current?.readings.find((item) => item.runId === runId);
      logDiagnostic(runId, 'saved', { previousCardId: reading?.final?.id ?? reading?.initial?.id ?? null, source: 'system' });
    }
    for (const id of runIds) reviewsRef.current.delete(id);
    setSession((current) => current.filter((entry) => !saved.has(entry.runId)));
  }, [logDiagnostic]);

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
    if (!clearSession()) { toast.info('Hay intentos protegidos. Conservamos el lote para verificarlos.'); return; }
    reviewsRef.current.clear();
    for (const entry of session) logDiagnostic(entry.runId, 'reading_discarded', { previousCardId: entry.candidate.card.id, source: 'user' });
    setSession([]);
    setCaptureReview(null);
    setReviewOpen(false);
  }, [toast, session, logDiagnostic]);

  const handleRemove = useCallback((runId: number) => {
    const entry = session.find((item) => item.runId === runId);
    if (entry) logDiagnostic(runId, 'reading_discarded', { previousCardId: entry.candidate.card.id, source: 'user' });
    reviewsRef.current.delete(runId);
    setSession((current) => current.filter((entry) => entry.runId !== runId));
  }, [session, logDiagnostic]);

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
    const activeDiagnostic = diagnosticRef.current;
    const diagnosticReading = activeDiagnostic?.readings.find((item) => item.runId === runId);
    const trackedDiagnostic = activeDiagnostic && !activeDiagnostic.finalized ? activeDiagnostic : null;
    if (trackedDiagnostic) { beginDiagnosticOperation(trackedDiagnostic); publishDiagnostic(); }
    setMatchPending(true);
    try {
      const existing = session.find((entry) => entry.runId === runId)?.candidate;
      const prices = existing?.card.id === match.card.id ? existing.prices ?? []
        : await getCardPrices(match.card.id, AbortSignal.timeout(5000)).then((response) => response.prices).catch(() => []);
      setSession((current) => current.map((entry) => entry.runId === runId ? { ...entry, identityReviewed: true, selectionSource: 'visual', candidate: {
        card: match.card, score: Math.max(0, Math.min(1, match.similarity)), rawScore: match.similarity,
        price: prices[0] ?? (existing?.card.id === match.card.id ? existing.price : null), prices,
      } } : entry));
      setReviewOpen(false);
      setOrganizeReview(null);
      if (activeDiagnostic && diagnosticRef.current === activeDiagnostic && diagnosticReading && !activeDiagnostic.finalized) {
        confirmDiagnosticIdentity(activeDiagnostic, diagnosticReading.id,
          { id: match.card.id, name: match.card.name, setId: match.card.setId, setName: match.card.set?.name ?? null, number: match.card.number },
          'model', match.retrievalRank);
        publishDiagnostic();
      }
      toast.success('Actualizamos la carta de esta lectura.');
    } finally {
      if (trackedDiagnostic && !trackedDiagnostic.finalized) {
        endDiagnosticOperation(trackedDiagnostic);
        if (diagnosticRef.current === trackedDiagnostic) publishDiagnostic();
      }
      setMatchPending(false);
    }
  };

  const progress = null;
  const headline = PHASE_HEADLINE[phase];
  const showShell = !showCamera;
  const reviewActions = captureReview && !detected && stage !== 'processing'
    ? <>
      {captureReview.source === 'camera' ? <CaptureQualityNotice quality={captureReview.quality} /> : null}
      <CaptureReviewActions review={captureReview} open={reviewOpen} onOpenChange={setReviewOpen} />
    </> : null;
  return <>
    {showShell ? <>
      <ScreenHeader title="Escanear" back={{ href: '/buscar', label: 'buscar' }} />
      <ScreenContainer className="flex flex-col gap-4">
        {stage === 'idle' ? <>
          <DiagnosticPanel session={diagnosticView} onChange={changeDiagnostic} />
          {!isAuthLoading && !isAuthenticated ? <Alert tone="info" title="Iniciá sesión para reconocer cartas">Podés explorar el catálogo sin cuenta. Para usar el escáner, entrá a tu cuenta primero.</Alert> : null}
          <IdlePanel visualCamera showCamera={mobileCamera} cameraAvailable={cameraAvailable}
            sessionCount={session.length} onScan={openCamera}
            onPickFromGallery={() => { if (isAuthLoading) return; if (!isAuthenticated) { router.push('/login?next=escanear'); return; } fileInputRef.current?.click(); }}
            onManualSearch={goManualSearch} onOrganize={() => openOrganize('idle')} />
          {detected && captureReview?.runId === detected.runId ? <VisualScanResult entry={detected} onReview={() => setReviewOpen(true)} /> : null}
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
            <p className="text-caption text-tertiary">{formatCount(session.length)} {session.length === 1 ? 'lectura pendiente' : 'lecturas pendientes'} de guardar en una colección.</p>
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
        {persistenceNotice ? <Alert tone="warning" title="Revisá el borrador de esta pestaña">{persistenceNotice}</Alert> : null}
        {captureMode === 'gallery' && stage !== 'processing' ? <CaptureQualityNotice quality={captureReview?.quality} /> : null}
        {reviewActions}
      </ScreenContainer>
    </> : null}
    {showCamera ? <CameraView autoVisual reviewOpen={reviewOpen || exitPending} onReview={captureReview?.runId === detected?.runId ? () => setReviewOpen(true) : undefined}
      diagnosticStatus={diagnosticView ? { label: `${diagnosticView.finalized ? 'Diagnóstico cerrado' : diagnosticView.pendingOperations ? `Diagnóstico · ${diagnosticView.pendingOperations} tarea(s) pendiente(s)` : diagnosticView.suspended ? 'Diagnóstico pausado por límite' : 'Diagnóstico activo'} · ${diagnosticView.readings.length} lecturas · Ver opciones`, onOpen: () => setStage('idle') } : null}
      autoCapturePaused={reviewOpen || matchPending || exitPending} reviewActions={reviewActions} liveResult={errorMessage} busy={stage === 'processing'} detected={detected}
      headline={headline} detail={PHASE_DETAIL[phase]} progress={progress} previewUrl={previewUrl}
      sessionCount={session.length} onCapture={handleCapture} onError={handleCameraError}
      onClose={() => { if (session.length > 0) setExitPending(true); else { abortRef.current?.abort(); runIdRef.current += 1; setStage('idle'); } }}
      onOrganize={() => openOrganize('camera')} /> : null}
    {(() => {
      const review = organizeReview ?? captureReview;
      const entry = session.find((item) => item.runId === review?.runId);
      return review && entry ? <ScanMatchSheet
        key={`${review.runId}-${entry.candidate.card.id}`} review={review} candidate={entry.candidate}
        open={Boolean(organizeReview) || reviewOpen} pending={matchPending}
        onOpenChange={(open) => { if (!matchPending) { setReviewOpen(open); if (!open) setOrganizeReview(null); } }}
        onSelect={(match) => { const d = diagnosticRef.current; const r = d?.readings.find((item) => item.runId === review.runId); if (d && r && !d.finalized && match.card.id !== r.provisional?.id) { selectDiagnosticAlternative(d, r.id, match.card.id); publishDiagnostic(); } }}
        onOpened={() => logDiagnostic(review.runId, 'comparison_opened', { previousCardId: entry.candidate.card.id, source: 'user' })}
        onConfirm={(match) => void confirmMatch(match)} onManualSearch={() => { logDiagnostic(review.runId, 'manual_search_opened', { previousCardId: entry.candidate.card.id, source: 'manual' }); setReviewOpen(false); setOrganizeReview(null); setManualReviewRunId(review.runId); openOrganize('idle'); }} /> : null;
    })()}
    <OrganizeSheet open={stage === 'organizing' && !organizeReview} entries={session} manualReviewRunId={manualReviewRunId} onClose={() => { setManualReviewRunId(null); setStage(organizeReturn); }}
      onSaved={handleSaved} onRemove={handleRemove}
      onManualSearchOpen={(runId) => {
        const reading = diagnosticRef.current?.readings.find((item) => item.runId === runId);
        logDiagnostic(runId, 'manual_search_opened', { previousCardId: reading?.final?.id ?? reading?.initial?.id ?? null, source: 'manual' });
      }}
      onCorrect={(runId, card) => {
        const d = diagnosticRef.current; const reading = d?.readings.find((item) => item.runId === runId);
        if (d && reading && !d.finalized) {
          const rank = diagnosticRankForIdentity(reading, card.id);
          appendDiagnosticEvent(d, reading.id, 'manual_result_confirmed', { previousCardId: reading.final?.id ?? reading.initial?.id ?? null, newCardId: card.id, source: 'manual', rank });
          confirmDiagnosticIdentity(d, reading.id, { id: card.id, name: card.name, setId: card.setId, setName: card.set?.name ?? null, number: card.number }, 'manual');
          publishDiagnostic();
        }
        void getCardPrices(card.id, AbortSignal.timeout(5000)).then((response) => response.prices).catch(() => []).then((prices) => {
          setSession((current) => current.map((entry) => entry.runId === runId ? { ...entry, identityReviewed: true, selectionSource: 'manual', candidate: { ...entry.candidate, card, score: 0, rawScore: 0, prices, price: prices[0] ?? null } } : entry));
        });
        setManualReviewRunId(null);
      }}
      onReview={(runId) => {
        const review = reviewsRef.current.get(runId);
        if (review) setOrganizeReview(review);
        else { setManualReviewRunId(runId); toast.info('La foto ya no está disponible. Podés buscar la carta para corregir esta lectura.'); }
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
