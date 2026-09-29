import 'reflect-metadata';
import sharp from 'sharp';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Fase 8.0 de `docs/files/08-VERSION-DISAMBIGUATION.md`: cuánto de REAL es el
 * problema de las reimpresiones en el catálogo, antes de construir nada.
 *
 * La pregunta de 8.0 ("si el 95% de los grupos son de tamaño 1, se pospone")
 * pide cosenos de embedding, que no existen hasta el backfill de Ola 2. Pero se
 * puede responder antes y más barato: un grupo de cartas que comparten
 * ilustración tiene que compartir (name, artist) o (name, number). Esos grupos
 * salen de un GROUP BY, y dentro de ellos un coseno de píxeles sobre la franja
 * de ilustración ya separa "misma imagen" de "mismo Pokémon".
 *
 * NO es el coseno de CLIP (ese lo calibrará 8.2 sobre `card_embeddings`). Es un
 * proxy más tosco y por lo tanto más conservador: sólo cuenta como casi-idéntico
 * lo que además es casi idéntico píxel a píxel. Sirve para dimensionar, no para
 * fijar `NEAR_DUP_THRESHOLD`.
 *
 *   pnpm run db:measure-near-dups
 *   pnpm run db:measure-near-dups -- --sample 300 --threshold 0.98
 */

interface Card {
  id: string;
  imageSmall: string;
}

interface Group {
  key: string;
  cards: Card[];
}

type By = 'nameArtist' | 'nameNumber';

const THUMB = 32;
/** Franja de ilustración de una carta: sin el marco, que domina la similitud. */
const ART = { x0: 0.14, x1: 0.86, y0: 0.08, y1: 0.6 };

const log = (...args: unknown[]): void => {
  console.log(`[${new Date().toISOString()}]`, ...args);
};

const column = (by: By): string => (by === 'nameArtist' ? 'artist' : 'number');

function artArea(pixels: Buffer, size: number): number[] {
  const x0 = Math.round(size * ART.x0);
  const x1 = Math.round(size * ART.x1);
  const y0 = Math.round(size * ART.y0);
  const y1 = Math.round(size * ART.y1);
  const out: number[] = [];
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) out.push(pixels[y * size + x] / 255);
  return out;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function embed(url: string): Promise<number[]> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const thumb = await sharp(bytes)
    .resize(THUMB, THUMB, { fit: 'fill' })
    .greyscale()
    .removeAlpha()
    .raw()
    .toBuffer();
  return artArea(thumb, THUMB);
}

/** Una query por variante: los grupos candidatos de tamaño > 1, al azar. */
async function sampleGroups(
  prisma: PrismaService,
  by: By,
  sample: number,
): Promise<Group[]> {
  const col = column(by);
  const keys = await prisma.$queryRawUnsafe<{ key: string }[]>(
    `SELECT name || '~' || ${col} AS key
       FROM cards
      WHERE ${col} IS NOT NULL
      GROUP BY name, ${col}
     HAVING count(*) > 1
      ORDER BY random()
      LIMIT $1`,
    sample,
  );
  const all = await prisma.$queryRawUnsafe<(Card & { key: string })[]>(
    `SELECT name || '~' || ${col} AS key, id, "imageSmall"
       FROM cards
      WHERE ${col} IS NOT NULL
      ORDER BY id`,
  );
  const index = new Map<string, Card[]>();
  for (const card of all) {
    const list = index.get(card.key) ?? [];
    list.push({ id: card.id, imageSmall: card.imageSmall });
    index.set(card.key, list);
  }
  return keys
    .map((k) => ({ key: k.key, cards: index.get(k.key) ?? [] }))
    .filter((g) => g.cards.length > 1);
}

async function inventory(prisma: PrismaService): Promise<void> {
  const [cartas, sets, conSimbolo, conReg, marcas, imagenes] = await Promise.all([
    prisma.card.count(),
    prisma.cardSet.count(),
    prisma.cardSet.count({ where: { symbolUrl: { not: null } } }),
    prisma.card.count({ where: { regulationMark: { not: null } } }),
    prisma.card.groupBy({ by: ['regulationMark'], _count: true }),
    prisma.$queryRawUnsafe<{ n: number }[]>('SELECT count(DISTINCT "imageLarge") AS n FROM cards'),
  ]);

  log('');
  log('── Inventario: lo que §4.3 da por supuesto ──');
  log(`cartas: ${cartas} · imágenes distintas: ${imagenes[0]?.n ?? 0} · sets: ${sets}`);
  log(`sets con symbolUrl: ${conSimbolo}/${sets}`);
  log(
    `regulationMark poblado: ${conReg}/${cartas} (${((100 * conReg) / cartas).toFixed(1)}%) · ` +
      `letras presentes: ${marcas
        .map((m) => m.regulationMark)
        .filter((m): m is string => m !== null)
        .sort()
        .join(',') || '(ninguna)'}`,
  );
  log(
    'Ojo: si imágenes distintas == cartas, el mismo archivo NO identifica una ' +
      'reimpresión. pokemontcg.io re-escanea cada una.',
  );
}

async function measure(prisma: PrismaService, by: By, sample: number, threshold: number): Promise<void> {
  const groups = await sampleGroups(prisma, by, sample);
  log('');
  log(`── Grupos de (name, ${column(by)}) ──`);

  const vectors = new Map<string, number[]>();
  let fallidas = 0;
  for (const group of groups) {
    for (const card of group.cards) {
      try {
        vectors.set(card.id, await embed(card.imageSmall));
      } catch {
        fallidas++;
      }
    }
  }
  log(`${groups.length} grupos, ${vectors.size} embeddings de proxy, ${fallidas} descargas fallidas`);

  const bySize = new Map<number, { total: number; hits: number; cartas: number }>();
  const ejemplos: { cos: number; a: string; b: string }[] = [];

  for (const group of groups) {
    const ids = group.cards.map((c) => c.id);
    if (!ids.every((id) => vectors.has(id))) continue;
    let max = 0;
    let par: [string, string] = ['?', '?'];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const cos = cosine(vectors.get(ids[i])!, vectors.get(ids[j])!);
        if (cos > max) {
          max = cos;
          par = [ids[i], ids[j]];
        }
      }
    }
    const bucket = bySize.get(ids.length) ?? { total: 0, hits: 0, cartas: 0 };
    bucket.total++;
    bucket.cartas += ids.length;
    if (max >= threshold) {
      bucket.hits++;
      if (ejemplos.length < 15) ejemplos.push({ cos: max, a: par[0], b: par[1] });
    }
    bySize.set(ids.length, bucket);
  }

  log('');
  log(`| tamaño | grupos | con par casi-idéntico (>= ${threshold}) | cartas |`);
  log('|---|---|---|---|');
  let grupos = 0;
  let hits = 0;
  let cartas = 0;
  for (const size of [...bySize.keys()].sort((a, b) => a - b)) {
    const b = bySize.get(size)!;
    grupos += b.total;
    hits += b.hits;
    cartas += b.cartas;
    log(
      `| ${size} | ${b.total} | ${b.hits} (${((100 * b.hits) / b.total).toFixed(1)}%) | ${b.cartas} |`,
    );
  }
  log('');
  log(
    `Total: ${hits}/${grupos} grupos (${((100 * hits) / grupos).toFixed(1)}%) con un par ` +
      `visualmente casi idéntico, sobre ${cartas} cartas.`,
  );
  log('Pares con mayor coseno:');
  for (const e of ejemplos.sort((a, b) => b.cos - a.cos))
    log(`  ${e.cos.toFixed(4)}  ${e.a}  <->  ${e.b}`);
}

async function main(): Promise<void> {
  const sampleAt = process.argv.indexOf('--sample');
  const thresholdAt = process.argv.indexOf('--threshold');
  const sample = sampleAt > -1 ? Number(process.argv[sampleAt + 1]) : 150;
  const threshold = thresholdAt > -1 ? Number(process.argv[thresholdAt + 1]) : 0.98;

  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    await inventory(prisma);
    await measure(prisma, 'nameArtist', sample, threshold);
    await measure(prisma, 'nameNumber', sample, threshold);
    log('');
    log(
      'Cómo leerlo: si (name, artist) devuelve un porcentaje alto de grupos con par ' +
        'casi-idéntico, el problema es real y §4.2 vale la pena. Si devuelve casi 0%, ' +
        'el documento se pospone.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[measure-near-duplicates] falló:', error);
  process.exit(1);
});
