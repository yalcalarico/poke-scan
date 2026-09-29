/**
 * Genera los PNG del Web App Manifest (fase 6) sin dependencias externas:
 * reutiliza el encoder PNG minimo que ya existe para los tests del scanner.
 *
 *   node scripts/generate-icons.mjs
 *
 * `encodePng` escribe colorType 2 (RGB), asi que no hay canal alfa: todos los
 * iconos son a sangre completa sobre slate-950 y el recorte redondeado lo hace
 * el launcher. Eso es ademas lo que exigen los iconos "maskable".
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { encodePng } from '../lib/scanner/__tests__/helpers/png.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '..', 'public', 'icons');

/** slate-950 */
const BG = [2, 6, 23];
/** slate-900, placa interior */
const PLATE = [15, 23, 42];
/** slate-50, borde claro del pokeball */
const RIM = [248, 250, 252];
/** slate-100, mitad inferior */
const BOTTOM = [241, 245, 249];
/** sky-400, mitad superior */
const TOP = [56, 189, 248];

function coverage(distance, edge) {
  return Math.min(1, Math.max(0, edge - distance));
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function blend(canvas, fn) {
  const { width, height, data } = canvas;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const hit = fn(x + 0.5, y + 0.5);
      if (!hit) continue;
      const [r, g, b, alpha = 1] = hit;
      if (alpha <= 0) continue;
      const i = (y * width + x) * 4;
      const out = mix([data[i], data[i + 1], data[i + 2]], [r, g, b], alpha);
      data[i] = out[0];
      data[i + 1] = out[1];
      data[i + 2] = out[2];
      data[i + 3] = 255;
    }
  }
}

/** Rectangulo redondeado, SDF estilo iq. */
function roundedRectDistance(px, py, halfW, halfH, radius) {
  const qx = Math.abs(px) - (halfW - radius);
  const qy = Math.abs(py) - (halfH - radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

/**
 * Pokeball estilizado: aro, banda horizontal y boton central.
 * @param size lado del lienzo
 * @param ballFraction diametro del pokeball como fraccion del lado
 * @param plate dibujar la placa redondeada interior (solo para "any")
 */
function drawIcon(size, { ballFraction = 0.72, plate = true } = {}) {
  const s = size;
  const u = s / 512;
  const canvas = { width: s, height: s, data: new Uint8ClampedArray(s * s * 4) };

  for (let i = 0; i < s * s; i += 1) {
    canvas.data[i * 4] = BG[0];
    canvas.data[i * 4 + 1] = BG[1];
    canvas.data[i * 4 + 2] = BG[2];
    canvas.data[i * 4 + 3] = 255;
  }

  if (plate) {
    blend(canvas, (x, y) => {
      const d = roundedRectDistance(x - s / 2, y - s / 2, s * 0.43, s * 0.43, s * 0.2);
      const a = coverage(d, 0);
      return a > 0 ? [PLATE[0], PLATE[1], PLATE[2], a] : null;
    });
  }

  const cx = s / 2;
  const cy = s / 2;
  const R = (ballFraction * s) / 2;
  const rim = 20 * u;
  const bandHalf = 16 * u;
  const btnOuter = 62 * u;
  const btnInner = 38 * u;

  // Mitad superior (sky) y mitad inferior (claro).
  blend(canvas, (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    const a = coverage(d, R - rim);
    if (a <= 0) return null;
    const c = y <= cy ? TOP : BOTTOM;
    return [c[0], c[1], c[2], a];
  });

  // Aro exterior: dentro de R pero fuera de R - rim.
  blend(canvas, (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    const a = Math.min(coverage(d, R), 1 - coverage(d, R - rim));
    return a > 0 ? [RIM[0], RIM[1], RIM[2], a] : null;
  });

  // Banda horizontal.
  blend(canvas, (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    const inside = coverage(d, R - rim);
    if (inside <= 0) return null;
    const a = coverage(Math.abs(y - cy), bandHalf) * inside;
    return a > 0 ? [BG[0], BG[1], BG[2], a] : null;
  });

  // Boton central: aro claro + relleno del fondo.
  blend(canvas, (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    const ring = Math.min(coverage(d, btnOuter), 1 - coverage(d, btnInner));
    if (ring > 0) return [RIM[0], RIM[1], RIM[2], ring];
    const core = coverage(d, btnInner);
    return core > 0 ? [BG[0], BG[1], BG[2], core] : null;
  });

  return canvas;
}

function write(name, canvas) {
  const png = encodePng(canvas);
  writeFileSync(resolve(OUT_DIR, name), png);
  console.log(`${name.padEnd(24)} ${canvas.width}x${canvas.height}  ${String(png.length).padStart(7)} bytes`);
}

mkdirSync(OUT_DIR, { recursive: true });

// "any": placa redondeada, pokeball grande.
write('icon-192.png', drawIcon(192, { ballFraction: 0.68, plate: true }));
write('icon-512.png', drawIcon(512, { ballFraction: 0.68, plate: true }));
// iOS no recorta: sin placa, a sangre completa.
write('apple-touch-icon.png', drawIcon(180, { ballFraction: 0.68, plate: false }));
// "maskable": el sistema recorta hasta ~20% por lado, asi que la bola va
// al 50% del lado y sin placa, para caer entera dentro de la zona segura.
write('maskable-512.png', drawIcon(512, { ballFraction: 0.5, plate: false }));
