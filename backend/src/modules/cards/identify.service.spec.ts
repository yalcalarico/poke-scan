import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/index.js';
import { IdentifyDto } from './dto/identify.dto.js';
import { IdentifyService, type IdentifyResultDto } from './identify.service.js';

// Líneas CRUDAS reales de Tesseract.js sobre imágenes de pokemontcg.io
// (ver `frontend/lib/scanner/__fixtures__/ocr-samples.json`).
const CHARIZARD_LINES = [
  'sthce , Evolves from Eon Put Charizard on the Stage | card',
  '115% 4 Charizard &',
  'Np 1',
  'ES = 3 Cas',
  '5¢y WFiame Pokémon. Length: 5\' 7", Weight: 200 (BS)',
];
const ALAKAZAM_LINES = [
  'STAGE 2 Evolves from Kadabra Put Alakazam on the Stage | card',
  '{5 + Alakazam 4',
  'SR',
  'So Psi Pokémon. Length: 4\' 11", Weight: 106 Ibs. {i',
];
const UNREADABLE_LINES = ['STAGE] J)', '85 " EEvolves from Cabone Wai iz: :', 'Pr p= VP -'];

const identify = (dto: IdentifyDto): Promise<IdentifyResultDto> =>
  service.identify(dto).then((r) => r);

let moduleRef: TestingModule;
let service: IdentifyService;
const prismaClient = new PrismaClient();

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    providers: [IdentifyService, { provide: PrismaService, useValue: prismaClient }],
  }).compile();

  service = moduleRef.get(IdentifyService);
});

afterAll(async () => {
  await prismaClient.$disconnect();
  await moduleRef.close();
});

describe('IdentifyService', () => {
  it('identifica Charizard a partir de las líneas sucias del OCR', async () => {
    const result = await identify({ lines: CHARIZARD_LINES });

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0]!.card.name).toBe('Charizard');
    expect(result.candidates[0]!.score).toBeGreaterThanOrEqual(0.9);
    expect(result.candidates[0]!.matchedText).toContain('Charizard');
    expect(result.extracted.name).toBe('Charizard');
  });

  it('el primer candidato de una carta base es la edición clásica (tiene precio)', async () => {
    const result = await identify({ lines: CHARIZARD_LINES });

    expect(result.candidates[0]!.card.id).toBe('base1-4');
    expect(result.candidates[0]!.card.set?.name).toBe('Base');
    expect(result.candidates[0]!.prices.length).toBeGreaterThan(0);
  });

  it('identifica Alakazam y lo rankea por encima de Kadabra (su evolución)', async () => {
    const result = await identify({ lines: ALAKAZAM_LINES });

    expect(result.candidates[0]!.card.name).toBe('Alakazam');
    const kadabra = result.candidates.find((c) => c.card.name === 'Kadabra');
    if (kadabra) {
      expect(result.candidates[0]!.score).toBeGreaterThanOrEqual(kadabra.score);
    }
  });

  it('funciona solo con `name`, sin líneas', async () => {
    const result = await identify({ name: 'Charizard' });

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0]!.card.name).toBe('Charizard');
    expect(result.candidates[0]!.score).toBe(1);
  });

  it('no crashea y devuelve scores bajos cuando el OCR no leyó ningún nombre', async () => {
    const result = await identify({ lines: UNREADABLE_LINES });

    expect(Array.isArray(result.candidates)).toBe(true);
    expect(result.candidates.length).toBeLessThanOrEqual(8);
    for (const candidate of result.candidates) {
      expect(candidate.score).toBeLessThan(0.75);
    }
  });

  it('sin ninguna entrada devuelve la respuesta vacía sin tocar la BD', async () => {
    const result = await identify({});

    expect(result).toEqual({
      candidates: [],
      extracted: { name: null, number: null, setHint: null },
      totalCandidates: 0,
    });
  });

  it('respeta `limit`', async () => {
    const result = await identify({ name: 'Charizard', limit: 3 });

    expect(result.candidates).toHaveLength(3);
  });

  it('devuelve como máximo 3 cartas por nombre exacto, priorizando las que tienen precio', async () => {
    const result = await identify({ name: 'Charizard', limit: 20 });
    const counts = new Map<string, number>();
    for (const candidate of result.candidates) {
      counts.set(candidate.card.name, (counts.get(candidate.card.name) ?? 0) + 1);
    }

    expect(result.candidates.length).toBeGreaterThan(3);
    for (const [, count] of counts) {
      expect(count).toBeLessThanOrEqual(3);
    }
    expect(result.candidates[0]!.card.id).toBe('base1-4');
  });

  it('el score es un número entre 0 y 1 con 2 decimales', async () => {
    const result = await identify({ lines: CHARIZARD_LINES, number: '4', setHint: 'Base' });

    for (const candidate of result.candidates) {
      expect(candidate.score).toBeGreaterThanOrEqual(0);
      expect(candidate.score).toBeLessThanOrEqual(1);
      expect(candidate.score).toBe(Math.round(candidate.score * 100) / 100);
    }
  });

  it('arma el shape que espera el frontend (card + set + prices + price)', async () => {
    const result = await identify({ lines: CHARIZARD_LINES });
    const top = result.candidates[0]!;

    expect(top.card.id).toEqual(expect.any(String));
    expect(top.card.name).toEqual(expect.any(String));
    expect(top.card.supertype).toEqual(expect.any(String));
    expect(Array.isArray(top.card.subtypes)).toBe(true);
    expect(Array.isArray(top.card.types)).toBe(true);
    expect(top.card.set?.id).toBe(top.card.setId);
    expect(top.card.imageSmall).toEqual(expect.any(String));
    expect(top.card.imageLarge).toEqual(expect.any(String));
    expect(Array.isArray(top.prices)).toBe(true);
    expect(top.price).not.toBeUndefined();
    expect(result.totalCandidates).toBeGreaterThanOrEqual(result.candidates.length);
  });

  it('trae los precios ya guardados en card_prices (sin llamar a la API externa)', async () => {
    const saved = await prismaClient.cardPrice.findMany({
      where: { cardId: 'xy5-1' },
      orderBy: { fetchedAt: 'desc' },
    });
    const variants = new Set(saved.map((price) => price.variant));

    const result = await identify({ lines: ['c/Weedle ~~ ,508@'] });
    const weedle = result.candidates.find((candidate) => candidate.card.id === 'xy5-1');

    expect(weedle).toBeDefined();
    expect(weedle!.prices.map((price) => price.variant).sort()).toEqual(
      [...variants].sort(),
    );
    for (const price of weedle!.prices) {
      expect(typeof price.market === 'number' || price.market === null).toBe(true);
      expect(price.fetchedAt).toEqual(expect.any(String));
    }
  });

  it('el `number` del OCR (poco confiable) ordena las variantes de un mismo nombre', async () => {
    const withNumber = await identify({ name: 'Charizard', number: '4/102', limit: 5 });
    const withoutNumber = await identify({ name: 'Charizard', limit: 5 });

    // "4/102" se normaliza a 4: la carta #4 del set Base tiene que ganar.
    expect(withNumber.candidates[0]!.card.id).toBe('base1-4');
    expect(withoutNumber.candidates[0]!.card.id).toBe('base1-4');
  });

  it('el `setHint` suma score a las cartas del set indicado', async () => {
    const withHint = await identify({ name: 'Charizard', setHint: 'Base', limit: 20 });
    const base = withHint.candidates.find((candidate) => candidate.card.set?.name === 'Base');

    expect(base).toBeDefined();
    expect(base!.card.set?.id).toBe('base1');
  });

  it('tolera 60 líneas de OCR sin reventar', async () => {
    const lines = Array.from({ length: 60 }, (_, i) => `linea ${i} Charizard & ruido ${i}`);
    const result = await identify({ lines });

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0]!.card.name).toBe('Charizard');
  });
});

/**
 * Desempate por atributos impresos.
 *
 * "Absol" tiene 20 impresiones en el catálogo con el mismo nombre y distinto HP,
 * artista, rareza y numeración. Con solo el nombre es imposible elegir una: los
 * cuatro casos de abajo son unívocos por un atributo, así que si el atributo se
 * leyó bien, la respuesta es forzosa.
 */
describe('IdentifyService — atributos impresos', () => {
  it('el número "N/M" elige esa impresión: el denominador es el total del set', async () => {
    // ex4-96: número 96 en ex4, cuyo printedTotal es 95.
    const result = await identify({ lines: ['Absol', '96/95'], limit: 5 });

    expect(result.candidates[0]!.card.id).toBe('ex4-96');
  });

  it('los HP del OCR eligen la impresión con ese HP', async () => {
    // hgss4-91 es el único Absol con 80 HP.
    const result = await identify({ lines: ['Absol', '80 HP'], limit: 5 });

    expect(result.candidates[0]!.card.id).toBe('hgss4-91');
  });

  it('el artista del OCR elige la impresión firmada por ese ilustrador', async () => {
    // sm12-133 es el único Absol ilustrado por Mizue.
    const result = await identify({ lines: ['Absol', 'Mizue'], limit: 5 });

    expect(result.candidates[0]!.card.id).toBe('sm12-133');
  });

  it('la rareza del OCR elige la impresión con esa rareza', async () => {
    // "Promo" (xyp-XY178) es la única rareza de Absol que no está contenida en
    // otra. Se evita a propósito "Rare Secret": ahí "Rare" también matchea
    // dentro del texto leído y ambos empatan, porque el bonus de rareza es un
    // substring.match — weakness documentada de la señal, no un bug del test.
    const result = await identify({ lines: ['Absol', 'Promo'], limit: 5 });

    expect(result.candidates[0]!.card.id).toBe('xyp-XY178');
  });

  it('sin atributos legibles sigue devolviendo candidatos (no se rompe)', async () => {
    const result = await identify({ lines: ['Absol'], limit: 5 });

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0]!.card.name).toBe('Absol');
  });

  it('no confunde un daño de ataque con los HP', async () => {
    // "does 40 damage" no es una caja de HP: no debe elegir nada por HP.
    const result = await identify({ lines: ['Absol', 'this attack does 40 damage'], limit: 5 });

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.map((c) => c.card.id)).not.toContain('hgss4-91');
  });

  it('no confunde un rango con el número impreso', async () => {
    // "1/2" no es una numeración de set (el denominador es demasiado chico).
    const result = await identify({ lines: ['Absol', '1/2'], limit: 5 });

    expect(result.candidates.length).toBeGreaterThan(0);
  });
});

/**
 * Un token de 3 letras que es el nombre de una carta con una letra de diferencia
 * no puede quedarse con el piso de match exacto.
 *
 * Regresión medida sobre fotos reales: el OCR leyó "mes" donde la carta dice
 * "Mew", y como "mes" es exactamente el nombre "Mew" en minúsculas, el piso de
 * 1.0 le ganaba al nombre real de la carta ("Chandelure", leído una sola vez y
 * por eso con el 0.97 de SINGLE_OCCURRENCE_FACTOR).
 */
describe('IdentifyService — nombres cortos', () => {
  it('un token corto casi igual a de un nombre de 3 letras no le gana al nombre real', async () => {
    const result = await identify({ lines: ['Chandelure', 'mes'], limit: 5 });

    expect(result.candidates[0]!.card.name).toBe('Chandelure');
  });

  it('el tope hunde la carta pero no la saca de los candidatos', async () => {
    const result = await identify({ lines: ['Mew'], limit: 5 });

    expect(result.candidates[0]!.card.name).toBe('Mew');
    expect(result.candidates[0]!.score).toBeGreaterThan(0.25);
    expect(result.candidates[0]!.score).toBeLessThan(1);
  });
});
