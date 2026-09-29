import { Injectable, Logger } from '@nestjs/common';
import type {
  CardIdentificationProvider,
  IdentificationCandidate,
} from './card-provider.interface.js';

@Injectable()
export class OcrLocalProvider implements CardIdentificationProvider {
  private readonly logger = new Logger(OcrLocalProvider.name);

  async identify(_imageBase64: string): Promise<IdentificationCandidate[]> {
    this.logger.debug('identify() sin implementar todavía: devolviendo lista vacía');
    return [];
  }
}
