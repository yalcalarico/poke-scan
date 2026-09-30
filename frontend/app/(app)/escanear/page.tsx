'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { ScreenContainer } from '@/components/layout/screen-container';
import { ScreenHeader } from '@/components/layout/screen-header';
import {
  CameraView,
  IdlePanel,
  MAX_SESSION_ENTRIES,
  OrganizeSheet,
  PHASE_DETAIL,
  PHASE_HEADLINE,
  ScanResults,
  ScanPreview,
  appendSessionEntry,
  cameraNoticeCopy,
  captureToImageData,
  clearSession,
  fileToImageData,
  formatCount,
  isCameraStage,
  readSession,
  writeSession,
  type CameraNoticeKind,
  type CaptureSource,
  type ScanPhase,
  type ScanStage,
  type SessionEntry,
} from '@/components/scanner';
import { Alert, Button, Progress, Surface, useToast } from '@/components/ui';
import { ApiError, IDENTIFY_LIMIT, identifyCard } from '@/lib/api';
import {
  DEFAULT_CAPTURE_WIDTH,
  isCameraSupported,
  isSecureContextForCamera,
} from '@/lib/scanner/camera';
import { OcrUnavailableError } from '@/lib/scanner/ocr';
import type { ImageInput } from '@/lib/scanner/preprocess';
import { SCAN_PASS_COUNT, SCAN_PASS_LABELS, scanCardImage } from '@/lib/scanner/pipeline';
import type { CameraError, ParsedScan, ScannedCapture } from '@/lib/scanner/types';
import type { IdentifiedCandidateDto, IdentifyResponseDto } from '@/types/api';

/**
 * ─── La máquina de estados ───
 *
 * ```
 * idle ──"Escanear carta"──> camera ──obturador──> processing ──identify──> results
 *   ▲                          ▲                        │                    │
 *   │ "cerrar" / error cámara  │                        │ error              │ "Seguir escaneando"
 *   │                          ▼                        ▼                    ▼
 *   └──────────────────────  idle  <────────────────  error                camera
 *                                                                            │
 *                                            "Organizar (N)" ──> organizing ┘
 * ```
 *
 * `camera` y `processing` son el mismo lugar físico: **la cámara sigue viva
 * mientras corre el OCR** y lo único que cambia es que el obturador se apaga.
 * `results` y `organizing` son los dos `Sheet`, y en ninguno hay cámara montada
 * (por qué, en el JSDoc de `CameraView`).
 *
 * ─── El rate limit no aparece en este archivo ───
 *
 * `identifyCard` es el único request de esta pantalla y se dispara **una vez
 * por captura**, nunca por frame de cámara. El chip de precio flotante no pide
 * nada: lee la fila `price` de la respuesta que ya llegó. El tope de 2,5 s
 * entre requests automáticos es la única defensa extra, y vive acá porque acá
 * es donde se distingue una captura del usuario de una de la máquina.
 */

/** Freno de seguridad: si el OCR se cuelga, la app no se queda trabada. */
const SCAN_TIMEOUT_MS = 90_000;
const IDENTIFY_TIMEOUT_MS = 30_000;

/**
 * Tope local entre requests a `/cards/identify` disparados **solos**
 * (`docs/redesign-2026.md` §7 punto 4). El obturador manual no lo espera: si el
 * usuario apretó, esperar es decisión de él.
 */
const AUTO_IDENTIFY_INTERVAL_MS = 2500;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

function ocrPhaseFor(status: string): ScanPhase {
  return status === 'recognizing text' ? 'recognizing' : 'ocr-boot';
}

interface BrowserEnv {
  supported: boolean;
  secure: boolean;
}

/**
 * La capacidad de la cámara solo existe en el navegador. `useSyncExternalStore`
 * con server snapshot `null` da el valor real después de hidratar sin provocar
 * un hydration mismatch.
 */
let cachedEnv: BrowserEnv | null = null;

function getBrowserEnv(): BrowserEnv {
  cachedEnv ??= {
    supported: isCameraSupported(),
    secure: isSecureContextForCamera(),
  };
  return cachedEnv;
}

function subscribeToEnv(): () => void {
  return () => {};
}

interface Notice {
  kind: CameraNoticeKind;
  detail: string | null;
}

export default function ScanPage() {
  const router = useRouter();
  const toast = useToast();

  const [stage, setStage] = useState<ScanStage>('idle');
  const env = useSyncExternalStore(subscribeToEnv, getBrowserEnv, () => null);
  const [cameraNotice, setCameraNotice] = useState<Notice | null>(null);
  const [errorTitle, setErrorTitle] = useState('No pudimos leer la carta');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [phase, setPhase] = useState<ScanPhase>('preparing');
  const [stepProgress, setStepProgress] = useState(0);
  const [attemptsDone, setAttemptsDone] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<IdentifyResponseDto | null>(null);
  const [nameGuess, setNameGuess] = useState<string | null>(null);
  /**
   * La sesión de escaneo.
   *
   * Empieza con lo que haya en `sessionStorage` **leído en un efecto**, no en el
   * `useState` inicial: `sessionStorage` no existe en el server, así que leerlo en
   * el inicializador daría una hydration mismatch (el HTML del server no tendría
   * las 7 cartas y el primer render del cliente sí) —y con `React 19` eso es un
   * error, no un warning.
   *
   * El efecto que la restaura corre en una microtask por el patrón de
   * `docs/gotchas.md` §9: un `setState` sincrónico en el cuerpo del efecto es un
   * render en cascada, y con el doble montaje de `StrictMode` el `writeSession`
   * del efecto de guardado se dispararía **antes** de que la restauración
   * termine y pisaría lo guardado con el array vacío. Esa es la razón concreta de
   * que los dos efectos estén ordenados así.
   */
  const [session, setSession] = useState<SessionEntry[]>([]);
  /**
   * `true` cuando el primer render ya leyó el storage. Antes de eso el guardado
   * está **desactivado**, por la misma razón del punto anterior: sin este flag,
   * el primer efecto que corre escribe `[]` y borra la sesión del usuario antes
   * de haberla leído.
   */
  const [isSessionRestored, setIsSessionRestored] = useState(false);

  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => {
      if (disposed) return;
      const stored = readSession();
      if (stored.length > 0) setSession(stored);
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

  /**
   * De dónde salió la lectura en curso. `processing` es un estado compartido
   * por la cámara y por la galería, y sin esto un "subir una foto" desde la
   * pantalla de reposo abriría la cámara para procesar una foto que ya está en
   * memoria.
   */
  const [captureMode, setCaptureMode] = useState<'camera' | 'gallery'>('camera');
  /** A dónde volver al cerrar `Organizar (N)`: la cámara o la pantalla. */
  const [organizeReturn, setOrganizeReturn] = useState<'camera' | 'idle'>('idle');

  const fileInputRef = useRef<HTMLInputElement>(null);
  /**
   * Contador de corrida: distingue "esta es la lectura vigente" de "esta la
   * canceló otra". Es lo que impide que la respuesta de una foto lenta pise el
   * estado de la siguiente (docs/gotchas.md #9).
   */
  const runIdRef = useRef(0);
  const objectUrlRef = useRef<string | null>(null);
  const lastAutoIdentifyRef = useRef(0);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const cameraAvailable = env ? env.supported && env.secure : true;
  const detected = session.length > 0 ? session[session.length - 1] : null;
  /** La cámara solo se monta si la lectura viene de ella. */
  const showCamera = isCameraStage(stage) && captureMode === 'camera';
  /** Destino de "volver" desde los sheets. */
  const backTo = cameraAvailable && captureMode === 'camera' ? 'camera' : 'idle';

  const sessionCardIds = useMemo(
    () => new Set(session.map((entry) => entry.candidate.card.id)),
    [session],
  );

  const goManualSearch = useCallback(
    (name?: string | null) => {
      const query = (name ?? '').trim();
      router.push(`/buscar${query ? `?q=${encodeURIComponent(query)}` : ''}`);
    },
    [router],
  );

  const runIdentify = useCallback(async (parsed: ParsedScan, runId: number) => {
    setPhase('searching');
    try {
      const data = await withTimeout(
        identifyCard({
          lines: parsed.lines.slice(0, 60),
          name: parsed.nameGuess ?? undefined,
          number: parsed.numberGuess ?? undefined,
          setHint: parsed.setHint ?? undefined,
          // Siempre `undefined` por ahora: el backend ya lo acepta, pero sin
          // banda medida no hay de dónde sacarlo. Ver `ParsedScan.setCode`.
          setCode: parsed.setCode ?? undefined,
          limit: IDENTIFY_LIMIT,
        }),
        IDENTIFY_TIMEOUT_MS,
        'La búsqueda tardó demasiado. Probá de nuevo o buscá a mano.',
      );
      if (runIdRef.current !== runId) return;

      setResult(data);
      setPhase('preparing');

      const best = data.candidates?.[0] ?? null;
      if (!best) {
        // Sin candidatas no hay nada que organizar: el `Sheet` lo cuenta con el
        // criterio repetido, que es el estado vacío de §10.2.
        setStage('results');
        return;
      }

      // Una entrada por captura. Si el usuario elige otro candidato después,
      // esta misma entrada se reemplaza en vez de sumar una nueva.
      //
      // El recorte al tope va adentro del setter (`appendSessionEntry`) y no
      // después: el estado en memoria tiene que respetar el mismo máximo que lo
      // que se persiste, o la UI anunciaría 30 cartas y mostraría 47 hasta que
      // el usuario recargara la página.
      setSession((current) => appendSessionEntry(current, { runId, candidate: best }));
      setStage('results');
    } catch (err) {
      if (runIdRef.current !== runId) return;
      setPhase('preparing');
      setErrorTitle('Falló la búsqueda');
      setErrorMessage(
        err instanceof ApiError
          ? `No pudimos consultar el catálogo: ${err.message}`
          : err instanceof Error
            ? err.message
            : 'No pudimos consultar el catálogo.',
      );
      setStage('error');
    }
  }, []);

  const runScan = useCallback(
    async (load: () => Promise<ImageInput>) => {
      const runId = runIdRef.current + 1;
      runIdRef.current = runId;

      setStage('processing');
      setPhase('preparing');
      setStepProgress(0);
      setAttemptsDone(0);
      setErrorMessage(null);
      setResult(null);
      setNameGuess(null);

      let source: ImageInput;
      try {
        source = await load();
      } catch (err) {
        setErrorTitle('No pudimos abrir la foto');
        setErrorMessage(
          err instanceof Error ? err.message : 'No pudimos abrir la imagen de la carta.',
        );
        setStage('error');
        return;
      }

      if (runIdRef.current !== runId) return;

      try {
        const scanned = await withTimeout(
          scanCardImage(source, {
            captureRun: `run-${runId}`,
            logger: (status, progress) => {
              if (runIdRef.current !== runId) return;
              setPhase(ocrPhaseFor(status));
              if (status === 'recognizing text') setStepProgress(progress);
            },
            onAttempt: () => {
              if (runIdRef.current !== runId) return;
              setAttemptsDone((done) => done + 1);
            },
          }),
          SCAN_TIMEOUT_MS,
          'El OCR tardó demasiado. Probá con una foto más nítida o con más luz.',
        );
        if (runIdRef.current !== runId) return;

        if (!scanned || scanned.lines.length === 0) {
          setErrorTitle('No pudimos leer la carta');
          setErrorMessage(
            'No pudimos leer texto en la foto. Probá con más luz, sin reflejos y con la carta llenando el marco.',
          );
          setStage('error');
          return;
        }

        setNameGuess(scanned.parsed.nameGuess ?? null);
        await runIdentify(scanned.parsed, runId);
      } catch (err) {
        if (runIdRef.current !== runId) return;
        setPhase('preparing');
        if (err instanceof OcrUnavailableError) {
          setErrorTitle('No pudimos iniciar el motor de lectura');
          setErrorMessage(cameraNoticeCopy('ocr-unavailable').hint);
        } else {
          setErrorTitle('No pudimos leer la carta');
          setErrorMessage(
            err instanceof Error ? err.message : 'No pudimos procesar la carta con el OCR.',
          );
        }
        setStage('error');
      }
    },
    [runIdentify],
  );

  const handleCapture = useCallback(
    (capture: ScannedCapture, source: CaptureSource) => {
      // El freno de 2,5 s es **solo** para el modo continuo. Una captura del
      // usuario no espera: si apretó el obturador, hacerlo esperar se siente
      // como que la app se lag.
      if (source === 'auto') {
        const now = Date.now();
        if (now - lastAutoIdentifyRef.current < AUTO_IDENTIFY_INTERVAL_MS) return;
        lastAutoIdentifyRef.current = now;
      } else {
        lastAutoIdentifyRef.current = Date.now();
      }

      setPreviewUrl(capture.dataUrl ?? null);
      void runScan(() => captureToImageData(capture));
    },
    [runScan],
  );

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;
      setPreviewUrl(url);
      setCaptureMode('gallery');
      void runScan(() => fileToImageData(file, DEFAULT_CAPTURE_WIDTH));
    },
    [runScan],
  );

  const openCamera = useCallback(() => {
    setCameraNotice(null);
    setErrorMessage(null);
    setCaptureMode('camera');
    setStage('camera');
  }, []);

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

  const handleChoose = useCallback(
    (candidate: IdentifiedCandidateDto) => {
      setSession((current) => {
        if (current.length === 0) return current;
        const last = current[current.length - 1];
        return [...current.slice(0, -1), { runId: last.runId, candidate }];
      });
      setStage(backTo);
    },
    [backTo],
  );

  const openOrganize = useCallback(
    (from: 'camera' | 'idle') => {
      setOrganizeReturn(from);
      setStage('organizing');
    },
    [],
  );

  const variantLabel = SCAN_PASS_LABELS[Math.min(attemptsDone, SCAN_PASS_LABELS.length - 1)] ?? '';

  /**
   * El progreso global: las 9 pasadas de `lib/scanner/pipeline` más la búsqueda.
   * Es la misma cuenta de siempre, pero en una barra inline en vez de una card
   * modal.
   */
  const progress = useMemo(() => {
    if (stage !== 'processing') return null;
    if (phase === 'searching') return 0.97;
    const variantFraction = SCAN_PASS_COUNT > 0 ? attemptsDone / SCAN_PASS_COUNT : 0;
    const within = phase === 'recognizing' ? Math.min(1, Math.max(0, stepProgress)) : 0;
    return Math.min(0.95, variantFraction + within / Math.max(1, SCAN_PASS_COUNT));
  }, [attemptsDone, phase, stage, stepProgress]);

  const headline =
    phase === 'recognizing' && variantLabel
      ? `${PHASE_HEADLINE[phase]} · ${variantLabel}`
      : PHASE_HEADLINE[phase];

  const showShell = !showCamera;

  return (
    <>
      {/*
        El chrome del shell solo existe fuera de la cámara. `ScreenHeader` es
        por pantalla, así que en `camera`/`processing` no se renderiza; la
        `BottomNav` vive en el layout y la tapa `z-media` (90) sin que nadie
        tenga que esconderla ni ella tenga que saber que el scanner existe.
      */}
      {showShell ? (
        <>
          <ScreenHeader title="Escanear" back={{ href: `/buscar`, label: 'buscar' }} />

          <ScreenContainer className="flex flex-col gap-4">
            {stage === 'idle' ? (
              <>
                <IdlePanel
                  cameraAvailable={cameraAvailable}
                  sessionCount={session.length}
                  onScan={openCamera}
                  onPickFromGallery={() => fileInputRef.current?.click()}
                  onManualSearch={() => goManualSearch(nameGuess)}
                  onOrganize={() => openOrganize('idle')}
                />

                {cameraNotice ? (
                  <Alert
                    tone="error"
                    title={cameraNoticeCopy(cameraNotice.kind).title}
                  >
                    <p>{cameraNoticeCopy(cameraNotice.kind).hint}</p>
                    {cameraNotice.detail ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-caption">Detalle técnico</summary>
                        <p className="mt-1 font-mono text-caption break-words">
                          {cameraNotice.detail}
                        </p>
                      </details>
                    ) : null}
                  </Alert>
                ) : null}

                {env && !env.supported ? (
                  <Alert tone="warning" title={cameraNoticeCopy('unsupported').title}>
                    <p>{cameraNoticeCopy('unsupported').hint}</p>
                  </Alert>
                ) : null}

                {env && env.supported && !env.secure ? (
                  <Alert tone="warning" title={cameraNoticeCopy('insecure-context').title}>
                    <p>{cameraNoticeCopy('insecure-context').hint}</p>
                  </Alert>
                ) : null}
              </>
            ) : null}

            {/*
              La lectura desde la galería no tiene cámara detrás, así que el
              progreso va acá. Es el mismo dato que muestra la barra inline del
              scanner, con la diferencia de que esta se parece a la forma real
              del resultado: la foto primero, la fase después.
            */}
            {stage === 'processing' ? (
              <Surface className="flex flex-col items-center gap-4 rounded-panel px-4 py-8">
                <ScanPreview url={previewUrl} className="h-40 w-32" />

                <div
                  role="status"
                  aria-live="polite"
                  className="flex w-full max-w-sm flex-col gap-2"
                >
                  <p className="text-body-strong text-primary">{headline}</p>
                  <Progress
                    value={Math.round((progress ?? 0) * 100)}
                    label="Progreso de la lectura de la carta"
                  />
                  <p className="text-caption text-secondary">{PHASE_DETAIL[phase]}</p>
                </div>
              </Surface>
            ) : null}

            {stage === 'error' ? (
              <>
                <Alert tone="error" title={errorTitle}>
                  <p>{errorMessage}</p>
                </Alert>

                <div className="flex flex-col gap-2 sm:flex-row">
                  {/*
                    El reintento ofrece **lo mismo que falló**: si la lectura
                    salió de la cámara, se vuelve a la cámara; si salió de un
                    archivo, se vuelve a pedir el archivo. Ofrecer siempre la
                    cámara sería mandarlo a una app que en ese dispositivo no
                    puede abrirla.
                  */}
                  {cameraAvailable && captureMode === 'camera' ? (
                    <Button variant="primary" size="lg" onClick={openCamera} className="flex-1">
                      Volver a escanear
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1"
                    >
                      Subir una foto
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={() => goManualSearch(nameGuess)}
                    className="flex-1"
                  >
                    Buscar a mano
                  </Button>
                </div>
              </>
            ) : null}

            {stage === 'idle' && session.length > 0 ? (
              <div className="flex flex-col gap-1">
                {/*
                  El texto sigue diciendo "en esta sesión" y no "guardadas",
                  porque `sessionStorage` **no** sobrevive a cerrar el browser:
                  sobrevive a cerrar la PWA y a un refresh, que es el caso que
                  importa. Decir "guardadas" sería una promesa de meses.
                */}
                <p className="text-caption text-tertiary">
                  {formatCount(session.length)}{' '}
                  {session.length === 1 ? 'carta leída' : 'cartas leídas'} en esta sesión.
                </p>
                {session.length >= MAX_SESSION_ENTRIES ? (
                  <p className="text-caption text-tertiary">
                    Guardamos hasta {formatCount(MAX_SESSION_ENTRIES)} cartas. Agregá estas y
                    seguí escaneando.
                  </p>
                ) : null}
                <div>
                  <Button variant="ghost" size="md" onClick={handleDiscardAll} fullWidth>
                    Descartar la sesión
                  </Button>
                </div>
              </div>
            ) : null}
          </ScreenContainer>
        </>
      ) : null}

      {showCamera ? (
        <CameraView
          busy={stage === 'processing'}
          detected={detected}
          headline={headline}
          detail={PHASE_DETAIL[phase]}
          progress={progress}
          previewUrl={previewUrl}
          sessionCount={session.length}
          onCapture={handleCapture}
          onError={handleCameraError}
          onClose={() => setStage('idle')}
          onPickFromGallery={() => fileInputRef.current?.click()}
          onDiscard={discardLast}
          onOrganize={() => openOrganize('camera')}
        />
      ) : null}

      {/*
        Los dos `Sheet` se montan siempre y se abren por `stage`: cada uno tiene
        su propio estado de salida de 160 ms (§5.1) y ninguno necesita que la
        pantalla le fabricque un estado transitorio.
      */}
      <ScanResults
        open={stage === 'results'}
        data={result}
        localNameGuess={nameGuess}
        sessionCardIds={sessionCardIds}
        onClose={() => setStage(backTo)}
        onChoose={handleChoose}
        onManualSearch={goManualSearch}
      />

      <OrganizeSheet
        open={stage === 'organizing'}
        entries={session}
        onClose={() => setStage(organizeReturn)}
        onSaved={handleSaved}
        onRemove={handleRemove}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label="Elegir una foto de la carta"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          handleFile(file);
        }}
      />
    </>
  );
}
