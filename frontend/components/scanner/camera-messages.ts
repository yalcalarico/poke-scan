import type { CameraError } from '@/lib/scanner/types';

export interface CameraErrorCopy {
  title: string;
  hint: string;
}

export const CAMERA_ERROR_COPY: Record<CameraError, CameraErrorCopy> = {
  'permission-denied': {
    title: 'Necesitamos permiso de cámara',
    hint: 'Habilitalo desde el candado de la barra de direcciones (o desde Ajustes → Permisos del sitio) y volvé a intentar. En iPhone también podés hacerlo desde Configuración → Cámara → Safari.',
  },
  'no-camera': {
    title: 'No encontramos cámara',
    hint: 'Este dispositivo no tiene cámara disponible, o la cámara que pedís no está conectada. Probá subiendo una foto de la carta.',
  },
  'insecure-context': {
    title: 'La cámara requiere HTTPS',
    hint: 'Los navegadores solo dan acceso a la cámara en conexiones seguras. En localhost funciona sin HTTPS; en producción hay que servir la app por https://.',
  },
  'camera-busy': {
    title: 'La cámara está ocupada',
    hint: 'Otra app o pestaña la está usando. Cerrá videollamadas (Zoom, Meet, Teams) y otras pestañas con la cámara activa, y reintentá.',
  },
  unknown: {
    title: 'No pudimos abrir la cámara',
    hint: 'Puede ser que otra app la esté usando. Cerrá otras pestañas con la cámara activa y reintentá.',
  },
};

export function cameraErrorCopy(kind: CameraError): CameraErrorCopy {
  return CAMERA_ERROR_COPY[kind];
}
