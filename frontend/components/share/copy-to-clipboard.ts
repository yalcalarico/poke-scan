/**
 * Copia al portapapeles con el fallback que hace falta en mobile.
 *
 * `navigator.clipboard` **no existe** fuera de un contexto seguro: en
 * `http://192.168.0.12:3000` —o sea, la PWA probada desde el teléfono en la wifi
 * de casa, que es como se prueba una app de cámara— `window.isSecureContext` es
 * `false`, la API no está definida y un `await navigator.clipboard.writeText(...)`
 * revienta con un `TypeError` antes de poder atraparlo. El `execCommand` es feo y
 * está deprecado, pero es **lo único que funciona** en ese caso, y por eso se
 * conserva.
 *
 * Lógica pura, sin React: se puede testear y la usan tanto el perfil como la
 * landing pública.
 */

/** `document.execCommand` no existe en el tipo de TS, y no queremos `any`. */
function legacyCopy(text: string): boolean {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    // Fuera de la vista pero enfocable: sin `position: fixed` el iOS scrollea
    // hasta el textarea y deja la página saltando.
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

/**
 * `true` si se copió, `false` si hay que pedirle al usuario que lo haga a mano.
 * Nunca tira: el fallo del portapapeles no es un error de la pantalla.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permiso denegado, o contexto no seguro con la API presente: al fallback.
    return legacyCopy(text);
  }
  return legacyCopy(text);
}
