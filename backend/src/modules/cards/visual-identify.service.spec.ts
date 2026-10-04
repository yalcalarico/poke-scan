import { validate } from 'class-validator';
import { VisualIdentifyDto } from './dto/visual-identify.dto.js';
import { VisualIdentifyService } from './visual-identify.service.js';

describe('Prueba visual: límites y opt-in', () => {
  const previous = process.env.SCANNER_VISUAL_ENABLED;
  afterEach(() => {
    if (previous === undefined) delete process.env.SCANNER_VISUAL_ENABLED;
    else process.env.SCANNER_VISUAL_ENABLED = previous;
  });
  it('no inicia el motor cuando está apagado', async () => {
    delete process.env.SCANNER_VISUAL_ENABLED;
    await expect(
      new VisualIdentifyService().identify(
        Object.assign(new VisualIdentifyDto(), {
          image: 'data:image/png;base64,YQ==',
        }),
      ),
    ).rejects.toThrow('desactivada');
  });
  it('valida formato y tamaño antes de enviar al motor', async () => {
    for (const image of [
      'data:image/svg+xml;base64,YQ==',
      'data:image/png;base64,%%%',
      'x'.repeat(8_388_641),
    ]) {
      expect(
        (await validate(Object.assign(new VisualIdentifyDto(), { image })))
          .length,
      ).toBeGreaterThan(0);
    }
  });
  it('rechaza fotos vacías sin cargar ONNX', async () => {
    process.env.SCANNER_VISUAL_ENABLED = '1';
    await expect(
      new VisualIdentifyService().identify(
        Object.assign(new VisualIdentifyDto(), {
          image: 'data:image/png;base64,',
        }),
      ),
    ).rejects.toThrow('6 MiB');
  });
});

describe('Prueba visual: aislamiento y cancelación', () => {
  const previous = process.env.SCANNER_VISUAL_ENABLED;
  afterEach(() => {
    if (previous === undefined) delete process.env.SCANNER_VISUAL_ENABLED;
    else process.env.SCANNER_VISUAL_ENABLED = previous;
  });
  it('rechaza concurrencia y recupera después de bytes inválidos', async () => {
    process.env.SCANNER_VISUAL_ENABLED = '1';
    const service = new VisualIdentifyService();
    const dto = Object.assign(new VisualIdentifyDto(), {
      image: 'data:image/png;base64,YQ==',
    });
    try {
      const first = expect(service.identify(dto)).rejects.toThrow(
        'imagen válida',
      );
      await expect(service.identify(dto)).rejects.toThrow('ocupado');
      await first;
      await expect(service.identify(dto)).rejects.toThrow('imagen válida');
    } finally {
      service.onModuleDestroy();
    }
  });
  it('cancela antes de enviar una foto y libera el motor', async () => {
    process.env.SCANNER_VISUAL_ENABLED = '1';
    const service = new VisualIdentifyService();
    const abort = new AbortController();
    abort.abort();
    try {
      await expect(
        service.identify(
          Object.assign(new VisualIdentifyDto(), {
            image: 'data:image/png;base64,YQ==',
          }),
          abort.signal,
        ),
      ).rejects.toThrow('cancelada');
      await expect(
        service.identify(
          Object.assign(new VisualIdentifyDto(), {
            image: 'data:image/png;base64,',
          }),
        ),
      ).rejects.toThrow('6 MiB');
    } finally {
      service.onModuleDestroy();
    }
  });
});
