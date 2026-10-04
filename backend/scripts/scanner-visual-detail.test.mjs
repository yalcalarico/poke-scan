import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { rerankDetails } from './scanner-visual-detail.mjs';

async function texture(seed) {
  const pixels = Buffer.alloc(384 * 536);
  for (let i = 0; i < pixels.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    pixels[i] = seed >>> 24;
  }
  return sharp(pixels, { raw: { width: 384, height: 536, channels: 1 } })
    .blur(0.8)
    .png()
    .toBuffer();
}
test('corrobora dibujo pese a rotación y prioriza geometría sobre un coseno incorrecto', async () => {
  const root = await mkdtemp(join(tmpdir(), 'scanner-detail-'));
  try {
    const original = await texture(17);
    const correct = join(root, 'correct.png'),
      wrong = join(root, 'wrong.png');
    await sharp(original).toFile(correct);
    await sharp(await texture(42)).toFile(wrong);
    const query = await sharp(original)
      .rotate(3)
      .resize(384, 536, { fit: 'fill' })
      .ensureAlpha()
      .png()
      .toBuffer();
    const candidates = [
      { id: 'wrong', similarity: 0.9, imagePath: wrong },
      { id: 'correct', similarity: 0.6, imagePath: correct },
    ];
    const result = await rerankDetails(query, candidates, 'v1');
    assert.equal(result[0].id, 'correct');
    assert.equal(result[0].geometry.verified, true);
    assert.equal(result[1].geometry.verified, false);
    assert.equal(result[0].similarity, 0.6);
    const warm = await rerankDetails(query, candidates, 'v1');
    assert.equal(warm[0].id, 'correct');
    const refreshed = await rerankDetails(query, candidates, 'v2');
    assert.equal(refreshed[0].id, 'correct');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('sin textura ni referencia local conserva el ranking, sin inventar evidencia', async () => {
  const root = await mkdtemp(join(tmpdir(), 'scanner-detail-'));
  try {
    const blank = await sharp({
      create: { width: 384, height: 536, channels: 3, background: '#888888' },
    })
      .png()
      .toBuffer();
    const imagePath = join(root, 'blank.png');
    await sharp(blank).toFile(imagePath);
    const result = await rerankDetails(
      blank,
      [
        { id: 'first', similarity: 0.9, imagePath },
        { id: 'missing', similarity: 0.8 },
      ],
      'blank',
    );
    assert.equal(result[0].id, 'first');
    assert.equal(result[0].geometry.verified, false);
    assert.equal(result[1].geometry, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
