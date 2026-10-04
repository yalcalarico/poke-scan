/**
 * Canvas shim good enough for `lib/scanner/preprocess`: a pixel buffer with the
 * handful of 2D-context calls the pre-processing code makes. It lets the real
 * reconocimiento visual pipeline run in plain Node (no native canvas binding needed).
 */
import { encodePng } from './png';

export interface DecodedImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

class ShimImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  colorSpace = 'srgb';

  constructor(
    dataOrWidth: Uint8ClampedArray | number,
    widthOrHeight: number,
    maybeHeight?: number,
  ) {
    if (typeof dataOrWidth === 'number') {
      this.width = dataOrWidth;
      this.height = widthOrHeight;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
    } else {
      this.data = dataOrWidth;
      this.width = widthOrHeight;
      this.height = maybeHeight ?? this.data.length / 4 / widthOrHeight;
    }
  }
}

class ShimContext2D {
  constructor(private readonly canvas: ShimCanvas) {}

  getImageData(_x: number, _y: number, width: number, height: number): ShimImageData {
    const out = new ShimImageData(width, height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const src = ((y + _y) * this.canvas.width + (x + _x)) * 4;
        const dst = (y * width + x) * 4;
        out.data[dst] = this.canvas.pixels[src];
        out.data[dst + 1] = this.canvas.pixels[src + 1];
        out.data[dst + 2] = this.canvas.pixels[src + 2];
        out.data[dst + 3] = this.canvas.pixels[src + 3];
      }
    }
    return out;
  }

  putImageData(image: { data: Uint8ClampedArray; width: number; height: number }, x: number, y: number): void {
    for (let row = 0; row < image.height; row += 1) {
      const src = row * image.width * 4;
      const dst = ((row + y) * this.canvas.width + x) * 4;
      this.canvas.pixels.set(image.data.subarray(src, src + image.width * 4), dst);
    }
  }

  createImageData(width: number, height: number): ShimImageData {
    return new ShimImageData(width, height);
  }

  /**
   * `drawImage(src, dx, dy)` copia 1:1 y `drawImage(src, dx, dy, dw, dh)`
   * escala con nearest-neighbour, que es lo que alcanza para los recortes del
   * escáner. Sin el escalado, `debug-capture` (que achica las capturas a 1000px)
   * se caería con un RangeError en vez de escribir el PNG.
   */
  drawImage(source: ShimCanvas, x: number, y: number, dw?: number, dh?: number): void {
    const outW = dw ?? source.width;
    const outH = dh ?? source.height;

    if (outW === source.width && outH === source.height) {
      for (let row = 0; row < source.height; row += 1) {
        const src = row * source.width * 4;
        const dst = (row + y) * this.canvas.width * 4;
        this.canvas.pixels.set(
          source.pixels.subarray(src, src + source.width * 4),
          dst + x * 4,
        );
      }
      return;
    }

    for (let row = 0; row < outH; row += 1) {
      const srcY = Math.min(source.height - 1, Math.floor((row * source.height) / outH));
      for (let col = 0; col < outW; col += 1) {
        const srcX = Math.min(source.width - 1, Math.floor((col * source.width) / outW));
        const src = (srcY * source.width + srcX) * 4;
        const dst = ((row + y) * this.canvas.width + (col + x)) * 4;
        this.canvas.pixels[dst] = source.pixels[src]!;
        this.canvas.pixels[dst + 1] = source.pixels[src + 1]!;
        this.canvas.pixels[dst + 2] = source.pixels[src + 2]!;
        this.canvas.pixels[dst + 3] = source.pixels[src + 3]!;
      }
    }
  }

  clearRect(): void {}
}

export class ShimCanvas {
  private _width: number;
  private _height: number;
  pixels: Uint8ClampedArray;
  private context = new ShimContext2D(this);

  constructor(width: number, height: number, image?: DecodedImage) {
    this._width = width;
    this._height = height;
    this.pixels = image ? new Uint8ClampedArray(image.data) : new Uint8ClampedArray(width * height * 4);
  }

  get width(): number {
    return this._width;
  }

  set width(value: number) {
    if (value === this._width) return;
    this._width = value;
    this.pixels = new Uint8ClampedArray(this._width * this._height * 4);
  }

  get height(): number {
    return this._height;
  }

  set height(value: number) {
    if (value === this._height) return;
    this._height = value;
    this.pixels = new Uint8ClampedArray(this._width * this._height * 4);
  }

  getContext(): ShimContext2D {
    return this.context;
  }

  toImageData(): DecodedImage {
    return { width: this.width, height: this.height, data: this.pixels };
  }

  /**
   * `toDataURL` para que `debug-capture` —que llama
   * `canvas.toDataURL('image/png')`— se pueda ejercitar en Node. El encoder
   * vive en ./png, que es el único lugar donde hay uno.
   */
  toDataURL(mime = 'image/png'): string {
    return `data:${mime};base64,${this.toBuffer().toString('base64')}`;
  }

  toBuffer(): Buffer {
    return encodePng({ width: this.width, height: this.height, data: this.pixels });
  }
}

/** Installs the globals `lib/scanner/preprocess` expects. */
export function installCanvasShim(): void {
  const globals = globalThis as unknown as Record<string, unknown>;
  if (!globals.ImageData) globals.ImageData = ShimImageData;
  if (!globals.document) {
    globals.document = {
      createElement: (tag: string) => {
        if (tag !== 'canvas') throw new Error(`shim only supports canvas, got ${tag}`);
        return new ShimCanvas(1, 1);
      },
    };
  }
}

export { ShimImageData };
