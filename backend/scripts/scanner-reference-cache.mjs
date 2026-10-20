import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import sharp from 'sharp';

const MAX_BYTES = 10 * 1024 * 1024;
async function removeTemporary(path) {
  try {
    await unlink(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function validateImage(bytes) {
  if (!bytes.length || bytes.length > MAX_BYTES)
    throw new Error('Referencia vacía o demasiado grande.');
  // Metadata sola puede aceptar un archivo truncado. Decodificar antes de
  // publicar evita que un HTTP 200 inválido envenene los próximos reintentos.
  try {
    await sharp(bytes, { limitInputPixels: 16_000_000, failOn: 'warning' })
      .raw()
      .toBuffer();
  } catch (error) {
    throw new Error(
      'Referencia inválida: no pudimos decodificar la imagen completa (máximo 16 megapíxeles).',
      { cause: error },
    );
  }
}

/** Se llama bajo index.lock; los archivos de caché válidos se conservan. */
export async function loadReferenceImage(
  imagePath,
  url,
  { fetchImpl = fetch, signal = AbortSignal.timeout(30000) } = {},
) {
  const temporaryPath = imagePath + '.tmp';
  await removeTemporary(temporaryPath);
  try {
    const bytes = await readFile(imagePath);
    try {
      await validateImage(bytes);
      return { bytes, cached: true };
    } catch {
      await unlink(imagePath);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    const response = await fetchImpl(url, { signal, redirect: 'error' });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`HTTP ${response.status}`);
    }
    if (!response.body) throw new Error('Referencia sin contenido.');
    const reader = response.body.getReader();
    // No depender sólo del abort del transporte: una lectura de cuerpo puede
    // seguir pendiente aun después de emitirse la señal de timeout.
    const cancelled = () => {
      void reader.cancel(signal.reason).catch(() => {});
    };
    signal.addEventListener('abort', cancelled, { once: true });
    if (signal.aborted) cancelled();
    const chunks = [];
    let size = 0;
    try {
      const declared = Number(response.headers.get('content-length'));
      if (declared > MAX_BYTES) throw new Error('Referencia demasiado grande.');
      while (true) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        signal.throwIfAborted();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) throw new Error('Referencia demasiado grande.');
        chunks.push(value);
      }
    } catch (error) {
      void reader.cancel(error).catch(() => {});
      throw error;
    } finally {
      signal.removeEventListener('abort', cancelled);
      reader.releaseLock();
    }
    const bytes = Buffer.concat(chunks, size);
    await validateImage(bytes);
    signal.throwIfAborted();
    await writeFile(temporaryPath, bytes);
    await rename(temporaryPath, imagePath);
    return { bytes, cached: false };
  } finally {
    await removeTemporary(temporaryPath);
  }
}
