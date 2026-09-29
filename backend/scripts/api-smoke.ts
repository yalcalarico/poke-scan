import 'reflect-metadata';
import { PokemonTcgIoProvider } from '../src/modules/providers/pokemon-tcg-io.provider.js';

const provider = new PokemonTcgIoProvider();

const sets = await provider.getSets(1, 5);
console.log(`getSets(1,5) -> page=${sets.page} pageSize=${sets.pageSize} total=${sets.total} totalPages=${sets.totalPages}`);
for (const s of sets.data) {
  console.log(`  - ${s.id} | ${s.name} | series=${s.series} | release=${s.releaseDate} | printed=${s.printedTotal} | logo=${s.logoUrl ?? 'null'}`);
}

const cards = await provider.getCardsPage(1, 3);
console.log(`getCardsPage(1,3) -> page=${cards.page} pageSize=${cards.pageSize} total=${cards.total} totalPages=${cards.totalPages}`);
for (const c of cards.data) {
  console.log(`  - ${c.id} | ${c.name} | set=${c.setId} | #${c.number} | types=${JSON.stringify(c.types)} | subtypes=${JSON.stringify(c.subtypes)} | hp=${c.hp} | rarity=${c.rarity} | mark=${c.regulationMark}`);
  console.log(`    small=${c.imageSmall}`);
  const prices = await provider.getPricesForCard(c);
  for (const p of prices) {
    console.log(`    precio ${p.variant}: low=${p.low} mid=${p.mid} high=${p.high} market=${p.market} (${p.source}/${p.currency})`);
  }
  if (prices.length === 0) console.log('    precio: (sin datos tcgplayer)');
}

const one = await provider.getCard(cards.data[0].id);
console.log(`getCard("${cards.data[0].id}") -> ${one ? `${one.name} (${one.id})` : 'null'}`);
const missing = await provider.getCard('no-existe-xyz');
console.log(`getCard("no-existe-xyz") -> ${missing === null ? 'null (correcto)' : 'inesperado'}`);
