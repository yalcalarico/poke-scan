import { detectCardRect } from './preprocess';

export function hasAlignedCard(image: ImageData): boolean {
  const rect = detectCardRect(image);
  if (!rect || rect.width >= rect.height) return false;
  // La muestra incluye un 20 % de margen alrededor de la guía.
  const width = rect.width / image.width;
  const height = rect.height / image.height;
  const centerX = (rect.x + rect.width / 2) / image.width;
  const centerY = (rect.y + rect.height / 2) / image.height;
  return width >= 0.62 && width <= 0.92 && height >= 0.62 && height <= 0.92
    && Math.abs(centerX - 0.5) < 0.12 && Math.abs(centerY - 0.5) < 0.12;
}

export function frameSignature(image: ImageData): number[] {
  const signature: number[] = [];
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 12; x += 1) {
      const px = Math.floor((x + 0.5) * image.width / 12);
      const py = Math.floor((y + 0.5) * image.height / 16);
      const i = (py * image.width + px) * 4;
      signature.push(image.data[i]! * 0.299 + image.data[i + 1]! * 0.587 + image.data[i + 2]! * 0.114);
    }
  }
  return signature;
}

function difference(a: number[], b: number[]): number {
  return a.reduce((sum, value, index) => sum + Math.abs(value - b[index]!), 0) / a.length;
}

/** Frena movimiento, lecturas simultáneas y repeticiones de una carta quieta. */
export class AutoVisualGate {
  private previous: number[] | null = null;
  private captured: number[] | null = null;
  private stableSince = 0;
  private absentSince: number | null = null;
  private lastCapture = -Infinity;

  observe(signature: number[], aligned: boolean, busy: boolean, now: number): { ready: boolean; capture: boolean } {
    if (!aligned) {
      this.previous = null;
      this.absentSince ??= now;
      if (now - this.absentSince >= 1000) this.captured = null;
      return { ready: false, capture: false };
    }
    this.absentSince = null;
    if (!this.previous || difference(signature, this.previous) > 8) this.stableSince = now;
    this.previous = signature;
    const ready = now - this.stableSince >= 900;
    const repeated = this.captured !== null && difference(signature, this.captured) < 14;
    const capture = ready && !busy && !repeated && now - this.lastCapture >= 2500;
    if (capture) {
      this.captured = signature;
      this.lastCapture = now;
    }
    return { ready, capture };
  }
}
