import { describe, expect, it } from 'vitest';

import { ApiError } from '../api/api-client';
import { toUserFacingMessage } from '../api/user-message';

/**
 * El bug que motiva el módulo: con el servidor caído, `fetch` tira un
 * `TypeError` y el `ErrorState` recibía el mensaje crudo del browser. En
 * WebKit eso es "Load failed" y en Chromium "Failed to fetch", o sea que la
 * misma app mostraba dos textos distintos y ninguno en español.
 */
describe('toUserFacingMessage', () => {
  it('muestra el mensaje del backend cuando hay uno', () => {
    expect(toUserFacingMessage(new ApiError(404, 'Colección no encontrada: x'))).toBe(
      'Colección no encontrada: x',
    );
  });

  it('traduce el error de red a un mensaje propio', () => {
    // Los dos textos de la especificación, más los que se ven en la práctica.
    for (const raw of ['Load failed', 'Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Network request failed']) {
      expect(toUserFacingMessage(new TypeError(raw))).toBe('El servidor no respondió.');
    }
  });

  it('no muestra nada ante un error que no es de red ni de API', () => {
    // Una excepción de un bug no es información para el usuario, y mostrarla
    // filtra detalles internos.
    expect(toUserFacingMessage(new Error('Cannot read properties of undefined'))).toBeNull();
    expect(toUserFacingMessage(new RangeError('Maximum call stack'))).toBeNull();
    expect(toUserFacingMessage('algo')).toBeNull();
    expect(toUserFacingMessage(undefined)).toBeNull();
  });

  it('no confunde un TypeError de código con uno de red', () => {
    // Un TypeError por bug también dice "algo no es un objeto"; si no se
    // discrimina por el mensaje, se muestra una traza en inglés al usuario.
    expect(toUserFacingMessage(new TypeError('x is not a function'))).toBeNull();
  });

  it('no muestra un mensaje de API vacío', () => {
    expect(toUserFacingMessage(new ApiError(500, ''))).toBeNull();
  });
});
