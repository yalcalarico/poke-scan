// Equivalencias revisadas contra el catálogo de grupos; cada producto aún debe validar su identidad.
export const REVIEWED_SETS: Readonly<Record<string, { name: string; groupId: number; groupName: string; supplemental?: boolean; bareNumber?: boolean }>> = {
  dpp: { name: 'DP Black Star Promos', groupId: 1421, groupName: 'Diamond and Pearl Promos', bareNumber: true },
  basep: { name: 'Wizards Black Star Promos', groupId: 1418, groupName: 'WoTC Promo', bareNumber: true },
  np: { name: 'Nintendo Black Star Promos', groupId: 1423, groupName: 'Nintendo Promos', bareNumber: true },
  hsp: { name: 'HGSS Black Star Promos', groupId: 1453, groupName: 'HGSS Promos', bareNumber: true },
  bwp: { name: 'BW Black Star Promos', groupId: 1407, groupName: 'Black and White Promos', bareNumber: true },
  smp: { name: 'SM Black Star Promos', groupId: 1861, groupName: 'SM Promos', bareNumber: true },
  xyp: { name: 'XY Black Star Promos', groupId: 1451, groupName: 'XY Promos', bareNumber: true },
  swshp: { name: 'SWSH Black Star Promos', groupId: 2545, groupName: 'SWSH: Sword & Shield Promo Cards', bareNumber: true },
  svp: { name: 'Scarlet & Violet Black Star Promos', groupId: 22872, groupName: 'SV: Scarlet & Violet Promo Cards', bareNumber: true },
  bp: { name: 'Best of Game', groupId: 1455, groupName: 'Best of Promos', bareNumber: true },
  tk1a: { name: 'EX Trainer Kit Latias', groupId: 1543, groupName: 'EX Trainer Kit 1: Latias & Latios' },
  tk1b: { name: 'EX Trainer Kit Latios', groupId: 1543, groupName: 'EX Trainer Kit 1: Latias & Latios' },
  tk2a: { name: 'EX Trainer Kit 2 Plusle', groupId: 1542, groupName: 'EX Trainer Kit 2: Plusle & Minun' },
  tk2b: { name: 'EX Trainer Kit 2 Minun', groupId: 1542, groupName: 'EX Trainer Kit 2: Plusle & Minun' },
  mcd11: { name: "McDonald's Collection 2011", groupId: 1401, groupName: "McDonald's Promos 2011", supplemental: false },
  mcd12: { name: "McDonald's Collection 2012", groupId: 1427, groupName: "McDonald's Promos 2012", supplemental: false },
  mcd14: { name: "McDonald's Collection 2014", groupId: 1692, groupName: "McDonald's Promos 2014", supplemental: false },
  mcd15: { name: "McDonald's Collection 2015", groupId: 1694, groupName: "McDonald's Promos 2015", supplemental: false },
  mcd16: { name: "McDonald's Collection 2016", groupId: 3087, groupName: "McDonald's Promos 2016", supplemental: true },
  mcd17: { name: "McDonald's Collection 2017", groupId: 2148, groupName: "McDonald's Promos 2017", supplemental: true },
  mcd18: { name: "McDonald's Collection 2018", groupId: 2364, groupName: "McDonald's Promos 2018", supplemental: true },
  mcd19: { name: "McDonald's Collection 2019", groupId: 2555, groupName: "McDonald's Promos 2019", supplemental: false },
  mcd21: { name: "McDonald's Collection 2021", groupId: 2782, groupName: "McDonald's 25th Anniversary Promos", supplemental: true },
  mcd22: { name: "McDonald's Collection 2022", groupId: 3150, groupName: "McDonald's Promos 2022", supplemental: false },
};

export function compatibleGroupSets(groupId: number, setIds: readonly string[]): boolean {
  const ids = [...new Set(setIds)];
  if (ids.length <= 1) return true;
  return (groupId === 1543 && ids.every((id) => id === 'tk1a' || id === 'tk1b'))
    || (groupId === 1542 && ids.every((id) => id === 'tk2a' || id === 'tk2b'));
}
