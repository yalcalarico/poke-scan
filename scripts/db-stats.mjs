#!/usr/bin/env node
// `pnpm run db:stats` — un vistazo a la base.
import { execFileSync } from 'node:child_process';

const Q = `SELECT
  (SELECT COUNT(*) FROM cards)                         AS cartas,
  (SELECT COUNT(*) FROM card_sets)                     AS sets,
  (SELECT COUNT(*) FROM card_prices)                   AS precios,
  (SELECT COUNT(*) FROM users)                         AS usuarios,
  (SELECT COUNT(*) FROM collections)                   AS colecciones,
  (SELECT COUNT(*) FROM collection_items)              AS items,
  (SELECT COUNT(*) FROM collection_items WHERE quantity > 1) AS duplicados,
  (SELECT COUNT(*) FROM share_links WHERE "isActive")   AS links_activos,
  (SELECT COUNT(*) FROM friendships WHERE status = 'accepted') AS amistades;`;

try {
  const out = execFileSync(
    'docker',
    ['exec', 'pokemon-scanner-db', 'psql', '-U', 'pokemon', '-d', 'pokemon_cards', '-c', Q],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  ).toString();
  process.stdout.write(out);
} catch {
  console.error(
    '\n  \x1b[31mNo pude consultar la base.\x1b[0m ¿Está PostgreSQL corriendo? (pnpm run infra:up)\n',
  );
  process.exit(1);
}
