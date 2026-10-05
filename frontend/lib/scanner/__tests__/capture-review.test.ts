// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { captureReviewFile, type CaptureReview } from '../capture-review';

const review: CaptureReview = {
  image: 'data:image/jpeg;base64,AAH+/w==', source: 'camera',
  capturedAt: '2026-10-04T12:34:56.789Z', runId: 7, result: null, error: 'Sin respuesta',
};
function read(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
it('descarga los bytes exactos y el formato original sin recodificar la imagen', async () => {
  const file = captureReviewFile(review, 'image');
  expect(file.blob.type).toBe('image/jpeg');
  expect(await read(file.blob)).toBe(review.image);
  expect(file.filename).toMatch(/-7\.jpg$/);
});
it('el diagnóstico enlaza el mismo archivo y no inventa un ID correcto ni duplica la foto', async () => {
  const file = captureReviewFile(review, 'diagnostic');
  const contents = await read(file.blob);
  const data = JSON.parse(atob(contents.split(',')[1]));
  expect(data.imageFile).toBe(captureReviewFile(review, 'image').filename);
  expect(data.expectedCardId).toBeNull();
  expect(data.source).toBe('camera');
  expect(data.error).toBe('Sin respuesta');
  expect(data).not.toHaveProperty('image');
});
