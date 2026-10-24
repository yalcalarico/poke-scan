// Grupo 1423: productos guardados, SHA256 b9b80c6956c8c40ba53bbc48bc6e749f2862df802478d2eced07d17b33739715.
// Sólo identidades sin impresiones alternativas y sin estampas/roles ambiguos.
// No se quitan anotaciones del nombre de productos nuevos mediante una regla general.
const rows = [
  ['1', 'Kyogre ex', 86555, 'Kyogre ex - 001 (Nintendo Power Magazine)'],
  ['2', 'Groudon ex', 85928, 'Groudon ex - 002 (Nintendo Power Magazine)'],
  ['3', 'Treecko', 90031, 'Treecko - 003 (e-League)'],
  ['5', 'Mudkip', 87608, 'Mudkip - 005 (POP Tournament)'],
  ['6', 'Torchic', 89952, 'Torchic - 006 (POP Tournament)'],
  ['7', 'Treecko', 90036, 'Treecko - 007 (POP Tournament)'],
  ['8', 'Torchic', 89948, 'Torchic - 008 (e-League)'],
  ['10', 'Mudkip', 87604, 'Mudkip - 010 (e-League)'],
  ['12', 'Pikachu', 88067, "Pikachu - 012 (EX Series Collector's Tin)"],
  ['13', 'Meowth', 87310, "Meowth - 013 (EX Series Collector's Tin)"],
  ['14', 'Latias', 86649, 'Latias - 014 (Pokemon Heroes: Latios & Latias DVD Release)'],
  ['15', 'Latios', 86663, 'Latios - 015 (Pokemon Heroes: Latios & Latias DVD Release)'],
  ['20', 'Ludicolo', 86896, 'Ludicolo - 020 (EX Series Value Pack)'],
  ['21', 'Jirachi', 86326, 'Jirachi - 021 (Jirachi: Wish Maker DVD Release)'],
  ['22', 'Beldum', 83784, 'Beldum - 022 (e-League)'],
  ['23', 'Metang', 87374, 'Metang - 023 (Stadium Challenge 2004)'],
  ['28', 'Championship Arena', 84163, 'Championship Arena - 028 (2005 World Championships)'],
  ['29', 'Celebi', 84145, "Celebi - 029 (EX Collector's Carry Tin)"],
  ['30', 'Suicune', 89603, "Suicune - 030 (EX Collector's Carry Tin)"],
  ['31', 'Moltres ex', 87567, "Moltres ex - 031 (EX Collector's Window Tins)"],
  ['32', 'Articuno ex', 83655, "Articuno ex - 032 (EX Collector's Window Tins)"],
  ['33', 'Zapdos ex', 90724, "Zapdos ex - 033 (EX Collector's Window Tins)"],
  ['34', 'Typhlosion', 90104, 'Typhlosion - 034 (Epic Collection Value Boxes)'],
  ['37', 'Kyogre ex', 86558, "Kyogre ex - 037 (EX Collector's Tins)"],
  ['38', 'Groudon ex', 85931, "Groudon ex - 038 (EX Collector's Tins)"],
  ['39', 'Rayquaza ex', 88644, "Rayquaza ex - 039 (EX Collector's Tin)"],
  ['40', 'Mew', 87402, "Mew - 040 (Trainer's Challenge Set)"],
] as const;

export const NINTENDO_PROMO_IDENTITIES = rows.map(([number, localName, productId, productName]) => ({
  cardId: `np-${number}`, localName, localNumber: number, productId, productName, fullNumber: number.padStart(3, '0'),
}));
