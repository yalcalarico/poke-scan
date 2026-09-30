'use client';

/**
 * API pública de `components/scanner/`.
 *
 * Lo que exporta `app/(app)/escanear/page.tsx` es re-exportable desde acá para
 * que otra pantalla no tenga que conocer los archivos internos: hoy la usan
 * `CameraView`, `PriceChip`, `DetectedCardBar`, `ScanResults`, `OrganizeSheet` e
 * `IdlePanel`; mañana la puede usar `/ajustes` (re-escanear una carta) o un
 * `Sheet` de resultados en otra pantalla.
 *
 * `lib/scanner/` queda importable solo desde acá: todo lo que toca canvas o
 * tesseract es cliente, y este es el borde.
 */

export { ActionBar, type ActionBarProps } from './action-bar';
export {
  CameraControls,
  NO_CAMERA_CAPABILITIES,
  type CameraCapabilities,
  type CameraControlsProps,
} from './camera-controls';
export { CameraView, type CameraViewProps, type CaptureSource } from './camera-view';
export { CardFrame, type CardFrameProps } from './card-frame';
export { CardThumb, type CardThumbProps } from './card-thumb';
export {
  CandidatePriceTable,
  DetectedCardBar,
  referencePrice,
  type CandidatePriceTableProps,
  type DetectedCardBarProps,
} from './detected-bar';
export { CandidateCard, type CandidateCardProps } from './candidate-card';
export {
  CAMERA_NOTICE_COPY,
  cameraErrorCopy,
  cameraNoticeCopy,
  formatCount,
  PHASE_DETAIL,
  PHASE_HEADLINE,
  type CameraNoticeKind,
} from './copy';
export { captureToImageData, fileToImageData } from './image-input';
export { IdlePanel, type IdlePanelProps } from './idle-panel';
export { MatchedText, type MatchedTextProps } from './matched-text';
export { OrganizeSheet, type OrganizeSheetProps } from './organize-sheet';
export { PriceChip, type PriceChipProps } from './price-chip';
export { ScanPreview, type ScanPreviewProps } from './scan-preview';
export { ScanResults, type ScanResultsProps } from './scan-results';
export {
  CONFIDENT_SCORE,
  frameToneFor,
  isCameraStage,
  isSheetStage,
  type FrameTone,
  type ScanPhase,
  type ScanStage,
  type SessionEntry,
} from './types';

/**
 * La sesión de escaneo persistida. Vive acá y no en `lib/api/` porque no habla
 * con el backend: es estado del navegador con su propio ciclo de vida, y su
 * hermano `token-storage.ts` está en `lib/api/` solo porque acompaña a `apiFetch`.
 *
 * `readSession` es segura de llamar desde el server (devuelve `[]`), así que un
 * Server Component puede preguntar "¿hay algo guardado?" sin romper el render.
 *
 * No hay `countSession()`: el conteo sale de `readSession().length` para que el
 * número y la lista que dibuja el `OrganizeSheet` no puedan divergir. Ver el
 * comentario en `session-storage.ts`.
 */
export {
  appendSessionEntry,
  clearSession,
  MAX_SESSION_ENTRIES,
  normalizeSession,
  readSession,
  writeSession,
} from './session-storage';
