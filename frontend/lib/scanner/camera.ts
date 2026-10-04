import { CameraErrorException, type CameraError, type ScannedCapture } from './types';

export const DEFAULT_CAPTURE_WIDTH = 1200;
export const JPEG_QUALITY = 0.92;

const IDEAL_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: { ideal: 'environment' },
  width: { ideal: 1920 },
  height: { ideal: 1080 },
};

export function isCameraSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

/**
 * `getUserMedia` is only exposed in secure contexts. localhost/127.0.0.1 count as
 * secure, so plain `next dev` works over http.
 */
export function isSecureContextForCamera(): boolean {
  if (typeof window === 'undefined') return false;
  return window.isSecureContext === true;
}

function errorName(err: unknown): string {
  if (err instanceof DOMException && err.name) return err.name;
  if (err && typeof err === 'object' && 'name' in err) {
    const { name } = err as { name?: unknown };
    if (typeof name === 'string') return name;
  }
  return '';
}

export function getCameraErrorKind(err: unknown): CameraError {
  if (err instanceof CameraErrorException) return err.kind;

  switch (errorName(err)) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'permission-denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'no-camera';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'camera-busy';
    default:
      return 'unknown';
  }
}

function assertCameraUsable(): void {
  if (!isSecureContextForCamera()) {
    throw new CameraErrorException(
      'insecure-context',
      'La cámara requiere un contexto seguro (https o localhost).',
    );
  }
  if (!isCameraSupported()) {
    throw new CameraErrorException(
      'no-camera',
      'Este navegador no expone getUserMedia.',
    );
  }
}

const VIDEO_READY_TIMEOUT_MS = 8000;

/**
 * Espera a que el <video> tenga dimensiones reales.
 *
 * `play()` puede rechazar con `AbortError: interrupted by a new load request`
 * cuando el elemento todavía no cargó metadata — pasa siempre en desarrollo,
 * donde React 19 (StrictMode) monta el efecto dos veces y el cleanup de la
 * primera pasada pisa el `srcObject` de la segunda mientras el `play()` de la
 * primera sigue en vuelo. Reintentar cuando ya hay frames resuelve el caso sin
 * pedirle permiso al usuario ni mostrar un error falso.
 */
function waitForVideoFrames(video: HTMLVideoElement, timeoutMs = VIDEO_READY_TIMEOUT_MS): Promise<boolean> {
  if (video.videoWidth > 0 && video.videoHeight > 0) return Promise.resolve(true);

  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('resize', onReady);
      resolve(ok);
    };
    const onReady = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) finish(true);
    };
    const timer = setTimeout(() => finish(video.videoWidth > 0), timeoutMs);
    video.addEventListener('loadeddata', onReady);
    video.addEventListener('resize', onReady);
  });
}

export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  assertCameraUsable();

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: IDEAL_CONSTRAINTS,
      audio: false,
    });
  } catch (err) {
    throw new CameraErrorException(getCameraErrorKind(err), (err as Error)?.message);
  }

  video.srcObject = stream;
  video.setAttribute('playsinline', 'true');
  video.muted = true;

  try {
    await video.play();
  } catch (err) {
    // Un AbortError acá no significa que la cámara falle: significa que el
    // elemento estaba recargando. Si el video ya tiene frames, seguimos.
    const hasFrames = await waitForVideoFrames(video);
    if (!hasFrames) {
      stopCamera(stream);
      video.srcObject = null;
      throw new CameraErrorException(getCameraErrorKind(err), (err as Error)?.message);
    }
    if (video.paused) {
      try {
        await video.play();
      } catch {
        // Último recurso: si ya hay frames, un play() que falla no impide
        // capturar con `captureFrame`, que lee del frame actual.
      }
    }
  }

  return stream;
}

export function stopCamera(stream: MediaStream | null): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // already stopped
    }
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        // Safari/private mode can return null: fall back to a data URL.
        try {
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
          resolve(new Blob([bytes], { type: 'image/jpeg' }));
        } catch (err) {
          reject(err);
        }
      },
      'image/jpeg',
      quality,
    );
  });
}

/** Rectángulo en píxeles CSS, relativo a un elemento. */
export interface BoxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Proporción de una carta Pokémon: 63 × 88 mm. */
export const CARD_ASPECT = 63 / 88;

/**
 * Margen que se deja alrededor del marco, en píxeles.
 *
 * Es porcentual respecto de la pantalla: en un teléfono alcanza con un margen
 * chico, mientras que en un monitor grande un margen fijo (o directamente none)
 * haría que el marco quede pegado al borde y no se entienda dónde termina.
 */
export function frameMargin(containerWidth: number, containerHeight: number): number {
  const smaller = Math.min(containerWidth, containerHeight);
  if (smaller <= 0) return 0;
  return Math.round(Math.min(56, Math.max(10, smaller * 0.045)));
}

/**
 * Mayor rectángulo con proporción de carta que entra en el contenedor.
 *
 * Se calcula en JS y no con CSS (`h-[68%] max-h-[520px]`) porque el tope fijo
 * en px recortaba el marco en monitores: el usuario tenía que alejar la carta
 * tanto que perdía nitidez y el reconocimiento visual no la leía.
 */
export function fitCardFrame(
  containerWidth: number,
  containerHeight: number,
  margin: number,
  aspect: number = CARD_ASPECT,
): BoxRect | null {
  if (containerWidth <= 0 || containerHeight <= 0) return null;

  // En el celular dejamos espacio para encuadrar sin acercar la lente hasta
  // perder foco. La misma geometría se usa al capturar, no sólo en la guía.
  const mobileScale = Math.min(containerWidth, containerHeight) <= 600 ? 0.72 : 1;
  const availableWidth = (containerWidth - margin * 2) * mobileScale;
  const availableHeight = (containerHeight - margin * 2) * mobileScale;
  if (availableWidth <= 0 || availableHeight <= 0) return null;

  let height = availableHeight;
  let width = height * aspect;
  if (width > availableWidth) {
    width = availableWidth;
    height = width / aspect;
  }

  width = Math.floor(width);
  height = Math.floor(height);
  if (width < 16 || height < 16) return null;

  // Centrado dentro del contenedor.
  return {
    x: Math.round((containerWidth - width) / 2),
    y: Math.round((containerHeight - height) / 2),
    width,
    height,
  };
}

/**
 * Traduce el rectángulo del marco guía (medido en el elemento `<video>`) a
 * píxeles de la imagen original de la cámara.
 *
 * El video se muestra con `object-cover`, o sea que la imagen se escala para
 * cubrir la caja y se recorta por el centro. Sin compensar ese escalado, un
 * recorteTomado de la pantalla saldría corrido.
 */
export function mapFrameToSourcePixels(
  frame: BoxRect,
  videoCssSize: { width: number; height: number },
  videoIntrinsic: { width: number; height: number },
): BoxRect | null {
  const { width: vw, height: vh } = videoIntrinsic;
  const { width: cw, height: ch } = videoCssSize;
  if (vw <= 0 || vh <= 0 || cw <= 0 || ch <= 0) return null;
  if (frame.width <= 0 || frame.height <= 0) return null;

  // object-cover: escala = max(cw/vw, ch/vh), contenido centrado.
  const scale = Math.max(cw / vw, ch / vh);
  const renderedW = vw * scale;
  const renderedH = vh * scale;
  const offsetX = (cw - renderedW) / 2;
  const offsetY = (ch - renderedH) / 2;

  const sourceX = (frame.x - offsetX) / scale;
  const sourceY = (frame.y - offsetY) / scale;
  const sourceW = frame.width / scale;
  const sourceH = frame.height / scale;

  // Recorte a los límites reales de la imagen.
  const left = Math.max(0, Math.min(vw, sourceX));
  const top = Math.max(0, Math.min(vh, sourceY));
  const right = Math.max(0, Math.min(vw, sourceX + sourceW));
  const bottom = Math.max(0, Math.min(vh, sourceY + sourceH));

  const width = Math.round(right - left);
  const height = Math.round(bottom - top);
  if (width < 16 || height < 16) return null;

  return { x: Math.round(left), y: Math.round(top), width, height };
}

/**
 * Grabs the current video frame into a JPEG, downscaled to `maxWidth` so we do
 * not feed multi-megapixel frames to the reconocimiento visual worker.
 *
 * `opts.crop` recorta a una región (en píxeles de la imagen original) antes de
 * escalar. El escáner lo usa para quedarse solo con el rectángulo de la carta:
 * el fondo de la mesa, la mesa y el resto de la habitación son ruido puro para
 * el reconocimiento visual y lo único que hacen es degradar la lectura del nombre.
 */
export async function captureFrame(
  video: HTMLVideoElement,
  opts: { maxWidth?: number; crop?: BoxRect | null } = {},
): Promise<ScannedCapture> {
  const maxWidth = opts.maxWidth ?? DEFAULT_CAPTURE_WIDTH;
  const sourceWidth = video.videoWidth || video.clientWidth;
  const sourceHeight = video.videoHeight || video.clientHeight;

  if (!sourceWidth || !sourceHeight) {
    throw new CameraErrorException('unknown', 'El video todavía no tiene dimensiones.');
  }

  const crop = normalizeCrop(opts.crop, sourceWidth, sourceHeight);
  const regionW = crop ? crop.width : sourceWidth;
  const regionH = crop ? crop.height : sourceHeight;

  const scale = Math.min(1, maxWidth / regionW);
  const width = Math.max(1, Math.round(regionW * scale));
  const height = Math.max(1, Math.round(regionH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new CameraErrorException('unknown', 'No se pudo crear el contexto 2D.');
  }

  if (crop) {
    ctx.drawImage(
      video,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      width,
      height,
    );
  } else {
    ctx.drawImage(video, 0, 0, width, height);
  }

  const blob = await canvasToBlob(canvas, JPEG_QUALITY);

  return { blob, width, height, cropped: Boolean(crop) };
}

function normalizeCrop(
  crop: BoxRect | null | undefined,
  sourceWidth: number,
  sourceHeight: number,
): BoxRect | null {
  if (!crop) return null;
  const x = Math.max(0, Math.min(sourceWidth - 1, Math.round(crop.x)));
  const y = Math.max(0, Math.min(sourceHeight - 1, Math.round(crop.y)));
  const width = Math.round(crop.width);
  const height = Math.round(crop.height);
  if (width < 16 || height < 16) return null;
  return {
    x,
    y,
    width: Math.min(width, sourceWidth - x),
    height: Math.min(height, sourceHeight - y),
  };
}

export async function listCameras(): Promise<MediaDeviceInfo[]> {
  if (!isCameraSupported()) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === 'videoinput');
}
