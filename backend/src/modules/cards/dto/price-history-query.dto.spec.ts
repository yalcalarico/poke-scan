import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PriceHistoryQueryDto } from './price-history-query.dto.js';

describe('Contrato de procedencia del historial', () => {
  it.each(['tcgcsv', 'tcgdex', 'pokemontcg.io', 'scrydex', 'legacy'])('conserva la consulta explícita de la fuente %s', async (provider) => {
    const query = plainToInstance(PriceHistoryQueryDto, { provider });
    expect(await validate(query)).toEqual([]);
  });

  it('sigue rechazando fuentes desconocidas', async () => {
    const query = plainToInstance(PriceHistoryQueryDto, { provider: 'desconocida' });
    expect((await validate(query)).map((error) => error.property)).toContain('provider');
  });
});
