import { PrismaClient } from '@prisma/client';

function parse(args) {
  const [command, ...rest] = args.filter((arg) => arg !== '--');
  if (!['list', 'seed', 'add', 'enable', 'disable', 'rank'].includes(command)) throw new Error('Usá list, seed, add, enable, disable o rank');
  const options = {};
  for (const arg of rest) {
    const match = /^--(set|priority)=([\w.-]+)$/.exec(arg);
    if (!match || options[match[1]] !== undefined) throw new Error('Opciones válidas: --set=ID y --priority=ENTERO');
    options[match[1]] = match[2];
  }
  if (command === 'seed' || command === 'list') {
    if (Object.keys(options).length) throw new Error(`${command} no acepta opciones`);
  } else if (!options.set) throw new Error(`${command} requiere --set=ID`);
  if (options.priority !== undefined && (!/^\d+$/.test(options.priority) || !Number.isSafeInteger(Number(options.priority)) || Number(options.priority) < 1 || Number(options.priority) > 2_147_483_647)) throw new Error('--priority debe ser un entero positivo');
  if (!['add', 'rank'].includes(command) && options.priority !== undefined) throw new Error('--priority sólo se acepta con add o rank');
  if (command === 'rank' && options.priority === undefined) throw new Error('rank requiere --priority=ENTERO');
  return { command, setId: options.set, priority: options.priority === undefined ? undefined : Number(options.priority) };
}

export async function run(prisma, args) {
  const { command, setId, priority } = parse(args);
  if (command === 'list') return prisma.priceSyncSet.findMany({ orderBy: [{ priority: 'asc' }, { setId: 'asc' }] });
  if (command === 'seed') {
    const curated = new Map([['me55', 1], ['me55c', 1], ['me2pt5', 2], ['sv8pt5', 3], ['sv3pt5', 4], ['me2', 5], ['me5', 6], ['me4', 7], ['me3', 8], ['sv10', 9], ['me1', 10]]);
    const ids = [...curated.keys()];
    const sets = await prisma.cardSet.findMany({ where: { id: { in: ids } }, select: { id: true } });
    const found = new Set(sets.map(({ id }) => id));
    const rows = ids.map((id) => ({ setId: id, priority: curated.get(id), origin: 'curated' })).filter(({ setId: id }) => found.has(id));
    const inserted = rows.length ? await prisma.priceSyncSet.createMany({ data: rows, skipDuplicates: true }) : { count: 0 };
    return { inserted: inserted.count, missingSetIds: ids.filter((id) => !found.has(id)) };
  }
  const cardSet = await prisma.cardSet.findUnique({ where: { id: setId }, select: { id: true } });
  if (!cardSet) throw new Error(`No existe el set ${setId} en el catálogo local`);
  if (command === 'rank') {
    if (!await prisma.priceSyncSet.findUnique({ where: { setId }, select: { setId: true } })) throw new Error(`El set ${setId} todavía no está en el registro; usá add primero`);
    return prisma.priceSyncSet.update({ where: { setId }, data: { priority } });
  }
  if (command === 'disable') return prisma.priceSyncSet.upsert({ where: { setId }, create: { setId, origin: 'manual', enabled: false }, update: { enabled: false } });
  const entry = await prisma.priceSyncSet.upsert({ where: { setId }, create: { setId, origin: 'manual', priority: priority ?? 100 }, update: { enabled: true, lastDemandAt: new Date(), ...(priority === undefined ? {} : { priority }) } });
  // La señal es durable y la atiende el planificador/worker Nest ya existente.
  const providers = [];
  const disabled = (value) => value !== undefined && ['false', '0', 'no'].includes(String(value).trim().toLowerCase());
  if (!disabled(process.env.ENABLE_PRICE_BACKFILL_CRON) && !disabled(process.env.PRICE_QUEUE_ENABLED)) providers.push('tcgdex');
  if (process.env.ENABLE_TCGCSV_INGESTION === 'true') providers.push('tcgcsv');
  if (providers.length) await prisma.$executeRaw`INSERT INTO price_sync_controls (provider, "requestedGeneration", "handledGeneration", "nextCycleAt")
    SELECT p.provider, 1, 0, NOW() FROM unnest(${providers}::text[]) AS p(provider)
    ON CONFLICT (provider) DO UPDATE SET "requestedGeneration" = CASE
      WHEN price_sync_controls."requestedGeneration" = price_sync_controls."handledGeneration" THEN price_sync_controls."requestedGeneration" + 1 ELSE price_sync_controls."requestedGeneration" END`;
  return entry;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let prisma;
  try {
    const args = process.argv.slice(2).filter((arg) => arg !== '--');
    if (args[0] === 'help' || args[0] === '--help') {
      console.log('prices:sets list | seed | add --set=ID [--priority=N] | enable --set=ID | disable --set=ID | rank --set=ID --priority=N');
    } else {
    prisma = new PrismaClient();
    await prisma.$connect();
    const result = await run(prisma, args);
    console.log(JSON.stringify(result, (_, value) => value instanceof Date ? value.toISOString() : value, 2));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'No se pudo operar el registro de sets');
    process.exitCode = 1;
  } finally { await prisma?.$disconnect(); }
}
