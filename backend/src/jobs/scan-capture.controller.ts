import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  PayloadTooLargeException,
  Post,
} from '@nestjs/common';
import { IsString, Matches, MaxLength } from 'class-validator';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const DATA_URL_PREFIX = 'data:image/png;base64,';
const MAX_BYTES = 8 * 1024 * 1024;

export class ScanCaptureDto {
  /** Id de la corrida: agrupa todos los recortes de un mismo escaneo. */
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9_-]+$/)
  run: string;

  /** Nombre del paso. Lleva su número adelante para que se ordenen al listar. */
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9_.-]+$/)
  step: string;

  @IsString()
  @MaxLength(Math.ceil(MAX_BYTES * 1.4))
  png: string;
}

/**
 * Endpoint **solo de desarrollo** para volcar los recortes intermedios del
 * escáner a disco, así se pueden mirar mientras se depura el OCR.
 *
 * No pide credenciales a propósito: lo llama el navegador, que no tiene el
 * admin key. A cambio no existe en producción (404) y solo escribe PNGs en un
 * directorio temporal con nombres sanitizados.
 */
@Controller('jobs')
export class ScanCaptureController {
  @Post('scan-capture')
  @HttpCode(HttpStatus.CREATED)
  async capture(@Body() dto: ScanCaptureDto): Promise<{ path: string }> {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
    if (!dto.png.startsWith(DATA_URL_PREFIX)) {
      throw new NotFoundException();
    }

    const base64 = dto.png.slice(DATA_URL_PREFIX.length);
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
      throw new PayloadTooLargeException('Captura vacía o demasiado grande');
    }

    // `os.tmpdir()` en macOS es un path opaco de /var/folders, y para ir a
    // mirar las capturas conviene un lugar que se pueda abrir a mano.
    const root = process.env.SCAN_CAPTURE_DIR ?? join('/tmp', 'pokemon-scanner-captures');
    const file = join(root, dto.run, `${dto.step}.png`);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, bytes);

    return { path: file };
  }
}
