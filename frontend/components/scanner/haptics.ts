/**
 * Vibración háptica, en un solo lugar.
 *
 * ─── Por qué centralizada y no `navigator.vibrate(...)` en cada sitio ───
 *
 * Por tres razones, y las tres son de las que no se ven en el diff:
 *
 * 1. **La API no existe casi en ningún lado.** En iOS Safari no está
 *    implementada —ninguna versión, ni instalada la PWA—; en desktop la tiene
 *    Firefox y casi nadie más. Un `navigator.vibrate(12)` escrito suelto en un
 *    handler es un `TypeError` en la mayoría de los dispositivos donde corre esta
 *    app, y un `TypeError` en un `onClick` se come el resto del handler. Acá el
 *    `typeof` es una guarda explícita y el resto de la app no tiene que acordarse
 *    de ella.
 *
 * 2. **"Menos movimiento" es una preferencia del sistema, no un detalle de la
 *    pantalla.** `globals.css` ya anula transiciones y animaciones para
 *    `prefers-reduced-motion: reduce` (§5.3), y `catalog-search.tsx` lo consulta
 *    para decidir el `behavior` del `scrollIntoView`. Una vibración es movimiento
 *    también: si alguien pidió menos movimiento en el sistema y la app le
 *    vibra el obturador, se le está ignorando la preferencia en el único canal
 *    donde el usuario no la puede apagar. La consulta va acá y no en cada call
 *    site por lo mismo.
 *
 * 3. **El presupuesto de vibraciones es de la app, no de cada componente.**
 *    La regla de la referencia de diseño es explícita: vibrar en cada toque es el
 *    anti-patrón. Si cada handler decide, la primera someone's idea de "un toque
 *    corto" se convierte en quince pulsaciones por pantalla y la
 *    retroalimentación deja de significar algo. Centralizado, el conjunto de
 *    lugares que vibran es legible de un vistazo: hoy son dos.
 *
 * Sin JSX y sin estado: lo importa un componente cliente y no necesita su propio
 * `'use client'`. Es lógica pura, como `components/share/copy-to-clipboard.ts`,
 * y se puede testear sin renderizar nada.
 */

/**
 * `VibrationPattern` del DOM: un número son milisegundos de vibración; un
 * arreglo alterna vibración y pausa, empezando por vibrar.
 */
export type HapticPattern = number | readonly number[];

/**
 * Vibra, o no hace nada.
 *
 * Nunca tira y nunca devuelve un booleano: el resultado no le interesa a
 * ninguno de los call sites —si no vibró, la app está igual de bien— y devolverlo
 * invita a escribir ramificaciones que no arreglan nada.
 */
export function haptic(pattern: HapticPattern): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;

  // `matchMedia` se consulta en cada llamada y no se cachea a propósito: la
  // preferencia se puede cambiar con la app abierta y el listener que la
  // cachearía costaría más de lo que ahorra (son dos llamadas por captura).
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  try {
    // Se copia el arreglo en vez de castearlo: `VibrationPattern` del DOM pide
    // `number[]` mutable y el token de los patrones es `readonly`, así que la
    // copia es lo que evita el `as` —y de paso no le deja a la API del navegador
    // una referencia a algo nuestro.
    navigator.vibrate(typeof pattern === 'number' ? pattern : [...pattern]);
  } catch {
    // Algunos navegadores con el permiso de\notificación denegado Lanza
    // `NotAllowedError` desde `vibrate`. Un gesto que no pudo vibrar no es un
    // error de la pantalla: la foto sale igual.
  }
}

/**
 * Los dos patrones de la app, con nombre.
 *
 * Nombrarlos acá y no en los call sites es la mitad del valor de este archivo:
 * `haptic(HAPTIC.shutter)` dice qué está pasando, y si mañana el obturador cambia
 * de duración solo se cambia en un lugar.
 */
export const HAPTIC = {
  /**
   * Obturador: un tick seco de 11 ms.
   *
   * Va cuando la captura se dispara de verdad y no en el `onClick` del botón, a
   * propósito: si el video no está o ya hay una lectura en vuelo, el click
   * suena igual y vibrar sin fotografiar es mentira. 11 ms es el umbral en el
   * que un teléfono Android lo siente como "click" y no como "notificación"; por
   * debajo de ~8 ms no se registra y por arriba de ~20 ms empieza a molestar en
   * un uso repetido, que es exactamente lo que hace el escaneo continuo.
   */
  shutter: 11,
  /**
   * Confirmación de una lectura: dos pulsos separados.
   *
   * Tiene que ser **distinguible** del del obturador, porque los dos están a
   * menos de un segundo de distancia en el uso normal: uno es "te escuché" y el
   * otro es "terminé y salió algo". Un segundo pulso corto, 70 ms de pausa y
   * otro de 26 ms, es la forma más corta que el patrón se lee como dos tiempos
   * y no como uno largo.
   */
  confirmed: [18, 70, 26],
} as const satisfies Record<string, HapticPattern>;
