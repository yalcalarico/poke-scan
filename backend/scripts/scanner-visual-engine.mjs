import sharp from 'sharp';
import { Tensor } from 'onnxruntime-node';
export async function embedding(session, image) {
  // El preprocesado oficial redimensiona el lado corto a 256 y centra un recorte de 224.
  const { width, height } = await sharp(image).rotate().metadata();
  if (!width || !height) throw new Error('Imagen sin dimensiones.');
  const scale = 256 / Math.min(width, height);
  const w = Math.round(width * scale),
    h = Math.round(height * scale);
  const pixels = await sharp(image)
    .rotate()
    .resize(w, h, { kernel: 'cubic' })
    .extract({
      left: Math.floor((w - 224) / 2),
      top: Math.floor((h - 224) / 2),
      width: 224,
      height: 224,
    })
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer();
  const data = new Float32Array(3 * 224 * 224);
  const mean = [0.485, 0.456, 0.406],
    std = [0.229, 0.224, 0.225];
  for (let channel = 0; channel < 3; channel++) {
    for (let i = 0; i < 224 * 224; i++)
      data[channel * 224 * 224 + i] =
        (pixels[i * 3 + channel] / 255 - mean[channel]) / std[channel];
  }
  const output = await session.run({
    pixel_values: new Tensor('float32', data, [1, 3, 224, 224]),
  });
  // Primer token (CLS) del last_hidden_state; no promediar los tokens de fondo.
  const vector = Array.from(
    output.last_hidden_state.data.slice(0, 384),
    Number,
  );
  const norm = Math.hypot(...vector);
  if (!Number.isFinite(norm) || norm === 0)
    throw new Error('Embedding inválido.');
  return vector.map((value) => value / norm);
}
