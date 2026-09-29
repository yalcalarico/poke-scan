import { ApiError } from '@/lib/api/api-client';

/**
 * Convierte un error de red en un mensaje que se pueda mostrar, o `null` si no
 * hay nada que mostrar.
 *
 * El caso que motiva esto: cuando el servidor no está, `fetch` tira un
 * `TypeError` cuyo mensaje es el del browser — "Load failed" en WebKit,
 * "Failed to fetch" en Chromium. Eso se estaba pasando tal cual al `ErrorState`,
 * y el usuario veía tres líneas: el título en español, el error del browser en
 * inglés, y la guía en español. Traducir el mensaje del browser no resuelve
 * nada: no dice qué pasó ni qué hacer, y cambia según el navegador.
 *
 * Hay tres casos y solo uno muestra algo:
 * - `ApiError` con mensaje del backend: se muestra. El backend ya responde en
 *   español y el mensaje es del dominio ("Colección no encontrada"), que es
 *   justo lo que el usuario necesita leer.
 * - Error de red (el servidor no responde): se cambia por un mensaje propio, en
 *   español y accionable. El `ErrorState` ya tiene la guía de qué hacer, así
 *   que alcanza con nombrarlo.
 * - Cualquier otra cosa: `null`. Una excepción de un bug no es información para
 *   el usuario, y mostrarla filtra detalles internos. El error se loguea en el
 *   server, que es donde sirve para depurar.
 */
export function toUserFacingMessage(error: unknown): string | null {
  if (error instanceof ApiError) {
    return error.message.length > 0 ? error.message : null;
  }

  if (isNetworkError(error)) {
    return 'El servidor no respondió.';
  }

  return null;
}

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;

  /**
   * `fetch` rechaza con un `TypeError` y el mensaje depende del browser. Los
   * dos textos de la especificación y los que se ven en la práctica, en
   * minúsculas y con el `Failed to fetch` de Chromium.
   */
  const message = error.message.toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('load failed') ||
    message.includes('networkerror') ||
    message.includes('network request failed')
  );
}
