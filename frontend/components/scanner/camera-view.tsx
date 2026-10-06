'use client';

import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/cn';
import {
  captureFrame,
  fitCardFrame,
  frameMargin,
  getCameraErrorKind,
  mapFrameToSourcePixels,
  startCamera,
  stopCamera,
  type BoxRect,
} from '@/lib/scanner/camera';
import type { CameraError, ScannedCapture } from '@/lib/scanner/types';
import { AutoVisualGate, frameSignature, hasAlignedCard } from '@/lib/scanner/auto-visual';

import { ActionBar, type ActionBarProps } from './action-bar';
import { CardFrame } from './card-frame';
import { CameraControls, NO_CAMERA_CAPABILITIES, type CameraCapabilities } from './camera-controls';
import { DetectedCardBar } from './detected-bar';
import { HAPTIC, haptic } from './haptics';
import { frameToneFor, type SessionEntry } from './types';

/**
 * 2,5 s entre capturas automáticas.
 *
 * Es el freno de `docs/redesign-2026.md` §7 punto 4 y la defensa de fondo del
 * rate limit: cada captura termina en un `identifyVisual`, y ese POST puede
 * terminar pegándole a pokemontcg.io (1.000/día, 30/min). Con el modo continuo
 * sin este tope, una carta quieta en el cuadro generaría un request cada
 * ~1 s mientras el reconocimiento visual de la vuelta.
 *
 * A esto se le suma el `busy` de la pantalla: mientras hay un escaneo en vuelo
 * el obturador está apagado, así que nunca hay dos `identify` en paralelo. El
 * shutter manual **no** espera este intervalo: si el usuario apretó, esperar
 * es de él, no nuestro.
 */
const CONTINUOUS_INTERVAL_MS = 2500;

/** Quién apretó: el usuario o el modo continuo. La pantalla frena al segundo, no al primero. */
export type CaptureSource = 'manual' | 'auto';

export interface CameraViewProps {
  hideControls?: boolean;
  autoVisual?: boolean;
  liveResult?: string | null;
  /** Hay un escaneo en vuelo: el obturador se apaga pero la cámara sigue viva. */
  busy: boolean;
  /** Última lectura de la sesión. `null` si todavía no leímos nada. */
  detected: SessionEntry | null;
  /** Frase corta de la fase, para la barra de progreso. */
  headline: string;
  /** Detalle de la fase, una línea más abajo. */
  detail: string;
  /** 0..1 del reconocimiento visual en curso, o `null` si no hay nada corriendo. */
  progress: number | null;
  /** Miniatura de la foto cuando el escaneo vino de la galería y no hay cámara. */
  previewUrl: string | null;
  sessionCount: number;
  onCapture: (capture: ScannedCapture, source: CaptureSource) => void;
  onError: (kind: CameraError, detail?: string) => void;
  onClose: () => void;
  onPickFromGallery: () => void;
  onDiscard: () => void;
  onOrganize: () => void;
  reviewActions?: ReactNode;
  autoCapturePaused?: boolean;
  reviewOpen?: boolean;
  onReview?: () => void;
}

/** `torch` no está en `MediaTrackConstraintSet` del lib.dom: es una extensión. */
interface TorchCapabilities {
  torch?: boolean;
}

function readTorch(track: MediaStreamTrack | undefined): boolean {
  if (!track || typeof track.getCapabilities !== 'function') return false;
  // `ImageCapture` es el otro requisito: sin él, varios navegadores aceptan
  // `torch` en `applyConstraints` y no hacen nada con el flag.
  if (typeof ImageCapture === 'undefined') return false;

  const capabilities: unknown = track.getCapabilities();
  if (typeof capabilities !== 'object' || capabilities === null) return false;

  const { torch } = capabilities as TorchCapabilities;
  return torch === true;
}

async function applyTorch(track: MediaStreamTrack, on: boolean): Promise<boolean> {
  const request: unknown = { advanced: [{ torch: on }] };
  await track.applyConstraints(request as MediaTrackConstraints);
  // Se releen los settings en vez de asumir que el flag se aplicó: algunos
  // navegadores lo aceptan y lo ignoran.
  return track.getSettings().torch === true;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo leer la foto capturada.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * La pantalla de cámara: `fixed inset-0 z-media` con su propio chrome.
 *
 * ─── Por qué `z-media` y no un `z-[nnn]` ───
 *
 * La escala de §6 es `base 0 → sticky 40 → nav 50 → overlay 60 → sheet 70 →
 * media 90 → offline 100`. `z-media` (90) es lo que arregla un bug histórico:
 * la cámara era `z-40` y la `BottomNav` `z-50`, así que en browser —donde la
 * nav está siempre visible— el obturador y el marco quedaban **debajo** de la
 * barra de navegación. Con 90 el scanner va por encima de la nav sin tocar la
 * nav.
 *
 * ─── Por qué la cámara se desmonta cuando hay un `Sheet` ───
 *
 * El `Sheet` se monta en `z-overlay`/`z-sheet` (60/70) sobre `document.body`,
 * o sea **debajo** de `z-media` (90). Un `Sheet` abierto desde adentro del
 * scanner quedaría detrás de la foto, que es peor que no tenerlo.
 *
 * En vez de inventar un `z-[110]`, la pantalla se desmonta: con un sheet
 * abierto no hay cámara en el DOM, y al cerrarse la cámara vuelve a pedir
 * `getUserMedia` (sin prompt: el permiso ya está) en ~300 ms. Los dos
 * efectos colaterales son **buenos**: se libera la cámara mientras el usuario
 * organiza —se apaga el indicador del sistema— y al volver lo espera una foto
 * mejor encuadrada.
 *
 * ─── El bucle de cámara no habla con la red ───
 *
 * `onCapture` se dispara **una vez por captura** y lo consume la pantalla, que
 * recién ahí corre el reconocimiento visual y recién ahí llama a `identifyVisual`. El
 * `setInterval` del modo continuo no pide nada: saca un JPEG del `<video>`.
 * En este archivo no hay un fetch, y no puede aparecer uno sin tocarlo — el
 * precio se resuelve en `price-chip.tsx`, que tampoco lo tiene.
 */
export function CameraView({
  hideControls = true,
  autoVisual = false,
  liveResult = null,
  busy,
  detected,
  headline,
  detail,
  progress,
  previewUrl,
  sessionCount,
  onCapture,
  onError,
  onClose,
  onPickFromGallery,
  onDiscard,
  onOrganize,
  reviewActions,
  autoCapturePaused = false,
  reviewOpen = false,
  onReview,
}: CameraViewProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handlersRef = useRef({ onCapture, onError, onClose });
  /** Sube en cada pasada del efecto; un cleanup viejo no toca un stream nuevo. */
  const generationRef = useRef(0);
  /** Cerrojo de captura en vuelo: dos `grab()` nunca leen el mismo frame. */
  const grabbingRef = useRef(false);

  const [isStarting, setIsStarting] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [continuous, setContinuous] = useState(false);
  const [visualReady, setVisualReady] = useState(false);
  const visualGateRef = useRef(new AutoVisualGate());
  const [torchOn, setTorchOn] = useState(false);
  const [capabilities, setCapabilities] = useState<CameraCapabilities>(NO_CAMERA_CAPABILITIES);
  /**
   * Rectángulo guía en píxeles CSS, relativo a la caja del video. Se calcula en
   * JS (no con un `max-h` fijo) para que ocupe todo el espacio posible: en un
   * monitor el tope fijo obligaba a alejar la carta y se perdía nitidez.
   */
  const [frameRect, setFrameRect] = useState<BoxRect | null>(null);

  useEffect(() => {
    handlersRef.current = { onCapture, onError, onClose };
  });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const measure = () => {
      const { width, height } = stage.getBoundingClientRect();
      setFrameRect(fitCardFrame(width, height, frameMargin(width, height)));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    window.addEventListener('orientationchange', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('orientationchange', measure);
    };
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    const root = viewportRef.current;
    if (!root) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Safari cambia el área visible al mostrar sus barras o al volver del teclado.
    const fitViewport = () => {
      root.style.height = `${viewport?.height ?? window.innerHeight}px`;
      root.style.width = `${viewport?.width ?? window.innerWidth}px`;
      root.style.top = `${viewport?.offsetTop ?? 0}px`;
      root.style.left = `${viewport?.offsetLeft ?? 0}px`;
    };
    fitViewport();
    viewport?.addEventListener('resize', fitViewport);
    viewport?.addEventListener('scroll', fitViewport);
    window.addEventListener('resize', fitViewport);
    return () => {
      document.body.style.overflow = previousOverflow;
      viewport?.removeEventListener('resize', fitViewport);
      viewport?.removeEventListener('scroll', fitViewport);
      window.removeEventListener('resize', fitViewport);
    };
  }, []);

  // El efecto depende solo del montaje: si algún callback cambiara de identidad
  // (cada render de la pantalla) no queremos arrancar la cámara de nuevo.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // React 19 en desarrollo monta el efecto dos veces (StrictMode): el
    // cleanup de la primera pasada corre DESPUÉS de que la segunda ya resolvió
    // `getUserMedia`. Sin este token ese cleanup viejo hacía
    // `video.srcObject = null` sobre el stream nuevo y abortaba el `play()`
    // en vuelo — cámara encendida, video negro (docs/gotchas.md #1).
    const generation = ++generationRef.current;

    let disposed = false;
    let stream: MediaStream | null = null;

    setIsStarting(true);
    setIsLive(false);
    setCapabilities(NO_CAMERA_CAPABILITIES);
    setTorchOn(false);

    startCamera(video)
      .then((started) => {
        if (disposed || generation !== generationRef.current) {
          stopCamera(started);
          return;
        }
        stream = started;
        streamRef.current = started;
        setCapabilities({
          torch: readTorch(started.getVideoTracks()[0]),
          audio: started.getAudioTracks().length > 0,
          accessory: 'none',
        });
        setIsStarting(false);
      })
      .catch((err: unknown) => {
        if (disposed || generation !== generationRef.current) return;
        setIsStarting(false);
        handlersRef.current.onError(getCameraErrorKind(err), (err as Error)?.message);
      });

    // `pagehide` cubre bfcache/navegación: sin esto el indicador de "cámara
    // encendida" del sistema queda prendido.
    const handlePageHide = () => stopCamera(stream);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      disposed = true;
      if (generationRef.current === generation) generationRef.current += 1;
      window.removeEventListener('pagehide', handlePageHide);
      stopCamera(stream);
      // Solo se suelta el `srcObject` si sigue siendo el de ESTA pasada: un
      // cleanup tardío no puede pisar el stream de la pasada siguiente.
      if (streamRef.current === stream || streamRef.current === null) {
        streamRef.current = null;
        if (video.srcObject === stream) video.srcObject = null;
      }
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleReady = () => setIsLive(true);
    video.addEventListener('loadeddata', handleReady);
    return () => video.removeEventListener('loadeddata', handleReady);
  }, []);

  /** Lee el frame actual del `<video>`, recortado al rectángulo guía. */
  const grab = useCallback(
    async (source: CaptureSource) => {
      const video = videoRef.current;
      if (!video || grabbingRef.current) return;

      grabbingRef.current = true;
      const generation = generationRef.current;
      setIsCapturing(true);

      /*
       * El obturador vibra **solo cuando el usuario apretó**, y va acá —después
       * del cerrojo de `grabbingRef` y no en el `onClick` del `ActionBar`— por
       * dos razones concretas:
       *
       * - `grab` es el único lugar donde la captura es real. Si el video no
       *   está, o si ya hay una lectura en vuelo, el `onClick` igual suena y
       *   vibrar sin fotografiar es mentira.
       * - El modo continuo entra por el mismo `grab` con `source: 'auto'` y
       *   dispara cada 2,5 s. Vibrar ahí sería el anti-patrón escrito: quince
       *   pulsaciones por minuto de la sesión entera.
       */
      if (source === 'manual') haptic(HAPTIC.shutter);

      try {
        // Solo el rectángulo del marco guía: el resto de la imagen es fondo, y
        // para el reconocimiento visual es ruido que degrada la lectura del nombre. Se usa el
        // MISMO rectángulo que se dibuja en pantalla, así guía y recorte no
        // pueden desincronizarse.
        const videoBox = video.getBoundingClientRect();
        const crop = frameRect
          ? mapFrameToSourcePixels(
              frameRect,
              { width: videoBox.width, height: videoBox.height },
              { width: video.videoWidth, height: video.videoHeight },
            )
          : null;

        const capture = await captureFrame(video, { crop });
        capture.dataUrl = await blobToDataUrl(capture.blob);
        if (generation !== generationRef.current) return;
        handlersRef.current.onCapture(capture, source);
      } catch (err) {
        handlersRef.current.onError(getCameraErrorKind(err), (err as Error)?.message);
      } finally {
        grabbingRef.current = false;
        setIsCapturing(false);
      }
    },
    [frameRect],
  );

  // El temporizador del modo continuo lee `grab` por ref: si lo tuviera en las
  // deps, cada cambio de `frameRect` (cada `ResizeObserver`) rearma el
  // intervalo y en modo continuo se shootearía en ráfaga.
  const grabRef = useRef(grab);
  useEffect(() => {
    grabRef.current = grab;
  });

  useEffect(() => {
    if (autoVisual || !continuous || !isLive || busy) return;
    const timer = setInterval(() => void grabRef.current('auto'), CONTINUOUS_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [autoVisual, busy, continuous, isLive]);

  useEffect(() => {
    if (!autoVisual || !isLive || !frameRect) return;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    const timer = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || grabbingRef.current) return;
      const box = video.getBoundingClientRect();
      const sample = {
        x: frameRect.x - frameRect.width * 0.1,
        y: frameRect.y - frameRect.height * 0.1,
        width: frameRect.width * 1.2,
        height: frameRect.height * 1.2,
      };
      const crop = mapFrameToSourcePixels(sample,
        { width: box.width, height: box.height },
        { width: video.videoWidth, height: video.videoHeight });
      if (!crop) return;
      canvas.width = 240;
      canvas.height = Math.round(240 * crop.height / crop.width);
      try {
        context.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const state = visualGateRef.current.observe(frameSignature(image), hasAlignedCard(image), busy || autoCapturePaused, performance.now());
        setVisualReady(state.ready);
        if (state.capture) void grabRef.current('auto');
      } catch {
        // Un frame todavía no disponible no cierra la cámara ni dispara red.
        setVisualReady(false);
      }
    }, 350);
    return () => clearInterval(timer);
  }, [autoVisual, autoCapturePaused, busy, frameRect, isLive]);

  const handleToggleContinuous = useCallback(() => {
    setContinuous((current) => !current);
  }, []);

  const handleToggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !capabilities.torch) return;
    try {
      // Sin estado optimista: si `applyConstraints` falla, un ícono encendido
      // sería mentira, y no hay forma de saber que la cámara no prendió.
      setTorchOn(await applyTorch(track, !track.getSettings().torch));
    } catch {
      // Un flash que no se puede prender no es un error de la pantalla: el
      // control queda como estaba y la foto sale igual.
    }
  }, [capabilities.torch]);

  const handleToggleAudio = useCallback(() => {
    // Hoy el stream se abre con `audio: false`, así que este camino no llega
    // y el botón no se renderiza (`capabilities.audio === false`). Queda para
    // que abrir el stream con audio sea un cambio de una línea acá y otra en
    // `lib/scanner/camera.ts`, sin tocar el chrome.
  }, []);

  const captureDisabled = !isLive || isStarting || isCapturing || busy || autoCapturePaused;

  const status: ActionBarProps['status'] = isStarting
    ? 'Abriendo la cámara…'
    : busy
      ? autoVisual ? 'Reconociendo la carta…' : 'La cámara sigue encendida: enderezá la carta si querés.'
      : isCapturing
        ? 'Capturando…'
        : autoVisual
          ? visualReady ? 'Captura lista. Retirá la carta para leer otra.' : 'Encuadrá la carta y mantenela quieta: la leemos automáticamente.'
        : continuous
          ? 'Escaneo continuo: no muevas la carta.'
          : 'Encuadrá la carta dentro del marco.';

  return (
    <div ref={viewportRef} className={cn("fixed left-0 top-0 flex h-dvh w-full flex-col overflow-hidden bg-canvas", reviewOpen ? "z-base" : "z-media")}>
      <div ref={stageRef} className="relative min-h-0 flex-1 overflow-hidden bg-on-media">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          aria-label="Vista de la cámara"
          className="absolute inset-0 h-full w-full object-cover"
        />

        {/*
          El velo baja la foto para que el marco y el chip se lean encima. Es
          `bg-on-media` al 40 % y no el token entero (0,72): con el token
          completo la foto deja de ser reconocible y el usuario no puede
          encuadrar. Los dos son el mismo token.
        */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-on-media/40" />

        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <CardFrame rect={frameRect} tone={autoVisual ? visualReady ? 'positive' : 'searching' : frameToneFor(detected?.candidate.score)} />
        </div>

        <div className="pointer-events-none absolute left-4 top-[calc(env(safe-area-inset-top)+1rem)]">
          {/*
            Los 16 px del `left-4` / `top-[...]` son el clearance del foco: el
            outline del botón de cerrar se dibuja 4 px por fuera de la caja, y
            este botón vive adentro del `stage`, que es `overflow-hidden`. Con
            `left-4` el borde externo del outline queda a 12 px del borde de la
            pantalla, o sea 4 px más de los que necesita y ninguno se recorta.
            Es el mismo motivo por el que el `CameraControls` va en `right-4` y no
            en `right-0`: los dos controls de las esquinas comparten la misma
            regla.
          */}
          <div className="pointer-events-auto">
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar la cámara"
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-full',
                'bg-on-media text-on-media-text shadow-lg backdrop-blur-md',
                'transition-colors duration-fast ease-standard hover:bg-on-media-text/20',
                // Mismo motivo que en `action-bar.tsx`: sobre la foto el token
                // de foco es `--on-media-text`, no `--focus-ring`.
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-media-text',
              )}
            >
              <X aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-5 w-5" />
            </button>
          </div>

          {/*
            ⛔ Sin red, nunca. `usd` sale de la fila `price` de la respuesta de
            `identifyVisual`; si no hay precio no se renderiza nada. Antes de
            tocar esto, leé el JSDoc de `price-chip.tsx`: la restricción es el
            rate limit de pokemontcg.io, no una preferencia.
          */}

        </div>

        <div className="pointer-events-none absolute inset-x-16 top-[calc(env(safe-area-inset-top)+1rem)] flex min-h-11 items-center justify-center rounded-panel bg-on-media px-3 py-2 text-center text-on-media-text backdrop-blur-md">
          <p className="truncate text-body-strong">{detected?.candidate.card.set?.name ?? detected?.candidate.card.setId ?? 'Encuadrá una carta'}</p>
        </div>

        {!hideControls ? <CameraControls
          showContinuous={!autoVisual}
          capabilities={capabilities}
          torchOn={torchOn}
          onToggleTorch={handleToggleTorch}
          continuous={continuous}
          onToggleContinuous={handleToggleContinuous}
          audioOn
          onToggleAudio={handleToggleAudio}
          className="absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)]"
        /> : null}

        {detected || reviewActions || (autoVisual && liveResult) ? <div className="absolute inset-x-4 bottom-4 flex max-h-[60%] flex-col gap-2 overflow-y-auto py-1">
          {detected ? <button type="button" onClick={onReview} disabled={!onReview}
            aria-label={`Revisar coincidencia de ${detected.candidate.card.name}`}
            className="w-full rounded-panel text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-media-text">
            <DetectedCardBar candidate={detected.candidate} />
          </button> : null}
          {autoVisual && liveResult ? <div role="status" className="rounded-panel bg-on-media p-3 text-on-media-text">{liveResult}</div> : null}
          {reviewActions}
        </div> : null}
      </div>

      <ActionBar
        progress={busy ? progress : null}
        headline={headline}
        detail={detail}
        previewUrl={previewUrl}
        sessionCount={sessionCount}
        canCapture={!captureDisabled}
        isCapturing={isCapturing}
        onPickFromGallery={onPickFromGallery}
        onDiscard={onDiscard}
        onCapture={() => void grab('manual')}
        onOrganize={onOrganize}
        status={status}
      />
    </div>
  );
}
