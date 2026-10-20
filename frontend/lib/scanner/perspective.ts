/** Geometría de perspectiva local: no requiere modelo ni imágenes del servidor. */
export interface CardPoint { x: number; y: number }
/** Esquinas en orden horario: superior izquierda, derecha, inferior derecha, izquierda. */
export type CardQuadrilateral = [CardPoint, CardPoint, CardPoint, CardPoint];
const ASPECT = 63 / 88;
const distance = (a: CardPoint, b: CardPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const cross = (a: CardPoint, b: CardPoint, c: CardPoint) =>
  (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);

export function validCardQuadrilateral(q: CardQuadrilateral, width: number, height: number): boolean {
  if (q.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > width - 1 || p.y > height - 1)) return false;
  if (q.some((p, i) => cross(p, q[(i + 1) % 4]!, q[(i + 2) % 4]!) <= 0)) return false;
  const sides = q.map((p, i) => distance(p, q[(i + 1) % 4]!));
  if (Math.min(...sides) < 12) return false;
  if ([sides[0]! / sides[2]!, sides[1]! / sides[3]!].some(r => r < 0.55 || r > 1 / 0.55)) return false;
  const ratio = (sides[0]! + sides[2]!) / (sides[1]! + sides[3]!);
  const deviation = Math.min(Math.abs(ratio / ASPECT - 1), Math.abs(ratio * ASPECT - 1));
  return deviation <= 0.35;
}

/** Inversa proyectiva del cuadrado unitario a las cuatro esquinas. */
export function rectifyCardPerspective(image: ImageData, q: CardQuadrilateral): ImageData | null {
  if (!validCardQuadrilateral(q, image.width, image.height)) return null;
  const [a, b, c, d] = q;
  const dx = a.x - b.x + c.x - d.x, dy = a.y - b.y + c.y - d.y;
  const ex = b.x - c.x, ey = b.y - c.y, fx = d.x - c.x, fy = d.y - c.y;
  const det = ex * fy - fx * ey;
  if (Math.abs(det) < 1e-8) return null;
  const g = (dx * fy - fx * dy) / det, h = (ex * dy - dx * ey) / det;
  const ax = b.x - a.x + g * b.x, bx = d.x - a.x + h * d.x;
  const ay = b.y - a.y + g * b.y, by = d.y - a.y + h * d.y;
  // Un polo dentro del cuadro implicaría un warp infinito/invertido.
  if (Math.min(1, 1 + g, 1 + h, 1 + g + h) <= 1e-6) return null;
  const horizontal = (distance(a, b) + distance(d, c)) / 2;
  const vertical = (distance(a, d) + distance(b, c)) / 2;
  const landscape = horizontal > vertical;
  const long = Math.min(1400, Math.max(2, Math.round(Math.max(horizontal, vertical))));
  const short = Math.max(2, Math.round(long * ASPECT));
  const width = landscape ? long : short, height = landscape ? short : long;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1), divisor = g * u + h * v + 1;
      const sx = Math.max(0, Math.min(image.width - 1, (ax * u + bx * v + a.x) / divisor));
      const sy = Math.max(0, Math.min(image.height - 1, (ay * u + by * v + a.y) / divisor));
      const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(image.width - 1, x0 + 1), y1 = Math.min(image.height - 1, y0 + 1);
      const wx = sx - x0, wy = sy - y0;
      for (let channel = 0; channel < 4; channel++) {
        const top = image.data[(y0 * image.width + x0) * 4 + channel]! * (1 - wx) + image.data[(y0 * image.width + x1) * 4 + channel]! * wx;
        const bottom = image.data[(y1 * image.width + x0) * 4 + channel]! * (1 - wx) + image.data[(y1 * image.width + x1) * 4 + channel]! * wx;
        out[(y * width + x) * 4 + channel] = top * (1 - wy) + bottom * wy;
      }
    }
  }
  return new ImageData(out, width, height);
}

interface Line { slope: number; intercept: number; votes: number }

/** Cuatro lados fuertes en una miniatura; ante ambigüedad se conserva el recorte anterior. */
export function detectCardQuadrilateral(image: ImageData): CardQuadrilateral | null {
  // Acotar también el alto evita trabajo enorme con panoramas verticales.
  const scale = Math.min(1, 180 / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale)), height = Math.max(1, Math.round(image.height * scale));
  if (Math.min(width, height) < 24) return null;
  const gray = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = Math.min(image.width - 1, Math.round(x / scale)), sy = Math.min(image.height - 1, Math.round(y / scale));
    const i = (sy * image.width + sx) * 4;
    gray[y * width + x] = .299 * image.data[i]! + .587 * image.data[i + 1]! + .114 * image.data[i + 2]!;
  }
  const vertical = new Uint8Array(width * height), horizontal = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x;
    const dx = Math.abs(gray[i + 1]! - gray[i - 1]!), dy = Math.abs(gray[i + width]! - gray[i - width]!);
    if (dx > 35 && dx > dy * .8) vertical[i] = 1;
    if (dy > 35 && dy > dx * .8) horizontal[i] = 1;
  }
  function lines(edges: Uint8Array, isVertical: boolean): Line[] {
    const candidates: Line[] = [], limit = isVertical ? width : height, along = isVertical ? height : width;
    for (let angle = -30; angle <= 30; angle += 3) {
      const slope = Math.tan(angle * Math.PI / 180), offset = along;
      const votes = new Uint16Array(limit + 2 * along);
      for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
        if (!edges[y * width + x]) continue;
        const bin = Math.round((isVertical ? x - slope * y : y - slope * x)) + offset;
        if (bin >= 0 && bin < votes.length) votes[bin] = votes[bin]! + 1;
      }
      for (let bin = 1; bin < votes.length - 1; bin++) {
        if (votes[bin]! >= 15 && votes[bin]! >= votes[bin - 1]! && votes[bin]! > votes[bin + 1]!) candidates.push({ slope, intercept: bin - offset, votes: votes[bin]! });
      }
    }
    candidates.sort((a, b) => b.votes - a.votes);
    const picked: Line[] = [];
    for (const line of candidates) {
      if (picked.some(p => Math.abs(p.intercept + p.slope * along / 2 - line.intercept - line.slope * along / 2) < 5)) continue;
      picked.push(line);
      if (picked.length === 10) break;
    }
    return picked;
  }
  const vs = lines(vertical, true), hs = lines(horizontal, false);
  function intersection(v: Line, h: Line): CardPoint {
    const x = (v.intercept + v.slope * h.intercept) / (1 - v.slope * h.slope);
    return { x, y: h.intercept + h.slope * x };
  }
  function coherence(a: CardPoint, b: CardPoint, edges: Uint8Array): number {
    const samples = Math.ceil(distance(a, b));
    let hits = 0;
    for (let i = 2; i < samples - 2; i++) {
      const x = Math.round(a.x + (b.x - a.x) * i / samples), y = Math.round(a.y + (b.y - a.y) * i / samples);
      let found = false;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (x + ox >= 0 && x + ox < width && y + oy >= 0 && y + oy < height && edges[(y + oy) * width + x + ox]) found = true;
      }
      if (found) hits++;
    }
    return hits / Math.max(1, samples - 4);
  }
  let best: CardQuadrilateral | null = null, bestScore = 0;
  for (let vi = 0; vi < vs.length; vi++) for (let vj = vi + 1; vj < vs.length; vj++) {
    const pair = [vs[vi]!, vs[vj]!].sort((a, b) => a.intercept + a.slope * height / 2 - b.intercept - b.slope * height / 2);
    for (let hi = 0; hi < hs.length; hi++) for (let hj = hi + 1; hj < hs.length; hj++) {
      const hp = [hs[hi]!, hs[hj]!].sort((a, b) => a.intercept + a.slope * width / 2 - b.intercept - b.slope * width / 2);
      const q: CardQuadrilateral = [intersection(pair[0]!, hp[0]!), intersection(pair[1]!, hp[0]!), intersection(pair[1]!, hp[1]!), intersection(pair[0]!, hp[1]!)];
      if (!validCardQuadrilateral(q, width, height)) continue;
      const area = Math.abs(q.reduce((sum, p, i) => sum + p.x * q[(i + 1) % 4]!.y - p.y * q[(i + 1) % 4]!.x, 0)) / (2 * width * height);
      if (area < .08 || area > .88) continue;
      const support = q.map((p, i) => coherence(p, q[(i + 1) % 4]!, i % 2 === 0 ? horizontal : vertical));
      if (Math.min(...support) < .8) continue;
      const score = Math.min(...support) * Math.sqrt(area);
      if (score > bestScore) { best = q; bestScore = score; }
    }
  }
  if (!best) return null;
  // Las fotos ya alineadas conservan el camino anterior, sin otro remuestreo.
  if (best.every((p, i) => {
    const next = best![(i + 1) % 4]!;
    return (i % 2 === 0 ? Math.abs(p.y - next.y) : Math.abs(p.x - next.x)) / distance(p, next) < .045;
  })) return null;
  return best.map(p => ({ x: p.x / scale, y: p.y / scale })) as CardQuadrilateral;
}
